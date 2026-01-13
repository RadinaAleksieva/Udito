import { NextResponse } from "next/server";
import { initDb, saveWixTokens } from "@/lib/db";
import { getActiveWixContext } from "@/lib/wix-context";

export async function POST(request: Request) {
  await initDb();
  const body = await request.json().catch(() => ({}));
  const siteId = typeof body?.siteId === "string" ? body.siteId.trim() : "";
  if (!siteId) {
    return NextResponse.json(
      { ok: false, error: "Missing siteId." },
      { status: 400 }
    );
  }

  const { instanceId } = await getActiveWixContext();

  await saveWixTokens({
    businessId: null,
    instanceId,
    siteId,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
  });

  const response = NextResponse.json({ ok: true, siteId, instanceId });
  response.cookies.set("udito_site_id", siteId, {
    path: "/",
    sameSite: "none",
    secure: true,
  });
  return response;
}
