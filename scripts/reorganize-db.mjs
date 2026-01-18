#!/usr/bin/env node
import pg from 'pg';

const connectionString = 'postgresql://udito_user:udito_password@78.47.173.82:5432/udito';
const client = new pg.Client({ connectionString });

// Map site_id to schema name (domain-based, friendly names)
const siteToSchema = {
  '6240f8a5-7af4-4fdf-96c1-d1f22b205408': 'thewhiterabbitshop',
  'de34f1c3-7bff-4501-9e04-bd90f3c43ae5': 'test_store',
};

const tenantTablePrefixes = [
  'orders_',
  'receipts_',
  'audit_logs_',
  'monthly_usage_',
  'pending_refunds_',
  'sync_state_',
  'webhook_logs_',
];

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  try {
    await client.connect();
    console.log('Connected to database');
    console.log(dryRun ? '\n🔍 DRY RUN MODE (add --execute to apply changes)\n' : '\n⚠️ EXECUTING CHANGES\n');

    // 1. Create schemas for each store
    console.log('=== Step 1: Create Schemas ===');
    for (const [siteId, schemaName] of Object.entries(siteToSchema)) {
      console.log(`  CREATE SCHEMA IF NOT EXISTS "${schemaName}";`);
      if (!dryRun) {
        await client.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
        console.log(`    ✅ Created schema ${schemaName}`);
      }
    }

    // 2. Move tenant tables to appropriate schemas
    console.log('\n=== Step 2: Move Tenant Tables to Schemas ===');

    // Get all tables
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    for (const row of tables.rows) {
      const tableName = row.table_name;

      // Check if it's a tenant table
      for (const prefix of tenantTablePrefixes) {
        if (tableName.startsWith(prefix)) {
          // Extract the site_id from table name (underscores instead of dashes)
          const siteIdPart = tableName.substring(prefix.length);
          const siteIdOriginal = siteIdPart.replace(/_/g, '-');

          if (siteToSchema[siteIdOriginal]) {
            const schemaName = siteToSchema[siteIdOriginal];
            const newTableName = prefix.slice(0, -1); // Remove trailing underscore (e.g., 'orders_' -> 'orders')

            console.log(`  ALTER TABLE public."${tableName}" SET SCHEMA "${schemaName}";`);
            console.log(`  ALTER TABLE "${schemaName}"."${tableName}" RENAME TO "${newTableName}";`);

            if (!dryRun) {
              await client.query(`ALTER TABLE public."${tableName}" SET SCHEMA "${schemaName}"`);
              await client.query(`ALTER TABLE "${schemaName}"."${tableName}" RENAME TO "${newTableName}"`);
              console.log(`    ✅ Moved and renamed to ${schemaName}.${newTableName}`);
            }
          }
          break;
        }
      }
    }

    // 3. Add schema_name column to store_connections for lookup
    console.log('\n=== Step 3: Add schema_name to store_connections ===');

    // Check if column exists
    const colCheck = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'store_connections' AND column_name = 'schema_name'
    `);

    if (colCheck.rows.length === 0) {
      console.log('  ALTER TABLE store_connections ADD COLUMN schema_name VARCHAR(100);');
      if (!dryRun) {
        await client.query('ALTER TABLE store_connections ADD COLUMN schema_name VARCHAR(100)');
        console.log('    ✅ Added schema_name column');
      }
    } else {
      console.log('  ⏭️ schema_name column already exists');
    }

    // Update schema_name for existing stores
    for (const [siteId, schemaName] of Object.entries(siteToSchema)) {
      console.log(`  UPDATE store_connections SET schema_name = '${schemaName}' WHERE site_id = '${siteId}';`);
      if (!dryRun) {
        await client.query(`UPDATE store_connections SET schema_name = $1 WHERE site_id = $2`, [schemaName, siteId]);
      }
    }

    // 4. Show final structure
    console.log('\n=== Final Structure ===');
    const schemas = await client.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name
    `);

    for (const schema of schemas.rows) {
      const schemaTables = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = $1
        ORDER BY table_name
      `, [schema.schema_name]);

      if (schemaTables.rows.length > 0) {
        console.log(`\n📁 Schema: ${schema.schema_name}`);
        for (const t of schemaTables.rows) {
          console.log(`   └── ${t.table_name}`);
        }
      }
    }

    console.log('\n✅ Done!');
    if (dryRun) {
      console.log('\nRun with --execute to apply these changes.');
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
