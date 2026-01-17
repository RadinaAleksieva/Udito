import { NextResponse } from "next/server";
import { sql } from "@/lib/supabase-sql";
import { auth } from "@/lib/auth";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Моля влезте в профила си първо" },
        { status: 401 }
      );
    }

    const { code } = await request.json();

    if (!code || typeof code !== "string" || code.length !== 6) {
      return NextResponse.json(
        { error: "Невалиден код за достъп" },
        { status: 400 }
      );
    }

    await initDb();

    // Find the access code
    const codeResult = await sql`
      SELECT code, site_id, role, expires_at
      FROM access_codes
      WHERE code = ${code.toUpperCase()}
      LIMIT 1
    `;

    if (codeResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Невалиден код за достъп" },
        { status: 400 }
      );
    }

    const accessCode = codeResult.rows[0];

    // Check if expired
    if (accessCode.expires_at && new Date(accessCode.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Кодът за достъп е изтекъл" },
        { status: 400 }
      );
    }

    // Check if user already has access to this store
    const existingAccess = await sql`
      SELECT id FROM store_connections
      WHERE site_id = ${accessCode.site_id} AND user_id = ${session.user.id}
      LIMIT 1
    `;

    if (existingAccess.rows.length > 0) {
      return NextResponse.json(
        { error: "Вече имате достъп до този магазин" },
        { status: 400 }
      );
    }

    // Create store connection for the user
    await sql`
      INSERT INTO store_connections (site_id, user_id, role, connected_at)
      VALUES (${accessCode.site_id}, ${session.user.id}, ${accessCode.role || 'accountant'}, NOW())
    `;

    // Set cookies
    const response = NextResponse.json({
      ok: true,
      siteId: accessCode.site_id,
      role: accessCode.role || 'accountant',
    });

    response.cookies.set("udito_site_id", accessCode.site_id, {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return response;
  } catch (error) {
    console.error("Join store error:", error);
    return NextResponse.json(
      { error: "Възникна грешка" },
      { status: 500 }
    );
  }
}
