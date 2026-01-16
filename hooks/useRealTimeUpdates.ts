"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export function useRealTimeUpdates() {
  const router = useRouter();
  const lastRefreshRef = useRef<number>(Date.now());

  useEffect(() => {
    console.log("✅ useRealTimeUpdates MOUNTED - polling every 10 seconds");

    // Polling - refresh every 10 seconds for near real-time updates
    const pollingInterval = setInterval(() => {
      console.log("🔄 Polling refresh...");
      router.refresh();
      lastRefreshRef.current = Date.now();
    }, 10000);

    return () => {
      console.log("❌ useRealTimeUpdates UNMOUNTED");
      clearInterval(pollingInterval);
    };
  }, [router]);
}
