import { NextResponse } from "next/server";
import { initDb, saveWixTokens } from "@/lib/db";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const instanceId =
    url.searchParams.get("instance_id") || url.searchParams.get("instanceId");

  const clientId = process.env.WIX_APP_ID;
  const clientSecret = process.env.WIX_APP_SECRET;
  const appBaseUrl = process.env.APP_BASE_URL;

  if (!code || !clientId || !clientSecret || !appBaseUrl) {
    return NextResponse.json(
      { ok: false, error: "Missing code or app credentials." },
      { status: 400 }
    );
  }

  const redirectUri = `${appBaseUrl}/api/oauth/callback`;
  const response = await fetch("https://www.wix.com/oauth/access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
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
  };

  await initDb();
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : null;

  await saveWixTokens({
    instanceId,
    siteId: data.site_id ?? null,
    accessToken: data.access_token ?? null,
    refreshToken: data.refresh_token ?? null,
    expiresAt,
  });

  const redirect = new URL("/overview?connected=1", appBaseUrl);
  return NextResponse.redirect(redirect.toString());
}
