import { NextResponse } from "next/server";
import { getLatestWixTokenForSite, initDb, listSyncSites, getSyncState } from "@/lib/db";
import { syncOrdersForSite } from "@/lib/sync";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initDb();
    const sites = await listSyncSites(50);
    const results: Array<{ siteId: string; ok: boolean; error?: string }> = [];
    for (const siteId of sites) {
      try {
        const token = await getLatestWixTokenForSite({ siteId });
        const instanceId = token?.instance_id ?? null;
        const syncState = await getSyncState(siteId);
        await syncOrdersForSite({
          siteId,
          instanceId,
          startDateIso: new Date("2000-01-01T00:00:00Z").toISOString(),
          limit: 100,
          maxPages: 50, // Increased to sync more orders per cron run
          paidOnly: false,
          cursor: syncState?.cursor ?? null,
        });
        results.push({ siteId, ok: true });
      } catch (error) {
        results.push({
          siteId,
          ok: false,
          error: (error as Error).message,
        });
      }
    }
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error("Cron sync failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}
