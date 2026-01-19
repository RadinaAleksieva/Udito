import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/sql";
import { getTenantCompany } from "@/lib/tenant-db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Не сте влезли" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const siteId = searchParams.get("siteId");

  if (!siteId) {
    return NextResponse.json({ ok: false, error: "Липсва siteId" }, { status: 400 });
  }

  try {
    // Check if already linked to this user
    const existingLink = await sql`
      SELECT id FROM store_connections
      WHERE site_id = ${siteId} AND user_id = ${session.user.id}
    `;
    const alreadyLinked = existingLink.rows.length > 0;

    // Get store info from tenant company or wix_tokens
    const company = await getTenantCompany(siteId);

    let storeName = company?.storeName || null;
    let storeDomain = company?.storeDomain || null;

    // Fallback to store_connections
    if (!storeName && !storeDomain) {
      const storeConn = await sql`
        SELECT store_name FROM store_connections WHERE site_id = ${siteId} LIMIT 1
      `;
      storeName = storeConn.rows[0]?.store_name || null;
    }

    return NextResponse.json({
      ok: true,
      storeName,
      storeDomain,
      alreadyLinked,
    });
  } catch (error) {
    console.error("Error fetching store info:", error);
    return NextResponse.json(
      { ok: false, error: "Грешка при зареждане на информация" },
      { status: 500 }
    );
  }
}
