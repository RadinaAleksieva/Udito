import { NextResponse } from "next/server";
import { initDb, saveWixTokens } from "@/lib/db";
import { getAppInstanceDetails } from "@/lib/wix";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const instanceId =
    url.searchParams.get("instance_id") || url.searchParams.get("instanceId");
  const clientId = process.env.WIX_APP_ID;
  const clientSecret = process.env.WIX_APP_SECRET;
  const appBaseUrl = process.env.APP_BASE_URL || url.origin;

  if (!code) {
    return NextResponse.redirect(`${appBaseUrl}/overview?connected=0&error=missing_code`);
  }

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing WIX_APP_ID or WIX_APP_SECRET.",
        missingClientId: !clientId,
        missingClientSecret: !clientSecret,
      },
      { status: 400 }
    );
  }

  const tokenPayload: Record<string, string> = {
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    code,
  };
  const response = await fetch("https://www.wixapis.com/oauth/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tokenPayload),
  });

  if (!response.ok) {
    const text = await response.text();
    const fallbackInstanceId = instanceId ?? null;
    const normalized = text.trim();
    let parsedError:
      | { error?: string; errorDescription?: string; errorCode?: number }
      | null = null;
    try {
      parsedError = JSON.parse(normalized) as {
        error?: string;
        errorDescription?: string;
        errorCode?: number;
      };
    } catch {
      parsedError = null;
    }
    const isInvalidAuthCode =
      parsedError?.error === "invalid_grant" ||
      parsedError?.errorDescription?.includes("invalid_auth_code");
    if (isInvalidAuthCode && fallbackInstanceId) {
      await initDb();
      let resolvedSiteId: string | null = null;
      try {
        const appInstance = await getAppInstanceDetails({
          instanceId: fallbackInstanceId,
        });
        resolvedSiteId = appInstance?.siteId ?? null;
      } catch (error) {
        console.warn("Wix app instance lookup failed", error);
      }

      await saveWixTokens({
        businessId: null,
        instanceId: fallbackInstanceId,
        siteId: resolvedSiteId,
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
      });

      const redirect = new URL("/overview?connected=1&warn=invalid_grant", appBaseUrl);
      const responseRedirect = NextResponse.redirect(redirect.toString());
      responseRedirect.cookies.set("udito_instance_id", fallbackInstanceId, {
        path: "/",
        sameSite: "none",
        secure: true,
      });
      if (resolvedSiteId) {
        responseRedirect.cookies.set("udito_site_id", resolvedSiteId, {
          path: "/",
          sameSite: "none",
          secure: true,
        });
      }
      return responseRedirect;
    }

    return NextResponse.json(
      { ok: false, error: `Token exchange failed: ${text}` },
      { status: 400 }
    );
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    token_type?: string;
    site_id?: string;
    instance_id?: string;
  };

  await initDb();
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : null;

  let resolvedInstanceId = instanceId ?? data.instance_id ?? null;
  let resolvedSiteId = data.site_id ?? null;
  if (data.access_token && (!resolvedInstanceId || !resolvedSiteId)) {
    try {
      const appInstance = await getAppInstanceDetails({
        instanceId: resolvedInstanceId,
        accessToken: data.access_token,
      });
      resolvedInstanceId = appInstance?.instanceId ?? resolvedInstanceId;
      resolvedSiteId = appInstance?.siteId ?? resolvedSiteId;
    } catch (error) {
      console.warn("Wix app instance lookup failed", error);
    }
  }

  await saveWixTokens({
    businessId: null,
    instanceId: resolvedInstanceId,
    siteId: resolvedSiteId,
    accessToken: data.access_token ?? null,
    refreshToken: data.refresh_token ?? null,
    expiresAt,
  });

  // Trigger initial sync of all orders in background
  if (resolvedSiteId && data.access_token) {
    console.log("Triggering initial sync for site", resolvedSiteId);
    fetch(`${appBaseUrl}/api/sync/initial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ siteId: resolvedSiteId }),
    }).catch((error) => {
      console.error("Failed to trigger initial sync:", error);
    });
  }

  const responseRedirect = data.access_token
    ? NextResponse.redirect(
        `https://www.wix.com/installer/close-window?access_token=${encodeURIComponent(
          data.access_token
        )}`
      )
    : NextResponse.redirect(`${appBaseUrl}/overview?connected=1`);
  if (resolvedInstanceId) {
    responseRedirect.cookies.set("udito_instance_id", resolvedInstanceId, {
      path: "/",
      sameSite: "none",
      secure: true,
    });
  }
  if (resolvedSiteId) {
    responseRedirect.cookies.set("udito_site_id", resolvedSiteId, {
      path: "/",
      sameSite: "none",
      secure: true,
    });
  }
  return responseRedirect;
}
