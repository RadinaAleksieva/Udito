import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { auth } from "@/lib/auth";
import { getActiveWixContext } from "@/lib/wix-context";

export const dynamic = "force-dynamic";

// GET: Auto-fix the current user's store to use the correct site_id from cookies
export async function GET() {
  try {
    await initDb();

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    // Get the real site_id from cookies/context
    const context = await getActiveWixContext();
    const realSiteId = context.siteId;
    const instanceId = context.instanceId;

    if (!realSiteId) {
      return NextResponse.json({ ok: false, error: "No site_id in context. Open app from Wix first." }, { status: 400 });
    }

    // Get current store connection for this user
    const currentStore = await sql`
      SELECT id, site_id, instance_id, user_id
      FROM store_connections
      WHERE user_id = ${session.user.id}
      LIMIT 1
    `;

    if (currentStore.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "No store connection found" }, { status: 404 });
    }

    const oldSiteId = currentStore.rows[0].site_id;
    const storeId = currentStore.rows[0].id;

    // Update store_connections with the real site_id
    await sql`
      UPDATE store_connections
      SET site_id = ${realSiteId}
      WHERE id = ${storeId}
    `;

    // Count orders for the real site_id
    const ordersCount = await sql`
      SELECT COUNT(*) as count FROM orders WHERE site_id = ${realSiteId}
    `;

    return NextResponse.json({
      ok: true,
      message: "Store connection fixed!",
      oldSiteId,
      newSiteId: realSiteId,
      instanceId,
      ordersForNewSiteId: ordersCount.rows[0]?.count,
    });
  } catch (error) {
    console.error("Fix store error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await initDb();

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { oldSiteId, newSiteId } = body;

    if (!oldSiteId || !newSiteId) {
      return NextResponse.json({ ok: false, error: "Missing oldSiteId or newSiteId" }, { status: 400 });
    }

    // Update store_connections
    const storeResult = await sql`
      UPDATE store_connections
      SET site_id = ${newSiteId}
      WHERE site_id = ${oldSiteId}
      RETURNING *
    `;

    // Also update companies table if exists
    const companyResult = await sql`
      UPDATE companies
      SET site_id = ${newSiteId}
      WHERE site_id = ${oldSiteId} OR instance_id = ${oldSiteId}
      RETURNING site_id
    `;

    return NextResponse.json({
      ok: true,
      storeConnectionsUpdated: storeResult.rowCount,
      companiesUpdated: companyResult.rowCount,
    });
  } catch (error) {
    console.error("Fix store error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
