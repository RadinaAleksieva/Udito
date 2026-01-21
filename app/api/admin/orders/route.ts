import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { initDb } from "@/lib/db";
import { upsertTenantOrder, TenantOrder, tenantTablesExist, createTenantTables } from "@/lib/tenant-db";
import { issueReceipt } from "@/lib/receipts";

function requireSecret(request: Request) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    throw new Error("ADMIN_SECRET is not configured.");
  }
  const header = request.headers.get("authorization") || "";
  const token = header.replace(/^Bearer\s+/i, "");
  if (token !== secret) {
    throw new Error("Unauthorized.");
  }
}

export async function GET(request: Request) {
  try {
    requireSecret(request);
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") || 25);
    const result = await sql`
      select id, number, payment_status, created_at, total, currency, source
      from orders
      order by created_at desc nulls last
      limit ${limit};
    `;
    return NextResponse.json({ ok: true, orders: result.rows });
  } catch (error) {
    console.error("List orders failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 401 }
    );
  }
}

export async function POST(request: Request) {
  try {
    requireSecret(request);
    await initDb();
    const now = new Date();
    const orderId = `test_${now.getTime()}`;
    const siteId = "test-site";

    // Ensure tenant tables exist
    const tablesExist = await tenantTablesExist(siteId);
    if (!tablesExist) {
      await createTenantTables(siteId);
    }

    const tenantOrder: TenantOrder = {
      id: orderId,
      number: `TEST-${now.getTime()}`,
      status: "CREATED",
      paymentStatus: "PAID",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      paidAt: now.toISOString(),
      currency: "BGN",
      subtotal: 100,
      taxTotal: 20,
      shippingTotal: 0,
      discountTotal: 0,
      total: 120,
      customerEmail: "test@example.com",
      customerName: "Test Customer",
      source: "backfill",
      raw: { test: true },
    };
    await upsertTenantOrder(siteId, tenantOrder);
    await issueReceipt({ orderId, payload: { ...tenantOrder, siteId }, businessId: null });

    return NextResponse.json({ ok: true, orderId });
  } catch (error) {
    console.error("Create test order failed", error);
    return NextResponse.json(
      { ok: false, error: (error as Error).message },
      { status: 401 }
    );
  }
}
