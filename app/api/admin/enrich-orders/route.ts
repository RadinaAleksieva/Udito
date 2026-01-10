import { NextResponse } from "next/server";
import { initDb, upsertOrder } from "@/lib/db";
import { sql } from "@vercel/postgres";
import {
  fetchOrderDetails,
  extractTransactionRef,
  extractPaymentSummaryFromPayment,
  pickOrderFields,
} from "@/lib/wix";
import { getActiveWixContext } from "@/lib/wix-context";

/**
 * Admin endpoint to enrich existing orders with missing payment data.
 *
 * This endpoint finds orders that are missing:
 * - Card details (cardProvider, cardLast4)
 * - Transaction reference ID
 *
 * And attempts to fetch this data from Wix API using the improved
 * instanceId-based enrichment logic.
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
    const onlyPaid = url.searchParams.get("onlyPaid") === "1";

    // Find orders with missing payment data
    const effectiveSiteId = siteId ?? instanceId ?? null;
    if (!effectiveSiteId) {
      return NextResponse.json(
        { ok: false, error: "Cannot determine site or instance ID." },
        { status: 400 }
      );
    }

    // Query orders that might be missing payment details
    const result = onlyPaid
      ? await sql`
          SELECT id, site_id, payment_status, raw, created_at
          FROM orders
          WHERE (site_id = ${effectiveSiteId} OR site_id IS NULL)
            AND payment_status = 'PAID'
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT id, site_id, payment_status, raw, created_at
          FROM orders
          WHERE (site_id = ${effectiveSiteId} OR site_id IS NULL)
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;

    const orders = result.rows;

    let enriched = 0;
    let skipped = 0;
    let failed = 0;

    for (const order of orders) {
      try {
        const raw = order.raw as any;
        const orderId = order.id;

        // Check if order already has payment details
        const hasCardDetails = Boolean(
          raw?.paymentMethod?.cardProvider ||
          raw?.paymentMethod?.cardLast4 ||
          raw?.udito?.paymentSummary?.cardBrand ||
          raw?.udito?.paymentSummary?.cardLast4
        );
        const hasTransactionRef = Boolean(extractTransactionRef(raw));

        // If order already has all data, skip enrichment
        if (hasCardDetails && hasTransactionRef) {
          skipped += 1;
          continue;
        }

        // Fetch full order details from Wix
        const enrichedOrder = await fetchOrderDetails({
          orderId,
          siteId: order.site_id ?? siteId ?? null,
          instanceId: instanceId ?? null,
        });

        if (!enrichedOrder) {
          console.warn(`Failed to fetch details for order ${orderId}`);
          failed += 1;
          continue;
        }

        // Extract payment summary from enriched data
        const orderTxPayments = enrichedOrder?.orderTransactions?.payments;
        let paymentSummary = null;
        if (Array.isArray(orderTxPayments) && orderTxPayments.length > 0) {
          const validStatuses = ['APPROVED', 'COMPLETED', 'REFUNDED'];
          const bestPayment = orderTxPayments.find(
            (p: any) => validStatuses.includes(p?.regularPaymentDetails?.status)
          ) || orderTxPayments[0];
          paymentSummary = extractPaymentSummaryFromPayment(bestPayment);
        }

        // Merge enriched data into raw
        const enrichedRaw = {
          ...raw,
          ...enrichedOrder,
          udito: {
            ...(raw.udito ?? {}),
            ...(paymentSummary ? { paymentSummary } : {}),
          },
        };

        // Re-pick fields to ensure consistency
        const mapped = pickOrderFields(enrichedRaw, "enrichment");
        if (!mapped.id) {
          console.warn(`Failed to map enriched order ${orderId}`);
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

        enriched += 1;

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        console.error(`Error enriching order ${order.id}:`, error);
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
    console.error("Enrich orders failed:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
