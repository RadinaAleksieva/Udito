import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";

function generateAccessCode(): string {
  // Generate a 6-character alphanumeric code
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Exclude confusing chars like 0/O, 1/I
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { siteId, role = "accountant" } = await request.json();

    if (!siteId) {
      return NextResponse.json({ error: "Site ID required" }, { status: 400 });
    }

    // Check if user is owner of this store
    const ownerCheck = await sql`
      SELECT role FROM store_connections
      WHERE site_id = ${siteId} AND user_id = ${session.user.id}
      LIMIT 1
    `;

    if (ownerCheck.rows.length === 0 || ownerCheck.rows[0].role !== "owner") {
      return NextResponse.json({ error: "Only owner can generate access codes" }, { status: 403 });
    }

    // Delete any existing access codes for this store (only one active at a time)
    await sql`
      DELETE FROM access_codes WHERE site_id = ${siteId}
    `;

    // Generate new code
    const code = generateAccessCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // Valid for 30 days

    await sql`
      INSERT INTO access_codes (site_id, code, role, expires_at, created_at)
      VALUES (${siteId}, ${code}, ${role}, ${expiresAt.toISOString()}, NOW())
    `;

    return NextResponse.json({
      accessCode: {
        code,
        role,
        expires_at: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Generate access code error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
