import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET() {
  // Check orders for January 2026
  const januaryOrders = await sql`
    SELECT
      number,
      site_id,
      created_at,
      paid_at,
      status,
      payment_status,
      total,
      customer_name
    FROM orders
    WHERE created_at >= '2026-01-01' AND created_at < '2026-02-01'
    ORDER BY created_at DESC
    LIMIT 50
  `;

  // Check receipts for January 2026
  const januaryReceipts = await sql`
    SELECT
      r.id as receipt_id,
      r.order_id,
      r.issued_at,
      r.type,
      o.number as order_number,
      o.site_id
    FROM receipts r
    LEFT JOIN orders o ON o.id = r.order_id
    WHERE r.issued_at >= '2026-01-01' AND r.issued_at < '2026-02-01'
    ORDER BY r.issued_at DESC
    LIMIT 50
  `;

  // Check white-rabbit site
  const whiteRabbitSite = await sql`
    SELECT site_id, store_name, instance_id
    FROM companies
    WHERE store_name ILIKE '%rabbit%' OR store_name ILIKE '%light%'
  `;

  // Count orders by site_id
  const ordersBySite = await sql`
    SELECT
      site_id,
      COUNT(*) as order_count
    FROM orders
    WHERE created_at >= '2026-01-01' AND created_at < '2026-02-01'
    GROUP BY site_id
  `;

  return NextResponse.json({
    januaryOrders: januaryOrders.rows,
    januaryReceipts: januaryReceipts.rows,
    whiteRabbitSite: whiteRabbitSite.rows,
    ordersBySite: ordersBySite.rows,
    summary: {
      totalJanuaryOrders: januaryOrders.rows.length,
      totalJanuaryReceipts: januaryReceipts.rows.length
    }
  });
}
