import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { sql } from "@vercel/postgres";
import { extractTransactionRef } from "@/lib/wix";

/**
 * Debug endpoint to see raw order data and extracted transaction ref
 */
export async function GET(request: Request) {
  try {
    await initDb();
    const url = new URL(request.url);
    const orderNumber = url.searchParams.get("number");

    if (!orderNumber) {
      return NextResponse.json(
        { ok: false, error: "Missing 'number' parameter. Use: ?number=10201" },
        { status: 400 }
      );
    }

    // Find order by number
    const result = await sql`
      SELECT id, number, site_id, status, payment_status, total, raw
      FROM orders
      WHERE number = ${orderNumber}
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: `Order #${orderNumber} not found in database` },
        { status: 404 }
      );
    }

    const order = result.rows[0];
    const raw = order.raw as any;

    // Extract transaction ref
    const txRef = extractTransactionRef(raw);

    // Extract payment method info
    const paymentMethod = {
      type: raw?.paymentMethod?.type ?? null,
      name: raw?.paymentMethod?.name ?? null,
      paymentId: raw?.paymentMethod?.paymentId ?? null,
      transactionId: raw?.paymentMethod?.transactionId ?? null,
    };

    // Extract payment info
    const paymentInfo = {
      paymentId: raw?.paymentInfo?.id ?? null,
      transactionId: raw?.paymentInfo?.transactionId ?? null,
    };

    // Extract orderTransactions
    const orderTransactions = raw?.orderTransactions ?? null;

    // Check for offline payment ID
    const offlinePaymentId =
      raw?.paymentId ??
      raw?.payment?.id ??
      raw?.payments?.[0]?.id ??
      raw?.offlinePaymentId ??
      null;

    return NextResponse.json({
      ok: true,
      order: {
        id: order.id,
        number: order.number,
        status: order.status,
        paymentStatus: order.payment_status,
        total: order.total,
      },
      extracted: {
        transactionRef: txRef,
        offlinePaymentId,
      },
      paymentMethod,
      paymentInfo,
      orderTransactions,
      rawKeys: Object.keys(raw || {}),
    });

  } catch (error) {
    console.error("Order raw debug failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
