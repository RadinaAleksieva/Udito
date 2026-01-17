import { redirect } from "next/navigation";
import { sql } from "@/lib/supabase-sql";
import { auth } from "@/lib/auth";

/**
 * Server-side onboarding check for protected pages.
 * Call this at the beginning of server components that require completed onboarding.
 *
 * Returns the business data if onboarding is complete, or redirects to the appropriate step.
 * If no business is found, returns null (for Wix-only users).
 */
export async function requireOnboarding() {
  const session = await auth();

  if (!session?.user?.id) {
    // Not authenticated - middleware should handle this
    redirect("/login");
  }

  const businessResult = await sql`
    SELECT b.id, b.name, b.onboarding_completed, b.onboarding_step, b.selected_plan_id,
           b.trial_ends_at, b.subscription_status
    FROM business_users bu
    JOIN businesses b ON b.id = bu.business_id
    WHERE bu.user_id = ${session.user.id}
    LIMIT 1
  `;

  if (businessResult.rows.length === 0) {
    // No business found - user might be Wix-only, allow access
    return null;
  }

  const business = businessResult.rows[0];

  if (!business.onboarding_completed) {
    // Redirect to appropriate onboarding step
    const stepRoutes = ["/onboarding/company", "/onboarding/settings", "/onboarding/plan"];
    const currentStep = business.onboarding_step ?? 0;

    if (currentStep < stepRoutes.length) {
      redirect(stepRoutes[currentStep]);
    } else {
      redirect("/onboarding");
    }
  }

  return {
    id: business.id,
    name: business.name,
    selectedPlanId: business.selected_plan_id,
    trialEndsAt: business.trial_ends_at,
    subscriptionStatus: business.subscription_status,
  };
}

/**
 * Check if user has a connected store.
 * Returns the store data if found, or null.
 */
export async function getConnectedStore(userId: string) {
  const storeResult = await sql`
    SELECT site_id, instance_id, store_name, role
    FROM store_connections
    WHERE user_id = ${userId}
    LIMIT 1
  `;

  if (storeResult.rows.length === 0) {
    return null;
  }

  return storeResult.rows[0];
}
