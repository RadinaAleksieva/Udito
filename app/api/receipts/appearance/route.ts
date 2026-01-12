import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await initDb();

  const token = await getActiveWixToken();
  const siteId = token?.site_id ?? null;

  if (!siteId) {
    return NextResponse.json(
      { ok: false, error: "Missing Wix site id." },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));

  try {
    await sql`
      UPDATE companies
      SET
        logo_url = ${body.logoUrl ?? null},
        logo_width = ${body.logoWidth ?? null},
        logo_height = ${body.logoHeight ?? null},
        receipt_template = ${body.receiptTemplate ?? 'modern'},
        accent_color = ${body.accentColor ?? 'green'},
        updated_at = now()
      WHERE site_id = ${siteId}
    `;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error saving receipt appearance:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to save appearance settings" },
      { status: 500 }
    );
  }
}
