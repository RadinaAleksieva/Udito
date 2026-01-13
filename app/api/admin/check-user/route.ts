import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get("email");

  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  // Find user
  const userResult = await sql`
    SELECT id, email, name, created_at FROM users WHERE email = ${email}
  `;
  const user = userResult.rows[0] || null;

  // Find store connections for user
  const storeConnections = user ? await sql`
    SELECT * FROM store_connections WHERE user_id = ${user.id}
  ` : { rows: [] };

  // Find all wix tokens (to see what stores exist)
  const wixTokens = await sql`
    SELECT instance_id, site_id, created_at FROM wix_tokens ORDER BY created_at DESC LIMIT 10
  `;

  // Find companies
  const companies = await sql`
    SELECT site_id, instance_id, store_name, store_domain FROM companies LIMIT 10
  `;

  return NextResponse.json({
    user,
    storeConnections: storeConnections.rows,
    recentWixTokens: wixTokens.rows,
    companies: companies.rows,
  });
}
