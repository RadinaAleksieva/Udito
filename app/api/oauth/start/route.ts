import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const appBaseUrl = process.env.APP_BASE_URL;
  const clientId = process.env.WIX_APP_ID;
  const scopes = process.env.WIX_OAUTH_SCOPES || "";

  if (!appBaseUrl || !clientId) {
    return NextResponse.json(
      { ok: false, error: "Missing APP_BASE_URL or WIX_APP_ID." },
      { status: 400 }
    );
  }

  const redirectUri = `${appBaseUrl}/api/oauth/callback`;
  const url = new URL("https://www.wix.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  if (scopes) {
    url.searchParams.set("scope", scopes);
  }

  return NextResponse.redirect(url.toString());
}
