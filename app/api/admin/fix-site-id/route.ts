import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// GET: Show orders with null site_id and available companies
export async function GET() {
  try {
    await initDb();

    // Get orders with null site_id
    const ordersResult = await sql`
      SELECT id, number, created_at, payment_status
      FROM orders
      WHERE site_id IS NULL
      ORDER BY created_at DESC
      LIMIT 50
    `;

    // Get available companies with site_id
    const companiesResult = await sql`
      SELECT site_id, store_name
      FROM companies
      WHERE site_id IS NOT NULL
      ORDER BY updated_at DESC
    `;

    return NextResponse.json({
      ok: true,
      ordersWithNullSiteId: ordersResult.rows,
      availableCompanies: companiesResult.rows,
      instructions: "POST with { siteId: 'xxx' } to update all orders with null site_id to the specified siteId",
    });
  } catch (error) {
    console.error("Check site_id failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

// POST: Update orders with null/wrong site_id to the specified siteId
export async function POST(request: NextRequest) {
  try {
    await initDb();

    const body = await request.json();
    const siteId = body?.siteId;
    const orderNumber = body?.orderNumber;
    const fixWrongSiteIds = body?.fixWrongSiteIds; // Fix orders that have instance_id stored as site_id

    if (!siteId) {
      return NextResponse.json({ ok: false, error: "siteId is required in request body" }, { status: 400 });
    }

    // Verify the siteId exists in companies
    const companyCheck = await sql`
      SELECT site_id, store_name, instance_id FROM companies WHERE site_id = ${siteId}
    `;

    if (companyCheck.rows.length === 0) {
      return NextResponse.json({ ok: false, error: `No company found with site_id: ${siteId}` }, { status: 400 });
    }

    const company = companyCheck.rows[0];
    let updateResult;

    if (orderNumber) {
      // Update specific order by number
      updateResult = await sql`
        UPDATE orders
        SET site_id = ${siteId}
        WHERE number = ${orderNumber}
        RETURNING id, number
      `;
    } else if (fixWrongSiteIds && company.instance_id) {
      // Fix orders that have instance_id stored as site_id
      updateResult = await sql`
        UPDATE orders
        SET site_id = ${siteId}
        WHERE site_id = ${company.instance_id}
        RETURNING id, number
      `;
    } else {
      // Update all orders that have null site_id
      updateResult = await sql`
        UPDATE orders
        SET site_id = ${siteId}
        WHERE site_id IS NULL
        RETURNING id, number
      `;
    }

    return NextResponse.json({
      ok: true,
      siteId,
      storeName: company.store_name,
      updatedCount: updateResult.rows.length,
      updatedOrders: updateResult.rows.map(r => ({ id: r.id, number: r.number })),
    });
  } catch (error) {
    console.error("Fix site_id failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
