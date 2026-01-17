import { NextResponse } from "next/server";
import { sql } from "@/lib/supabase-sql";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    const { email, password, storeName } = await request.json();

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

    if (!storeName || !storeName.trim()) {
      return NextResponse.json(
        { error: "Името на магазина е задължително" },
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
      VALUES (${userId}, ${email}, ${storeName.trim()}, ${passwordHash}, ${salt}, NULL)
    `;

    // Create business with 14-day trial and onboarding pending
    const businessId = crypto.randomUUID();
    await sql`
      INSERT INTO businesses (id, name, onboarding_completed, onboarding_step, trial_ends_at, subscription_status, created_at, updated_at)
      VALUES (${businessId}, ${storeName.trim()}, false, 0, NOW() + INTERVAL '10 days', 'trial', NOW(), NOW())
    `;

    // Link user to business as owner
    await sql`
      INSERT INTO business_users (business_id, user_id, role, created_at)
      VALUES (${businessId}, ${userId}, 'owner', NOW())
    `;

    // Note: Company fiscal data (ЕИК, NAP store number) will be entered in Settings
    // after the user connects their Wix store. This creates a record in the 'companies'
    // table which is used for receipt generation.

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
