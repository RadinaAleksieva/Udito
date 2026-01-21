import { NextResponse } from 'next/server';
import { sql } from '@/lib/sql';
import { initDb } from '@/lib/db';
import { getAccessToken } from '@/lib/wix';

export const dynamic = 'force-dynamic';

const WIX_API_BASE = "https://www.wixapis.com";

// Fetch domain from Wix App Instance API (works with client_credentials tokens)
async function fetchSiteDomainFromWix(siteId: string, instanceId: string | null): Promise<string | null> {
  try {
    console.log(`[Health] Fetching domain for site ${siteId}, instance ${instanceId}`);

    // getAccessToken automatically refreshes expired tokens
    const accessToken = await getAccessToken({ siteId, instanceId });
    if (!accessToken) {
      console.log(`[Health] No token found for site ${siteId}`);
      return null;
    }

    // Use App Instance API - it returns site URL and works with client_credentials tokens
    const response = await fetch(`${WIX_API_BASE}/apps/v1/instance`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    console.log(`[Health] Wix App Instance API response status: ${response.status}`);

    if (!response.ok) {
      const errText = await response.text();
      console.log(`[Health] Wix API error: ${errText}`);
      return null;
    }

    const data = await response.json();
    console.log(`[Health] Wix API data:`, JSON.stringify(data).substring(0, 500));

    // Extract domain from site.url or site.siteDisplayName
    const domain = data?.site?.url ??
                   data?.site?.siteDisplayName ??
                   null;

    console.log(`[Health] Extracted domain: ${domain}`);
    return domain;
  } catch (error) {
    console.error(`[Health] Error fetching domain:`, error);
    return null;
  }
}

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
      SELECT sc.id, sc.site_id, sc.instance_id, sc.store_name as sc_name, c.store_name as company_name, c.store_domain
      FROM store_connections sc
      LEFT JOIN companies c ON c.site_id = sc.site_id
      WHERE sc.store_name = 'Wix Store' OR sc.store_name IS NULL
    `;

    if (genericNames.rows.length > 0) {
      issues.push(`${genericNames.rows.length} stores with generic "Wix Store" name`);

      if (autoFix) {
        for (const row of genericNames.rows) {
          let newName = row.store_domain && row.store_domain.length > 0
            ? row.store_domain
            : null;

          // If no domain in DB, try fetching from Wix API
          if (!newName && row.site_id) {
            const wixDomain = await fetchSiteDomainFromWix(row.site_id, row.instance_id);
            if (wixDomain) {
              newName = wixDomain;
              // Also save to companies table for future use
              await sql`
                UPDATE companies SET store_domain = ${wixDomain} WHERE site_id = ${row.site_id}
              `;
              fixes.push(`Fetched domain from Wix for site ${row.site_id}: "${wixDomain}"`);
            }
          }

          if (newName) {
            await sql`
              UPDATE store_connections SET store_name = ${newName} WHERE id = ${row.id}
            `;
            fixes.push(`Fixed store name for site ${row.site_id}: "${row.sc_name}" -> "${newName}"`);
          }
        }
      }
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
