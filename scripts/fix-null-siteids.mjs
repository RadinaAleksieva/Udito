import { sql } from '../lib/supabase-sql.js';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function fixNullSiteIds() {
  // Count orders with NULL site_id
  const count = await sql`
    SELECT COUNT(*) as count
    FROM orders
    WHERE site_id IS NULL
  `;
  console.log(`Found ${count.rows[0].count} orders with NULL site_id`);

  if (count.rows[0].count === 0) {
    console.log('No orders to fix!');
    process.exit(0);
  }

  // Update all NULL site_ids to the correct site_id
  const result = await sql`
    UPDATE orders
    SET site_id = ${SITE_ID}
    WHERE site_id IS NULL
  `;

  console.log(`✅ Updated ${result.rowCount} orders to have site_id: ${SITE_ID}`);

  // Verify
  const afterCount = await sql`
    SELECT COUNT(*) as count
    FROM orders
    WHERE site_id IS NULL
  `;
  console.log(`Remaining NULL site_ids: ${afterCount.rows[0].count}`);

  // Show totals by site_id
  const bySite = await sql`
    SELECT site_id, COUNT(*) as count
    FROM orders
    GROUP BY site_id
    ORDER BY count DESC
  `;
  console.log('\nOrders by site_id after fix:');
  bySite.rows.forEach(row => {
    console.log(`  ${row.site_id || 'NULL'}: ${row.count} orders`);
  });

  process.exit(0);
}

fixNullSiteIds().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
