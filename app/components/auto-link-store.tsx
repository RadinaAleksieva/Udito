"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

export default function AutoLinkStore() {
  const { data: session, status } = useSession();
  const [linked, setLinked] = useState(false);

  useEffect(() => {
    async function tryLinkStore() {
      if (status === "authenticated" && session?.user?.id && !linked) {
        try {
          const res = await fetch("/api/auth/link-store", { method: "POST" });
          const data = await res.json();
          if (data.ok) {
            setLinked(true);
            // Refresh the page to show updated data
            window.location.reload();
          }
        } catch (e) {
          // Silently fail - not critical
          console.log("Auto-link store skipped:", e);
        }
      }
    }

    // Only try once
    if (!linked) {
      tryLinkStore();
    }
  }, [session, status, linked]);

  // This component doesn't render anything visible
  return null;
}
