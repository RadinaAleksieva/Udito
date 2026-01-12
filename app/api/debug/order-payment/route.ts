import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  await initDb();

  const { searchParams } = new URL(request.url);
  const orderNumber = searchParams.get("order") || "10184";

  try {
    // Find order by number
    const orderResult = await sql`
      SELECT
        o.id,
        o.number,
        o.total,
        o.currency,
        o.customer_name,
        o.payment_status,
        o.raw,
        r.id as receipt_id,
        r.type as receipt_type,
        r.issued_at
      FROM orders o
      LEFT JOIN receipts r ON r.order_id = o.id
      WHERE o.number = ${orderNumber}
    `;

    if (orderResult.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Order not found" });
    }

    const row = orderResult.rows[0];
    const raw = row.raw || {};

    // Extract all payment-related fields for debugging
    const paymentDebug = {
      orderNumber: row.number,
      customerName: row.customer_name,
      total: row.total,
      currency: row.currency,
      paymentStatus: row.payment_status,
      receiptType: row.receipt_type,
      receiptIssuedAt: row.issued_at,

      // Payment detection sources
      orderTransactionsPayments: raw?.orderTransactions?.payments?.map((p: any) => ({
        offlinePayment: p?.regularPaymentDetails?.offlinePayment,
        paymentMethod: p?.regularPaymentDetails?.paymentMethod,
        providerTransactionId: p?.regularPaymentDetails?.providerTransactionId,
        fullRegularPaymentDetails: p?.regularPaymentDetails,
      })),

      paymentsArray: raw?.payments?.map((p: any) => ({
        offlinePayment: p?.regularPaymentDetails?.offlinePayment,
        paymentMethod: p?.regularPaymentDetails?.paymentMethod ?? p?.paymentMethod,
        methodType: p?.method?.type,
        methodName: p?.method?.name,
      })),

      // Check for COD indicators
      shippingTitle: raw?.shippingInfo?.title ?? raw?.shippingInfo?.shipmentDetails?.methodName,
      channelExternalOrderId: raw?.channelInfo?.externalOrderId,
      paymentStatusFromRaw: raw?.paymentStatus,

      // Udito enrichment
      uditoPaymentSummary: raw?.udito?.paymentSummary,
    };

    return NextResponse.json({
      ok: true,
      paymentDebug,
      // Also show first 500 chars of raw for reference
      rawSample: JSON.stringify(raw).substring(0, 1000),
    });
  } catch (error) {
    console.error("Error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
