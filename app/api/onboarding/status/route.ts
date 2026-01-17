import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { sql } from "@/lib/supabase-sql";
import { authOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не сте влезли в системата" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get user's business and role
    const businessResult = await sql`
      SELECT b.id, b.name, b.onboarding_completed, b.onboarding_step, b.selected_plan_id,
             b.trial_ends_at, b.subscription_status,
             bu.role as user_role
      FROM businesses b
      JOIN business_users bu ON bu.business_id = b.id
      WHERE bu.user_id = ${userId}
      LIMIT 1
    `;

    // Also check role from store_connections (for users who joined via access code)
    const storeRoleResult = await sql`
      SELECT role FROM store_connections
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    const storeRole = storeRoleResult.rows[0]?.role ?? null;

    if (businessResult.rows.length === 0) {
      return NextResponse.json({
        error: "Нямате свързан бизнес",
        onboardingCompleted: false,
        onboardingStep: 0,
      });
    }

    const business = businessResult.rows[0];
    const userRole = business.user_role || storeRole || "member";

    // For non-owner/admin users: if business is not onboarded, they cannot onboard it
    const canOnboard = userRole === "owner" || userRole === "admin";

    if (!business.onboarding_completed && !canOnboard) {
      return NextResponse.json({
        error: "Собственикът на магазина трябва първо да завърши настройката.",
        onboardingCompleted: false,
        onboardingStep: 0,
        cannotOnboard: true,
        userRole,
      });
    }

    // Get company data (for receipts) if exists
    let company = null;
    const companyResult = await sql`
      SELECT c.store_name as company_name, c.bulstat as eik, c.vat_number,
             c.address_line1 as address, c.city, c.postal_code, c.mol, c.store_id as nap_store_number,
             c.receipts_start_date, c.cod_receipts_enabled, c.receipt_number_start
      FROM companies c
      JOIN store_connections sc ON sc.site_id = c.site_id
      WHERE sc.user_id = ${userId}
      LIMIT 1
    `;

    if (companyResult.rows.length > 0) {
      const c = companyResult.rows[0];
      company = {
        companyName: c.company_name,
        eik: c.eik,
        vatNumber: c.vat_number,
        address: c.address,
        city: c.city,
        postalCode: c.postal_code,
        mol: c.mol,
        napStoreNumber: c.nap_store_number,
      };
    }

    // Get billing company if exists
    let billingCompany = null;
    const billingResult = await sql`
      SELECT company_name, eik, vat_number, address, city, postal_code, mol, use_same_as_store
      FROM billing_companies
      WHERE business_id = ${business.id}
      LIMIT 1
    `;

    if (billingResult.rows.length > 0) {
      const bc = billingResult.rows[0];
      billingCompany = {
        companyName: bc.company_name,
        eik: bc.eik,
        vatNumber: bc.vat_number,
        address: bc.address,
        city: bc.city,
        postalCode: bc.postal_code,
        mol: bc.mol,
        useSameAsStore: bc.use_same_as_store,
      };
    }

    // Get settings from company if exists
    let settings = null;
    if (companyResult.rows.length > 0) {
      const c = companyResult.rows[0];
      settings = {
        receiptsStartDate: c.receipts_start_date ? new Date(c.receipts_start_date).toISOString().split("T")[0] : null,
        codReceiptsEnabled: c.cod_receipts_enabled ?? true,
        initialReceiptNumber: c.receipt_number_start,
      };
    }

    // Get available plans
    const plansResult = await sql`
      SELECT id, name, orders_per_month, price_monthly_eur, price_per_extra_order_eur, is_pay_per_order, features
      FROM subscription_plans
      WHERE is_active = true
      ORDER BY price_monthly_eur ASC
    `;

    const plans = plansResult.rows.map((p) => ({
      id: p.id,
      name: p.name,
      ordersPerMonth: p.orders_per_month,
      priceMonthlyEur: Number(p.price_monthly_eur),
      pricePerExtraOrderEur: Number(p.price_per_extra_order_eur),
      isPayPerOrder: p.is_pay_per_order,
      features: p.features || {},
    }));

    return NextResponse.json({
      businessId: business.id,
      businessName: business.name,
      onboardingCompleted: business.onboarding_completed ?? false,
      onboardingStep: business.onboarding_step ?? 0,
      selectedPlan: business.selected_plan_id,
      trialEndsAt: business.trial_ends_at,
      subscriptionStatus: business.subscription_status,
      userRole,
      canOnboard,
      company,
      billingCompany,
      settings,
      plans,
    });
  } catch (error) {
    console.error("Onboarding status error:", error);
    return NextResponse.json({ error: "Възникна грешка" }, { status: 500 });
  }
}
