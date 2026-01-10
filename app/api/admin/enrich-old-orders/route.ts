import { NextResponse } from "next/server";
import { initDb, upsertOrder } from "@/lib/db";
import { sql } from "@vercel/postgres";
import {
  fetchOrderTransactionsForOrder,
  extractPaymentSummaryFromPayment,
  pickOrderFields,
} from "@/lib/wix";
import { getActiveWixToken } from "@/lib/wix-context";

/**
 * Enriches old orders with missing payment data
 * Only processes orders that don't have orderTransactions
 */
export async function POST(request: Request) {
  try {
    await initDb();

    // Get active Wix token
    const token = await getActiveWixToken();
    const activeSiteId = token?.site_id ?? null;
    const activeInstanceId = token?.instance_id ?? null;

    if (!activeSiteId && !activeInstanceId) {
      return NextResponse.json(
        { ok: false, error: "No active Wix session. Please open from Wix dashboard." },
        { status: 401 }
      );
    }

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);

    const effectiveSiteId = activeSiteId ?? activeInstanceId ?? null;

    // Find PAID orders missing orderTransactions
    const result = await sql`
      SELECT id, number, site_id, payment_status, raw, created_at
      FROM orders
      WHERE (site_id = ${effectiveSiteId} OR site_id IS NULL)
        AND payment_status = 'PAID'
        AND (
          raw IS NULL
          OR raw::jsonb -> 'orderTransactions' IS NULL
          OR raw::jsonb -> 'orderTransactions' -> 'payments' IS NULL
          OR jsonb_array_length((raw::jsonb -> 'orderTransactions' -> 'payments')::jsonb) = 0
        )
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    const orders = result.rows;
    let enriched = 0;
    let skipped = 0;
    let failed = 0;

    console.log(`🔍 Found ${orders.length} old orders needing payment data`);

    for (const order of orders) {
      try {
        const orderId = order.id;
        const raw = order.raw as any;

        // Fetch orderTransactions
        const orderTx = await fetchOrderTransactionsForOrder({
          orderId,
          siteId: order.site_id ?? activeSiteId ?? null,
          instanceId: activeInstanceId ?? null,
        });

        if (!orderTx?.orderTransactions && !orderTx?.payments) {
          console.warn(`No payment data found for order ${order.number}`);
          skipped += 1;
          continue;
        }

        // Merge orderTransactions into raw
        const enrichedRaw = {
          ...raw,
          orderTransactions: orderTx.orderTransactions ?? { payments: orderTx.payments },
        };

        // Extract payment summary for udito field
        const payments = orderTx.payments ?? orderTx.orderTransactions?.payments;
        if (Array.isArray(payments) && payments.length > 0) {
          const validStatuses = ['APPROVED', 'COMPLETED', 'REFUNDED'];
          const bestPayment = payments.find(
            (p: any) => validStatuses.includes(p?.regularPaymentDetails?.status)
          ) || payments[0];

          const paymentSummary = extractPaymentSummaryFromPayment(bestPayment);

          // Get gatewayTransactionId (correct payment ID)
          const transactionRef =
            bestPayment?.regularPaymentDetails?.gatewayTransactionId ??
            bestPayment?.regularPaymentDetails?.providerTransactionId ??
            bestPayment?.id ??
            null;

          enrichedRaw.udito = {
            ...(enrichedRaw.udito ?? {}),
            ...(paymentSummary ? { paymentSummary } : {}),
            ...(transactionRef ? { transactionRef } : {}),
          };
        }

        // Re-pick fields and update
        const mapped = pickOrderFields(enrichedRaw, "backfill");
        if (!mapped.id) {
          console.warn(`Failed to map order ${orderId}`);
          failed += 1;
          continue;
        }

        await upsertOrder({
          ...mapped,
          siteId: order.site_id ?? activeSiteId ?? null,
          businessId: null,
          raw: enrichedRaw,
        });

        enriched += 1;
        console.log(`✅ Enriched order ${order.number}`);

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error enriching order ${order.number}:`, error);
        failed += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      total: orders.length,
      enriched,
      skipped,
      failed,
      message: `Enriched ${enriched} orders, skipped ${skipped}, failed ${failed}.`,
    });

  } catch (error) {
    console.error("Enrich old orders failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
