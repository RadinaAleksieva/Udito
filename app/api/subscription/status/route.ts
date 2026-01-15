import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth, getActiveStore } from "@/lib/auth";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  const cookieStore = cookies();

  // Get Wix context from cookies or URL params
  const url = new URL(request.url);
  const instanceId = url.searchParams.get("instanceId") || cookieStore.get("udito_instance_id")?.value;
  const siteId = url.searchParams.get("siteId") || cookieStore.get("udito_site_id")?.value;

  let businessId: string | null = null;

  // First try to get business from NextAuth session
  if (session?.user?.id) {
    const result = await sql`
      SELECT business_id FROM business_users
      WHERE user_id = ${session.user.id}
      LIMIT 1
    `;
    if (result.rows.length > 0) {
      businessId = result.rows[0].business_id;
    }
  }

  // If no business from session, try to get from Wix store connection
  if (!businessId && (siteId || instanceId)) {
    const storeResult = await sql`
      SELECT business_id FROM store_connections
      WHERE (${siteId}::text IS NOT NULL AND site_id = ${siteId})
         OR (${instanceId}::text IS NOT NULL AND instance_id = ${instanceId})
      LIMIT 1
    `;
    if (storeResult.rows.length > 0) {
      businessId = storeResult.rows[0].business_id;
    }
  }

  // If still no business, try from companies table
  if (!businessId && (siteId || instanceId)) {
    const companyResult = await sql`
      SELECT business_id FROM companies
      WHERE (${siteId}::text IS NOT NULL AND site_id = ${siteId})
         OR (${instanceId}::text IS NOT NULL AND instance_id = ${instanceId})
      LIMIT 1
    `;
    if (companyResult.rows.length > 0) {
      businessId = companyResult.rows[0].business_id;
    }
  }

  if (!businessId) {
    return NextResponse.json({
      hasSubscription: false,
      status: "none",
      isActive: true, // Allow access if no business found (legacy/Wix-only users)
      daysRemaining: 999,
      message: "Няма намерен бизнес акаунт",
    });
  }

  try {
    // Get business subscription
    const result = await sql`
      SELECT id, name, trial_ends_at, subscription_status,
             plan_id, subscription_expires_at
      FROM businesses
      WHERE id = ${businessId}
      LIMIT 1
    `;

    if (result.rows.length === 0) {
      return NextResponse.json({
        hasSubscription: false,
        status: "none",
        isActive: true,
        daysRemaining: 999,
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
      daysRemaining = 999;
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
