import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET() {
  try {
    // Get ALL companies from database
    const result = await sql`
      select site_id, instance_id, store_id, cod_receipts_enabled, receipts_start_date, store_name
      from companies;
    `;

    return NextResponse.json({
      ok: true,
      count: result.rows.length,
      companies: result.rows,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: (error as Error).message,
    });
  }
}
