import { NextResponse } from "next/server";
import { initDb, getOrdersMissingTransactionRef, updateOrderTransactionRef } from "@/lib/db";
import { fetchTransactionRefForOrder } from "@/lib/wix";
import { getActiveWixContext } from "@/lib/wix-context";

/**
 * Enriches paid orders with missing transaction references
 * by fetching them from Wix Payments API
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
    const limit = Math.min(Number(url.searchParams.get("limit") || 20), 100);

    // Get paid orders missing transaction refs
    const orders = await getOrdersMissingTransactionRef(siteId, limit);

    if (orders.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No orders need enrichment",
        enriched: 0,
        total: 0,
      });
    }

    let enriched = 0;
    let failed = 0;
    const results: Array<{ orderId: string; orderNumber: string; transactionRef: string | null; error?: string }> = [];

    for (const order of orders) {
      try {
        const transactionRef = await fetchTransactionRefForOrder({
          orderId: order.id,
          siteId,
          instanceId,
        });

        if (transactionRef) {
          await updateOrderTransactionRef(order.id, transactionRef);
          enriched++;
          results.push({
            orderId: order.id,
            orderNumber: order.number,
            transactionRef,
          });
        } else {
          failed++;
          results.push({
            orderId: order.id,
            orderNumber: order.number,
            transactionRef: null,
            error: "No transaction ref found in Wix",
          });
        }
      } catch (error) {
        failed++;
        results.push({
          orderId: order.id,
          orderNumber: order.number,
          transactionRef: null,
          error: (error as Error).message,
        });
      }

      // Small delay to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return NextResponse.json({
      ok: true,
      total: orders.length,
      enriched,
      failed,
      results,
    });
  } catch (error) {
    console.error("Enrich transactions failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
