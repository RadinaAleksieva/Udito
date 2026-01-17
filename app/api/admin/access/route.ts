import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { sql } from "@/lib/supabase-sql";
import { authOptions } from "@/lib/auth";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
  return adminEmails.includes(email.toLowerCase());
}

// Generate random access code
function generateAccessCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// GET - List all access codes
export async function GET() {
  try {
    await initDb();

    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const result = await sql`
      SELECT
        ac.id,
        ac.code,
        ac.site_id,
        ac.role,
        ac.expires_at,
        ac.created_at,
        ac.used_at,
        ac.used_by_user_id,
        u.email as used_by_email,
        c.store_name,
        b.name as business_name
      FROM access_codes ac
      LEFT JOIN users u ON u.id = ac.used_by_user_id
      LEFT JOIN companies c ON c.site_id = ac.site_id
      LEFT JOIN businesses b ON b.id = c.business_id
      ORDER BY ac.created_at DESC
      LIMIT 100
    `;

    return NextResponse.json({ accessCodes: result.rows });
  } catch (error) {
    console.error("Admin access codes error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST - Create new access code
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { siteId, role = "accountant", expiresInDays = 30 } = body;

    if (!siteId) {
      return NextResponse.json({ error: "Missing siteId" }, { status: 400 });
    }

    const code = generateAccessCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    await sql`
      INSERT INTO access_codes (code, site_id, role, expires_at, created_at)
      VALUES (${code}, ${siteId}, ${role}, ${expiresAt.toISOString()}, NOW())
    `;

    return NextResponse.json({ ok: true, code });
  } catch (error) {
    console.error("Admin create access code error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE - Delete an access code
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const codeId = searchParams.get("id");

    if (!codeId) {
      return NextResponse.json({ error: "Missing code ID" }, { status: 400 });
    }

    await sql`DELETE FROM access_codes WHERE id = ${codeId}`;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin delete access code error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
