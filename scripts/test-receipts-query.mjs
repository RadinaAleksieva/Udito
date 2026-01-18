#!/usr/bin/env node
import pg from 'pg';

const connectionString = 'postgresql://udito_user:udito_password@78.47.173.82:5432/udito';
const client = new pg.Client({ connectionString });

const siteId = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';
const n = siteId.replace(/-/g, '_');

async function main() {
  try {
    await client.connect();
    console.log('Connected to database\n');

    // Test the exact query used by the page
    console.log('=== Testing listReceiptsWithOrdersForSite ===');
    console.log(`Query: SELECT from receipts_${n} r LEFT JOIN orders_${n} o...`);

    const result = await client.query(`
      SELECT r.order_id,
        r.id as receipt_id,
        r.issued_at,
        r.status,
        r.payload,
        r.type as receipt_type,
        r.reference_receipt_id,
        r.refund_amount,
        o.number as order_number,
        o.customer_name,
        o.total,
        o.currency
      FROM receipts_${n} r
      LEFT JOIN orders_${n} o ON o.id = r.order_id
      ORDER BY r.id DESC
      LIMIT 10
    `);

    console.log(`Found ${result.rows.length} receipts:`);
    for (const row of result.rows) {
      console.log(`  #${row.receipt_id} | Order: ${row.order_number || row.order_id.substring(0, 8)} | ${row.customer_name || 'N/A'} | ${row.total} ${row.currency} | ${row.issued_at}`);
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

main();
