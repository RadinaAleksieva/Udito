"use client";

import { useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

type EventType = "order_updated" | "receipt_issued" | "connected" | "heartbeat";

interface SSEEvent {
  type: EventType;
  data?: {
    orderId?: string;
    orderNumber?: string;
    paymentStatus?: string;
    status?: string;
  };
}

export function useRealTimeUpdates(options?: { onEvent?: (event: SSEEvent) => void }) {
  const router = useRouter();
  const lastRefreshRef = useRef<number>(Date.now());

  const handleEvent = useCallback(
    (event: SSEEvent) => {
      console.log("📡 Real-time event:", event.type, event.data);

      if (event.type === "order_updated" || event.type === "receipt_issued") {
        // Refresh the page data
        router.refresh();
        lastRefreshRef.current = Date.now();

        // Call custom handler if provided
        options?.onEvent?.(event);
      }
    },
    [router, options]
  );

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimeout: NodeJS.Timeout | null = null;
    let pollingInterval: NodeJS.Timeout | null = null;

    const connect = () => {
      try {
        eventSource = new EventSource("/api/events");

        eventSource.onmessage = (e) => {
          try {
            const event: SSEEvent = JSON.parse(e.data);
            handleEvent(event);
          } catch (err) {
            console.warn("Failed to parse SSE event:", err);
          }
        };

        eventSource.onerror = () => {
          console.warn("SSE connection error, reconnecting in 5s...");
          eventSource?.close();
          reconnectTimeout = setTimeout(connect, 5000);
        };

        eventSource.onopen = () => {
          console.log("📡 SSE connected");
        };
      } catch (err) {
        console.error("Failed to connect to SSE:", err);
        reconnectTimeout = setTimeout(connect, 5000);
      }
    };

    // SSE connection (for same-instance updates)
    connect();

    // Polling fallback - refresh every 30 seconds as backup
    // This catches updates that SSE misses due to serverless architecture
    pollingInterval = setInterval(() => {
      const timeSinceLastRefresh = Date.now() - lastRefreshRef.current;
      // Only poll if we haven't had a refresh in the last 25 seconds
      if (timeSinceLastRefresh > 25000) {
        console.log("🔄 Polling refresh...");
        router.refresh();
        lastRefreshRef.current = Date.now();
      }
    }, 30000);

    return () => {
      eventSource?.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (pollingInterval) clearInterval(pollingInterval);
    };
  }, [handleEvent, router]);
}
