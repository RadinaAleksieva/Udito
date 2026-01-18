#!/usr/bin/env node
import pg from 'pg';

const connectionString = 'postgresql://udito_user:udito_password@78.47.173.82:5432/udito';
const client = new pg.Client({ connectionString });

async function main() {
  try {
    await client.connect();
    console.log('Connected to database\n');

    // List all tables
    const tables = await client.query(`
      SELECT table_schema, table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('=== All Tables ===');
    for (const row of tables.rows) {
      console.log(`  ${row.table_name}`);
    }

    // Identify tenant tables (orders_*, receipts_*)
    console.log('\n=== Tenant Tables (orders_*, receipts_*) ===');
    const tenantTables = tables.rows.filter(r =>
      r.table_name.startsWith('orders_') || r.table_name.startsWith('receipts_')
    );
    for (const row of tenantTables) {
      console.log(`  ${row.table_name}`);
    }

    // Get store info to map site_id to domain
    console.log('\n=== Store Connections (site_id -> domain) ===');
    const stores = await client.query(`
      SELECT DISTINCT site_id, store_name
      FROM store_connections
      WHERE site_id IS NOT NULL
    `);
    for (const row of stores.rows) {
      console.log(`  ${row.site_id} -> ${row.store_name}`);
    }

    // Get companies info
    console.log('\n=== Companies (site_id -> store_name) ===');
    const companies = await client.query(`
      SELECT site_id, store_name
      FROM companies
      WHERE site_id IS NOT NULL
    `);
    for (const row of companies.rows) {
      console.log(`  ${row.site_id} -> ${row.store_name}`);
    }

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
