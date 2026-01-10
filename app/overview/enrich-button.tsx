"use client";

import { useState, useCallback } from "react";

type EnrichState =
  | { status: "idle" }
  | { status: "loading"; enriched: number; skipped: number; failed: number }
  | { status: "ok"; enriched: number; skipped: number; failed: number }
  | { status: "error"; message: string };

export default function EnrichButton() {
  const [state, setState] = useState<EnrichState>({ status: "idle" });

  const runEnrichment = useCallback(async () => {
    setState({ status: "loading", enriched: 0, skipped: 0, failed: 0 });

    try {
      const response = await fetch("/api/admin/enrich-orders", {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || "Enrichment failed.");
      }

      setState({
        status: "ok",
        enriched: data.enriched || 0,
        skipped: data.skipped || 0,
        failed: data.failed || 0,
      });

      // Auto-reload after 2 seconds to show updated data
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Enrichment failed.",
      });
    }
  }, []);

  return (
    <div className="cta-row">
      <button
        className="cta cta-secondary"
        onClick={runEnrichment}
        disabled={state.status === "loading"}
      >
        {state.status === "loading"
          ? "Обогатяване..."
          : "Обогати поръчки"}
      </button>
      {state.status === "ok" ? (
        <span className="status-meta">
          Готово! Обогатени: {state.enriched}, Пропуснати: {state.skipped}
          {state.failed > 0 ? `, Грешки: ${state.failed}` : ""}
        </span>
      ) : null}
      {state.status === "error" ? (
        <span className="status-meta">
          Грешка: {state.message}
        </span>
      ) : null}
    </div>
  );
}
