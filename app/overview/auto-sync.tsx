"use client";

import { useEffect } from "react";

// SYNC VERSION: Increment this when sync logic changes significantly
// This forces all stores to re-sync automatically
const SYNC_VERSION = 2; // v2: Fixed offset-based pagination (was cursor-based, only got first page)

const INITIAL_SYNC_KEY = "udito_initial_sync_done";
const SYNC_VERSION_KEY = "udito_sync_version";
const AUTO_SYNC_KEY = "udito_auto_sync_at";
const AUTO_SYNC_WINDOW_MS = 30 * 60 * 1000; // 30 minutes window - balance between freshness and resource usage
const AUTO_SYNC_DELAY_MS = 300;
const FIX_PAYMENTS_KEY = "udito_fix_payments_at";
const FIX_PAYMENTS_WINDOW_MS = 30 * 60 * 1000; // 30 minutes window

export default function AutoSync() {
  useEffect(() => {
    const now = Date.now();

    // Check sync version - if outdated, force a full re-sync
    const storedVersion = Number(localStorage.getItem(SYNC_VERSION_KEY) || 0);
    if (storedVersion < SYNC_VERSION) {
      console.log(`🔄 Sync version updated (${storedVersion} → ${SYNC_VERSION}), forcing full re-sync...`);
      localStorage.removeItem(INITIAL_SYNC_KEY);
      localStorage.removeItem(AUTO_SYNC_KEY);
      localStorage.setItem(SYNC_VERSION_KEY, String(SYNC_VERSION));
    }

    // Check if initial sync was ever done
    const initialSyncDone = localStorage.getItem(INITIAL_SYNC_KEY) === "true";

    try {
      const lastRun = Number(localStorage.getItem(AUTO_SYNC_KEY) || 0);
      if (lastRun && now - lastRun < AUTO_SYNC_WINDOW_MS) {
        return;
      }
      localStorage.setItem(AUTO_SYNC_KEY, String(now));
    } catch {
      // Ignore storage errors; still attempt sync once.
    }

    // Track total synced across all runs
    let totalSynced = 0;

    const runSync = async (offset = 0, consecutiveEmpty = 0) => {
      // Stop if we've had 3 consecutive empty pages (sync complete)
      if (consecutiveEmpty >= 3) {
        console.log(`✅ Auto-sync complete! Total synced: ${totalSynced} orders`);
        if (!initialSyncDone) {
          localStorage.setItem(INITIAL_SYNC_KEY, "true");
        }
        runFixPayments();
        return;
      }

      // For initial sync: start from beginning, sync ALL orders
      // For incremental sync: only last 7 days
      const startDate = initialSyncDone
        ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        : "2000-01-01T00:00:00Z";

      const params = new URLSearchParams({
        auto: "1",
        limit: "100",
        maxPages: "10", // Process 10 pages per request (1000 orders)
        start: startDate,
        cursor: String(offset), // Use offset as cursor
      });

      // Reset on first-ever sync
      if (offset === 0 && !initialSyncDone) {
        params.set("reset", "1");
      }

      try {
        const response = await fetch(`/api/backfill?${params.toString()}`, {
          method: "POST",
          credentials: "include",
        });

        if (!response.ok) {
          console.error("❌ Sync request failed:", response.status);
          return;
        }

        const data = await response.json() as {
          cursor?: string | null;
          total?: number;
          hasMore?: boolean;
        };

        const synced = data.total ?? 0;
        totalSynced += synced;

        if (synced > 0) {
          console.log(`📦 Synced ${synced} orders (total: ${totalSynced})`);
        }

        // Continue if there's more data
        if (data.hasMore && data.cursor) {
          const nextOffset = parseInt(data.cursor, 10) || offset + 1000;
          setTimeout(() => {
            void runSync(nextOffset, synced === 0 ? consecutiveEmpty + 1 : 0);
          }, AUTO_SYNC_DELAY_MS);
        } else {
          // No more data - sync complete
          console.log(`✅ Auto-sync complete! Total synced: ${totalSynced} orders`);
          if (!initialSyncDone) {
            localStorage.setItem(INITIAL_SYNC_KEY, "true");
          }
          runFixPayments();
        }
      } catch (error) {
        console.error("❌ Sync error:", error);
      }
    };

    const runFixPayments = async () => {
      try {
        const lastFixRun = Number(localStorage.getItem(FIX_PAYMENTS_KEY) || 0);
        if (lastFixRun && now - lastFixRun < FIX_PAYMENTS_WINDOW_MS) {
          return;
        }

        console.log("🔄 Starting payment enrichment for old orders...");

        const response = await fetch("/api/admin/enrich-old-orders?limit=100", {
          method: "POST",
          credentials: "include",
        });

        if (response.ok) {
          const data = await response.json();
          console.log("✅ Payment enrichment completed:", data);
          if (data.enriched > 0) {
            console.log(`🎉 Successfully enriched ${data.enriched} old orders with payment data!`);
          }
          localStorage.setItem(FIX_PAYMENTS_KEY, String(Date.now()));
        } else {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          console.error("❌ Payment enrichment failed:", response.status, errorData);
        }
      } catch (error) {
        console.error("❌ Payment enrichment exception:", error);
      }
    };

    runSync().catch(() => {
      // Background sync is best-effort.
    });
  }, []);

  return null;
}
