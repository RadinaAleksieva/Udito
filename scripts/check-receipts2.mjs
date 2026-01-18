#!/usr/bin/env node
import pg from 'pg';

const connectionString = 'postgresql://udito_user:udito_password@78.47.173.82:5432/udito';
const client = new pg.Client({ connectionString });

async function main() {
  try {
    await client.connect();
    console.log('Connected to database\n');

    // Check tenant receipts tables
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'receipts_%'
    `);

    console.log('=== Tenant Receipts Tables ===');
    for (const row of tables.rows) {
      const count = await client.query(`SELECT COUNT(*) FROM "${row.table_name}"`);
      console.log(`  ${row.table_name}: ${count.rows[0].count} records`);

      // Get columns
      const cols = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = $1
        ORDER BY ordinal_position
      `, [row.table_name]);
      console.log(`    Columns: ${cols.rows.map(c => c.column_name).join(', ')}`);

      // Show sample
      const sample = await client.query(`SELECT * FROM "${row.table_name}" LIMIT 3`);
      for (const r of sample.rows) {
        console.log(`    - ${JSON.stringify(r).substring(0, 200)}`);
      }
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

main();
