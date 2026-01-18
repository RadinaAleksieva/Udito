#!/usr/bin/env node
import pg from 'pg';

const connectionString = 'postgresql://udito_user:udito_password@78.47.173.82:5432/udito';
const client = new pg.Client({ connectionString });

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  try {
    await client.connect();
    console.log('Connected to database');
    console.log(dryRun ? '\n🔍 DRY RUN MODE (add --execute to apply changes)\n' : '\n⚠️ EXECUTING CHANGES\n');

    const legacyTables = ['orders', 'receipts', 'sync_state', 'monthly_usage', 'webhook_logs'];

    for (const table of legacyTables) {
      // Check if table exists
      const exists = await client.query(`
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      `, [table]);

      if (exists.rows.length > 0) {
        console.log(`  DROP TABLE IF EXISTS ${table} CASCADE;`);
        if (!dryRun) {
          await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
          console.log(`    ✅ Dropped ${table}`);
        }
      } else {
        console.log(`  ⏭️ Table ${table} doesn't exist, skipping`);
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
