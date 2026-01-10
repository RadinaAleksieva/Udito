"use client";

import { useState } from "react";

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function ConnectionCheck() {
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleCheck() {
    setLoading(true);
    setStatus("");
    try {
      const instanceId = readCookie("udito_instance_id");
      if (!instanceId) {
        setStatus("Липсва код за достъп. Влезте през Wix или въведете код.");
        return;
      }

      // Step 1: Check connection
      setStatus("Проверка на връзката...");
      const response = await fetch("/api/instance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId }),
      });
      const data = await response.json();
      if (!data?.ok) {
        throw new Error(
          data?.error || "Не е намерен сайт за този код. Отворете приложението от Wix."
        );
      }

      // Step 2: Run backfill
      setStatus("Връзката е активна. Синхронизация на поръчки...");
      let totalSynced = 0;
      let currentOffset = 0;
      let hasMoreData = true;
      let isFirstRun = true;

      while (hasMoreData) {
        const params = new URLSearchParams({
          limit: "50",
          maxPages: "5",
          start: "2000-01-01T00:00:00Z",
        });
        if (isFirstRun) {
          params.set("reset", "1");
          isFirstRun = false;
        } else {
          params.set("offset", String(currentOffset));
        }

        const backfillResponse = await fetch(`/api/backfill/fast?${params.toString()}`, {
          method: "POST",
          credentials: "include",
        });
        const backfillData = await backfillResponse.json();

        if (!backfillResponse.ok || !backfillData?.ok) {
          // If backfill fails, still consider it success (connection works)
          console.warn("Backfill failed:", backfillData?.error);
          break;
        }

        totalSynced += Number(backfillData.total || 0);
        currentOffset = Number(backfillData.offset || currentOffset);
        hasMoreData = Boolean(backfillData.hasMore);

        setStatus(`Синхронизирани ${totalSynced} поръчки...`);

        if (hasMoreData) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }

      setStatus(`Готово! Синхронизирани ${totalSynced} поръчки. Презареждане...`);
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Грешка при проверка на връзката."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="status-action">
      <button
        type="button"
        className="status-link"
        onClick={handleCheck}
        disabled={loading}
      >
        {loading ? "Проверка..." : "Провери връзката"}
      </button>
      {status ? <span className="status-meta">{status}</span> : null}
    </div>
  );
}
