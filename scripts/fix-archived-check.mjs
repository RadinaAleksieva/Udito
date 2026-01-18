import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log("Checking schemas...");

  // Check what schemas exist
  const schemas = await pool.query(`
    SELECT schema_name FROM information_schema.schemata
    WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY schema_name
  `);
  console.log("Available schemas:", schemas.rows.map(r => r.schema_name).join(", "));

  // Find orders that should be archived - try public schema first
  console.log("\nFinding non-archived orders from public.orders...");
  const result = await pool.query(`
    SELECT o.id, o.number, o.status, o.created_at,
           o.raw->>'archived' as archived_flag,
           o.raw->>'status' as raw_status
    FROM public.orders o
    WHERE (o.status IS NULL OR LOWER(o.status) NOT LIKE 'archiv%')
      AND COALESCE(o.raw->>'archived', 'false') <> 'true'
      AND COALESCE(o.raw->>'isArchived', 'false') <> 'true'
      AND o.raw->>'archivedAt' IS NULL
    ORDER BY o.created_at DESC
    LIMIT 20
  `);

  console.log(`Found ${result.rows.length} non-archived orders:`);
  for (const row of result.rows) {
    console.log(`  - #${row.number} (${row.id?.slice(0,8)}...) status=${row.status} raw_status=${row.raw_status} created=${row.created_at?.toISOString()?.slice(0,10)}`);
  }

  await pool.end();
}

main().catch(console.error);
