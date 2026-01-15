import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { sql } from "@vercel/postgres";
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

    // Get stats
    const [
      businessCount,
      userCount,
      orderCount,
      receiptCount,
      activeCount,
      trialCount,
    ] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM businesses`,
      sql`SELECT COUNT(*) as count FROM users`,
      sql`SELECT COUNT(*) as count FROM orders`,
      sql`SELECT COUNT(*) as count FROM receipts`,
      sql`SELECT COUNT(*) as count FROM businesses WHERE subscription_status = 'active'`,
      sql`SELECT COUNT(*) as count FROM businesses WHERE subscription_status = 'trial' OR subscription_status IS NULL`,
    ]);

    const stats = {
      totalBusinesses: parseInt(businessCount.rows[0]?.count || "0"),
      totalUsers: parseInt(userCount.rows[0]?.count || "0"),
      totalOrders: parseInt(orderCount.rows[0]?.count || "0"),
      totalReceipts: parseInt(receiptCount.rows[0]?.count || "0"),
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

    // Get orders breakdown by site
    const ordersBySite = await sql`
      SELECT
        o.site_id,
        c.store_name,
        c.store_domain,
        b.name as business_name,
        COUNT(*) as order_count,
        COUNT(CASE WHEN r.id IS NOT NULL THEN 1 END) as receipt_count
      FROM orders o
      LEFT JOIN companies c ON o.site_id = c.site_id
      LEFT JOIN businesses b ON c.business_id = b.id
      LEFT JOIN receipts r ON o.id = r.order_id
      GROUP BY o.site_id, c.store_name, c.store_domain, b.name
      ORDER BY order_count DESC
    `;

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
