import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { sql } from "@/lib/sql";
import { authOptions } from "@/lib/auth";
import { initDb } from "@/lib/db";

export const dynamic = "force-dynamic";

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim().toLowerCase()) || [];
  return adminEmails.includes(email.toLowerCase());
}

// GET - Diagnose store_connections issues
export async function GET() {
  try {
    await initDb();

    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get all store_connections with their current state
    const connections = await sql`
      SELECT
        sc.id,
        sc.site_id,
        sc.instance_id,
        sc.schema_name,
        sc.store_name,
        sc.store_domain,
        sc.user_id,
        sc.business_id,
        u.email as user_email,
        c.store_name as company_store_name,
        c.store_domain as company_store_domain,
        c.schema_name as company_schema_name
      FROM store_connections sc
      LEFT JOIN users u ON u.id = sc.user_id
      LEFT JOIN companies c ON c.site_id = sc.site_id
      ORDER BY sc.connected_at DESC
    `;

    // Get all schemas in the database
    const schemas = await sql`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('public', 'pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name
    `;

    // Find issues
    const issues: string[] = [];
    for (const conn of connections.rows) {
      if (!conn.schema_name) {
        issues.push(`Connection ${conn.id} (site: ${conn.site_id}) has no schema_name`);
      }
      if (!conn.store_domain && !conn.store_name) {
        issues.push(`Connection ${conn.id} (site: ${conn.site_id}) has no store_name or store_domain`);
      }
      if (conn.store_name === "Wix Store" && !conn.store_domain) {
        issues.push(`Connection ${conn.id} (site: ${conn.site_id}) has default "Wix Store" name`);
      }
    }

    return NextResponse.json({
      connections: connections.rows,
      schemas: schemas.rows.map(s => s.schema_name),
      issues
    });
  } catch (error) {
    console.error("Admin fix-stores GET error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST - Fix store_connections issues
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user?.email)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { action, connectionId, siteId, schemaName, storeDomain, storeName } = body;

    if (action === "fix_schema") {
      // Update schema_name in store_connections
      if (!connectionId || !schemaName) {
        return NextResponse.json({ error: "Missing connectionId or schemaName" }, { status: 400 });
      }

      await sql`
        UPDATE store_connections
        SET schema_name = ${schemaName}, updated_at = NOW()
        WHERE id = ${connectionId}
      `;

      return NextResponse.json({ ok: true, message: `Updated schema to ${schemaName}` });
    }

    if (action === "fix_domain") {
      // Update store_domain in store_connections
      if (!connectionId || !storeDomain) {
        return NextResponse.json({ error: "Missing connectionId or storeDomain" }, { status: 400 });
      }

      await sql`
        UPDATE store_connections
        SET store_domain = ${storeDomain},
            store_name = COALESCE(${storeName}, store_name),
            updated_at = NOW()
        WHERE id = ${connectionId}
      `;

      // Also update companies table if exists
      const conn = await sql`SELECT site_id FROM store_connections WHERE id = ${connectionId}`;
      if (conn.rows[0]?.site_id) {
        await sql`
          UPDATE companies
          SET store_domain = ${storeDomain},
              store_name = COALESCE(${storeName}, store_name)
          WHERE site_id = ${conn.rows[0].site_id}
        `;
      }

      return NextResponse.json({ ok: true, message: `Updated domain to ${storeDomain}` });
    }

    if (action === "auto_fix") {
      // Auto-fix: match site_id to schema by looking at companies table or schema names
      const fixed: string[] = [];

      // Get all connections without schema
      const brokenConns = await sql`
        SELECT sc.id, sc.site_id, c.schema_name as company_schema
        FROM store_connections sc
        LEFT JOIN companies c ON c.site_id = sc.site_id
        WHERE sc.schema_name IS NULL
      `;

      for (const conn of brokenConns.rows) {
        if (conn.company_schema) {
          await sql`
            UPDATE store_connections
            SET schema_name = ${conn.company_schema}
            WHERE id = ${conn.id}
          `;
          fixed.push(`Fixed ${conn.id}: set schema to ${conn.company_schema}`);
        } else {
          // Try to find schema by site_id pattern
          const normalizedId = conn.site_id?.replace(/-/g, "_");
          const possibleSchema = `site_${normalizedId}`;

          const schemaExists = await sql`
            SELECT 1 FROM information_schema.schemata
            WHERE schema_name = ${possibleSchema}
          `;

          if (schemaExists.rows.length > 0) {
            await sql`
              UPDATE store_connections
              SET schema_name = ${possibleSchema}
              WHERE id = ${conn.id}
            `;
            fixed.push(`Fixed ${conn.id}: set schema to ${possibleSchema}`);
          }
        }
      }

      // Fix store domains from companies table
      const connsMissingDomain = await sql`
        SELECT sc.id, sc.site_id, c.store_domain, c.store_name
        FROM store_connections sc
        LEFT JOIN companies c ON c.site_id = sc.site_id
        WHERE (sc.store_domain IS NULL OR sc.store_name = 'Wix Store')
          AND c.store_domain IS NOT NULL
      `;

      for (const conn of connsMissingDomain.rows) {
        await sql`
          UPDATE store_connections
          SET store_domain = ${conn.store_domain},
              store_name = COALESCE(${conn.store_name}, store_name)
          WHERE id = ${conn.id}
        `;
        fixed.push(`Fixed ${conn.id}: set domain to ${conn.store_domain}`);
      }

      return NextResponse.json({ ok: true, fixed });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Admin fix-stores POST error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
