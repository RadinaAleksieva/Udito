"use client";

import { useEffect } from "react";

export default function PrintTrigger({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (enabled) {
      setTimeout(() => window.print(), 250);
    }
  }, [enabled]);

  return null;
}
