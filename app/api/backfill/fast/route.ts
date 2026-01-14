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

    const url = new URL(request.url);

    // PRIORITY: Use URL params if provided (for explicit store selection), otherwise fall back to context
    const urlSiteId = url.searchParams.get("siteId") || url.searchParams.get("site_id");
    const urlInstanceId = url.searchParams.get("instanceId") || url.searchParams.get("instance_id");

    let siteId: string | null = urlSiteId;
    let instanceId: string | null = urlInstanceId;

    // Only fall back to context if no URL params provided
    if (!siteId && !instanceId) {
      const context = await getActiveWixContext();
      siteId = context.siteId;
      instanceId = context.instanceId;
    }

    console.log("🔄 Backfill using store:", { siteId, instanceId, fromUrl: Boolean(urlSiteId || urlInstanceId) });

    if (!siteId && !instanceId) {
      return NextResponse.json(
        { ok: false, error: "Missing Wix context." },
        { status: 400 }
      );
    }

    const startDateIso = resolveStartDateIso(url.searchParams.get("start"));
    const limit = Math.min(Number(url.searchParams.get("limit") || 50), 100);
    const maxPages = Math.min(Number(url.searchParams.get("maxPages") || 5), 20);
    const cursorParam = url.searchParams.get("cursor");
    const reset = url.searchParams.get("reset") === "1";
    const paidOnly = url.searchParams.get("paidOnly") === "1";

    // Get existing sync state
    const syncState = siteId ? await getSyncState(siteId) : null;
    // Use offset-based pagination (cursor doesn't work reliably with Wix API)
    const offsetParam = url.searchParams.get("offset");
    let currentOffset: number = offsetParam != null
      ? Number(offsetParam)
      : (reset ? 0 : (syncState?.cursor ? Number(syncState.cursor) : 0) || 0);

    if (siteId) {
      await upsertSyncState({
        siteId,
        cursor: reset ? null : String(currentOffset),
        status: "running",
        lastError: null,
      });
    }

    let total = 0;
    let pages = 0;
    let moreDataAvailable = true;
    let wixTotal: number | null = null;

    // Fetch and store orders in bulk - NO individual enrichment calls
    while (moreDataAvailable && pages < maxPages) {
      const page = await queryOrders({
        startDateIso,
        offset: currentOffset,
        limit,
        siteId,
        instanceId,
        paymentStatus: paidOnly ? "PAID" : null,
      });

      const orders = page.orders || [];
      wixTotal = page.total;

      // No more data if we got fewer orders than requested
      if (orders.length === 0) {
        moreDataAvailable = false;
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

      // Update offset for next page
      currentOffset += orders.length;
      pages += 1;

      // Check if there's more data
      moreDataAvailable = page.hasMore && orders.length === limit;
    }

    // Determine if sync is complete
    const syncComplete = wixTotal != null ? currentOffset >= wixTotal : !moreDataAvailable;

    // Update sync state
    if (siteId) {
      await upsertSyncState({
        siteId,
        cursor: syncComplete ? null : String(currentOffset),
        status: syncComplete ? "done" : "partial",
        lastError: null,
      });
    }

    return NextResponse.json({
      ok: true,
      total,
      pages,
      offset: currentOffset,
      wixTotal,
      startDateIso,
      hasMore: !syncComplete,
    });
  } catch (error) {
    console.error("Fast sync failed", error);
    const { siteId } = await getActiveWixContext();

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
