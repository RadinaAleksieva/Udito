import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { companyName, eik, napStoreNumber } = await request.json();

    // Validate input
    if (!companyName || !companyName.trim()) {
      return NextResponse.json(
        { error: "Името на фирмата е задължително" },
        { status: 400 }
      );
    }

    if (!eik || eik.length !== 9) {
      return NextResponse.json(
        { error: "ЕИК трябва да е точно 9 цифри" },
        { status: 400 }
      );
    }

    if (!napStoreNumber || !napStoreNumber.trim()) {
      return NextResponse.json(
        { error: "Номерът на обект в НАП е задължителен" },
        { status: 400 }
      );
    }

    // Get or create business for user
    let businessResult = await sql`
      SELECT bu.business_id
      FROM business_users bu
      WHERE bu.user_id = ${session.user.id}
      LIMIT 1
    `;

    let businessId: string;

    if (businessResult.rows.length === 0) {
      // Create new business with 10-day trial
      businessId = crypto.randomUUID();

      await sql`
        INSERT INTO businesses (id, name, trial_ends_at, subscription_status, created_at, updated_at)
        VALUES (${businessId}, ${companyName.trim()}, NOW() + INTERVAL '10 days', 'trial', NOW(), NOW())
      `;

      await sql`
        INSERT INTO business_users (business_id, user_id, role, created_at)
        VALUES (${businessId}, ${session.user.id}, 'owner', NOW())
      `;
    } else {
      businessId = businessResult.rows[0].business_id;

      // Update business name
      await sql`
        UPDATE businesses
        SET name = ${companyName.trim()}, updated_at = NOW()
        WHERE id = ${businessId}
      `;
    }

    // Upsert business profile
    await sql`
      INSERT INTO business_profiles (
        business_id,
        store_name,
        legal_name,
        bulstat,
        store_id,
        updated_at
      ) VALUES (
        ${businessId},
        ${companyName.trim()},
        ${companyName.trim()},
        ${eik.trim()},
        ${napStoreNumber.trim()},
        NOW()
      )
      ON CONFLICT (business_id) DO UPDATE SET
        store_name = ${companyName.trim()},
        legal_name = ${companyName.trim()},
        bulstat = ${eik.trim()},
        store_id = ${napStoreNumber.trim()},
        updated_at = NOW()
    `;

    return NextResponse.json({
      ok: true,
      message: "Данните са запазени успешно",
    });
  } catch (error) {
    console.error("Error completing onboarding:", error);
    return NextResponse.json(
      { error: "Възникна грешка при запис" },
      { status: 500 }
    );
  }
}
