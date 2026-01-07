"use client";

import { useState, useCallback } from "react";

type BackfillState =
  | { status: "idle" }
  | { status: "loading"; total: number; pages: number }
  | { status: "ok"; total: number; pages: number }
  | { status: "error"; message: string; total?: number };

export default function BackfillButton() {
  const [state, setState] = useState<BackfillState>({ status: "idle" });

  const runFullBackfill = useCallback(async () => {
    setState({ status: "loading", total: 0, pages: 0 });
    let totalSynced = 0;
    let totalPages = 0;
    let cursor: string | null = null;
    let previousCursor: string | null = null;
    let isFirstRun = true;
    let consecutiveErrors = 0;

    try {
      // Keep syncing until no more cursor (all orders synced)
      do {
        const params = new URLSearchParams({
          limit: "50", // Larger batch - fast sync doesn't do per-order API calls
          maxPages: "5", // Multiple pages per request
          start: "2000-01-01T00:00:00Z",
        });
        if (isFirstRun) {
          params.set("reset", "1"); // Reset on first run
          isFirstRun = false;
        }
        if (cursor) {
          params.set("cursor", cursor);
        }

        try {
          const response = await fetch(`/api/backfill/fast?${params.toString()}`, {
            method: "POST",
            credentials: "include",
          });
          const data = await response.json();

          if (!response.ok || !data?.ok) {
            throw new Error(data?.error || "Backfill failed.");
          }

          totalSynced += Number(data.total || 0);
          totalPages += Number(data.pages || 0);
          const newCursor = data.cursor ?? null;

          // CRITICAL: Detect repeated cursor (Wix API returns same cursor when no more data)
          if (newCursor && newCursor === previousCursor) {
            console.log("Detected repeated cursor - stopping sync");
            cursor = null;
            break;
          }
          previousCursor = cursor;
          cursor = newCursor;
          consecutiveErrors = 0; // Reset error count on success

          setState({ status: "loading", total: totalSynced, pages: totalPages });
        } catch (error) {
          consecutiveErrors += 1;
          if (consecutiveErrors >= 3) {
            throw error; // Give up after 3 consecutive errors
          }
          // Retry with same cursor after a short delay
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }

        // Small delay between requests to be kind to the server
        if (cursor) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      } while (cursor);

      setState({ status: "ok", total: totalSynced, pages: totalPages });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Backfill failed.",
        total: totalSynced,
      });
    }
  }, []);

  return (
    <div className="cta-row">
      <button
        className="cta cta-secondary"
        onClick={runFullBackfill}
        disabled={state.status === "loading"}
      >
        {state.status === "loading"
          ? `Синхронизиране... (${state.total} поръчки)`
          : "Пълна синхронизация"}
      </button>
      {state.status === "ok" ? (
        <span className="status-meta">
          Готово! {state.total} поръчки от {state.pages} страници.
        </span>
      ) : null}
      {state.status === "error" ? (
        <span className="status-meta">
          Грешка: {state.message}
          {state.total ? ` (синхронизирани ${state.total})` : ""}
        </span>
      ) : null}
    </div>
  );
}
