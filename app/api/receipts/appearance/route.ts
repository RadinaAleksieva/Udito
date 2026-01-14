import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { getActiveWixToken } from "@/lib/wix-context";
import { auth, getUserStores } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  await initDb();

  // Get identifiers from session or legacy Wix token
  let siteId: string | null = null;
  let instanceId: string | null = null;

  const session = await auth();
  if (session?.user?.id) {
    const userStores = await getUserStores(session.user.id);
    if (userStores.length > 0) {
      siteId = userStores[0].site_id || null;
      instanceId = userStores[0].instance_id || null;
    }
  } else {
    const token = await getActiveWixToken();
    siteId = token?.site_id ?? null;
    instanceId = token?.instance_id ?? null;
  }

  if (!siteId && !instanceId) {
    return NextResponse.json(
      { ok: false, error: "Missing site identifier." },
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
      WHERE site_id = ${siteId} OR instance_id = ${instanceId}
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
