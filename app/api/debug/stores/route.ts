import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";
import { auth, getUserStores } from "@/lib/auth";
import { getActiveWixContext } from "@/lib/wix-context";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await initDb();

    const session = await auth();
    const context = await getActiveWixContext();
    const userStores = session?.user?.id ? await getUserStores(session.user.id) : [];

    // Get unique site_ids from orders
    const siteIdsResult = await sql`
      SELECT DISTINCT site_id, COUNT(*) as order_count
      FROM orders
      GROUP BY site_id
      ORDER BY order_count DESC
      LIMIT 20
    `;

    // Get total orders
    const totalResult = await sql`SELECT COUNT(*) as total FROM orders`;

    // Get orders for current context
    const currentSiteId = context.siteId || context.instanceId;
    const currentOrdersResult = currentSiteId
      ? await sql`
          SELECT COUNT(*) as count
          FROM orders
          WHERE site_id = ${currentSiteId}
        `
      : { rows: [{ count: 0 }] };

    return NextResponse.json({
      ok: true,
      session: {
        userId: session?.user?.id || null,
        email: session?.user?.email || null,
      },
      context: {
        siteId: context.siteId,
        instanceId: context.instanceId,
      },
      userStores: userStores.map((s: any) => ({
        site_id: s.site_id,
        instance_id: s.instance_id,
        store_name: s.store_name,
      })),
      database: {
        totalOrders: totalResult.rows[0]?.total,
        ordersForCurrentSite: currentOrdersResult.rows[0]?.count,
        siteIds: siteIdsResult.rows,
      },
    });
  } catch (error) {
    console.error("Debug stores error:", error);
    return NextResponse.json(
      { ok: false, error: String(error) },
      { status: 500 }
    );
  }
}
