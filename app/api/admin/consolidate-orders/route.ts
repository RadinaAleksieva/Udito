import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET: Show current site_id distribution or list orders for a specific site_id
export async function GET(request: Request) {
  try {
    await initDb();

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const url = new URL(request.url);
    const listSiteId = url.searchParams.get("list");

    // If list parameter provided, show orders for that site_id
    if (listSiteId) {
      const orders = await sql`
        SELECT id, number, status, payment_status, created_at, customer_name, raw
        FROM orders
        WHERE site_id = ${listSiteId}
        ORDER BY created_at DESC
        LIMIT 50
      `;
      // Extract line items from raw
      const ordersWithItems = orders.rows.map((order: any) => {
        const raw = order.raw as any;
        const lineItems = raw?.lineItems ?? raw?.items ?? [];
        const items = Array.isArray(lineItems)
          ? lineItems.map((item: any) => item?.productName?.translated ?? item?.productName?.original ?? item?.name ?? "Unknown")
          : [];
        return {
          id: order.id,
          number: order.number,
          status: order.status,
          payment_status: order.payment_status,
          created_at: order.created_at,
          customer_name: order.customer_name,
          items,
        };
      });
      return NextResponse.json({
        ok: true,
        siteId: listSiteId,
        count: orders.rowCount,
        orders: ordersWithItems,
      });
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
      hint: "Use POST with { fromSiteId, toSiteId } to consolidate orders. Use GET ?list=<siteId> to see orders.",
    });
  } catch (error) {
    console.error("Consolidate orders GET error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}

// POST: Consolidate orders or move single order
export async function POST(request: Request) {
  try {
    await initDb();

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { fromSiteId, toSiteId, orderNumber, orderId } = body;

    if (!toSiteId) {
      return NextResponse.json({ ok: false, error: "Missing toSiteId" }, { status: 400 });
    }

    // If orderId provided, move single order by ID
    if (orderId) {
      const updateResult = await sql`
        UPDATE orders SET site_id = ${toSiteId} WHERE id = ${orderId}
        RETURNING id, number, site_id
      `;
      return NextResponse.json({
        ok: true,
        orderId,
        toSiteId,
        updated: updateResult.rowCount,
        order: updateResult.rows[0],
      });
    }

    // If orderNumber provided, move single order by number
    if (orderNumber) {
      const updateResult = await sql`
        UPDATE orders SET site_id = ${toSiteId} WHERE number = ${orderNumber}
        RETURNING id, number, site_id
      `;
      return NextResponse.json({
        ok: true,
        orderNumber,
        toSiteId,
        updated: updateResult.rowCount,
        order: updateResult.rows[0],
      });
    }

    // Bulk consolidation: Count orders that will be affected
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
      return NextResponse.json({ ok: false, error: "Missing fromSiteId or orderNumber" }, { status: 400 });
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
