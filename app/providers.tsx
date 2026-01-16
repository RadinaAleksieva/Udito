"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { useRealTimeUpdates } from "@/hooks/useRealTimeUpdates";

function RealTimeUpdater() {
  useRealTimeUpdates();
  return null;
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <RealTimeUpdater />
      {children}
    </SessionProvider>
  );
}
