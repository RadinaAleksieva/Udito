import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/supabase-sql";
import { fetchOrderDetails } from "@/lib/wix";

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
  return adminEmails.includes(email.toLowerCase());
}

export const dynamic = "force-dynamic";

// POST - Fix archived orders by re-syncing from Wix or marking directly
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { orderIds, markArchived } = body;

    // Get the site_id for thewhiterabbitshop
    const siteResult = await sql.query(`
      SELECT site_id FROM companies WHERE store_domain LIKE '%thewhiterabbitshop%' LIMIT 1
    `);

    const siteId = siteResult.rows[0]?.site_id;
    if (!siteId) {
      return NextResponse.json({ error: "Site not found" }, { status: 404 });
    }

    // If specific orderIds provided, mark them as archived directly
    if (orderIds && Array.isArray(orderIds) && orderIds.length > 0) {
      let fixedCount = 0;
      for (const orderId of orderIds) {
        await sql.query(`
          UPDATE public.orders
          SET raw = raw || '{"archived": true}'::jsonb
          WHERE id = $1
        `, [orderId]);
        fixedCount++;
        console.log(`[FIX-ARCHIVED] Marked order ${orderId} as archived`);
      }
      return NextResponse.json({ success: true, fixed: fixedCount });
    }

    // Otherwise, check all non-archived orders against Wix
    const ordersResult = await sql.query(`
      SELECT o.id, o.number, o.status, o.raw
      FROM public.orders o
      WHERE site_id = $1
        AND (o.status IS NULL OR LOWER(o.status) NOT LIKE 'archiv%')
        AND COALESCE(o.raw->>'archived', 'false') <> 'true'
        AND COALESCE(o.raw->>'isArchived', 'false') <> 'true'
        AND o.raw->>'archivedAt' IS NULL
      ORDER BY o.created_at DESC
      LIMIT 50
    `, [siteId]);

    let fixedCount = 0;
    const fixedOrders: string[] = [];

    // Re-fetch each order from Wix to check archived status
    for (const order of ordersResult.rows) {
      try {
        const wixOrder = await fetchOrderDetails({
          orderId: order.id,
          siteId,
          instanceId: null,
        });

        if (!wixOrder) continue;

        // Check if archived in Wix
        const isArchived = wixOrder?.archived === true ||
          wixOrder?.isArchived === true ||
          wixOrder?.archivedAt ||
          wixOrder?.archivedDate ||
          String(wixOrder?.status ?? "").toLowerCase().includes("archived");

        if (isArchived) {
          // Update local database with archived flag
          await sql.query(`
            UPDATE public.orders
            SET raw = raw || '{"archived": true}'::jsonb,
                status = COALESCE($1, status)
            WHERE id = $2
          `, [wixOrder.status, order.id]);

          fixedCount++;
          fixedOrders.push(order.number || order.id);
          console.log(`[FIX-ARCHIVED] Marked order ${order.number} as archived`);
        }
      } catch (err) {
        console.warn(`Could not check order ${order.id}:`, err);
      }
    }

    console.log(`[FIX-ARCHIVED] Fixed ${fixedCount} orders`);

    return NextResponse.json({
      success: true,
      checked: ordersResult.rows.length,
      fixed: fixedCount,
      fixedOrders,
    });
  } catch (error) {
    console.error("Error fixing archived orders:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// GET - Check for orders that might need archiving
export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Find orders that are showing as non-archived but might be archived in Wix
    const ordersResult = await sql.query(`
      SELECT o.id, o.number, o.status, o.payment_status, o.created_at, o.site_id,
             o.raw->>'archived' as archived_flag,
             o.raw->>'isArchived' as is_archived_flag,
             o.raw->>'status' as raw_status
      FROM public.orders o
      WHERE (o.status IS NULL OR LOWER(o.status) NOT LIKE 'archiv%')
        AND COALESCE(o.raw->>'archived', 'false') <> 'true'
        AND COALESCE(o.raw->>'isArchived', 'false') <> 'true'
        AND o.raw->>'archivedAt' IS NULL
      ORDER BY o.created_at DESC
      LIMIT 20
    `);

    return NextResponse.json({
      orders: ordersResult.rows,
      count: ordersResult.rows.length,
    });
  } catch (error) {
    console.error("Error checking archived orders:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
