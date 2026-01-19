import { sql } from '../lib/sql.js';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function main() {
  // Get all orders with transaction refs
  const orders = await sql`
    SELECT id, number, raw->'udito'->'transactionRef' as tx_ref
    FROM orders
    WHERE site_id = ${SITE_ID}
    AND raw #> '{udito,transactionRef}' IS NOT NULL
  `;

  console.log(`Found ${orders.rows.length} orders with transaction refs\n`);

  // Count frequency of each transaction ref
  const txRefCounts = new Map();

  for (const order of orders.rows) {
    const txRef = order.tx_ref;
    txRefCounts.set(txRef, (txRefCounts.get(txRef) || 0) + 1);
  }

  // Find duplicates (same transaction ref on multiple orders)
  const duplicates = Array.from(txRefCounts.entries())
    .filter(([ref, count]) => count > 1)
    .sort((a, b) => b[1] - a[1]);

  console.log(`Found ${duplicates.length} duplicate transaction refs:\n`);

  for (const [ref, count] of duplicates) {
    console.log(`  ${ref}: used ${count} times`);
  }

  if (duplicates.length > 0) {
    console.log('\nClearing duplicate transaction refs...\n');

    for (const [badRef, count] of duplicates) {
      const result = await sql`
        UPDATE orders
        SET raw = raw #- '{udito,transactionRef}'
        WHERE site_id = ${SITE_ID}
        AND raw #>> '{udito,transactionRef}' = ${badRef}
      `;

      console.log(`Cleared ${result.rowCount} orders with duplicate ref: ${badRef}`);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
