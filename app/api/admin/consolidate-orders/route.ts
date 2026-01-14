import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET: Show current site_id distribution
export async function GET() {
  try {
    await initDb();

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    // Get site_id distribution
    const distribution = await sql`
      SELECT site_id, COUNT(*) as order_count
      FROM orders
      GROUP BY site_id
      ORDER BY order_count DESC
    `;

    // Get store_connections for this user
    const stores = await sql`
      SELECT sc.id, sc.site_id, sc.instance_id, sc.store_name, c.store_domain
      FROM store_connections sc
      LEFT JOIN companies c ON c.site_id = sc.site_id
      WHERE sc.user_id = ${session.user.id}
    `;

    return NextResponse.json({
      ok: true,
      siteIdDistribution: distribution.rows,
      userStores: stores.rows,
      hint: "Use POST with { fromSiteId, toSiteId } to consolidate orders",
    });
  } catch (error) {
    console.error("Consolidate orders GET error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// POST: Consolidate orders from one site_id to another
export async function POST(request: Request) {
  try {
    await initDb();

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { fromSiteId, toSiteId } = body;

    if (!toSiteId) {
      return NextResponse.json({ ok: false, error: "Missing toSiteId" }, { status: 400 });
    }

    // Count orders that will be affected
    let countResult;
    if (fromSiteId === null || fromSiteId === "null") {
      countResult = await sql`
        SELECT COUNT(*) as count FROM orders WHERE site_id IS NULL
      `;
    } else if (fromSiteId) {
      countResult = await sql`
        SELECT COUNT(*) as count FROM orders WHERE site_id = ${fromSiteId}
      `;
    } else {
      return NextResponse.json({ ok: false, error: "Missing fromSiteId (use 'null' for NULL values)" }, { status: 400 });
    }

    const affectedCount = countResult.rows[0]?.count || 0;

    // Update orders
    let updateResult;
    if (fromSiteId === null || fromSiteId === "null") {
      updateResult = await sql`
        UPDATE orders SET site_id = ${toSiteId} WHERE site_id IS NULL
        RETURNING id
      `;
    } else {
      updateResult = await sql`
        UPDATE orders SET site_id = ${toSiteId} WHERE site_id = ${fromSiteId}
        RETURNING id
      `;
    }

    return NextResponse.json({
      ok: true,
      fromSiteId,
      toSiteId,
      expectedCount: affectedCount,
      updatedCount: updateResult.rowCount,
    });
  } catch (error) {
    console.error("Consolidate orders POST error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
