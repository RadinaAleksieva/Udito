import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { initDb } from "@/lib/db";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await initDb();

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { storeId, siteId, storeName } = body;

    if (!storeId || !storeName) {
      return NextResponse.json({ ok: false, error: "Missing storeId or storeName" }, { status: 400 });
    }

    // Verify the store belongs to the user
    const storeCheck = await sql`
      SELECT id FROM store_connections
      WHERE id = ${storeId} AND user_id = ${session.user.id}
    `;

    if (storeCheck.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Store not found or access denied" }, { status: 404 });
    }

    // Update the store name in store_connections
    await sql`
      UPDATE store_connections
      SET store_name = ${storeName}
      WHERE id = ${storeId}
    `;

    // Also update in companies table if exists
    if (siteId) {
      await sql`
        UPDATE companies
        SET store_name = ${storeName}
        WHERE site_id = ${siteId}
      `;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Store update error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
