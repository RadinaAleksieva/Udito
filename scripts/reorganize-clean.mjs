#!/usr/bin/env node
import pg from 'pg';

const connectionString = 'postgresql://udito_user:udito_password@78.47.173.82:5432/udito';
const client = new pg.Client({ connectionString });

// The only store we're keeping
const KEEP_SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';
const KEEP_SCHEMA = 'thewhiterabbitshop';

// Store to delete
const DELETE_SITE_ID = 'de34f1c3-7bff-4501-9e04-bd90f3c43ae5';

// Tenant table prefixes
const TENANT_PREFIXES = [
  'orders_',
  'receipts_',
  'audit_logs_',
  'monthly_usage_',
  'pending_refunds_',
  'sync_state_',
  'webhook_logs_',
  'users_',
];

function normalizeSiteId(siteId) {
  return siteId.replace(/-/g, '_');
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  try {
    await client.connect();
    console.log('Connected to database');
    console.log(dryRun ? '\n🔍 DRY RUN MODE (add --execute to apply changes)\n' : '\n⚠️ EXECUTING CHANGES\n');

    // =========================================================================
    // STEP 1: Delete test store tables
    // =========================================================================
    console.log('=== Step 1: Delete test_store tables ===');
    const deleteNormalized = normalizeSiteId(DELETE_SITE_ID);

    for (const prefix of TENANT_PREFIXES) {
      const tableName = `${prefix}${deleteNormalized}`;

      // Check if table exists
      const exists = await client.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      `, [tableName]);

      if (exists.rows.length > 0) {
        console.log(`  DROP TABLE ${tableName} CASCADE;`);
        if (!dryRun) {
          await client.query(`DROP TABLE IF EXISTS "${tableName}" CASCADE`);
          console.log(`    ✅ Dropped`);
        }
      }
    }

    // Delete from store_connections
    console.log(`  DELETE FROM store_connections WHERE site_id = '${DELETE_SITE_ID}';`);
    if (!dryRun) {
      await client.query(`DELETE FROM store_connections WHERE site_id = $1`, [DELETE_SITE_ID]);
    }

    // Delete from wix_tokens
    console.log(`  DELETE FROM wix_tokens WHERE site_id = '${DELETE_SITE_ID}';`);
    if (!dryRun) {
      await client.query(`DELETE FROM wix_tokens WHERE site_id = $1`, [DELETE_SITE_ID]);
    }

    // Delete from companies
    console.log(`  DELETE FROM companies WHERE site_id = '${DELETE_SITE_ID}';`);
    if (!dryRun) {
      await client.query(`DELETE FROM companies WHERE site_id = $1`, [DELETE_SITE_ID]);
    }

    // =========================================================================
    // STEP 2: Create schema for thewhiterabbitshop
    // =========================================================================
    console.log('\n=== Step 2: Create schema ===');
    console.log(`  CREATE SCHEMA IF NOT EXISTS "${KEEP_SCHEMA}";`);
    if (!dryRun) {
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${KEEP_SCHEMA}"`);
      console.log(`    ✅ Schema "${KEEP_SCHEMA}" created`);
    }

    // =========================================================================
    // STEP 3: Move and rename tables
    // =========================================================================
    console.log('\n=== Step 3: Move tables to schema with clean names ===');
    const keepNormalized = normalizeSiteId(KEEP_SITE_ID);

    for (const prefix of TENANT_PREFIXES) {
      const oldTableName = `${prefix}${keepNormalized}`;
      const newTableName = prefix.slice(0, -1); // Remove trailing underscore

      // Check if table exists
      const exists = await client.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      `, [oldTableName]);

      if (exists.rows.length > 0) {
        console.log(`  Moving: public.${oldTableName} → ${KEEP_SCHEMA}.${newTableName}`);
        if (!dryRun) {
          // Move to schema
          await client.query(`ALTER TABLE public."${oldTableName}" SET SCHEMA "${KEEP_SCHEMA}"`);
          // Rename to clean name
          await client.query(`ALTER TABLE "${KEEP_SCHEMA}"."${oldTableName}" RENAME TO "${newTableName}"`);
          console.log(`    ✅ Done`);
        }
      } else {
        console.log(`  ⏭️ Table ${oldTableName} doesn't exist, skipping`);
      }
    }

    // =========================================================================
    // STEP 4: Add schema_name column to store_connections
    // =========================================================================
    console.log('\n=== Step 4: Add schema_name to store_connections ===');

    const colCheck = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'store_connections' AND column_name = 'schema_name'
    `);

    if (colCheck.rows.length === 0) {
      console.log('  ALTER TABLE store_connections ADD COLUMN schema_name VARCHAR(100);');
      if (!dryRun) {
        await client.query('ALTER TABLE store_connections ADD COLUMN schema_name VARCHAR(100)');
        console.log('    ✅ Column added');
      }
    } else {
      console.log('  ⏭️ schema_name column already exists');
    }

    console.log(`  UPDATE store_connections SET schema_name = '${KEEP_SCHEMA}' WHERE site_id = '${KEEP_SITE_ID}';`);
    if (!dryRun) {
      await client.query(`UPDATE store_connections SET schema_name = $1 WHERE site_id = $2`, [KEEP_SCHEMA, KEEP_SITE_ID]);
    }

    // Also add to companies table
    const compColCheck = await client.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'companies' AND column_name = 'schema_name'
    `);

    if (compColCheck.rows.length === 0) {
      console.log('  ALTER TABLE companies ADD COLUMN schema_name VARCHAR(100);');
      if (!dryRun) {
        await client.query('ALTER TABLE companies ADD COLUMN schema_name VARCHAR(100)');
      }
    }

    console.log(`  UPDATE companies SET schema_name = '${KEEP_SCHEMA}' WHERE site_id = '${KEEP_SITE_ID}';`);
    if (!dryRun) {
      await client.query(`UPDATE companies SET schema_name = $1 WHERE site_id = $2`, [KEEP_SCHEMA, KEEP_SITE_ID]);
    }

    // =========================================================================
    // STEP 5: Clean up any remaining legacy tables in public
    // =========================================================================
    console.log('\n=== Step 5: Clean up legacy tables ===');
    const legacyTables = ['orders', 'receipts', 'sync_state', 'monthly_usage', 'webhook_logs', 'audit_logs', 'pending_refunds', 'users'];

    for (const table of legacyTables) {
      const exists = await client.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      `, [table]);

      if (exists.rows.length > 0) {
        console.log(`  DROP TABLE public.${table} CASCADE;`);
        if (!dryRun) {
          await client.query(`DROP TABLE IF EXISTS public."${table}" CASCADE`);
          console.log(`    ✅ Dropped`);
        }
      }
    }

    // =========================================================================
    // VERIFICATION
    // =========================================================================
    console.log('\n=== Verification ===');

    // List all schemas
    const schemas = await client.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      ORDER BY schema_name
    `);

    console.log('\n📁 Database Structure:');
    for (const schema of schemas.rows) {
      const tables = await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = $1
        ORDER BY table_name
      `, [schema.schema_name]);

      if (tables.rows.length > 0 || schema.schema_name === 'public' || schema.schema_name === KEEP_SCHEMA) {
        console.log(`\n📂 ${schema.schema_name}/`);
        for (const t of tables.rows) {
          // Get row count
          let count = '?';
          try {
            const countResult = await client.query(`SELECT COUNT(*) as c FROM "${schema.schema_name}"."${t.table_name}"`);
            count = countResult.rows[0].c;
          } catch (e) {
            // Ignore errors
          }
          console.log(`   └── ${t.table_name} (${count} rows)`);
        }
      }
    }

    // Verify store_connections
    console.log('\n📋 Store Connections:');
    try {
      const stores = await client.query(`SELECT site_id, store_name, schema_name FROM store_connections`);
      for (const s of stores.rows) {
        console.log(`   ${s.store_name || 'N/A'}: ${s.site_id} → schema: ${s.schema_name || 'N/A'}`);
      }
    } catch (e) {
      // schema_name column might not exist in dry run
      const stores = await client.query(`SELECT site_id, store_name FROM store_connections`);
      for (const s of stores.rows) {
        console.log(`   ${s.store_name || 'N/A'}: ${s.site_id}`);
      }
    }

    console.log('\n✅ Done!');
    if (dryRun) {
      console.log('\n⚠️ This was a DRY RUN. Run with --execute to apply changes.');
    }

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
