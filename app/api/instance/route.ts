import { NextResponse } from "next/server";
import { getLatestWixTokenForSite, initDb, saveWixTokens } from "@/lib/db";
import { decodeWixInstanceToken } from "@/lib/wix-instance";
import { getAppInstanceDetails, getTokenInfo, getAccessToken } from "@/lib/wix";
import { getServerSession } from "next-auth";
import { authOptions, linkStoreToUser } from "@/lib/auth";
import { sql } from "@vercel/postgres";

const WIX_API_BASE = process.env.WIX_API_BASE || "https://www.wixapis.com";

// Handle accountant access code
async function handleAccessCode(accessCode: string) {
  await initDb();

  // Get session - accountant must be logged in
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "Моля влезте в профила си, за да използвате код за достъп" },
      { status: 401 }
    );
  }

  // Find the access code
  const codeResult = await sql`
    SELECT id, site_id, instance_id, business_id, access_code_expires_at, user_id
    FROM store_connections
    WHERE access_code = ${accessCode.toUpperCase()}
  `;

  if (codeResult.rows.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Невалиден код за достъп" },
      { status: 400 }
    );
  }

  const codeRecord = codeResult.rows[0];

  // Check if code is already claimed
  if (codeRecord.user_id) {
    return NextResponse.json(
      { ok: false, error: "Този код вече е използван" },
      { status: 400 }
    );
  }

  // Check if code is expired
  if (codeRecord.access_code_expires_at) {
    const expiresAt = new Date(codeRecord.access_code_expires_at);
    if (expiresAt < new Date()) {
      return NextResponse.json(
        { ok: false, error: "Кодът за достъп е изтекъл" },
        { status: 400 }
      );
    }
  }

  // Claim the access code - assign the user
  await sql`
    UPDATE store_connections
    SET user_id = ${session.user.id}, connected_at = NOW()
    WHERE id = ${codeRecord.id}
  `;

  const response = NextResponse.json({
    ok: true,
    siteId: codeRecord.site_id,
    instanceId: codeRecord.instance_id,
    role: "accountant",
    message: "Успешно свързване като счетоводител",
  });

  // Set cookies for the accountant
  if (codeRecord.instance_id) {
    response.cookies.set("udito_instance_id", codeRecord.instance_id, {
      path: "/",
      sameSite: "none",
      secure: true,
    });
  }
  if (codeRecord.site_id) {
    response.cookies.set("udito_site_id", codeRecord.site_id, {
      path: "/",
      sameSite: "none",
      secure: true,
    });
  }

  return response;
}

async function registerWebhooks(instanceId: string, siteId: string | null) {
  try {
    const accessToken = await getAccessToken({ instanceId, siteId });
    const authHeader = accessToken.startsWith("Bearer ")
      ? accessToken
      : `Bearer ${accessToken}`;

    // Register webhook for order events
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://udito.vercel.app"}/api/webhooks/wix/orders`;

    const response = await fetch(`${WIX_API_BASE}/webhooks/v1/webhooks`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        ...(siteId ? { "wix-site-id": siteId } : {}),
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
      console.log("✅ Webhooks registered successfully");
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

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = body?.token;
    const instanceIdParam = body?.instanceId || body?.instance_id;
    const siteIdParam = body?.siteId || body?.site_id;
    const accessCode = body?.accessCode || body?.access_code;

    // Handle access code for accountants
    if (accessCode && typeof accessCode === "string") {
      return handleAccessCode(accessCode);
    }

    if ((!token || typeof token !== "string") && !instanceIdParam) {
      return NextResponse.json(
        { ok: false, error: "Missing token or instance id." },
        { status: 400 }
      );
    }

    const payload = token
      ? decodeWixInstanceToken(token, process.env.WIX_APP_SECRET)
      : null;
    let instanceId =
      payload?.instanceId ??
      (typeof instanceIdParam === "string" ? instanceIdParam : null);
    if (!instanceId && typeof token === "string") {
      try {
        const tokenInfo = await getTokenInfo(token);
        instanceId = tokenInfo?.instanceId ?? token;
      } catch (error) {
        console.warn("Wix token info failed", error);
        instanceId = token;
      }
    }
    if (instanceId && !/^[0-9a-fA-F-]{36}$/.test(instanceId)) {
      try {
        const tokenInfo = await getTokenInfo(instanceId);
        instanceId = tokenInfo?.instanceId ?? instanceId;
      } catch (error) {
        console.warn("Wix token info failed", error);
      }
    }
    const siteIdFromParam =
      payload?.siteId ??
      (typeof siteIdParam === "string" ? siteIdParam : null);

    if (!instanceId) {
      return NextResponse.json(
        { ok: false, error: "Invalid Wix instance token." },
        { status: 400 }
      );
    }

    await initDb();
    const existingToken = instanceId
      ? await getLatestWixTokenForSite({ instanceId })
      : null;
    let resolvedSiteId =
      siteIdFromParam ?? existingToken?.site_id ?? null;
    console.info("Wix instance capture", {
      hasToken: Boolean(token),
      tokenLength: typeof token === "string" ? token.length : 0,
      instanceId,
      siteId: siteIdFromParam,
    });
    if (!resolvedSiteId) {
      try {
        const appInstance = await getAppInstanceDetails({ instanceId });
        resolvedSiteId = appInstance?.siteId ?? null;
      } catch (error) {
        console.warn("Wix get app instance failed", error);
      }
    }
    await saveWixTokens({
      businessId: null,
      instanceId,
      siteId: resolvedSiteId ?? null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    });

    // Register webhooks automatically
    if (resolvedSiteId) {
      await registerWebhooks(instanceId, resolvedSiteId);
    }

    // Auto-link store to user if logged in
    try {
      const session = await getServerSession(authOptions);
      if (session?.user?.id && (resolvedSiteId || instanceId)) {
        await linkStoreToUser(session.user.id, resolvedSiteId || "", instanceId);
        console.log("✅ Auto-linked store to user:", session.user.id);
      }
    } catch (error) {
      console.warn("⚠️ Auto-link store failed:", error);
    }

    const hasSite = Boolean(resolvedSiteId);
    const response = NextResponse.json(
      {
        ok: hasSite,
        siteId: resolvedSiteId,
        instanceId,
        error: hasSite
          ? undefined
          : "Не е намерен сайт за този код. Отворете приложението от Wix веднъж.",
      },
      { status: hasSite ? 200 : 422 }
    );
    response.cookies.set("udito_instance_id", instanceId, {
      path: "/",
      sameSite: "none",
      secure: true,
    });
    if (resolvedSiteId) {
      response.cookies.set("udito_site_id", resolvedSiteId, {
        path: "/",
        sameSite: "none",
        secure: true,
      });
    }
    return response;
  } catch (error) {
    console.error("Save instance token failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}
