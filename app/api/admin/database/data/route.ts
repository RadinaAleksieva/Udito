import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { sql } from "@/lib/supabase-sql";

// Check if user is admin
function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
  return adminEmails.includes(email.toLowerCase());
}

// Validate identifier (schema/table name) to prevent SQL injection
function isValidIdentifier(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

export const dynamic = "force-dynamic";

// GET - Fetch data from table with pagination
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const schema = searchParams.get("schema");
    const table = searchParams.get("table");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

    if (!schema || !table) {
      return NextResponse.json({ error: "Missing schema or table parameter" }, { status: 400 });
    }

    if (!isValidIdentifier(schema) || !isValidIdentifier(table)) {
      return NextResponse.json({ error: "Invalid schema or table name" }, { status: 400 });
    }

    const offset = (page - 1) * limit;

    // Get column information
    const columnsResult = await sql.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `, [schema, table]);

    const columns = columnsResult.rows.map(row => ({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
      default: row.column_default
    }));

    // Get primary key column(s)
    const pkResult = await sql.query(`
      SELECT a.attname as column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE i.indisprimary
        AND n.nspname = $1
        AND c.relname = $2
    `, [schema, table]);

    const primaryKeys = pkResult.rows.map(row => row.column_name);

    // Get total count
    const countResult = await sql.query(`
      SELECT COUNT(*)::int as total FROM "${schema}"."${table}"
    `);
    const total = countResult.rows[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    // Get data with pagination
    const dataResult = await sql.query(`
      SELECT * FROM "${schema}"."${table}"
      ORDER BY 1
      LIMIT $1 OFFSET $2
    `, [limit, offset]);

    return NextResponse.json({
      schema,
      table,
      columns,
      primaryKeys,
      rows: dataResult.rows,
      total,
      page,
      limit,
      totalPages
    });
  } catch (error) {
    console.error("Error fetching data:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// PUT - Update a row
export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { schema, table, id, data } = body;

    if (!schema || !table || !id || !data) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!isValidIdentifier(schema) || !isValidIdentifier(table)) {
      return NextResponse.json({ error: "Invalid schema or table name" }, { status: 400 });
    }

    // Get primary key column
    const pkResult = await sql.query(`
      SELECT a.attname as column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE i.indisprimary
        AND n.nspname = $1
        AND c.relname = $2
      LIMIT 1
    `, [schema, table]);

    const pkColumn = pkResult.rows[0]?.column_name || 'id';

    // Build SET clause for parameterized update
    const entries = Object.entries(data).filter(([key]) =>
      isValidIdentifier(key) && key !== pkColumn
    );

    if (entries.length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const setClause = entries.map(([key], idx) => `"${key}" = $${idx + 1}`).join(", ");
    const values = entries.map(([, value]) => value);

    // Add ID as the last parameter
    values.push(id);

    const query = `
      UPDATE "${schema}"."${table}"
      SET ${setClause}
      WHERE "${pkColumn}" = $${values.length}
      RETURNING *
    `;

    const result = await sql.query(query, values);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 });
    }

    // Log the change for audit
    console.log(`[AUDIT] Admin ${session?.user?.email} updated row in ${schema}.${table}:`, {
      id,
      changes: data
    });

    return NextResponse.json({
      success: true,
      row: result.rows[0]
    });
  } catch (error) {
    console.error("Error updating row:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE - Delete a row
export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { schema, table, id } = body;

    if (!schema || !table || !id) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!isValidIdentifier(schema) || !isValidIdentifier(table)) {
      return NextResponse.json({ error: "Invalid schema or table name" }, { status: 400 });
    }

    // Get primary key column
    const pkResult = await sql.query(`
      SELECT a.attname as column_name
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      JOIN pg_class c ON c.oid = i.indrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE i.indisprimary
        AND n.nspname = $1
        AND c.relname = $2
      LIMIT 1
    `, [schema, table]);

    const pkColumn = pkResult.rows[0]?.column_name || 'id';

    const result = await sql.query(`
      DELETE FROM "${schema}"."${table}"
      WHERE "${pkColumn}" = $1
      RETURNING *
    `, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Row not found" }, { status: 404 });
    }

    // Log the deletion for audit
    console.log(`[AUDIT] Admin ${session?.user?.email} deleted row from ${schema}.${table}:`, {
      id,
      deletedRow: result.rows[0]
    });

    return NextResponse.json({
      success: true,
      deleted: result.rows[0]
    });
  } catch (error) {
    console.error("Error deleting row:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
