"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function useRealTimeUpdates() {
  const router = useRouter();
  const lastRefreshRef = useRef<number>(Date.now());

  useEffect(() => {
    // Polling - refresh every 30 seconds
    const pollingInterval = setInterval(() => {
      const timeSinceLastRefresh = Date.now() - lastRefreshRef.current;
      if (timeSinceLastRefresh > 25000) {
        console.log("🔄 Polling refresh...");
        router.refresh();
        lastRefreshRef.current = Date.now();
      }
    }, 30000);

    return () => {
      clearInterval(pollingInterval);
    };
  }, [router]);
}
