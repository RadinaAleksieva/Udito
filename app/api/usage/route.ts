import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { sql } from "@/lib/supabase-sql";
import { authOptions } from "@/lib/auth";
import { getMonthlyUsage } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get user's business
    const businessResult = await sql`
      SELECT b.id, b.selected_plan_id, sp.name as plan_name
      FROM business_users bu
      JOIN businesses b ON b.id = bu.business_id
      LEFT JOIN subscription_plans sp ON sp.id = b.selected_plan_id
      WHERE bu.user_id = ${userId}
      LIMIT 1
    `;

    if (businessResult.rows.length === 0) {
      return NextResponse.json({ error: "No business found" }, { status: 404 });
    }

    const business = businessResult.rows[0];

    if (!business.id) {
      return NextResponse.json({ error: "No business ID" }, { status: 404 });
    }

    const usage = await getMonthlyUsage(business.id);

    if (!usage) {
      // Return defaults if no usage data yet
      return NextResponse.json({
        ordersCount: 0,
        receiptsCount: 0,
        planLimit: 50, // Default to starter plan limit
        isOverLimit: false,
        extraOrders: 0,
        extraCharge: 0,
        planName: business.plan_name || "Starter",
        yearMonth: new Date().toISOString().slice(0, 7),
      });
    }

    return NextResponse.json({
      ...usage,
      planName: business.plan_name || "Starter",
    });
  } catch (error) {
    console.error("Usage API error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
