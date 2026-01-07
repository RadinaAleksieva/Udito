"use client";

import { useState } from "react";

type BackfillState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; total: number }
  | { status: "error"; message: string };

export default function BackfillButton() {
  const [state, setState] = useState<BackfillState>({ status: "idle" });

  const runBackfill = async () => {
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/backfill", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Backfill failed.");
      }
      setState({ status: "ok", total: Number(data.total || 0) });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Backfill failed.",
      });
    }
  };

  return (
    <div className="cta-row">
      <button
        className="cta cta-secondary"
        onClick={runBackfill}
        disabled={state.status === "loading"}
      >
      {state.status === "loading" ? "Синхронизиране..." : "Синхронизирай поръчки"}
      </button>
      {state.status === "ok" ? (
        <span className="status-meta">Синхронизирани {state.total} поръчки.</span>
      ) : null}
      {state.status === "error" ? (
        <span className="status-meta">Грешка: {state.message}</span>
      ) : null}
    </div>
  );
}
