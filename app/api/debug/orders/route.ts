import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get all orders with number 10232
    const order10232 = await sql`
      SELECT id, number, site_id, status, payment_status, created_at, source
      FROM orders
      WHERE number = '10232'
      ORDER BY created_at DESC
      LIMIT 5
    `;

    // Get total count of all orders
    const totalCount = await sql`
      SELECT COUNT(*) as count FROM orders
    `;

    // Get count of orders with null site_id
    const nullSiteIdCount = await sql`
      SELECT COUNT(*) as count FROM orders WHERE site_id IS NULL
    `;

    // Get recent orders
    const recentOrders = await sql`
      SELECT id, number, site_id, status, payment_status, created_at, source
      FROM orders
      ORDER BY created_at DESC
      LIMIT 10
    `;

    return NextResponse.json({
      order10232: order10232.rows,
      totalCount: totalCount.rows[0],
      nullSiteIdCount: nullSiteIdCount.rows[0],
      recentOrders: recentOrders.rows,
    });
  } catch (error) {
    console.error("Debug query failed", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
