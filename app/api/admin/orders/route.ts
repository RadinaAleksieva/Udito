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

export async function GET(request: Request) {
  try {
    requireSecret(request);
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || 25);
    const result = await sql`
      select id, number, payment_status, created_at, total, currency, source
      from orders
      order by created_at desc nulls last
      limit ${limit};
    `;
    return NextResponse.json({ ok: true, orders: result.rows });
  } catch (error) {
    console.error("List orders failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 401 }
    );
  }
}
