import { NextResponse } from "next/server";
import { getLatestWixTokenForSite, initDb, saveWixTokens } from "@/lib/db";
import { decodeWixInstanceToken } from "@/lib/wix-instance";
import { getAppInstanceDetails, getTokenInfo } from "@/lib/wix";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = body?.token;
    const instanceIdParam = body?.instanceId || body?.instance_id;
    const siteIdParam = body?.siteId || body?.site_id;

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
