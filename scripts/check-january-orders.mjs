import { sql } from '../lib/supabase-sql.js';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function checkJanuaryOrders() {
  // Check total orders
  const total = await sql`
    SELECT COUNT(*) as count
    FROM orders
    WHERE site_id = ${SITE_ID}
  `;
  console.log('Total orders for site:', total.rows[0].count);

  // Check orders by created_at month
  const byMonth = await sql`
    SELECT
      DATE_TRUNC('month', created_at) as month,
      COUNT(*) as count
    FROM orders
    WHERE site_id = ${SITE_ID}
    GROUP BY month
    ORDER BY month DESC
    LIMIT 5
  `;
  console.log('\nOrders by created_at month:');
  byMonth.rows.forEach(row => {
    console.log(`  ${row.month}: ${row.count} orders`);
  });

  // Check specific January 2026 orders
  const jan2026 = await sql`
    SELECT number, created_at, updated_at
    FROM orders
    WHERE site_id = ${SITE_ID}
      AND created_at >= '2026-01-01'
      AND created_at < '2026-02-01'
    ORDER BY created_at DESC
    LIMIT 10
  `;
  console.log('\nJanuary 2026 orders:');
  if (jan2026.rows.length === 0) {
    console.log('  No orders found for January 2026');
  } else {
    jan2026.rows.forEach(row => {
      console.log(`  #${row.number}: ${row.created_at}`);
    });
  }

  // Check most recent orders
  const recent = await sql`
    SELECT number, created_at, updated_at
    FROM orders
    WHERE site_id = ${SITE_ID}
    ORDER BY created_at DESC
    LIMIT 5
  `;
  console.log('\nMost recent orders by created_at:');
  recent.rows.forEach(row => {
    console.log(`  #${row.number}: ${row.created_at}`);
  });

  // Check if order 10224 exists
  const order10224 = await sql`
    SELECT number, created_at, updated_at, site_id
    FROM orders
    WHERE number = '10224'
  `;
  console.log('\nOrder 10224:');
  if (order10224.rows.length === 0) {
    console.log('  Not found in database');
  } else {
    console.log('  Found:', JSON.stringify(order10224.rows[0], null, 2));
  }

  process.exit(0);
}

checkJanuaryOrders().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
