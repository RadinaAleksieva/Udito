import { NextResponse } from "next/server";
import { initDb, upsertOrder } from "@/lib/db";
import { sql } from "@vercel/postgres";
import {
  fetchOrderDetails,
  fetchOrderTransactionsForOrder,
  extractPaymentSummaryFromPayment,
  pickOrderFields,
} from "@/lib/wix";
import { getActiveWixContext } from "@/lib/wix-context";

/**
 * Admin endpoint to fix payment data for orders missing transaction refs
 */
export async function POST(request: Request) {
  try {
    await initDb();
    const { siteId, instanceId } = getActiveWixContext();

    if (!siteId && !instanceId) {
      return NextResponse.json(
        { ok: false, error: "Missing Wix context." },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);

    // Find paid orders missing payment data
    const effectiveSiteId = siteId ?? instanceId ?? null;
    const result = await sql`
      SELECT id, number, site_id, payment_status, raw, created_at
      FROM orders
      WHERE (site_id = ${effectiveSiteId} OR site_id IS NULL)
        AND payment_status = 'PAID'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    const orders = result.rows;
    let fixed = 0;
    let skipped = 0;
    let failed = 0;

    for (const order of orders) {
      try {
        const raw = order.raw as any;
        const orderId = order.id;

        // Fetch order transactions (payment data)
        const orderTx = await fetchOrderTransactionsForOrder({
          orderId,
          siteId: order.site_id ?? siteId ?? null,
          instanceId: instanceId ?? null,
        });

        if (!orderTx || !orderTx.orderTransactions) {
          console.warn(`No payment data found for order ${order.number}`);
          skipped += 1;
          continue;
        }

        // Extract payment summary
        const orderTxPayments = orderTx.payments;
        let paymentSummary = null;
        let offlinePaymentId = null;

        if (Array.isArray(orderTxPayments) && orderTxPayments.length > 0) {
          const validStatuses = ['APPROVED', 'COMPLETED', 'REFUNDED'];
          const bestPayment = orderTxPayments.find(
            (p: any) => validStatuses.includes(p?.regularPaymentDetails?.status)
          ) || orderTxPayments[0];

          paymentSummary = extractPaymentSummaryFromPayment(bestPayment);

          // Extract offline payment ID if exists
          offlinePaymentId =
            bestPayment?.id ??
            bestPayment?.paymentId ??
            bestPayment?.regularPaymentDetails?.paymentId ??
            orderTx.orderTransactions?.id ??
            null;

          console.log(`Order ${order.number}: offlinePaymentId =`, offlinePaymentId);
        }

        // Merge payment data into raw
        const enrichedRaw = {
          ...raw,
          orderTransactions: orderTx.orderTransactions,
          udito: {
            ...(raw.udito ?? {}),
            ...(paymentSummary ? { paymentSummary } : {}),
            ...(offlinePaymentId ? { offlinePaymentId } : {}),
          },
        };

        // Re-pick fields
        const mapped = pickOrderFields(enrichedRaw, "backfill");
        if (!mapped.id) {
          console.warn(`Failed to map order ${orderId}`);
          failed += 1;
          continue;
        }

        // Update order in database
        await upsertOrder({
          ...mapped,
          siteId: order.site_id ?? siteId ?? null,
          businessId: null,
          raw: enrichedRaw,
        });

        fixed += 1;
        console.log(`✅ Fixed payment data for order ${order.number}`);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error fixing order ${order.number}:`, error);
        failed += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      total: orders.length,
      fixed,
      skipped,
      failed,
      message: `Fixed ${fixed} orders, skipped ${skipped}, failed ${failed}.`,
    });

  } catch (error) {
    console.error("Fix payments failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
