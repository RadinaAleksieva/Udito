import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const searchNumber = url.searchParams.get("number");

  try {
    // Search for specific order if number provided
    let searchResult = null;
    if (searchNumber) {
      const result = await sql`
        SELECT id, number, site_id, status, payment_status, created_at, paid_at, source
        FROM orders
        WHERE number = ${searchNumber}
        LIMIT 5
      `;
      searchResult = result.rows;
    }

    // Get total count of all orders
    const totalCount = await sql`
      SELECT COUNT(*) as count FROM orders
    `;

    // Get recent orders - sorted by number descending to see newest
    const recentOrders = await sql`
      SELECT id, number, site_id, status, payment_status, created_at, paid_at, source
      FROM orders
      ORDER BY CAST(number AS INTEGER) DESC NULLS LAST
      LIMIT 20
    `;

    return NextResponse.json({
      searchNumber,
      searchResult,
      totalCount: totalCount.rows[0],
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
