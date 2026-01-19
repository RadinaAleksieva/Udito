import { NextRequest, NextResponse } from "next/server";
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

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const schema = searchParams.get("schema");

    if (!schema) {
      return NextResponse.json({ error: "Missing schema parameter" }, { status: 400 });
    }

    // Validate schema name (prevent SQL injection)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
      return NextResponse.json({ error: "Invalid schema name" }, { status: 400 });
    }

    // Get all tables in the schema with row counts
    const result = await sql.query(`
      SELECT
        t.table_name as name,
        COALESCE(s.n_live_tup, 0)::int as row_count
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s
        ON s.schemaname = t.table_schema
        AND s.relname = t.table_name
      WHERE t.table_schema = $1
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `, [schema]);

    return NextResponse.json({
      schema,
      tables: result.rows.map(row => ({
        name: row.name,
        rowCount: row.row_count
      }))
    });
  } catch (error) {
    console.error("Error fetching tables:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
