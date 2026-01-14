import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Get user's business subscription
    const result = await sql`
      SELECT b.id, b.name, b.trial_ends_at, b.subscription_status,
             b.plan_id, b.subscription_expires_at
      FROM businesses b
      JOIN business_users bu ON b.id = bu.business_id
      WHERE bu.user_id = ${session.user.id}
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({
        hasSubscription: false,
        status: "none",
        message: "Няма намерен бизнес акаунт",
      });
    }

    const business = result.rows[0];
    const now = new Date();
    const trialEndsAt = business.trial_ends_at ? new Date(business.trial_ends_at) : null;
    const subscriptionExpiresAt = business.subscription_expires_at
      ? new Date(business.subscription_expires_at)
      : null;

    let status = business.subscription_status || "trial";
    let isActive = false;
    let daysRemaining = 0;

    if (status === "trial" && trialEndsAt) {
      daysRemaining = Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      isActive = daysRemaining > 0;
      if (!isActive) {
        status = "expired";
      }
    } else if (status === "active" && subscriptionExpiresAt) {
      daysRemaining = Math.ceil((subscriptionExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      isActive = daysRemaining > 0;
      if (!isActive) {
        status = "expired";
      }
    } else if (status === "active") {
      isActive = true;
    }

    return NextResponse.json({
      hasSubscription: true,
      businessId: business.id,
      businessName: business.name,
      status,
      isActive,
      planId: business.plan_id,
      trialEndsAt: trialEndsAt?.toISOString() || null,
      subscriptionExpiresAt: subscriptionExpiresAt?.toISOString() || null,
      daysRemaining: Math.max(0, daysRemaining),
    });
  } catch (error) {
    console.error("Error checking subscription status:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
