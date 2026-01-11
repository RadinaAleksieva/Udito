import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET() {
  try {
    // Get the company directly from database
    const result = await sql`
      select site_id, store_id, cod_receipts_enabled, receipts_start_date, store_name
      from companies
      limit 1;
    `;

    const company = result.rows[0] ?? null;

    return NextResponse.json({
      ok: true,
      company,
      rawRow: result.rows[0],
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: (error as Error).message,
    });
  }
}
