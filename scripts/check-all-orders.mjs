import { sql } from '../lib/sql.js';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function checkAllOrders() {
  // Total orders in database
  const total = await sql`
    SELECT COUNT(*) as count
    FROM orders
  `;
  console.log('Total orders in database:', total.rows[0].count);

  // Orders by site_id
  const bySite = await sql`
    SELECT site_id, COUNT(*) as count
    FROM orders
    GROUP BY site_id
    ORDER BY count DESC
  `;
  console.log('\nOrders by site_id:');
  bySite.rows.forEach(row => {
    console.log(`  ${row.site_id || 'NULL'}: ${row.count} orders`);
  });

  // Recent orders with NULL site_id
  const nullSite = await sql`
    SELECT number, created_at, site_id
    FROM orders
    WHERE site_id IS NULL
    ORDER BY created_at DESC
    LIMIT 10
  `;
  console.log('\nRecent orders with NULL site_id:');
  nullSite.rows.forEach(row => {
    console.log(`  #${row.number}: ${row.created_at}`);
  });

  process.exit(0);
}

checkAllOrders().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
