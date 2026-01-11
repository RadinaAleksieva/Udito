import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";

function requireSecret(request: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SECRET is not configured.");
  }
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (token !== secret) {
    throw new Error("Unauthorized.");
  }
}

// Real receipts data: order_number -> issued_at date
const REAL_RECEIPTS = [
  { orderNumber: "10118", issuedAt: "2025-04-18T12:00:00.000Z" },
  { orderNumber: "10121", issuedAt: "2025-04-20T12:00:00.000Z" },
  { orderNumber: "10129", issuedAt: "2025-04-22T12:00:00.000Z" },
  { orderNumber: "10136", issuedAt: "2025-05-03T12:00:00.000Z" },
  { orderNumber: "10137", issuedAt: "2025-05-10T12:00:00.000Z" },
  { orderNumber: "10139", issuedAt: "2025-05-19T12:00:00.000Z" },
  { orderNumber: "10140", issuedAt: "2025-06-01T12:00:00.000Z" },
  { orderNumber: "10143", issuedAt: "2025-10-22T12:00:00.000Z" },
  { orderNumber: "10164", issuedAt: "2025-11-28T12:00:00.000Z" },
];

export async function POST(request: Request) {
  try {
    requireSecret(request);
    await initDb();

    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dryRun") === "true";
    const deleteIds = url.searchParams.get("deleteIds");

    // If deleteIds is provided, just delete those specific receipts
    if (deleteIds) {
      const ids = deleteIds.split(",").map(id => parseInt(id.trim(), 10)).filter(id => !isNaN(id));
      if (ids.length === 0) {
        return NextResponse.json({ ok: false, error: "No valid IDs" }, { status: 400 });
      }
      // Delete each ID individually to avoid array type issues
      let deletedCount = 0;
      for (const id of ids) {
        const result = await sql`DELETE FROM receipts WHERE id = ${id};`;
        deletedCount += result.rowCount ?? 0;
      }
      return NextResponse.json({ ok: true, deleted: deletedCount, ids });
    }

    // 1. Find thewhiterabbitshop.com site_id
    const siteResult = await sql`
      SELECT site_id FROM companies
      WHERE store_domain LIKE '%thewhiterabbitshop%'
      LIMIT 1;
    `;

    if (siteResult.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Site not found" }, { status: 404 });
    }

    const siteId = siteResult.rows[0].site_id;
    console.log("Found site_id:", siteId);

    // 2. Count existing receipts for this site
    const existingCount = await sql`
      SELECT COUNT(*) as count FROM receipts r
      JOIN orders o ON o.id = r.order_id
      WHERE o.site_id = ${siteId};
    `;
    const existingReceiptsCount = Number(existingCount.rows[0].count);
    console.log("Existing receipts to delete:", existingReceiptsCount);

    // 3. Find order IDs for the real receipts
    const ordersToInsert: Array<{ orderId: string; orderNumber: string; issuedAt: string; total: string; currency: string; raw: any }> = [];

    for (const receipt of REAL_RECEIPTS) {
      const orderResult = await sql`
        SELECT id, number, total, currency, raw FROM orders
        WHERE number = ${receipt.orderNumber}
          AND site_id = ${siteId}
        LIMIT 1;
      `;

      if (orderResult.rows.length > 0) {
        const order = orderResult.rows[0];
        ordersToInsert.push({
          orderId: order.id,
          orderNumber: order.number,
          issuedAt: receipt.issuedAt,
          total: order.total,
          currency: order.currency,
          raw: order.raw,
        });
      } else {
        console.warn(`Order ${receipt.orderNumber} not found`);
      }
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        siteId,
        existingReceiptsToDelete: existingReceiptsCount,
        receiptsToInsert: ordersToInsert.map(o => ({
          orderNumber: o.orderNumber,
          orderId: o.orderId,
          issuedAt: o.issuedAt,
        })),
        missingOrders: REAL_RECEIPTS.filter(
          r => !ordersToInsert.some(o => o.orderNumber === r.orderNumber)
        ).map(r => r.orderNumber),
      });
    }

    // 4. Delete all existing receipts for this site
    const deleteResult = await sql`
      DELETE FROM receipts
      WHERE order_id IN (
        SELECT id FROM orders WHERE site_id = ${siteId}
      );
    `;
    console.log("Deleted receipts:", deleteResult.rowCount);

    // 5. Reset the sequence to 1
    await sql`ALTER SEQUENCE receipts_id_seq RESTART WITH 1;`;
    console.log("Reset receipt sequence to 1");

    // 6. Insert the real receipts (in order, so they get IDs 1-9)
    const inserted: Array<{ receiptId: number; orderNumber: string }> = [];

    for (const order of ordersToInsert) {
      const result = await sql`
        INSERT INTO receipts (order_id, business_id, issued_at, status, payload, type)
        VALUES (
          ${order.orderId},
          NULL,
          ${order.issuedAt},
          'issued',
          ${JSON.stringify(order.raw)},
          'sale'
        )
        RETURNING id;
      `;
      inserted.push({
        receiptId: result.rows[0].id,
        orderNumber: order.orderNumber,
      });
    }

    return NextResponse.json({
      ok: true,
      siteId,
      deleted: deleteResult.rowCount,
      inserted,
    });
  } catch (error) {
    console.error("Fix receipts failed:", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  // GET = dry run by default
  const url = new URL(request.url);
  if (!url.searchParams.has("dryRun")) {
    url.searchParams.set("dryRun", "true");
  }
  return POST(new Request(url.toString(), {
    method: "POST",
    headers: request.headers,
  }));
}
