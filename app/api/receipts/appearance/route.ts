import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { initDb } from "@/lib/db";
import { getActiveStore } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await initDb();

  const store = await getActiveStore();
  if (!store?.siteId && !store?.instanceId) {
    return NextResponse.json(
      { ok: false, error: "Missing site identifier." },
      { status: 400 }
    );
  }

  const { siteId, instanceId } = store;

  const body = await request.json().catch(() => ({}));

  try {
    // Use explicit null checks because SQL NULL = NULL is false
    await sql`
      UPDATE companies
      SET
        logo_url = ${body.logoUrl ?? null},
        logo_width = ${body.logoWidth ?? null},
        logo_height = ${body.logoHeight ?? null},
        receipt_template = ${body.receiptTemplate ?? 'modern'},
        accent_color = ${body.accentColor ?? 'green'},
        updated_at = now()
      WHERE (${siteId}::text IS NOT NULL AND site_id = ${siteId})
         OR (${instanceId}::text IS NOT NULL AND instance_id = ${instanceId})
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
