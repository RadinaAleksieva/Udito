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

  return NextResponse.json({
    ok: true,
    ordersWithNullSiteId: analysis,
    companies: companies.rows,
    message: "Add ?action=fix to actually update the orders"
  });
}
