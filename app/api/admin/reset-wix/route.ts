import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

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
    const result = await sql`delete from wix_tokens;`;
    return NextResponse.json({ ok: true, deleted: result.rowCount ?? 0 });
  } catch (error) {
    console.error("Reset Wix tokens failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 400 }
    );
  }
}

export async function GET(request: Request) {
  return POST(request);
}
