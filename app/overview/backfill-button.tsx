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
    let isFirstRun = true;

    try {
      // Keep syncing until no more cursor (all orders synced)
      do {
        const params = new URLSearchParams({
          limit: "100",
          maxPages: "50", // More pages per request
          start: "2000-01-01T00:00:00Z",
        });
        if (isFirstRun) {
          params.set("reset", "1"); // Reset on first run
          isFirstRun = false;
        }
        if (cursor) {
          params.set("cursor", cursor);
        }

        const response = await fetch(`/api/backfill?${params.toString()}`, {
          method: "POST",
          credentials: "include",
        });
        const data = await response.json();

        if (!response.ok || !data?.ok) {
          throw new Error(data?.error || "Backfill failed.");
        }

        totalSynced += Number(data.total || 0);
        totalPages += Number(data.pages || 0);
        cursor = data.cursor ?? null;

        setState({ status: "loading", total: totalSynced, pages: totalPages });

        // Small delay between requests to avoid overload
        if (cursor) {
          await new Promise((resolve) => setTimeout(resolve, 300));
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
