import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { sql } from "@/lib/sql";
import { authOptions } from "@/lib/auth";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Check if user is admin - emails stored in env variable for security
function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
  return adminEmails.includes(email.toLowerCase());
}

export async function GET() {
  try {
    await initDb();

    const session = await getServerSession(authOptions);

    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get stats (orders/receipts are now in tenant schemas, so we count from there)
    const [
      businessCount,
      userCount,
      activeCount,
      trialCount,
      tenantSchemas,
    ] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM businesses`,
      sql`SELECT COUNT(*) as count FROM users`,
      sql`SELECT COUNT(*) as count FROM businesses WHERE subscription_status = 'active'`,
      sql`SELECT COUNT(*) as count FROM businesses WHERE subscription_status = 'trial' OR subscription_status IS NULL`,
      sql`SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('public', 'information_schema', 'pg_catalog', 'pg_toast')`,
    ]);

    // Count orders and receipts from all tenant schemas
    let totalOrders = 0;
    let totalReceipts = 0;
    for (const row of tenantSchemas.rows) {
      const schema = row.schema_name;
      try {
        const orderCountResult = await sql.query(`SELECT COUNT(*) as count FROM "${schema}".orders`);
        const receiptCountResult = await sql.query(`SELECT COUNT(*) as count FROM "${schema}".receipts`);
        totalOrders += parseInt(orderCountResult.rows[0]?.count || "0");
        totalReceipts += parseInt(receiptCountResult.rows[0]?.count || "0");
      } catch {
        // Schema might not have orders/receipts tables
      }
    }

    const stats = {
      totalBusinesses: parseInt(businessCount.rows[0]?.count || "0"),
      totalUsers: parseInt(userCount.rows[0]?.count || "0"),
      totalOrders,
      totalReceipts,
      activeSubscriptions: parseInt(activeCount.rows[0]?.count || "0"),
      trialUsers: parseInt(trialCount.rows[0]?.count || "0"),
    };

    // Get businesses
    const businessesResult = await sql`
      SELECT id, name, subscription_status, plan_id, trial_ends_at,
             onboarding_completed, created_at
      FROM businesses
      ORDER BY created_at DESC
      LIMIT 50
    `;

    // Get users
    const usersResult = await sql`
      SELECT id, email, name, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 50
    `;

    // Get orders breakdown by site (from tenant schemas)
    const companiesResult = await sql`
      SELECT c.site_id, c.store_name, c.store_domain, b.name as business_name
      FROM companies c
      LEFT JOIN businesses b ON c.business_id = b.id
    `;

    const ordersBySiteArr = [];
    for (const company of companiesResult.rows) {
      if (!company.site_id) continue;
      // Convert site_id to schema name
      const schemaName = company.site_id.replace(/-/g, "_");
      try {
        const countResult = await sql.query(`
          SELECT
            (SELECT COUNT(*) FROM "${schemaName}".orders) as order_count,
            (SELECT COUNT(*) FROM "${schemaName}".receipts) as receipt_count
        `);
        ordersBySiteArr.push({
          site_id: company.site_id,
          store_name: company.store_name,
          store_domain: company.store_domain,
          business_name: company.business_name,
          order_count: parseInt(countResult.rows[0]?.order_count || "0"),
          receipt_count: parseInt(countResult.rows[0]?.receipt_count || "0"),
        });
      } catch {
        // Schema doesn't exist or doesn't have tables
        ordersBySiteArr.push({
          site_id: company.site_id,
          store_name: company.store_name,
          store_domain: company.store_domain,
          business_name: company.business_name,
          order_count: 0,
          receipt_count: 0,
        });
      }
    }
    const ordersBySite = { rows: ordersBySiteArr.sort((a, b) => b.order_count - a.order_count) };

    return NextResponse.json({
      stats,
      businesses: businessesResult.rows,
      users: usersResult.rows,
      ordersBySite: ordersBySite.rows,
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
