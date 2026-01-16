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

// PUT: Revert to original IDs (emergency restore)
export async function PUT() {
  try {
    await initDb();

    // Original mapping: newId -> oldId (from the bad fix we did)
    const revertMapping: Record<number, number> = {
      1: 41, 2: 42, 3: 43, 4: 44, 5: 45, 6: 46, 7: 47, 8: 48, 9: 49, 10: 50,
      11: 51, 12: 52, 13: 53, 14: 54, 15: 55, 16: 56, 17: 57, 18: 58, 19: 59, 20: 60,
      21: 61, 22: 62, 23: 63, 24: 64, 25: 65, 26: 66, 27: 67, 28: 68, 29: 69, 30: 70,
      31: 71, 32: 72, 33: 73, 34: 74, 35: 75, 36: 76, 37: 77, 38: 78, 39: 79, 40: 80,
      41: 81, 42: 82, 43: 83, 44: 84, 45: 85, 46: 86, 47: 87,
      48: 1, 49: 2, 50: 3, 51: 4, 52: 5, 53: 6, 54: 7, 55: 8, 56: 9, 57: 10,
      58: 11, 59: 12, 60: 13, 61: 14, 62: 15, 63: 16, 64: 17, 65: 18, 66: 19, 67: 20,
      68: 21, 69: 22, 70: 23, 71: 24, 72: 25, 73: 26, 74: 27, 75: 28, 76: 29, 77: 30,
      78: 31, 79: 32, 80: 33, 81: 34, 82: 35, 83: 36, 84: 37, 85: 38, 86: 39,
      87: 89, 88: 92, 89: 93
    };

    // Also need to restore reference_receipt_id for refunds
    // Receipt 81 (refund) referenced sale receipt 65 (which was 18, now should be back to 18)
    // Receipt 88 (refund) referenced sale receipt 87 (which was 89)
    const refundRefMapping: Record<number, number> = {
      81: 18,  // refund for order 10184, sale was receipt 18
      88: 89   // refund for order 10273, sale was receipt 89
    };

    const receiptsResult = await sql`
      SELECT id, order_id, type, issued_at, reference_receipt_id, refund_amount, payload, business_id, status
      FROM receipts
      ORDER BY id ASC
    `;

    const receipts = receiptsResult.rows;

    // Store receipt data with restored IDs
    const receiptData = receipts.map(r => {
      const currentId = Number(r.id);
      const restoredId = revertMapping[currentId] || currentId;
      const restoredRefId = refundRefMapping[currentId] || r.reference_receipt_id;

      return {
        restoredId,
        currentId,
        order_id: r.order_id,
        type: r.type,
        issued_at: r.issued_at,
        reference_receipt_id: restoredRefId,
        refund_amount: r.refund_amount,
        payload: r.payload,
        business_id: r.business_id,
        status: r.status
      };
    });

    // Delete all receipts
    await sql`DELETE FROM receipts`;

    // Re-insert with restored IDs
    for (const r of receiptData) {
      await sql`
        INSERT INTO receipts (id, order_id, type, issued_at, reference_receipt_id, refund_amount, payload, business_id, status)
        VALUES (${r.restoredId}, ${r.order_id}, ${r.type}, ${r.issued_at}, ${r.reference_receipt_id}, ${r.refund_amount}, ${JSON.stringify(r.payload)}, ${r.business_id}, ${r.status})
      `;
    }

    // Reset sequence to max
    await sql`SELECT setval('receipts_id_seq', (SELECT COALESCE(MAX(id), 0) FROM receipts))`;

    return NextResponse.json({
      ok: true,
      message: "Restored original receipt IDs",
      restored: receiptData.map(r => ({ from: r.currentId, to: r.restoredId }))
    });
  } catch (error) {
    console.error("Revert receipt numbers failed", error);
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
