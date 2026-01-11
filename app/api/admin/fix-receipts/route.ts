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
// Receipts 1-9 (original)
const RECEIPTS_1_TO_9 = [
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

// Receipts 10-30 (new batch) - issuedAt will be taken from order's paid_at
const RECEIPTS_10_TO_30 = [
  "10160", "10161", "10169", "10165", "10170", "10171", "10183", "10186",
  "10189", "10193", "10194", "10192", "10190", "10198", "10199", "10191",
  "10202", "10203", "10196", "10187", "10184"
];

// Date overrides for receipts with incorrect paid_at dates
// These orders were paid in December but have November dates in the database
const DATE_OVERRIDES: Record<string, string> = {
  // Receipt 10: 10160 - change from Nov 19 to Dec 1, keeping time 10:35:24.581Z
  "10160": "2025-12-01T10:35:24.581Z",
  // Receipt 11: 10161 - change from Nov 21 to Dec 12, keeping time 13:43:20.581Z
  "10161": "2025-12-12T13:43:20.581Z",
};

const REAL_RECEIPTS = RECEIPTS_1_TO_9;

export async function POST(request: Request) {
  try {
    requireSecret(request);
    await initDb();

    const url = new URL(request.url);
    const dryRun = url.searchParams.get("dryRun") === "true";
    const deleteIds = url.searchParams.get("deleteIds");
    const queryNewBatch = url.searchParams.get("queryNewBatch") === "true";
    const insertAll = url.searchParams.get("insertAll") === "true";

    // Insert January receipts (31-36)
    const insertJanuary = url.searchParams.get("insertJanuary") === "true";
    if (insertJanuary) {
      const siteResult = await sql`
        SELECT site_id FROM companies
        WHERE store_domain LIKE '%thewhiterabbitshop%'
        LIMIT 1;
      `;
      if (siteResult.rows.length === 0) {
        return NextResponse.json({ ok: false, error: "Site not found" }, { status: 404 });
      }
      const siteId = siteResult.rows[0].site_id;

      // January sales (sorted by date)
      const januarySales = [
        { orderNumber: "10201", issuedAt: "2026-01-03T12:30:14.393Z" },
        { orderNumber: "10219", issuedAt: "2026-01-05T12:12:50.576Z" },
        { orderNumber: "10195", issuedAt: "2026-01-05T14:36:59.794Z" },
        // Refund for 10184 goes here (will be inserted separately)
        { orderNumber: "10200", issuedAt: "2026-01-06T16:15:36.881Z" },
        { orderNumber: "10227", issuedAt: "2026-01-09T20:49:57.931Z" },
      ];

      // Refund for 10184
      const refund = {
        orderNumber: "10184",
        issuedAt: "2026-01-06T14:45:45.000Z",
        refundAmount: 58,
        referenceReceiptId: 18, // Original sale receipt
      };

      const inserted: Array<{ receiptId: number; orderNumber: string; issuedAt: string; type: string }> = [];

      // Insert sales before refund date
      for (const sale of januarySales.slice(0, 3)) {
        const orderResult = await sql`
          SELECT id, raw FROM orders
          WHERE number = ${sale.orderNumber} AND site_id = ${siteId}
          LIMIT 1;
        `;
        if (orderResult.rows.length > 0) {
          const order = orderResult.rows[0];
          const result = await sql`
            INSERT INTO receipts (order_id, business_id, issued_at, status, payload, type)
            VALUES (${order.id}, NULL, ${sale.issuedAt}, 'issued', ${JSON.stringify(order.raw)}, 'sale')
            RETURNING id;
          `;
          inserted.push({ receiptId: result.rows[0].id, orderNumber: sale.orderNumber, issuedAt: sale.issuedAt, type: 'sale' });
        }
      }

      // Insert refund
      const refundOrderResult = await sql`
        SELECT id, raw FROM orders
        WHERE number = ${refund.orderNumber} AND site_id = ${siteId}
        LIMIT 1;
      `;
      if (refundOrderResult.rows.length > 0) {
        const order = refundOrderResult.rows[0];
        const result = await sql`
          INSERT INTO receipts (order_id, business_id, issued_at, status, payload, type, refund_amount, reference_receipt_id)
          VALUES (${order.id}, NULL, ${refund.issuedAt}, 'issued', ${JSON.stringify(order.raw)}, 'refund', ${refund.refundAmount}, ${refund.referenceReceiptId})
          RETURNING id;
        `;
        inserted.push({ receiptId: result.rows[0].id, orderNumber: refund.orderNumber, issuedAt: refund.issuedAt, type: 'refund' });
      }

      // Insert sales after refund date
      for (const sale of januarySales.slice(3)) {
        const orderResult = await sql`
          SELECT id, raw FROM orders
          WHERE number = ${sale.orderNumber} AND site_id = ${siteId}
          LIMIT 1;
        `;
        if (orderResult.rows.length > 0) {
          const order = orderResult.rows[0];
          const result = await sql`
            INSERT INTO receipts (order_id, business_id, issued_at, status, payload, type)
            VALUES (${order.id}, NULL, ${sale.issuedAt}, 'issued', ${JSON.stringify(order.raw)}, 'sale')
            RETURNING id;
          `;
          inserted.push({ receiptId: result.rows[0].id, orderNumber: sale.orderNumber, issuedAt: sale.issuedAt, type: 'sale' });
        }
      }

      return NextResponse.json({
        ok: true,
        insertJanuary: true,
        siteId,
        inserted,
        totalInserted: inserted.length,
      });
    }

    // Query specific orders by number
    const queryOrders = url.searchParams.get("queryOrders");
    if (queryOrders) {
      const orderNumbers = queryOrders.split(",").map(n => n.trim()).filter(n => n);
      const siteResult = await sql`
        SELECT site_id FROM companies
        WHERE store_domain LIKE '%thewhiterabbitshop%'
        LIMIT 1;
      `;
      if (siteResult.rows.length === 0) {
        return NextResponse.json({ ok: false, error: "Site not found" }, { status: 404 });
      }
      const siteId = siteResult.rows[0].site_id;

      const results: Array<{
        orderNumber: string;
        orderId: string | null;
        paidAt: string | null;
        total: string | null;
        currency: string | null;
        customerName: string | null;
        found: boolean;
      }> = [];

      for (const orderNumber of orderNumbers) {
        const orderResult = await sql`
          SELECT id, number, paid_at, total, currency, customer_name FROM orders
          WHERE number = ${orderNumber}
            AND site_id = ${siteId}
          LIMIT 1;
        `;
        if (orderResult.rows.length > 0) {
          const order = orderResult.rows[0];
          results.push({
            orderNumber: order.number,
            orderId: order.id,
            paidAt: order.paid_at,
            total: order.total,
            currency: order.currency,
            customerName: order.customer_name,
            found: true,
          });
        } else {
          results.push({
            orderNumber,
            orderId: null,
            paidAt: null,
            total: null,
            currency: null,
            customerName: null,
            found: false,
          });
        }
      }

      return NextResponse.json({
        ok: true,
        queryOrders: true,
        siteId,
        orders: results,
        missingOrders: results.filter(r => !r.found).map(r => r.orderNumber),
      });
    }

    // Query info about the new batch of orders (10-30)
    if (queryNewBatch) {
      const siteResult = await sql`
        SELECT site_id FROM companies
        WHERE store_domain LIKE '%thewhiterabbitshop%'
        LIMIT 1;
      `;
      if (siteResult.rows.length === 0) {
        return NextResponse.json({ ok: false, error: "Site not found" }, { status: 404 });
      }
      const siteId = siteResult.rows[0].site_id;

      const results: Array<{
        receiptNumber: number;
        orderNumber: string;
        orderId: string | null;
        paidAt: string | null;
        total: string | null;
        currency: string | null;
        customerName: string | null;
        found: boolean;
      }> = [];

      for (let i = 0; i < RECEIPTS_10_TO_30.length; i++) {
        const orderNumber = RECEIPTS_10_TO_30[i];
        const orderResult = await sql`
          SELECT id, number, paid_at, total, currency, customer_name FROM orders
          WHERE number = ${orderNumber}
            AND site_id = ${siteId}
          LIMIT 1;
        `;
        if (orderResult.rows.length > 0) {
          const order = orderResult.rows[0];
          results.push({
            receiptNumber: 10 + i,
            orderNumber: order.number,
            orderId: order.id,
            paidAt: order.paid_at,
            total: order.total,
            currency: order.currency,
            customerName: order.customer_name,
            found: true,
          });
        } else {
          results.push({
            receiptNumber: 10 + i,
            orderNumber,
            orderId: null,
            paidAt: null,
            total: null,
            currency: null,
            customerName: null,
            found: false,
          });
        }
      }

      return NextResponse.json({
        ok: true,
        queryNewBatch: true,
        siteId,
        receipts: results,
        missingOrders: results.filter(r => !r.found).map(r => r.orderNumber),
      });
    }

    // Insert ALL 30 receipts (1-9 + 10-30)
    if (insertAll) {
      const siteResult = await sql`
        SELECT site_id FROM companies
        WHERE store_domain LIKE '%thewhiterabbitshop%'
        LIMIT 1;
      `;
      if (siteResult.rows.length === 0) {
        return NextResponse.json({ ok: false, error: "Site not found" }, { status: 404 });
      }
      const siteId = siteResult.rows[0].site_id;
      console.log("insertAll: Found site_id:", siteId);

      // Delete all existing receipts for this site
      const deleteResult = await sql`
        DELETE FROM receipts
        WHERE order_id IN (
          SELECT id FROM orders WHERE site_id = ${siteId}
        );
      `;
      console.log("insertAll: Deleted receipts:", deleteResult.rowCount);

      // Reset the sequence to 1
      await sql`ALTER SEQUENCE receipts_id_seq RESTART WITH 1;`;
      console.log("insertAll: Reset receipt sequence to 1");

      const inserted: Array<{ receiptId: number; orderNumber: string; issuedAt: string }> = [];

      // Insert receipts 1-9 (with fixed issuedAt dates)
      for (const receipt of RECEIPTS_1_TO_9) {
        const orderResult = await sql`
          SELECT id, raw FROM orders
          WHERE number = ${receipt.orderNumber}
            AND site_id = ${siteId}
          LIMIT 1;
        `;
        if (orderResult.rows.length > 0) {
          const order = orderResult.rows[0];
          const result = await sql`
            INSERT INTO receipts (order_id, business_id, issued_at, status, payload, type)
            VALUES (
              ${order.id},
              NULL,
              ${receipt.issuedAt},
              'issued',
              ${JSON.stringify(order.raw)},
              'sale'
            )
            RETURNING id;
          `;
          inserted.push({
            receiptId: result.rows[0].id,
            orderNumber: receipt.orderNumber,
            issuedAt: receipt.issuedAt,
          });
        } else {
          console.warn(`insertAll: Order ${receipt.orderNumber} not found`);
        }
      }

      // Collect receipts 10-30 data first, then sort by date
      const newBatchData: Array<{ orderNumber: string; orderId: string; issuedAt: string; raw: any }> = [];

      for (const orderNumber of RECEIPTS_10_TO_30) {
        const orderResult = await sql`
          SELECT id, paid_at, raw FROM orders
          WHERE number = ${orderNumber}
            AND site_id = ${siteId}
          LIMIT 1;
        `;
        if (orderResult.rows.length > 0) {
          const order = orderResult.rows[0];
          // Use date override if available, otherwise use paid_at
          const issuedAt = DATE_OVERRIDES[orderNumber] || order.paid_at;
          newBatchData.push({
            orderNumber,
            orderId: order.id,
            issuedAt,
            raw: order.raw,
          });
        } else {
          console.warn(`insertAll: Order ${orderNumber} not found`);
        }
      }

      // Sort by issuedAt date (chronological order)
      newBatchData.sort((a, b) => new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime());

      // Insert receipts 10-30 in chronological order
      for (const data of newBatchData) {
        const result = await sql`
          INSERT INTO receipts (order_id, business_id, issued_at, status, payload, type)
          VALUES (
            ${data.orderId},
            NULL,
            ${data.issuedAt},
            'issued',
            ${JSON.stringify(data.raw)},
            'sale'
          )
          RETURNING id;
        `;
        inserted.push({
          receiptId: result.rows[0].id,
          orderNumber: data.orderNumber,
          issuedAt: data.issuedAt,
        });
      }

      return NextResponse.json({
        ok: true,
        insertAll: true,
        siteId,
        deleted: deleteResult.rowCount,
        inserted,
        totalInserted: inserted.length,
      });
    }

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
