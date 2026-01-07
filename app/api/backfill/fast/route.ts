import { NextResponse } from "next/server";
import { initDb, upsertOrder, upsertSyncState, getSyncState } from "@/lib/db";
import { queryOrders, pickOrderFields, extractTransactionRef, extractDeliveryMethodFromOrder } from "@/lib/wix";
import { getActiveWixContext } from "@/lib/wix-context";

/**
 * Fast Sync API - Bulk imports orders WITHOUT per-order enrichment API calls.
 *
 * This is designed for initial bulk sync of thousands of orders.
 * It fetches orders from Wix and stores them immediately without:
 * - Individual order detail lookups
 * - Individual payment record lookups
 * - Individual transaction ref lookups
 *
 * Payment data enrichment can happen later via:
 * - Webhooks for new payments
 * - A separate batch enrichment process
 * - Lazy loading when viewing individual orders
 */

function resolveStartDateIso(startParam?: string | null) {
  if (startParam) {
    const parsed = new Date(startParam);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed.toISOString();
    }
  }
  return new Date("2000-01-01T00:00:00Z").toISOString();
}

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
    const startDateIso = resolveStartDateIso(url.searchParams.get("start"));
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
    const maxPages = Math.min(Number(url.searchParams.get("maxPages") || 5), 20);
    const cursorParam = url.searchParams.get("cursor");
    const reset = url.searchParams.get("reset") === "1";
    const paidOnly = url.searchParams.get("paidOnly") === "1";

    // Get existing sync state
    const syncState = siteId ? await getSyncState(siteId) : null;
    let cursor: string | null = cursorParam ?? (reset ? null : syncState?.cursor ?? null);

    if (siteId) {
      await upsertSyncState({
        siteId,
        cursor: reset ? null : cursor,
        status: "running",
        lastError: null,
      });
    }

    let total = 0;
    let pages = 0;
    let hasMore = true;

    // Fetch and store orders in bulk - NO individual enrichment calls
    while (hasMore && pages < maxPages) {
      const page = await queryOrders({
        startDateIso,
        cursor,
        limit,
        siteId,
        instanceId,
        paymentStatus: paidOnly ? "PAID" : null,
      });

      const orders = page.orders || [];

      // CRITICAL: Detect if Wix returns the same cursor we sent (indicates end of pagination)
      // Wix API sometimes returns the same cursor instead of null when there's no more data
      if (page.cursor && page.cursor === cursor) {
        console.log("Detected repeated cursor - end of pagination");
        cursor = null;
        hasMore = false;
        break;
      }

      for (const rawItem of orders) {
        const raw = rawItem as any;
        const base = pickOrderFields(raw, "backfill");

        if (!base.id) continue;

        // Extract what we can from the raw order data without making API calls
        const deliveryMethod = extractDeliveryMethodFromOrder(raw);
        const transactionRef = extractTransactionRef(raw);

        // Enrich raw with any extracted data
        let orderRaw = raw;
        if (deliveryMethod || transactionRef) {
          orderRaw = {
            ...raw,
            udito: {
              ...(raw.udito ?? {}),
              ...(deliveryMethod ? { deliveryMethod } : {}),
              ...(transactionRef ? { transactionRef } : {}),
            },
          };
        }

        const mapped = orderRaw === raw ? base : pickOrderFields(orderRaw, "backfill");
        if (!mapped.id) continue;

        const siteIdResolved = mapped.siteId ?? siteId ?? null;

        // Store order immediately - no additional API calls
        await upsertOrder({
          ...mapped,
          siteId: siteIdResolved,
          businessId: null,
          raw: orderRaw,
        });

        total += 1;
      }

      cursor = page.cursor ?? null;
      pages += 1;
      hasMore = Boolean(cursor) && orders.length > 0;
    }

    // Update sync state
    if (siteId) {
      await upsertSyncState({
        siteId,
        cursor,
        status: cursor ? "partial" : "done",
        lastError: null,
      });
    }

    return NextResponse.json({
      ok: true,
      total,
      pages,
      cursor,
      startDateIso,
      hasMore: Boolean(cursor),
    });
  } catch (error) {
    console.error("Fast sync failed", error);
    const { siteId } = getActiveWixContext();

    if (siteId) {
      await upsertSyncState({
        siteId,
        cursor: null,
        status: "error",
        lastError: (error as Error).message,
      });
    }

    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
