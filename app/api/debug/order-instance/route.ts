import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orderNumber = url.searchParams.get("number");

  if (!orderNumber) {
    return NextResponse.json({ error: "Missing number param" }, { status: 400 });
  }

  const result = await sql`
    SELECT number, site_id, raw->>'instanceId' as instance_id
    FROM orders
    WHERE number = ${orderNumber}
    LIMIT 1
  `;

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json(result.rows[0]);
}
