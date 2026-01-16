import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// POST: Fix receipts - delete fake ones and renumber
export async function POST(request: NextRequest) {
  try {
    await initDb();

    const body = await request.json().catch(() => ({}));
    const action = body.action;

    if (action === "fix-receipts") {
      // 1. Delete fake receipts 39-85
      const deleteResult = await sql`
        DELETE FROM receipts
        WHERE id BETWEEN 39 AND 85
        RETURNING id
      `;

      // 2. Renumber receipt 86 to 39
      const renumberResult = await sql`
        UPDATE receipts
        SET id = 39
        WHERE id = 86
        RETURNING id, order_id
      `;

      return NextResponse.json({
        deleted: deleteResult.rows.length,
        deletedIds: deleteResult.rows.map(r => r.id),
        renumbered: renumberResult.rows[0] ?? null,
      });
    }

    // Default: fix orders with null site_id
    const companiesResult = await sql`
      SELECT site_id FROM companies WHERE site_id IS NOT NULL LIMIT 1
    `;
    const correctSiteId = companiesResult.rows[0]?.site_id;

    if (!correctSiteId) {
      return NextResponse.json({ error: "No company site_id found" }, { status: 400 });
    }

    const updateResult = await sql`
      UPDATE orders
      SET site_id = ${correctSiteId}
      WHERE site_id IS NULL
      RETURNING id, number
    `;

    return NextResponse.json({
      fixed: updateResult.rows.length,
      orders: updateResult.rows,
      siteId: correctSiteId,
    });
  } catch (error) {
    console.error("Fix error:", error);
    return NextResponse.json({
      error: "Internal error",
      message: (error as Error).message,
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await initDb();

    const orderId = request.nextUrl.searchParams.get("id");

    // Check specific order if ID provided
    let specificOrder = null;
    if (orderId) {
      const result = await sql`
        SELECT id, number, site_id, source, payment_status, status, created_at, updated_at,
               raw::text as raw_text
        FROM orders
        WHERE id = ${orderId}
      `;
      const row = result.rows[0];
      if (row) {
        let rawData = null;
        try {
          rawData = JSON.parse(row.raw_text);
        } catch {}
        specificOrder = {
          id: row.id,
          number: row.number,
          site_id: row.site_id,
          source: row.source,
          payment_status: row.payment_status,
          status: row.status,
          created_at: row.created_at,
          updated_at: row.updated_at,
          udito_data: rawData?.udito,
        };
      }
    }

    // Get last 5 orders
    const recentOrders = await sql`
      SELECT id, number, site_id, source, payment_status, created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 5
    `;

    // Get webhook logs for this specific order (if orderId provided)
    const webhookLogsForOrder = orderId ? await sql`
      SELECT id, event_type, order_id, order_number, site_id, instance_id, status, error_message, payload_preview, created_at
      FROM webhook_logs
      WHERE order_id = ${orderId}
      ORDER BY created_at DESC
      LIMIT 10
    ` : null;

    // Get last 10 webhook logs (general)
    const webhookLogs = await sql`
      SELECT id, event_type, order_id, order_number, site_id, instance_id, status, error_message, created_at
      FROM webhook_logs
      ORDER BY created_at DESC
      LIMIT 10
    `;

    // Get companies for comparison
    const companies = await sql`
      SELECT site_id, instance_id, store_name, store_id
      FROM companies
      LIMIT 5
    `;

    // Get order count by source
    const sourceStats = await sql`
      SELECT source, COUNT(*) as count
      FROM orders
      GROUP BY source
    `;

    // Get ALL receipt IDs to check for gaps
    const allReceiptIds = await sql`
      SELECT id FROM receipts ORDER BY id DESC LIMIT 100
    `;

    // Get orphan receipts (receipts without matching orders in this site)
    const orphanReceipts = await sql`
      SELECT r.id, r.order_id, r.issued_at, o.site_id, o.number as order_number, o.customer_name, o.total, o.currency
      FROM receipts r
      LEFT JOIN orders o ON r.order_id = o.id
      WHERE r.id BETWEEN 39 AND 85
      ORDER BY r.id
    `;

    // Get recent receipts with order info
    const recentReceipts = await sql`
      SELECT r.id, r.order_id, r.type, r.issued_at, r.status,
             r.payload->>'receiptNumber' as receipt_number,
             r.payload->>'fiscalReceiptNumber' as fiscal_receipt_number,
             o.number as order_number, o.total as order_total
      FROM receipts r
      LEFT JOIN orders o ON r.order_id = o.id
      ORDER BY r.issued_at DESC
      LIMIT 10
    `;

    // Search for specific order by number if requested
    const orderNumber = request.nextUrl.searchParams.get("number");
    let orderByNumber = null;
    let receiptForOrder = null;
    if (orderNumber) {
      const orderResult = await sql`
        SELECT id, number, total, payment_status, site_id, source, created_at
        FROM orders
        WHERE number = ${orderNumber}
      `;
      orderByNumber = orderResult.rows[0] ?? null;

      if (orderByNumber) {
        const receiptResult = await sql`
          SELECT id, order_id, type, issued_at, status,
                 payload->>'receiptNumber' as receipt_number,
                 payload->>'fiscalReceiptNumber' as fiscal_receipt_number,
                 payload::text as payload_text
          FROM receipts
          WHERE order_id = ${orderByNumber.id}
        `;
        receiptForOrder = receiptResult.rows[0] ?? null;
      }
    }

    return NextResponse.json({
      specificOrder,
      orderByNumber,
      receiptForOrder,
      allReceiptIds: allReceiptIds.rows.map(r => r.id),
      orphanReceipts: orphanReceipts.rows,
      webhookLogsForOrder: webhookLogsForOrder?.rows || [],
      recentOrders: recentOrders.rows,
      recentReceipts: recentReceipts.rows,
      webhookLogs: webhookLogs.rows,
      companies: companies.rows,
      sourceStats: sourceStats.rows,
    });
  } catch (error) {
    console.error("Check order error:", error);
    return NextResponse.json({
      error: "Internal error",
      message: (error as Error).message,
    }, { status: 500 });
  }
}
