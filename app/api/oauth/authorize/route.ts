import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const appBaseUrl = process.env.APP_BASE_URL || url.origin;
  const appId = process.env.WIX_APP_ID;

  if (!appId) {
    return NextResponse.redirect(`${appBaseUrl}/overview?error=missing_app_id`);
  }

  // Build Wix OAuth URL for manual authorization
  // This allows users to connect their store without going through the Wix Dashboard
  const redirectUrl = `${appBaseUrl}/api/oauth/callback`;

  // Wix OAuth authorization URL
  const wixAuthUrl = new URL("https://www.wix.com/installer/install");
  wixAuthUrl.searchParams.set("appId", appId);
  wixAuthUrl.searchParams.set("redirectUrl", redirectUrl);

  return NextResponse.redirect(wixAuthUrl.toString());
}
