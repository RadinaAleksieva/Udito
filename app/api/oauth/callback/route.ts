import { NextResponse } from "next/server";
import { initDb, saveWixTokens } from "@/lib/db";
import { linkStoreToUser } from "@/lib/auth";
import { getAppInstanceDetails } from "@/lib/wix";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const WIX_API_BASE = process.env.WIX_API_BASE || "https://www.wixapis.com";

async function registerWebhooks(accessToken: string, siteId: string, appBaseUrl: string) {
  try {
    const authHeader = accessToken.startsWith("Bearer ")
      ? accessToken
      : `Bearer ${accessToken}`;

    const webhookUrl = `${appBaseUrl}/api/webhooks/wix/orders`;

    const response = await fetch(`${WIX_API_BASE}/webhooks/v1/webhooks`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        "wix-site-id": siteId,
      },
      body: JSON.stringify({
        webhook: {
          url: webhookUrl,
          eventTypes: [
            "wix.ecom.v1.order.created",
            "wix.ecom.v1.order.updated",
            "wix.ecom.v1.order.canceled",
          ],
        },
      }),
    });

    if (response.ok) {
      console.log("✅ Webhooks registered successfully for site", siteId);
      return true;
    } else {
      const error = await response.text();
      console.warn("⚠️ Webhook registration failed:", error);
      return false;
    }
  } catch (error) {
    console.error("❌ Webhook registration error:", error);
    return false;
  }
}

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

  // Register webhooks automatically after successful OAuth
  if (resolvedSiteId && data.access_token) {
    await registerWebhooks(data.access_token, resolvedSiteId, appBaseUrl);
  }

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

// Handle POST requests with access_token from popup flow
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { accessToken } = body as { accessToken?: string };

    if (!accessToken) {
      return NextResponse.json(
        { ok: false, error: "Липсва access token" },
        { status: 400 }
      );
    }

    // Decode the JWT to get instanceId
    // Format: OAUTH2.{base64header}.{base64payload}.{signature}
    let instanceId: string | null = null;
    try {
      const parts = accessToken.split(".");
      if (parts.length >= 2) {
        // The payload is the second part for OAUTH2 tokens
        const payloadBase64 = parts[1];
        const payloadJson = Buffer.from(payloadBase64, "base64").toString("utf8");
        const payload = JSON.parse(payloadJson);

        // The actual data is nested in the "data" field as a JSON string
        if (payload.data) {
          const data = JSON.parse(payload.data);
          instanceId = data.instanceId;
        }
      }
    } catch (decodeError) {
      console.warn("Failed to decode access token:", decodeError);
    }

    if (!instanceId) {
      return NextResponse.json(
        { ok: false, error: "Невалиден access token" },
        { status: 400 }
      );
    }

    // Get user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json(
        { ok: false, error: "Не сте влезли в системата" },
        { status: 401 }
      );
    }

    await initDb();

    // Get site details from Wix
    let siteId: string | null = null;

    try {
      const appInstance = await getAppInstanceDetails({
        instanceId,
        accessToken,
      });
      siteId = appInstance?.siteId ?? null;
    } catch (error) {
      console.warn("Failed to get app instance details:", error);
    }

    // Save tokens to database
    await saveWixTokens({
      businessId: null,
      instanceId,
      siteId,
      accessToken,
      refreshToken: null,
      expiresAt: null,
    });

    // Link store to user
    if (siteId) {
      await linkStoreToUser(session.user.id, siteId, instanceId ?? undefined);
    }

    return NextResponse.json({
      ok: true,
      instanceId,
      siteId,
    });
  } catch (error) {
    console.error("OAuth callback POST error:", error);
    return NextResponse.json(
      { ok: false, error: "Грешка при обработка на токена" },
      { status: 500 }
    );
  }
}
