"use client";

import { useEffect } from "react";

export default function TokenCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token =
      params.get("instance") ||
      params.get("token") ||
      params.get("appInstance");
    if (!token) {
      return;
    }

    fetch("/api/instance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch((error) => {
      console.error("Failed to save Wix instance token", error);
    });
  }, []);

  return null;
}
