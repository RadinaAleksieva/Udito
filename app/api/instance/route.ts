import { NextResponse } from "next/server";
import { initDb, saveWixTokens } from "@/lib/db";

function decodeBase64Url(input: string) {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function decodeJwt(token: string) {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  const payload = decodeBase64Url(parts[1]);
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = body?.token;
    if (!token || typeof token !== "string") {
      return NextResponse.json(
        { ok: false, error: "Missing token." },
        { status: 400 }
      );
    }

    const payload = decodeJwt(token) as {
      instanceId?: string;
      siteId?: string;
      exp?: number;
    } | null;

    await initDb();
    await saveWixTokens({
      instanceId: payload?.instanceId ?? null,
      siteId: payload?.siteId ?? null,
      accessToken: token,
      refreshToken: null,
      expiresAt: payload?.exp
        ? new Date(payload.exp * 1000).toISOString()
        : null,
    });

    return NextResponse.json({
      ok: true,
      siteId: payload?.siteId ?? null,
      instanceId: payload?.instanceId ?? null,
    });
  } catch (error) {
    console.error("Save instance token failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}
