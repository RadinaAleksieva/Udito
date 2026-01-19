import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Check if user exists
    const result = await sql`
      SELECT id FROM users WHERE email = ${email}
    `;

    return NextResponse.json({
      exists: result.rows.length > 0,
    });
  } catch (error) {
    console.error("Check email error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
