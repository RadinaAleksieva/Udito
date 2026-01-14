import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { sql } from "@vercel/postgres";
import { authOptions } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не сте влезли в системата" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { planId } = body;

    // Validate plan
    if (!planId) {
      return NextResponse.json({ error: "Моля изберете план" }, { status: 400 });
    }

    // Check plan exists
    const planResult = await sql`
      SELECT id, name FROM subscription_plans WHERE id = ${planId} AND is_active = true
    `;

    if (planResult.rows.length === 0) {
      return NextResponse.json({ error: "Невалиден план" }, { status: 400 });
    }

    // Get user's business
    const businessResult = await sql`
      SELECT b.id, b.onboarding_step FROM businesses b
      JOIN business_users bu ON bu.business_id = b.id
      WHERE bu.user_id = ${userId}
      LIMIT 1
    `;

    if (businessResult.rows.length === 0) {
      return NextResponse.json({ error: "Нямате свързан бизнес" }, { status: 400 });
    }

    const businessId = businessResult.rows[0].id;
    const currentStep = businessResult.rows[0].onboarding_step || 0;

    // Check step 2 is completed
    if (currentStep < 2) {
      return NextResponse.json({ error: "Моля първо попълнете настройките" }, { status: 400 });
    }

    // Complete onboarding with selected plan
    // Trial starts NOW (10 days from plan selection)
    await sql`
      UPDATE businesses
      SET selected_plan_id = ${planId},
          trial_ends_at = NOW() + INTERVAL '10 days',
          subscription_status = 'trial',
          onboarding_step = 3,
          onboarding_completed = true,
          updated_at = NOW()
      WHERE id = ${businessId}
    `;

    // Initialize monthly usage tracking
    const yearMonth = new Date().toISOString().slice(0, 7); // '2026-01'
    await sql`
      INSERT INTO monthly_usage (business_id, year_month, orders_count, receipts_count)
      VALUES (${businessId}, ${yearMonth}, 0, 0)
      ON CONFLICT (business_id, year_month) DO NOTHING
    `;

    return NextResponse.json({
      ok: true,
      message: "Планът е избран. Добре дошли в UDITO!",
      planId,
      trialEndsAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (error) {
    console.error("Onboarding plan error:", error);
    return NextResponse.json({ error: "Възникна грешка при избор на план" }, { status: 500 });
  }
}
