import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");

  try {
    // Get recent receipts
    const recentReceipts = await sql`
      SELECT id, order_id, type, issued_at
      FROM receipts
      ORDER BY issued_at DESC
      LIMIT 10
    `;

    // Search by order_id if provided
    let orderReceipts = null;
    if (orderId) {
      const result = await sql`
        SELECT * FROM receipts WHERE order_id = ${orderId}
      `;
      orderReceipts = result.rows;
    }

    // Count total receipts
    const totalCount = await sql`
      SELECT COUNT(*) as count FROM receipts
    `;

    return NextResponse.json({
      orderId,
      orderReceipts,
      totalCount: totalCount.rows[0],
      recentReceipts: recentReceipts.rows,
    });
  } catch (error) {
    console.error("Debug receipts query failed", error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
