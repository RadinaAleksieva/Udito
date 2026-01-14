import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// POST: Update store_connections site_id
export async function POST(request: Request) {
  try {
    await initDb();

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { storeId, newSiteId } = body;

    if (!storeId || !newSiteId) {
      return NextResponse.json({ ok: false, error: "Missing storeId or newSiteId" }, { status: 400 });
    }

    // Verify the store belongs to the user
    const storeCheck = await sql`
      SELECT id, site_id, instance_id FROM store_connections
      WHERE id = ${storeId} AND user_id = ${session.user.id}
    `;

    if (storeCheck.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Store not found or access denied" }, { status: 404 });
    }

    const oldSiteId = storeCheck.rows[0].site_id;

    // Check if new site_id already exists for this user
    const existingCheck = await sql`
      SELECT id FROM store_connections
      WHERE site_id = ${newSiteId} AND user_id = ${session.user.id} AND id != ${storeId}
    `;

    if (existingCheck.rows.length > 0) {
      return NextResponse.json({
        ok: false,
        error: "This site_id is already used by another store connection"
      }, { status: 400 });
    }

    // Update store_connections
    await sql`
      UPDATE store_connections
      SET site_id = ${newSiteId}
      WHERE id = ${storeId}
    `;

    // Count orders for new site_id
    const ordersCount = await sql`
      SELECT COUNT(*) as count FROM orders WHERE site_id = ${newSiteId}
    `;

    return NextResponse.json({
      ok: true,
      storeId,
      oldSiteId,
      newSiteId,
      ordersForNewSiteId: ordersCount.rows[0]?.count,
    });
  } catch (error) {
    console.error("Fix store ID error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
