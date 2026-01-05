import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";

function requireSecret(request: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SECRET is not configured.");
  }
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (token !== secret) {
    throw new Error("Unauthorized.");
  }
}

export async function POST(request: Request) {
  try {
    requireSecret(request);
    await initDb();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Init DB failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 401 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
