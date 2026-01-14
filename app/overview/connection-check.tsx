"use client";

import { useState } from "react";

function readCookie(name: string) {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Get current store from URL params (for multi-store support)
function getCurrentStoreFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("store") || params.get("instanceId") || params.get("siteId") || null;
}

interface ConnectionCheckProps {
  currentSiteId?: string | null;
  currentInstanceId?: string | null;
}

export default function ConnectionCheck({ currentSiteId, currentInstanceId }: ConnectionCheckProps = {}) {
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function handleCheck() {
    setLoading(true);
    setStatus("");
    try {
      // Priority: 1) prop, 2) URL param, 3) cookie, 4) first store from API
      let instanceId = currentInstanceId || currentSiteId || getCurrentStoreFromUrl() || readCookie("udito_instance_id");
      let siteId = currentSiteId || null;

      // If no store specified, try to get from user session via API
      if (!instanceId) {
        setStatus("Проверка на свързани магазини...");
        const storesResponse = await fetch("/api/user/stores", {
          credentials: "include",
        });
        if (storesResponse.ok) {
          const storesData = await storesResponse.json();
          if (storesData?.stores?.length > 0) {
            instanceId = storesData.stores[0].instance_id || storesData.stores[0].site_id;
            siteId = storesData.stores[0].site_id;
          }
        }
      }

      if (!instanceId) {
        setStatus("Липсва код за достъп. Влезте през Wix или свържете магазин от Настройки.");
        return;
      }

      console.log("🔄 ConnectionCheck using store:", { instanceId, siteId, currentSiteId, currentInstanceId });

      // Step 1: Check connection and get resolved siteId
      setStatus("Проверка на връзката...");
      const response = await fetch("/api/instance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceId, siteId }),
      });
      const data = await response.json();
      if (!data?.ok) {
        throw new Error(
          data?.error || "Не е намерен сайт за този код. Отворете приложението от Wix."
        );
      }

      // Use the resolved siteId from the API
      const resolvedSiteId = data.siteId || siteId;
      const resolvedInstanceId = data.instanceId || instanceId;
      console.log("✅ Resolved store:", { resolvedSiteId, resolvedInstanceId });

      // Step 2: Run backfill with explicit store ID
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
        // IMPORTANT: Pass store ID explicitly to avoid using wrong store from cookies
        if (resolvedSiteId) params.set("siteId", resolvedSiteId);
        if (resolvedInstanceId) params.set("instanceId", resolvedInstanceId);

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

      // Step 3: Enrich old orders with payment data
      setStatus(`Готово! Синхронизирани ${totalSynced} поръчки. Обогатяване с payment данни...`);
      try {
        const enrichResponse = await fetch("/api/admin/enrich-old-orders?limit=100", {
          method: "POST",
          credentials: "include",
        });
        if (enrichResponse.ok) {
          const enrichData = await enrichResponse.json();
          if (enrichData.enriched > 0) {
            setStatus(`Готово! Синхронизирани ${totalSynced} поръчки, обогатени ${enrichData.enriched} с payment данни. Презареждане...`);
          } else {
            setStatus(`Готово! Синхронизирани ${totalSynced} поръчки. Презареждане...`);
          }
        }
      } catch (enrichError) {
        console.warn("Payment enrichment failed:", enrichError);
        // Continue even if enrichment fails
        setStatus(`Готово! Синхронизирани ${totalSynced} поръчки. Презареждане...`);
      }
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
