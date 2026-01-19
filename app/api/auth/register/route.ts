import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  try {
    const { email, password, storeName, fromWix, wixSiteId: providedSiteId } = await request.json();

    // Try to get store ID from various sources
    let wixSiteId = providedSiteId;

    // Fallback: try to get from cookies if not provided
    if (!wixSiteId && fromWix) {
      const cookieStore = await cookies();
      const siteIdCookie = cookieStore.get("udito_site_id")?.value;
      const instanceIdCookie = cookieStore.get("udito_instance_id")?.value;

      if (siteIdCookie) {
        wixSiteId = siteIdCookie;
        console.log("Using site_id from cookie:", wixSiteId);
      } else if (instanceIdCookie) {
        // Try to get site_id from wix_tokens using instance_id
        const tokenResult = await sql`
          SELECT site_id FROM wix_tokens WHERE instance_id = ${instanceIdCookie} AND site_id IS NOT NULL LIMIT 1
        `;
        if (tokenResult.rows[0]?.site_id) {
          wixSiteId = tokenResult.rows[0].site_id;
          console.log("Resolved site_id from instance_id:", wixSiteId);
        }
      }

      // Last resort: get the most recent wix_tokens entry with a site_id
      if (!wixSiteId) {
        const recentToken = await sql`
          SELECT site_id, instance_id FROM wix_tokens
          WHERE site_id IS NOT NULL
          ORDER BY created_at DESC
          LIMIT 1
        `;
        if (recentToken.rows[0]?.site_id) {
          wixSiteId = recentToken.rows[0].site_id;
          console.log("Using most recent site_id from wix_tokens:", wixSiteId);
        }
      }
    }

    console.log("Register API - fromWix:", fromWix, "wixSiteId:", wixSiteId);

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
        // Get instance_id and other info from wix_tokens
        const wixTokens = await sql`
          SELECT instance_id FROM wix_tokens WHERE site_id = ${wixSiteId} LIMIT 1
        `;
        const instanceId = wixTokens.rows[0]?.instance_id || null;

        // Get store_domain and store_name from tenant company table (created by OAuth callback)
        const normalizedSiteId = wixSiteId.replace(/-/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
        const schemaName = `site_${normalizedSiteId}`;

        let storeDomain: string | null = null;
        let storeNameFromDb: string | null = null;

        // Try to get store info from tenant company table
        try {
          const companyResult = await sql.query(`
            SELECT store_domain, store_name FROM "${schemaName}".company WHERE site_id = $1 LIMIT 1
          `, [wixSiteId]);

          if (companyResult.rows[0]) {
            storeDomain = companyResult.rows[0].store_domain;
            storeNameFromDb = companyResult.rows[0].store_name;
            console.log("Got store info from tenant company:", { storeDomain, storeNameFromDb });
          }
        } catch (schemaError) {
          console.log("Could not read tenant company (schema may not exist yet)");
        }

        // Fallback: try public.companies table
        if (!storeDomain) {
          const publicCompany = await sql`
            SELECT store_domain, store_name, schema_name FROM companies WHERE site_id = ${wixSiteId} LIMIT 1
          `;
          if (publicCompany.rows[0]) {
            storeDomain = publicCompany.rows[0].store_domain;
            storeNameFromDb = storeNameFromDb || publicCompany.rows[0].store_name;
          }
        }

        // Use the best available store name
        const bestStoreName = storeNameFromDb || storeName?.trim() || (storeDomain ? storeDomain : "Wix Store");

        // Check if store_connection already exists for this site_id
        const existingConnection = await sql`
          SELECT id FROM store_connections WHERE site_id = ${wixSiteId} LIMIT 1
        `;

        if (existingConnection.rows.length > 0) {
          // Update existing connection to link to new user AND add schema_name/store_domain
          await sql`
            UPDATE store_connections
            SET business_id = ${businessId},
                user_id = ${userId},
                role = 'owner',
                schema_name = COALESCE(schema_name, ${schemaName}),
                store_domain = COALESCE(store_domain, ${storeDomain}),
                store_name = COALESCE(NULLIF(store_name, 'Wix Store'), ${bestStoreName}),
                updated_at = NOW()
            WHERE site_id = ${wixSiteId}
          `;
          console.log("✅ Updated existing store_connection for site:", wixSiteId, { schemaName, storeDomain, bestStoreName });
        } else {
          // Create new store connection with schema_name and store_domain
          await sql`
            INSERT INTO store_connections (business_id, user_id, site_id, instance_id, role, store_name, store_domain, schema_name, provider)
            VALUES (${businessId}, ${userId}, ${wixSiteId}, ${instanceId}, 'owner', ${bestStoreName}, ${storeDomain}, ${schemaName}, 'wix')
          `;
          console.log("✅ Created new store_connection for site:", wixSiteId, { schemaName, storeDomain, bestStoreName });
        }

        console.log("✅ Linked Wix store to new user:", { userId, wixSiteId, schemaName, storeDomain });
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
