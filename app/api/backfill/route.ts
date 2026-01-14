import { NextResponse } from "next/server";
import { getSyncState, initDb, upsertSyncState } from "@/lib/db";
import { syncOrdersForSite } from "@/lib/sync";
import { getActiveStore } from "@/lib/auth";

function resolveStartDateIso(startParam?: string | null) {
  if (startParam) {
    const parsed = new Date(startParam);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed.toISOString();
    }
  }
  const fallback = new Date("2000-01-01T00:00:00Z");
  return fallback.toISOString();
}

export async function POST(request: Request) {
  try {
    await initDb();
    const url = new URL(request.url);
    const storeParam = url.searchParams.get("store");
    const store = await getActiveStore(storeParam);
    const siteId = store?.siteId ?? null;
    const instanceId = store?.instanceId ?? null;
    if (!siteId && !instanceId) {
      return NextResponse.json(
        { ok: false, error: "Missing Wix context." },
        { status: 400 }
      );
    }
    const startDateIso = resolveStartDateIso(url.searchParams.get("start"));
    const limit = Number(url.searchParams.get("limit") || 100);
    const maxPages = Number(url.searchParams.get("maxPages") || 10);
    const paidOnly = url.searchParams.get("paidOnly") === "1";
    const cursorParam = url.searchParams.get("cursor");
    const reset = url.searchParams.get("reset") === "1";
    const auto = url.searchParams.get("auto") === "1";
    const syncState = siteId ? await getSyncState(siteId) : null;

    let cursor: string | null = cursorParam ?? (auto ? syncState?.cursor ?? null : null);
    if (reset) {
      cursor = null;
    }

    if (siteId) {
      await upsertSyncState({
        siteId,
        cursor: reset ? null : cursor,
        status: "running",
        lastError: null,
      });
    }
    if (auto && !cursorParam && siteId) {
      const latest = await syncOrdersForSite({
        siteId,
        instanceId,
        startDateIso,
        limit,
        maxPages: 1,
        paidOnly,
        cursor: null,
      });
      if (latest.cursor && !syncState?.cursor) {
        cursor = latest.cursor;
      }
    }

    const result = siteId
      ? await syncOrdersForSite({
          siteId,
          instanceId,
          startDateIso,
          limit,
          maxPages,
          paidOnly,
          cursor,
        })
      : { cursor: null, total: 0, pages: 0, receiptsIssued: 0, receiptsSkipped: 0 };

    if (siteId) {
      const nextCursor = result.cursor ?? null;
      await upsertSyncState({
        siteId,
        cursor: nextCursor,
        status: nextCursor ? "partial" : "done",
        lastError: null,
      });
    }
    return NextResponse.json({
      ok: true,
      total: result.total,
      pages: result.pages,
      receiptsIssued: result.receiptsIssued,
      receiptsSkipped: result.receiptsSkipped,
      startDateIso,
      cursor: result.cursor ?? null,
    });
  } catch (error) {
    console.error("Backfill failed", error);
    const store = await getActiveStore();
    const errorSiteId = store?.siteId ?? store?.instanceId ?? null;
    if (errorSiteId) {
      await upsertSyncState({
        siteId: errorSiteId,
        cursor: null,
        status: "error",
        lastError: (error as Error).message,
      });
    }
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
