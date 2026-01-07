"use client";

import { useEffect } from "react";

const AUTO_SYNC_KEY = "udito_auto_sync_at";
const AUTO_SYNC_WINDOW_MS = 2 * 60 * 1000; // 2 minutes window
const AUTO_SYNC_MAX_RUNS = 30; // Allow more runs to sync all orders
const AUTO_SYNC_DELAY_MS = 500; // Faster retries

export default function AutoSync() {
  useEffect(() => {
    const now = Date.now();
    let shouldReset = true;
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
      const params = new URLSearchParams({
        auto: "1",
        limit: "100",
        maxPages: "20", // More pages per run
        start: "2000-01-01T00:00:00Z",
      });
      if (run === 0 && !cursor && shouldReset) params.set("reset", "1");
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
      }
    };

    runSync().catch(() => {
      // Background sync is best-effort.
    });
  }, []);

  return null;
}
