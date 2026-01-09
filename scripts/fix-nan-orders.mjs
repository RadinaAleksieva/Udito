import { sql } from '@vercel/postgres';
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function fixOrders() {
  // Find all orders with NaN totals for this site
  const nanOrders = await sql`
    SELECT id, number, total, created_at
    FROM orders
    WHERE site_id = ${SITE_ID}
      AND (total IS NULL OR total::text = 'NaN')
  `;

  console.log(`Found ${nanOrders.rows.length} orders with NaN/NULL totals:`);
  nanOrders.rows.forEach(row => {
    console.log(`  #${row.number} (${row.created_at}): total = ${row.total}`);
  });

  if (nanOrders.rows.length > 0) {
    // Delete these broken orders
    const result = await sql`
      DELETE FROM orders
      WHERE site_id = ${SITE_ID}
        AND (total IS NULL OR total::text = 'NaN')
    `;

    console.log(`\n✅ Deleted ${result.rowCount} broken orders`);
  }

  process.exit(0);
}

fixOrders().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
