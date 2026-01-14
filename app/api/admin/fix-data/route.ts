import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    if (action === "fix-trial") {
      // Fix businesses with NULL trial_ends_at - set to 30 days from now
      const result = await sql`
        UPDATE businesses
        SET trial_ends_at = NOW() + INTERVAL '30 days',
            updated_at = NOW()
        WHERE trial_ends_at IS NULL
        RETURNING id, name, trial_ends_at
      `;
      return NextResponse.json({
        ok: true,
        message: "Fixed trial_ends_at for businesses",
        updated: result.rows,
      });
    }

    if (action === "link-store") {
      const email = searchParams.get("email");
      const siteId = searchParams.get("siteId");

      if (!email || !siteId) {
        return NextResponse.json({ ok: false, error: "Need email and siteId" }, { status: 400 });
      }

      // Find user by email
      const userResult = await sql`SELECT id FROM users WHERE email = ${email}`;
      if (userResult.rows.length === 0) {
        return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
      }

      const userId = userResult.rows[0].id;

      // Get user's business
      const businessResult = await sql`
        SELECT business_id FROM business_users WHERE user_id = ${userId} LIMIT 1
      `;

      let businessId: string;

      if (businessResult.rows.length === 0) {
        // Create a business for this user
        businessId = crypto.randomUUID();
        await sql`
          INSERT INTO businesses (id, name, trial_ends_at, subscription_status, created_at, updated_at)
          VALUES (${businessId}, 'Моята фирма', NOW() + INTERVAL '30 days', 'trial', NOW(), NOW())
        `;
        await sql`
          INSERT INTO business_users (business_id, user_id, role, created_at)
          VALUES (${businessId}, ${userId}, 'owner', NOW())
        `;
      } else {
        businessId = businessResult.rows[0].business_id;
      }

      // Check if connection already exists
      const existingResult = await sql`
        SELECT id FROM store_connections
        WHERE site_id = ${siteId} AND user_id = ${userId}
      `;

      if (existingResult.rows.length > 0) {
        return NextResponse.json({ ok: true, message: "Connection already exists" });
      }

      // Get instance_id from existing connection
      const instanceResult = await sql`
        SELECT instance_id, store_name FROM store_connections WHERE site_id = ${siteId} LIMIT 1
      `;
      const instanceId = instanceResult.rows[0]?.instance_id;
      const storeName = instanceResult.rows[0]?.store_name || "Unknown Store";

      // Create store connection
      await sql`
        INSERT INTO store_connections (business_id, site_id, instance_id, user_id, store_name, provider, connected_at)
        VALUES (${businessId}, ${siteId}, ${instanceId}, ${userId}, ${storeName}, 'wix', NOW())
      `;

      return NextResponse.json({
        ok: true,
        message: "Store linked to user",
        userId,
        siteId,
        instanceId,
      });
    }

    // Default: show current state
    const businesses = await sql`
      SELECT id, name, subscription_status, trial_ends_at FROM businesses
    `;
    const connections = await sql`
      SELECT sc.*, u.email FROM store_connections sc
      LEFT JOIN users u ON u.id = sc.user_id
    `;

    return NextResponse.json({
      ok: true,
      businesses: businesses.rows,
      connections: connections.rows,
      actions: ["?action=fix-trial", "?action=link-store&email=xxx&siteId=yyy"],
    });
  } catch (error) {
    console.error("Fix data error:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
