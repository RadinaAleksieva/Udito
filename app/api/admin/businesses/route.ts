import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { sql } from "@/lib/sql";
import { authOptions } from "@/lib/auth";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
  return adminEmails.includes(email.toLowerCase());
}

// GET - List all businesses with detailed info
export async function GET() {
  try {
    await initDb();

    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get basic business data first
    const result = await sql`
      SELECT
        b.id,
        b.name,
        b.subscription_status,
        b.plan_id,
        b.trial_ends_at,
        b.subscription_expires_at,
        b.onboarding_completed,
        b.onboarding_step,
        b.created_at,
        b.updated_at,
        (SELECT string_agg(DISTINCT u.email, ', ')
         FROM business_users bu
         JOIN users u ON u.id = bu.user_id
         WHERE bu.business_id = b.id) as user_emails,
        (SELECT COUNT(*) FROM business_users WHERE business_id = b.id) as user_count,
        (SELECT c.store_name FROM companies c WHERE c.business_id = b.id LIMIT 1) as store_name,
        (SELECT c.site_id FROM companies c WHERE c.business_id = b.id LIMIT 1) as site_id
      FROM businesses b
      ORDER BY b.created_at DESC
    `;

    // Now get order/receipt counts from tenant schemas
    const businesses = await Promise.all(result.rows.map(async (biz) => {
      let total_orders = 0;
      let total_receipts = 0;
      let receipts_this_month = 0;

      if (biz.site_id) {
        const schemaName = biz.site_id.replace(/-/g, "_");
        try {
          const counts = await sql.query(`
            SELECT
              (SELECT COUNT(*) FROM "${schemaName}".orders) as order_count,
              (SELECT COUNT(*) FROM "${schemaName}".receipts) as receipt_count,
              (SELECT COUNT(*) FROM "${schemaName}".receipts WHERE created_at >= date_trunc('month', CURRENT_DATE)) as receipts_month
          `);
          total_orders = parseInt(counts.rows[0]?.order_count || "0");
          total_receipts = parseInt(counts.rows[0]?.receipt_count || "0");
          receipts_this_month = parseInt(counts.rows[0]?.receipts_month || "0");
        } catch {
          // Schema doesn't exist
        }
      }

      return {
        ...biz,
        total_orders,
        total_receipts,
        receipts_this_month,
      };
    }));

    return NextResponse.json({ businesses });
  } catch (error) {
    console.error("Admin businesses error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// PATCH - Update a business
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { businessId, action, ...data } = body;

    if (!businessId) {
      return NextResponse.json({ error: "Missing businessId" }, { status: 400 });
    }

    switch (action) {
      case "update_subscription": {
        const { status, planId, trialEndsAt, subscriptionExpiresAt } = data;
        await sql`
          UPDATE businesses
          SET subscription_status = COALESCE(${status}, subscription_status),
              plan_id = COALESCE(${planId}, plan_id),
              trial_ends_at = COALESCE(${trialEndsAt}::timestamptz, trial_ends_at),
              subscription_expires_at = COALESCE(${subscriptionExpiresAt}::timestamptz, subscription_expires_at),
              updated_at = NOW()
          WHERE id = ${businessId}
        `;
        break;
      }
      case "extend_trial": {
        const { days } = data;
        await sql`
          UPDATE businesses
          SET trial_ends_at = COALESCE(trial_ends_at, NOW()) + ${days || 10} * INTERVAL '1 day',
              subscription_status = 'trial',
              updated_at = NOW()
          WHERE id = ${businessId}
        `;
        break;
      }
      case "activate": {
        const { months } = data;
        await sql`
          UPDATE businesses
          SET subscription_status = 'active',
              subscription_expires_at = NOW() + ${months || 1} * INTERVAL '1 month',
              updated_at = NOW()
          WHERE id = ${businessId}
        `;
        break;
      }
      case "cancel": {
        await sql`
          UPDATE businesses
          SET subscription_status = 'cancelled',
              updated_at = NOW()
          WHERE id = ${businessId}
        `;
        break;
      }
      case "update_name": {
        const { name } = data;
        await sql`
          UPDATE businesses
          SET name = ${name},
              updated_at = NOW()
          WHERE id = ${businessId}
        `;
        break;
      }
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin update business error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE - Delete a business
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const businessId = searchParams.get("id");

    if (!businessId) {
      return NextResponse.json({ error: "Missing business ID" }, { status: 400 });
    }

    // Delete in order to avoid foreign key constraints
    await sql`DELETE FROM store_connections WHERE business_id = ${businessId}`;
    await sql`DELETE FROM business_users WHERE business_id = ${businessId}`;
    await sql`DELETE FROM companies WHERE business_id = ${businessId}`;
    await sql`DELETE FROM businesses WHERE id = ${businessId}`;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin delete business error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
