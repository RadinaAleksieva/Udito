import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { sql } from "@vercel/postgres";
import { authOptions } from "@/lib/auth";

// Admin emails that have access
const ADMIN_EMAILS = ["office@designedbypo.com"];

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
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

    return NextResponse.json({
      stats,
      businesses: businessesResult.rows,
      users: usersResult.rows,
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
