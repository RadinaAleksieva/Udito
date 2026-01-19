import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { auth, getActiveStore } from "@/lib/auth";
import crypto from "crypto";

export const dynamic = "force-dynamic";

// Generate a readable access code (6 characters, alphanumeric)
function generateAccessCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed I, O, 0, 1 to avoid confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const storeParam = searchParams.get("store");

  const store = await getActiveStore(storeParam);

  if (!store?.siteId && !store?.instanceId) {
    return NextResponse.json({ error: "No active store" }, { status: 400 });
  }

  const siteId = store.siteId;
  const instanceId = store.instanceId;

  try {
    // Check if user is owner/admin of this store
    const roleCheck = await sql`
      SELECT role FROM store_connections
      WHERE user_id = ${session.user.id}
        AND (
          (${siteId}::text IS NOT NULL AND site_id = ${siteId})
          OR (${instanceId}::text IS NOT NULL AND instance_id = ${instanceId})
        )
      LIMIT 1
    `;

    if (roleCheck.rows.length === 0 || !["owner", "admin"].includes(roleCheck.rows[0].role || "")) {
      return NextResponse.json(
        { error: "Нямате права да генерирате код за достъп" },
        { status: 403 }
      );
    }

    // Generate unique access code
    let accessCode = generateAccessCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await sql`
        SELECT id FROM store_connections WHERE access_code = ${accessCode}
      `;
      if (existing.rows.length === 0) break;
      accessCode = generateAccessCode();
      attempts++;
    }

    // Set expiration to 30 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Get owner's connection for business_id
    const ownerConn = await sql`
      SELECT business_id, schema_name FROM store_connections
      WHERE user_id = ${session.user.id}
        AND (
          (${siteId}::text IS NOT NULL AND site_id = ${siteId})
          OR (${instanceId}::text IS NOT NULL AND instance_id = ${instanceId})
        )
      LIMIT 1
    `;

    if (ownerConn.rows.length === 0) {
      return NextResponse.json({ error: "Store connection not found" }, { status: 400 });
    }

    const businessId = ownerConn.rows[0].business_id;
    const schemaName = ownerConn.rows[0].schema_name;

    // Check if there's already an unclaimed invitation for this store
    const existingInvite = await sql`
      SELECT id FROM store_connections
      WHERE user_id IS NULL
        AND access_code IS NOT NULL
        AND (
          (${siteId}::text IS NOT NULL AND site_id = ${siteId})
          OR (${instanceId}::text IS NOT NULL AND instance_id = ${instanceId})
        )
      LIMIT 1
    `;

    if (existingInvite.rows.length > 0) {
      // Update existing unclaimed invitation
      await sql`
        UPDATE store_connections
        SET
          access_code = ${accessCode},
          access_code_expires_at = ${expiresAt.toISOString()},
          invited_by = ${session.user.id},
          invited_at = NOW()
        WHERE id = ${existingInvite.rows[0].id}
      `;
    } else {
      // Create new invitation row (without user_id - will be claimed by accountant)
      await sql`
        INSERT INTO store_connections (
          business_id,
          site_id,
          instance_id,
          role,
          access_code,
          access_code_expires_at,
          invited_by,
          invited_at,
          provider,
          schema_name
        ) VALUES (
          ${businessId},
          ${siteId},
          ${instanceId},
          'accountant',
          ${accessCode},
          ${expiresAt.toISOString()},
          ${session.user.id},
          NOW(),
          'wix',
          ${schemaName}
        )
      `;
    }

    return NextResponse.json({
      ok: true,
      accessCode,
      expiresAt: expiresAt.toISOString(),
      message: "Кодът за достъп е генериран успешно",
    });
  } catch (error) {
    console.error("Error generating access code:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
