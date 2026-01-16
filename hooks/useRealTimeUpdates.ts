"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function useRealTimeUpdates() {
  const router = useRouter();
  const lastRefreshRef = useRef<number>(Date.now());

  useEffect(() => {
    // Polling - refresh every 10 seconds for near real-time updates
    const pollingInterval = setInterval(() => {
      const timeSinceLastRefresh = Date.now() - lastRefreshRef.current;
      if (timeSinceLastRefresh > 8000) {
        console.log("🔄 Polling refresh...");
        router.refresh();
        lastRefreshRef.current = Date.now();
      }
    }, 10000);

    return () => {
      clearInterval(pollingInterval);
    };
  }, [router]);
}
