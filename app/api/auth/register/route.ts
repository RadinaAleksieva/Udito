import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import bcrypt from "bcryptjs";

export async function POST(request: Request) {
  try {
    const { email, password, storeName, fromWix, wixSiteId } = await request.json();

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

    // Store name is optional if coming from Wix
    const finalStoreName = storeName?.trim() || (fromWix ? "Wix Store" : null);
    if (!finalStoreName) {
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
      VALUES (${userId}, ${email}, ${finalStoreName}, ${passwordHash}, ${salt}, NULL)
    `;

    // Create business with 14-day trial and onboarding pending
    const businessId = crypto.randomUUID();
    await sql`
      INSERT INTO businesses (id, name, onboarding_completed, onboarding_step, trial_ends_at, subscription_status, created_at, updated_at)
      VALUES (${businessId}, ${finalStoreName}, false, 0, NOW() + INTERVAL '10 days', 'trial', NOW(), NOW())
    `;

    // Link user to business as owner
    await sql`
      INSERT INTO business_users (business_id, user_id, role, created_at)
      VALUES (${businessId}, ${userId}, 'owner', NOW())
    `;

    // If coming from Wix, link the store to the user
    if (fromWix && wixSiteId) {
      try {
        // Get instance_id from wix_tokens if available
        const wixTokens = await sql`
          SELECT instance_id FROM wix_tokens WHERE site_id = ${wixSiteId} LIMIT 1
        `;
        const instanceId = wixTokens.rows[0]?.instance_id || null;

        // Check if store_connection already exists for this site_id
        const existingConnection = await sql`
          SELECT id FROM store_connections WHERE site_id = ${wixSiteId} LIMIT 1
        `;

        if (existingConnection.rows.length > 0) {
          // Update existing connection to link to new user
          await sql`
            UPDATE store_connections
            SET business_id = ${businessId}, user_id = ${userId}, role = 'owner', updated_at = NOW()
            WHERE site_id = ${wixSiteId}
          `;
        } else {
          // Create new store connection
          await sql`
            INSERT INTO store_connections (id, business_id, user_id, site_id, instance_id, role, store_name, provider, created_at, updated_at)
            VALUES (gen_random_uuid(), ${businessId}, ${userId}, ${wixSiteId}, ${instanceId}, 'owner', ${finalStoreName}, 'wix', NOW(), NOW())
          `;
        }

        console.log("✅ Linked Wix store to new user:", { userId, wixSiteId });
      } catch (linkError) {
        // Don't fail registration if store linking fails
        console.error("Failed to link Wix store:", linkError);
      }
    }

    return NextResponse.json({
      ok: true,
      message: "Регистрацията е успешна",
      userId,
      businessId,
      storeLinked: fromWix && wixSiteId ? true : false,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Възникна грешка при регистрация" },
      { status: 500 }
    );
  }
}
