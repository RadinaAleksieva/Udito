import { NextResponse } from "next/server";
import { sql } from "@/lib/supabase-sql";
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

    // Create a placeholder entry for the accountant (without user_id yet)
    // The accountant will claim this when they use the code
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
        provider
      )
      SELECT
        sc.business_id,
        ${siteId},
        ${instanceId},
        'accountant',
        ${accessCode},
        ${expiresAt.toISOString()},
        ${session.user.id},
        NOW(),
        'wix'
      FROM store_connections sc
      WHERE sc.user_id = ${session.user.id}
        AND (
          (${siteId}::text IS NOT NULL AND sc.site_id = ${siteId})
          OR (${instanceId}::text IS NOT NULL AND sc.instance_id = ${instanceId})
        )
      LIMIT 1
    `;

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
