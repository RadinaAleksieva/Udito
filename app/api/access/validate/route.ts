import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

// Validate access code WITHOUT requiring authentication
// This allows accountants to use access codes without registering
export async function POST(request: Request) {
  try {
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
      SELECT ac.code, ac.site_id, ac.role, ac.expires_at,
             sc.store_name, sc.store_domain
      FROM access_codes ac
      LEFT JOIN store_connections sc ON sc.site_id = ac.site_id
      WHERE ac.code = ${code.toUpperCase()}
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

    // Set cookies for access code authentication
    const response = NextResponse.json({
      ok: true,
      siteId: accessCode.site_id,
      role: accessCode.role || "accountant",
      storeName: accessCode.store_name || accessCode.store_domain || "Магазин",
    });

    // Set access code cookie (valid for 30 days like the code itself)
    response.cookies.set("udito_access_code", code.toUpperCase(), {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    response.cookies.set("udito_site_id", accessCode.site_id, {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
    });

    // Mark this as accountant access (read-only)
    response.cookies.set("udito_access_role", accessCode.role || "accountant", {
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 30,
    });

    return response;
  } catch (error) {
    console.error("Access code validation error:", error);
    return NextResponse.json(
      { error: "Възникна грешка" },
      { status: 500 }
    );
  }
}
