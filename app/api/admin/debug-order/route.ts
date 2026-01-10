import { NextResponse } from "next/server";
import { initDb, getOrderById } from "@/lib/db";
import { sql } from "@vercel/postgres";

/**
 * Debug endpoint to inspect order raw data
 * Usage: /api/admin/debug-order?number=10242
 */
export async function GET(request: Request) {
  try {
    await initDb();

    const url = new URL(request.url);
    const orderNumber = url.searchParams.get("number");

    if (!orderNumber) {
      return NextResponse.json({ error: "Missing order number" }, { status: 400 });
    }

    const result = await sql`
      SELECT id, number, payment_status, raw
      FROM orders
      WHERE number = ${orderNumber}
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const order = result.rows[0];
    const raw = order.raw as any;

    return NextResponse.json({
      orderNumber: order.number,
      orderId: order.id,
      paymentStatus: order.payment_status,
      hasOrderTransactions: !!raw?.orderTransactions,
      hasPayments: !!raw?.orderTransactions?.payments,
      paymentsCount: raw?.orderTransactions?.payments?.length || 0,
      firstPayment: raw?.orderTransactions?.payments?.[0] || null,
      uditoData: raw?.udito || null,
      rawKeys: Object.keys(raw || {}),
    }, null, 2);

  } catch (error) {
    console.error("Debug order error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
