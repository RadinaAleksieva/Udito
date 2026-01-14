import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    if (action === "fix-trial") {
      // Fix businesses with NULL trial_ends_at - set to 30 days from now
      const result = await sql`
        UPDATE businesses
        SET trial_ends_at = NOW() + INTERVAL '30 days',
            updated_at = NOW()
        WHERE trial_ends_at IS NULL
        RETURNING id, name, trial_ends_at
      `;
      return NextResponse.json({
        ok: true,
        message: "Fixed trial_ends_at for businesses",
        updated: result.rows,
      });
    }

    if (action === "link-store") {
      const email = searchParams.get("email");
      const siteId = searchParams.get("siteId");

      if (!email || !siteId) {
        return NextResponse.json({ ok: false, error: "Need email and siteId" }, { status: 400 });
      }

      // Find user by email
      const userResult = await sql`SELECT id FROM users WHERE email = ${email}`;
      if (userResult.rows.length === 0) {
        return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
      }

      const userId = userResult.rows[0].id;

      // Get user's business
      const businessResult = await sql`
        SELECT business_id FROM business_users WHERE user_id = ${userId} LIMIT 1
      `;

      let businessId: string;

      if (businessResult.rows.length === 0) {
        // Create a business for this user
        businessId = crypto.randomUUID();
        await sql`
          INSERT INTO businesses (id, name, trial_ends_at, subscription_status, created_at, updated_at)
          VALUES (${businessId}, 'Моята фирма', NOW() + INTERVAL '30 days', 'trial', NOW(), NOW())
        `;
        await sql`
          INSERT INTO business_users (business_id, user_id, role, created_at)
          VALUES (${businessId}, ${userId}, 'owner', NOW())
        `;
      } else {
        businessId = businessResult.rows[0].business_id;
      }

      // Check if connection already exists
      const existingResult = await sql`
        SELECT id FROM store_connections
        WHERE site_id = ${siteId} AND user_id = ${userId}
      `;

      if (existingResult.rows.length > 0) {
        return NextResponse.json({ ok: true, message: "Connection already exists" });
      }

      // Get instance_id from existing connection
      const instanceResult = await sql`
        SELECT instance_id, store_name FROM store_connections WHERE site_id = ${siteId} LIMIT 1
      `;
      const instanceId = instanceResult.rows[0]?.instance_id;
      const storeName = instanceResult.rows[0]?.store_name || "Unknown Store";

      // Create store connection
      await sql`
        INSERT INTO store_connections (business_id, site_id, instance_id, user_id, store_name, provider, connected_at)
        VALUES (${businessId}, ${siteId}, ${instanceId}, ${userId}, ${storeName}, 'wix', NOW())
      `;

      return NextResponse.json({
        ok: true,
        message: "Store linked to user",
        userId,
        siteId,
        instanceId,
      });
    }

    if (action === "fix-roles") {
      // Set role = 'owner' for all store_connections that have a user_id
      const result = await sql`
        UPDATE store_connections
        SET role = 'owner'
        WHERE user_id IS NOT NULL
        RETURNING id, site_id, user_id, role
      `;
      return NextResponse.json({
        ok: true,
        message: "Fixed roles for store connections",
        updated: result.rows,
      });
    }

    if (action === "fix-company-site") {
      const oldSiteId = searchParams.get("old");
      const newSiteId = searchParams.get("new");

      if (!oldSiteId || !newSiteId) {
        return NextResponse.json({ ok: false, error: "Need old and new siteId" }, { status: 400 });
      }

      const result = await sql`
        UPDATE companies
        SET site_id = ${newSiteId}
        WHERE site_id = ${oldSiteId}
        RETURNING site_id, instance_id, store_name
      `;

      return NextResponse.json({
        ok: true,
        message: "Fixed company site_id",
        updated: result.rows,
      });
    }

    if (action === "fix-all-site-ids") {
      // Fix all White Rabbit orders to have the correct site_id
      // The correct site_id is 6240f8a5-7af4-4fdf-96c1-d1f22b205408
      // Some have null, some have the instance_id 8865cc09-0949-43c4-a09c-5fdfbb352edf

      // First, fix orders with null site_id
      const fixedNull = await sql`
        UPDATE orders
        SET site_id = '6240f8a5-7af4-4fdf-96c1-d1f22b205408'
        WHERE site_id IS NULL
        RETURNING id, number
      `;

      // Second, fix orders with wrong site_id (instance_id instead of site_id)
      const fixedWrong = await sql`
        UPDATE orders
        SET site_id = '6240f8a5-7af4-4fdf-96c1-d1f22b205408'
        WHERE site_id = '8865cc09-0949-43c4-a09c-5fdfbb352edf'
        RETURNING id, number
      `;

      // Also fix the companies table
      const fixedCompany = await sql`
        UPDATE companies
        SET site_id = '6240f8a5-7af4-4fdf-96c1-d1f22b205408'
        WHERE site_id = '8865cc09-0949-43c4-a09c-5fdfbb352edf'
        OR instance_id = '8865cc09-0949-43c4-a09c-5fdfbb352edf'
        RETURNING site_id, instance_id, store_name
      `;

      return NextResponse.json({
        ok: true,
        message: "Fixed all site_ids for White Rabbit",
        fixedNullOrders: fixedNull.rows.length,
        fixedWrongOrders: fixedWrong.rows.length,
        fixedCompanies: fixedCompany.rows,
      });
    }

    if (action === "fix-null-orders") {
      const targetSiteId = searchParams.get("siteId");
      if (!targetSiteId) {
        // Show orders with null site_id
        const nullOrders = await sql`
          SELECT id, number, created_at, total, currency, status
          FROM orders
          WHERE site_id IS NULL
          ORDER BY created_at DESC
          LIMIT 20
        `;
        return NextResponse.json({
          ok: true,
          message: "Orders with null site_id",
          orders: nullOrders.rows,
          hint: "Add &siteId=xxx to fix them",
        });
      }

      // Fix orders with null site_id
      const result = await sql`
        UPDATE orders
        SET site_id = ${targetSiteId}
        WHERE site_id IS NULL
        RETURNING id, number, site_id
      `;
      return NextResponse.json({
        ok: true,
        message: "Fixed orders with null site_id",
        updated: result.rows,
      });
    }

    if (action === "enrich-order") {
      const orderNumber = searchParams.get("number");
      if (!orderNumber) {
        return NextResponse.json({ ok: false, error: "Need order number" }, { status: 400 });
      }

      // Get order from DB
      const orderResult = await sql`
        SELECT id, number, site_id, raw FROM orders WHERE number = ${orderNumber}
      `;
      if (orderResult.rows.length === 0) {
        return NextResponse.json({ ok: false, error: "Order not found" }, { status: 404 });
      }

      const order = orderResult.rows[0];
      const raw = order.raw as any;

      // Import necessary functions
      const { fetchOrderTransactionsForOrder, extractPaymentSummaryFromPayment, pickOrderFields } = await import("@/lib/wix");
      const { upsertOrder } = await import("@/lib/db");

      // Fetch orderTransactions from Wix
      const orderTx = await fetchOrderTransactionsForOrder({
        orderId: order.id,
        siteId: order.site_id,
        instanceId: null,
      });

      if (!orderTx?.orderTransactions && !orderTx?.payments) {
        return NextResponse.json({
          ok: false,
          error: "No payment data found in Wix",
          orderId: order.id,
        });
      }

      // Merge orderTransactions into raw
      const enrichedRaw = {
        ...raw,
        orderTransactions: orderTx.orderTransactions ?? { payments: orderTx.payments },
      };

      // Extract payment summary
      const payments = orderTx.payments ?? orderTx.orderTransactions?.payments;
      let transactionRef: string | null = null;
      if (Array.isArray(payments) && payments.length > 0) {
        const validStatuses = ['APPROVED', 'COMPLETED', 'REFUNDED'];
        const bestPayment = payments.find(
          (p: any) => validStatuses.includes(p?.regularPaymentDetails?.status)
        ) || payments[0];

        const paymentSummary = extractPaymentSummaryFromPayment(bestPayment);

        transactionRef =
          bestPayment?.regularPaymentDetails?.gatewayTransactionId ??
          bestPayment?.regularPaymentDetails?.providerTransactionId ??
          bestPayment?.id ??
          null;

        enrichedRaw.udito = {
          ...(enrichedRaw.udito ?? {}),
          ...(paymentSummary ? { paymentSummary } : {}),
          ...(transactionRef ? { transactionRef } : {}),
        };
      }

      // Update order in DB
      const mapped = pickOrderFields(enrichedRaw, "backfill");
      await upsertOrder({
        ...mapped,
        siteId: order.site_id,
        businessId: null,
        raw: enrichedRaw,
      });

      return NextResponse.json({
        ok: true,
        message: "Order enriched with payment data",
        orderNumber: order.number,
        transactionRef,
        payments: payments?.length || 0,
      });
    }

    // Default: show current state
    const businesses = await sql`
      SELECT id, name, subscription_status, trial_ends_at FROM businesses
    `;
    const connections = await sql`
      SELECT sc.*, u.email FROM store_connections sc
      LEFT JOIN users u ON u.id = sc.user_id
    `;
    const companies = await sql`
      SELECT site_id, instance_id, store_name, store_domain, store_id, bulstat, cod_receipts_enabled, receipts_start_date
      FROM companies
    `;
    const companyCount = await sql`SELECT COUNT(*) as count FROM companies`;

    return NextResponse.json({
      ok: true,
      businesses: businesses.rows,
      connections: connections.rows,
      companies: companies.rows,
      companyCount: companyCount.rows[0]?.count,
      actions: ["?action=fix-trial", "?action=link-store&email=xxx&siteId=yyy", "?action=fix-roles", "?action=fix-null-orders", "?action=fix-null-orders&siteId=xxx", "?action=fix-company-site&old=xxx&new=yyy", "?action=enrich-order&number=xxx"],
    });
  } catch (error) {
    console.error("Fix data error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
