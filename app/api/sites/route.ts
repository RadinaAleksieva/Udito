import { NextResponse } from "next/server";
import { getAccessToken } from "@/lib/wix";
import { getActiveWixContext } from "@/lib/wix-context";

const WIX_API_BASE = "https://www.wixapis.com";

export async function GET() {
  let accessToken: string;
  try {
    const { siteId, instanceId } = await getActiveWixContext();
    accessToken = await getAccessToken({
      instanceId,
      siteId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Missing Wix access token.",
      },
      { status: 400 }
    );
  }
  const authHeader = accessToken.startsWith("Bearer ")
    ? accessToken
    : `Bearer ${accessToken}`;

  const response = await fetch(`${WIX_API_BASE}/sites/v1/site`, {
    method: "GET",
    headers: {
      Authorization: authHeader,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    return NextResponse.json(
      { ok: false, error: text || "Failed to fetch site." },
      { status: response.status }
    );
  }

  const data = await response.json();
  return NextResponse.json({ ok: true, data });
}
