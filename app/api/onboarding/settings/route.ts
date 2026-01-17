import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { sql } from "@/lib/supabase-sql";
import { authOptions } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Не сте влезли в системата" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { codReceiptsEnabled, initialReceiptNumber } = body;

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

    // Check step 1 is completed
    if (currentStep < 1) {
      return NextResponse.json({ error: "Моля първо попълнете данните на фирмата" }, { status: 400 });
    }

    // Get user's store connection
    const storeResult = await sql`
      SELECT site_id FROM store_connections
      WHERE user_id = ${userId}
      LIMIT 1
    `;

    if (storeResult.rows.length === 0) {
      return NextResponse.json({ error: "Нямате свързан магазин" }, { status: 400 });
    }

    const siteId = storeResult.rows[0].site_id;

    // Update company settings
    await sql`
      UPDATE companies
      SET cod_receipts_enabled = ${codReceiptsEnabled ?? true},
          receipt_number_start = ${initialReceiptNumber ? parseInt(initialReceiptNumber, 10) : null},
          updated_at = NOW()
      WHERE site_id = ${siteId}
    `;

    // Update onboarding step
    await sql`
      UPDATE businesses
      SET onboarding_step = GREATEST(onboarding_step, 2), updated_at = NOW()
      WHERE id = ${businessId}
    `;

    return NextResponse.json({ ok: true, message: "Настройките са запазени" });
  } catch (error) {
    console.error("Onboarding settings error:", error);
    return NextResponse.json({ error: "Възникна грешка при запис" }, { status: 500 });
  }
}
