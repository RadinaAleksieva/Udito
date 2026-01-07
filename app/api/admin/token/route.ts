import { NextResponse } from "next/server";
import { getLatestWixToken } from "@/lib/db";

export async function GET(request: Request) {
  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!adminSecret || token !== adminSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const latest = await getLatestWixToken();
  return NextResponse.json({ ok: true, latest });
}
