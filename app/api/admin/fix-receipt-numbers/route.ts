import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Fix receipt numbering - renumber receipts that have gaps
export async function POST() {
  try {
    await initDb();

    // Get all receipts ordered by issued_at
    const receiptsResult = await sql`
      SELECT id, order_id, type, issued_at, reference_receipt_id, refund_amount, payload, business_id, status
      FROM receipts
      ORDER BY issued_at ASC
    `;

    const receipts = receiptsResult.rows;
    const fixes: { oldId: number; newId: number; orderNumber: string; type: string }[] = [];
    const refundMappings: Map<number, number> = new Map(); // old sale id -> new sale id

    // First pass: assign new sequential IDs
    let nextId = 1;
    for (const receipt of receipts) {
      const oldId = Number(receipt.id);
      if (oldId !== nextId) {
        // Get order number for logging
        const orderResult = await sql`SELECT number FROM orders WHERE id = ${receipt.order_id} LIMIT 1`;
        const orderNumber = orderResult.rows[0]?.number || 'unknown';

        fixes.push({
          oldId,
          newId: nextId,
          orderNumber,
          type: receipt.type
        });
      }

      if (receipt.type === 'sale') {
        refundMappings.set(oldId, nextId);
      }

      nextId++;
    }

    if (fixes.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No gaps found, numbering is already sequential",
        totalReceipts: receipts.length
      });
    }

    // Delete all receipts and re-insert with correct IDs
    // We need to do this carefully to maintain referential integrity

    // First, store all receipt data
    const receiptData = receipts.map((r, index) => ({
      newId: index + 1,
      oldId: Number(r.id),
      order_id: r.order_id,
      type: r.type,
      issued_at: r.issued_at,
      reference_receipt_id: r.reference_receipt_id ? refundMappings.get(Number(r.reference_receipt_id)) : null,
      refund_amount: r.refund_amount,
      payload: r.payload,
      business_id: r.business_id,
      status: r.status
    }));

    // Delete all receipts
    await sql`DELETE FROM receipts`;

    // Re-insert with correct sequential IDs
    for (const r of receiptData) {
      await sql`
        INSERT INTO receipts (id, order_id, type, issued_at, reference_receipt_id, refund_amount, payload, business_id, status)
        VALUES (${r.newId}, ${r.order_id}, ${r.type}, ${r.issued_at}, ${r.reference_receipt_id}, ${r.refund_amount}, ${JSON.stringify(r.payload)}, ${r.business_id}, ${r.status})
      `;
    }

    // Reset the sequence to MAX(id) + 1
    await sql`SELECT setval('receipts_id_seq', (SELECT COALESCE(MAX(id), 0) FROM receipts))`;

    return NextResponse.json({
      ok: true,
      message: `Fixed ${fixes.length} receipt numbers`,
      fixes,
      totalReceipts: receiptData.length,
      nextId: receiptData.length + 1
    });
  } catch (error) {
    console.error("Fix receipt numbers failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// PUT: Clean up receipts - delete old ones (41-87) and renumber recent ones (89,92,93 -> 40,41,42)
export async function PUT() {
  try {
    await initDb();

    // Step 1: Delete old receipts (41-87) - these are from the physical cash register, not UDITO
    const deleteResult = await sql`
      DELETE FROM receipts WHERE id >= 41 AND id <= 87
      RETURNING id
    `;
    const deletedCount = deleteResult.rows.length;

    // Step 2: Renumber recent receipts
    // 89 -> 40 (order 10273 sale)
    // 92 -> 41 (order 10273 refund, reference should point to 40)
    // 93 -> 42 (order 10274 sale)

    // Get the receipts we need to renumber
    const toRenumber = await sql`
      SELECT id, order_id, type, issued_at, reference_receipt_id, refund_amount, payload, business_id, status
      FROM receipts
      WHERE id IN (89, 92, 93)
      ORDER BY id ASC
    `;

    const renumbered: { from: number; to: number; order: string }[] = [];

    for (const r of toRenumber.rows) {
      const oldId = Number(r.id);
      let newId: number;
      let newRefId: number | null = r.reference_receipt_id;

      if (oldId === 89) {
        newId = 40;
      } else if (oldId === 92) {
        newId = 41;
        newRefId = 40; // refund references the sale receipt 40
      } else if (oldId === 93) {
        newId = 42;
      } else {
        continue;
      }

      // Delete old and insert with new ID
      await sql`DELETE FROM receipts WHERE id = ${oldId}`;
      await sql`
        INSERT INTO receipts (id, order_id, type, issued_at, reference_receipt_id, refund_amount, payload, business_id, status)
        VALUES (${newId}, ${r.order_id}, ${r.type}, ${r.issued_at}, ${newRefId}, ${r.refund_amount}, ${JSON.stringify(r.payload)}, ${r.business_id}, ${r.status})
      `;

      // Get order number for logging
      const orderResult = await sql`SELECT number FROM orders WHERE id = ${r.order_id} LIMIT 1`;
      const orderNumber = orderResult.rows[0]?.number || 'unknown';

      renumbered.push({ from: oldId, to: newId, order: orderNumber });
    }

    // Step 3: Reset sequence to 42
    await sql`SELECT setval('receipts_id_seq', 42)`;

    return NextResponse.json({
      ok: true,
      message: "Cleaned up receipts",
      deletedOldReceipts: deletedCount,
      renumbered,
      nextReceiptId: 43
    });
  } catch (error) {
    console.error("Clean up receipts failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// GET: Preview what would be fixed
export async function GET() {
  try {
    await initDb();

    const receiptsResult = await sql`
      SELECT r.id, r.order_id, r.type, r.issued_at, o.number as order_number
      FROM receipts r
      LEFT JOIN orders o ON o.id = r.order_id
      ORDER BY r.issued_at ASC
    `;

    const receipts = receiptsResult.rows;
    const gaps: { position: number; currentId: number; shouldBe: number; orderNumber: string; type: string }[] = [];

    receipts.forEach((r, index) => {
      const expectedId = index + 1;
      const actualId = Number(r.id);
      if (actualId !== expectedId) {
        gaps.push({
          position: index + 1,
          currentId: actualId,
          shouldBe: expectedId,
          orderNumber: r.order_number || 'unknown',
          type: r.type
        });
      }
    });

    return NextResponse.json({
      ok: true,
      totalReceipts: receipts.length,
      gapsFound: gaps.length,
      gaps,
      receipts: receipts.map((r, i) => ({
        currentId: Number(r.id),
        expectedId: i + 1,
        orderNumber: r.order_number,
        type: r.type,
        issuedAt: r.issued_at
      }))
    });
  } catch (error) {
    console.error("Check receipt numbers failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
