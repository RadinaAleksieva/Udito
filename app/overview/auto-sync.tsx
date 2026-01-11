"use client";

import { useEffect } from "react";

const INITIAL_SYNC_KEY = "udito_initial_sync_done";
const AUTO_SYNC_KEY = "udito_auto_sync_at";
const AUTO_SYNC_WINDOW_MS = 10 * 60 * 1000; // 10 minutes window (less frequent)
const AUTO_SYNC_MAX_RUNS = 5; // Fewer runs since we only sync recent orders
const AUTO_SYNC_DELAY_MS = 500;
const FIX_PAYMENTS_KEY = "udito_fix_payments_at";
const FIX_PAYMENTS_WINDOW_MS = 30 * 60 * 1000; // 30 minutes window

export default function AutoSync() {
  useEffect(() => {
    const now = Date.now();

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

    const runSync = async (cursor?: string | null, run = 0) => {
      if (run >= AUTO_SYNC_MAX_RUNS) return;

      // If initial sync done, only sync last 7 days
      // If not done, do full sync from 2000
      const startDate = initialSyncDone
        ? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        : "2000-01-01T00:00:00Z";

      const params = new URLSearchParams({
        auto: "1",
        limit: "100",
        maxPages: initialSyncDone ? "3" : "20", // Fewer pages for incremental sync
        start: startDate,
      });

      // Only reset on first-ever sync, not on subsequent syncs
      if (run === 0 && !cursor && !initialSyncDone) {
        params.set("reset", "1");
      }
      if (cursor) params.set("cursor", cursor);

      const response = await fetch(`/api/backfill?${params.toString()}`, {
        method: "POST",
        credentials: "include",
      });
      if (!response.ok) return;
      const data = (await response.json()) as { cursor?: string | null };
      if (data?.cursor) {
        setTimeout(() => {
          void runSync(data.cursor ?? null, run + 1);
        }, AUTO_SYNC_DELAY_MS);
      } else {
        // Mark initial sync as done
        if (!initialSyncDone) {
          localStorage.setItem(INITIAL_SYNC_KEY, "true");
        }
        // Backfill completed, now fix missing payment data
        runFixPayments();
      }
    };

    const runFixPayments = async () => {
      try {
        // Check if we already ran fix payments recently
        const lastFixRun = Number(localStorage.getItem(FIX_PAYMENTS_KEY) || 0);
        if (lastFixRun && now - lastFixRun < FIX_PAYMENTS_WINDOW_MS) {
          return;
        }

        console.log("🔄 Starting payment enrichment for old orders...");

        // Run enrich old orders endpoint
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
        // Background fix is best-effort
      }
    };

    runSync().catch(() => {
      // Background sync is best-effort.
    });
  }, []);

  return null;
}
