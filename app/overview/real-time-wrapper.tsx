"use client";

import { useRealTimeUpdates } from "@/hooks/useRealTimeUpdates";

export default function RealTimeWrapper({ children }: { children: React.ReactNode }) {
  useRealTimeUpdates();
  return <>{children}</>;
}
