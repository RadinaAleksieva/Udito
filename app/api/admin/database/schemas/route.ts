import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/sql";

// Check if user is admin
function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
  return adminEmails.includes(email.toLowerCase());
}

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get all schemas with their table counts
    const result = await sql`
      SELECT
        schema_name as name,
        (
          SELECT COUNT(*)::int
          FROM information_schema.tables t
          WHERE t.table_schema = s.schema_name
            AND t.table_type = 'BASE TABLE'
        ) as table_count
      FROM information_schema.schemata s
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY
        CASE WHEN schema_name = 'public' THEN 0 ELSE 1 END,
        schema_name
    `;

    return NextResponse.json({
      schemas: result.rows.map(row => ({
        name: row.name,
        tableCount: row.table_count
      }))
    });
  } catch (error) {
    console.error("Error fetching schemas:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
