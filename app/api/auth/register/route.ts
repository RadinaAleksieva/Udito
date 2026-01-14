import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    const { email, password, companyName, eik, napStoreNumber } = await request.json();

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: "Имейл и парола са задължителни" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "Паролата трябва да е поне 8 символа" },
        { status: 400 }
      );
    }

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

    // Check if user already exists
    const existingUser = await sql`
      SELECT id FROM users WHERE email = ${email}
    `;

    if (existingUser.rows.length > 0) {
      return NextResponse.json(
        { error: "Потребител с този имейл вече съществува" },
        { status: 400 }
      );
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const userId = crypto.randomUUID();
    await sql`
      INSERT INTO users (id, email, name, password_hash, password_salt, email_verified)
      VALUES (${userId}, ${email}, ${companyName.trim()}, ${passwordHash}, ${salt}, NULL)
    `;

    // Create business with 10-day trial
    const businessId = crypto.randomUUID();
    await sql`
      INSERT INTO businesses (id, name, trial_ends_at, subscription_status, created_at, updated_at)
      VALUES (${businessId}, ${companyName.trim()}, NOW() + INTERVAL '10 days', 'trial', NOW(), NOW())
    `;

    // Link user to business as owner
    await sql`
      INSERT INTO business_users (business_id, user_id, role, created_at)
      VALUES (${businessId}, ${userId}, 'owner', NOW())
    `;

    // Create business profile with company info
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
      message: "Регистрацията е успешна",
      userId,
      businessId
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Възникна грешка при регистрация" },
      { status: 500 }
    );
  }
}
