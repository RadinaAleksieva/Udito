import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";

/**
 * This endpoint:
 * 1. Shows orders with NULL site_id and their instanceId from raw data
 * 2. Can update them to have the correct site_id based on instanceId
 */
export async function GET(request: Request) {
  await initDb();
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  // Show orders with NULL site_id
  const ordersWithNullSiteId = await sql`
    SELECT
      number,
      site_id,
      raw->>'instanceId' as instance_id_from_raw,
      raw->'instanceId' as instance_id_object,
      jsonb_typeof(raw->'instanceId') as instance_id_type,
      created_at
    FROM orders
    WHERE site_id IS NULL
    ORDER BY created_at DESC
    LIMIT 20
  `;

  // Get company mapping (instanceId -> site_id)
  const companies = await sql`
    SELECT instance_id, site_id, store_name
    FROM companies
    WHERE instance_id IS NOT NULL
  `;

  const companyMap: Record<string, { siteId: string; storeName: string }> = {};
  for (const c of companies.rows) {
    if (c.instance_id) {
      companyMap[c.instance_id] = { siteId: c.site_id, storeName: c.store_name };
    }
  }

  // For each order, show what store it belongs to
  const analysis = ordersWithNullSiteId.rows.map(order => {
    const instId = order.instance_id_from_raw;
    const matchedCompany = instId ? companyMap[instId] : null;
    return {
      number: order.number,
      instanceIdFromRaw: instId,
      instanceIdObject: order.instance_id_object,
      instanceIdType: order.instance_id_type,
      matchedStore: matchedCompany?.storeName || "UNKNOWN",
      shouldHaveSiteId: matchedCompany?.siteId || null,
    };
  });

  if (action === "fix") {
    // Actually update the orders
    let fixed = 0;
    for (const order of ordersWithNullSiteId.rows) {
      const instId = order.instance_id_from_raw;
      if (instId && companyMap[instId]) {
        await sql`
          UPDATE orders
          SET site_id = ${companyMap[instId].siteId}
          WHERE number = ${order.number} AND site_id IS NULL
        `;
        fixed++;
      }
    }
    return NextResponse.json({
      ok: true,
      fixed,
      message: `Fixed ${fixed} orders with NULL site_id`
    });
  }

  // Manual assignment: ?action=assign&orders=10258,10227&store=white-rabbit
  if (action === "assign") {
    const orderNumbers = url.searchParams.get("orders")?.split(",") || [];
    const store = url.searchParams.get("store");

    // Get the site_id for the store
    let targetSiteId: string | null = null;
    if (store === "white-rabbit") {
      targetSiteId = "8865cc09-0949-43c4-a09c-5fdfbb352edf";
    } else if (store === "fst") {
      targetSiteId = "de34f1c3-7bff-4501-9e04-bd90f3c43ae5";
    }

    if (!targetSiteId || orderNumbers.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "Usage: ?action=assign&orders=10258,10227&store=white-rabbit (or store=fst)"
      }, { status: 400 });
    }

    let assigned = 0;
    for (const num of orderNumbers) {
      const result = await sql`
        UPDATE orders
        SET site_id = ${targetSiteId}
        WHERE number = ${num.trim()}
        RETURNING number
      `;
      if (result.rows.length > 0) assigned++;
    }

    return NextResponse.json({
      ok: true,
      assigned,
      message: `Assigned ${assigned} orders to ${store} (site_id: ${targetSiteId})`
    });
  }

  // Delete orders: ?action=delete&orders=10126
  if (action === "delete") {
    const orderNumbers = url.searchParams.get("orders")?.split(",") || [];

    if (orderNumbers.length === 0) {
      return NextResponse.json({
        ok: false,
        error: "Usage: ?action=delete&orders=10126,10127"
      }, { status: 400 });
    }

    let deleted = 0;
    for (const num of orderNumbers) {
      const result = await sql`
        DELETE FROM orders
        WHERE number = ${num.trim()}
        RETURNING number
      `;
      if (result.rows.length > 0) deleted++;
    }

    return NextResponse.json({
      ok: true,
      deleted,
      message: `Deleted ${deleted} orders`
    });
  }

  return NextResponse.json({
    ok: true,
    ordersWithNullSiteId: analysis,
    companies: companies.rows,
    message: "Add ?action=fix to actually update the orders"
  });
}
