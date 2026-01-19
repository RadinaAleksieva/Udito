import { NextResponse } from 'next/server';
import { sql } from '@/lib/sql';
import { initDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const autoFix = url.searchParams.get('fix') === 'true';

  try {
    // Test database connection
    await sql`SELECT 1 as test`;

    // Run migrations to ensure all columns exist
    await initDb();

    // Get basic stats from shared tables
    const businessCount = await sql`SELECT COUNT(*) as count FROM businesses`;
    const storeCount = await sql`SELECT COUNT(*) as count FROM store_connections`;

    // Check for issues
    const issues: string[] = [];
    const fixes: string[] = [];

    // Check for store_connections with missing schema_name
    const missingSchemas = await sql`
      SELECT sc.id, sc.site_id
      FROM store_connections sc
      WHERE sc.schema_name IS NULL AND sc.site_id IS NOT NULL
    `;

    if (missingSchemas.rows.length > 0) {
      issues.push(`${missingSchemas.rows.length} store_connections with missing schema_name`);

      if (autoFix) {
        // Auto-fix: try to find and set schema_name
        for (const row of missingSchemas.rows) {
          const normalizedSiteId = row.site_id.replace(/-/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
          const expectedSchema = `site_${normalizedSiteId}`;

          // Check if schema exists
          const schemaExists = await sql`
            SELECT schema_name FROM information_schema.schemata WHERE schema_name = ${expectedSchema}
          `;

          if (schemaExists.rows.length > 0) {
            await sql`
              UPDATE store_connections SET schema_name = ${expectedSchema} WHERE id = ${row.id}
            `;
            fixes.push(`Fixed schema_name for site ${row.site_id} -> ${expectedSchema}`);
          }
        }
      }
    }

    // Check for store_connections with "Wix Store" name that could be improved
    const genericNames = await sql`
      SELECT COUNT(*) as count FROM store_connections WHERE store_name = 'Wix Store'
    `;
    if (parseInt(genericNames.rows[0]?.count || '0') > 0) {
      issues.push(`${genericNames.rows[0].count} stores with generic "Wix Store" name`);
    }

    return NextResponse.json({
      status: issues.length === 0 ? 'healthy' : 'degraded',
      database: 'connected',
      stats: {
        businesses: parseInt(businessCount.rows[0]?.count ?? '0'),
        stores: parseInt(storeCount.rows[0]?.count ?? '0'),
      },
      issues: issues.length > 0 ? issues : undefined,
      fixes: fixes.length > 0 ? fixes : undefined,
      hint: issues.length > 0 && !autoFix ? 'Add ?fix=true to auto-repair issues' : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const err = error as Error;
    return NextResponse.json({
      status: 'unhealthy',
      database: 'error',
      error: err.message,
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}
