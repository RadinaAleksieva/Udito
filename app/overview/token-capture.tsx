"use client";

import { useEffect } from "react";

// Broadcast channel for cross-window communication (Wix iframe refresh)
const LOGIN_CHANNEL = "udito-login-channel";

export default function TokenCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Check if we need to broadcast login success (after Google OAuth redirect)
    const shouldBroadcast = params.get("loginBroadcast") === "1";
    if (shouldBroadcast) {
      console.log("📢 Broadcasting login success after OAuth redirect");
      try {
        const channel = new BroadcastChannel(LOGIN_CHANNEL);
        channel.postMessage({ type: "LOGIN_SUCCESS", timestamp: Date.now() });
        channel.close();
      } catch {
        // Fallback for browsers without BroadcastChannel
        localStorage.setItem("udito-login-event", Date.now().toString());
      }

      // Clean up URL by removing the loginBroadcast param
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("loginBroadcast");
      window.history.replaceState({}, "", cleanUrl.toString());
    }
    const instanceId =
      params.get("instanceId") ||
      params.get("instance_id") ||
      params.get("appInstanceId");
    const instanceToken = params.get("instance");
    const tokenParam = params.get("token") || params.get("appInstance");
    const authorizationCode = params.get("authorizationCode");
    if (!instanceToken && !tokenParam && !instanceId) {
      return;
    }

    const parseAuthorizationCode = (raw: string) => {
      const parts = raw.split(".");
      if (parts.length < 2) return null;
      try {
        const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
        const payload = JSON.parse(json) as { data?: string };
        if (!payload?.data) return null;
        const data = JSON.parse(payload.data) as {
          decodedToken?: {
            siteId?: string;
            instanceId?: string;
          };
          tokenMetadata?: {
            siteId?: string;
          };
        };
        return {
          siteId:
            data?.decodedToken?.siteId ??
            data?.tokenMetadata?.siteId ??
            null,
          instanceId: data?.decodedToken?.instanceId ?? null,
        };
      } catch {
        return null;
      }
    };

    const resolvedFromAuth = authorizationCode
      ? parseAuthorizationCode(authorizationCode)
      : null;
    const siteId =
      params.get("siteId") ||
      params.get("site_id") ||
      resolvedFromAuth?.siteId ||
      null;
    const resolvedInstanceId =
      instanceId || resolvedFromAuth?.instanceId || null;

    const tokenToUse = instanceToken || tokenParam;
    if (typeof tokenToUse === "string" && !tokenToUse.includes(".")) {
      const redirect = new URL("/api/oauth/start", window.location.origin);
      redirect.searchParams.set("instance", tokenToUse);
      if (resolvedInstanceId) {
        redirect.searchParams.set("instanceId", resolvedInstanceId);
      }
      if (siteId) {
        redirect.searchParams.set("siteId", siteId);
      }
      window.location.replace(redirect.toString());
      return;
    }

    fetch("/api/instance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: tokenToUse ?? undefined,
        instanceId: resolvedInstanceId ?? undefined,
        siteId: siteId ?? undefined,
      }),
      credentials: "include",
    }).catch(() => {
      // Swallow errors; the app can still render and retry on next load.
    });
  }, []);

  return null;
}
