import { NextResponse } from "next/server";
import { initDb, saveWixTokens } from "@/lib/db";
import { decodeWixInstanceToken } from "@/lib/wix-instance";
import { getAppInstanceDetails, getTokenInfo } from "@/lib/wix";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appBaseUrl = process.env.APP_BASE_URL || url.origin;
  const appId = process.env.WIX_APP_ID;
  const instanceToken =
    url.searchParams.get("instance") ||
    url.searchParams.get("token") ||
    url.searchParams.get("appInstance");
  const instanceIdParam =
    url.searchParams.get("instanceId") ||
    url.searchParams.get("instance_id") ||
    url.searchParams.get("appInstanceId");
  const siteIdParam =
    url.searchParams.get("siteId") || url.searchParams.get("site_id");
  console.info("Wix oauth start", {
    hasInstanceToken: Boolean(instanceToken),
    tokenLength: typeof instanceToken === "string" ? instanceToken.length : 0,
    instanceIdParam,
    siteIdParam,
  });

  if (!instanceToken && !instanceIdParam) {
    return NextResponse.redirect(`${appBaseUrl}/api/oauth/authorize`);
  }

  const isInstallToken =
    Boolean(instanceToken) &&
    !instanceIdParam &&
    typeof instanceToken === "string" &&
    !instanceToken.includes(".");
  if (isInstallToken) {
    if (!appId) {
      return NextResponse.redirect(
        `${appBaseUrl}/overview?connected=0&error=missing_app_id`
      );
    }
    const redirectUrl = `${appBaseUrl}/api/oauth/callback`;
    const installerUrl = new URL("https://www.wix.com/installer/install");
    installerUrl.searchParams.set("token", instanceToken);
    installerUrl.searchParams.set("appId", appId);
    installerUrl.searchParams.set("redirectUrl", redirectUrl);
    console.log("OAuth start - redirecting to Wix installer:", {
      appBaseUrl,
      redirectUrl,
      appId,
      installerUrl: installerUrl.toString(),
    });
    return NextResponse.redirect(installerUrl.toString());
  }

  const payload = instanceToken
    ? decodeWixInstanceToken(instanceToken, process.env.WIX_APP_SECRET)
    : null;
  let instanceId =
    payload?.instanceId ??
    (instanceIdParam ?? null);
  if (!instanceId && instanceToken) {
    try {
      const tokenInfo = await getTokenInfo(instanceToken);
      instanceId = tokenInfo?.instanceId ?? instanceToken;
    } catch (error) {
      console.warn("Wix token info failed", error);
      instanceId = instanceToken;
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
  const siteId = payload?.siteId ?? siteIdParam ?? null;

  if (!instanceId) {
    return NextResponse.redirect(`${appBaseUrl}/overview?connected=0`);
  }

  await initDb();
  await saveWixTokens({
    businessId: null,
    instanceId,
    siteId,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
  });

  let resolvedSiteId = siteId;
  if (!resolvedSiteId) {
    try {
      const appInstance = await getAppInstanceDetails({ instanceId });
      resolvedSiteId = appInstance?.siteId ?? null;
    } catch (error) {
      console.warn("Wix get app instance failed", error);
    }
  }
  if (resolvedSiteId && resolvedSiteId !== siteId) {
    await saveWixTokens({
      businessId: null,
      instanceId,
      siteId: resolvedSiteId,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    });
  }

  const response = NextResponse.redirect(`${appBaseUrl}/overview?connected=1`);
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
}
