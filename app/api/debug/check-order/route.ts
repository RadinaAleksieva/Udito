import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

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

    return NextResponse.json({
      specificOrder,
      webhookLogsForOrder: webhookLogsForOrder?.rows || [],
      recentOrders: recentOrders.rows,
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
