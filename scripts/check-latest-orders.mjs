import { sql } from '@vercel/postgres';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function checkLatestOrders() {
  // Get latest 5 orders
  const latest = await sql`
    SELECT number, created_at, payment_status, site_id
    FROM orders
    WHERE site_id = ${SITE_ID}
    ORDER BY created_at DESC
    LIMIT 5
  `;

  console.log('Latest 5 orders:');
  latest.rows.forEach(row => {
    console.log(`  #${row.number}: ${row.created_at} - ${row.payment_status}`);
  });

  // Check orders created in last 10 minutes
  const recent = await sql`
    SELECT number, created_at, payment_status
    FROM orders
    WHERE site_id = ${SITE_ID}
      AND created_at >= NOW() - INTERVAL '10 minutes'
    ORDER BY created_at DESC
  `;

  console.log(`\nOrders created in last 10 minutes: ${recent.rows.length}`);
  recent.rows.forEach(row => {
    console.log(`  #${row.number}: ${row.created_at} - ${row.payment_status}`);
  });

  process.exit(0);
}

checkLatestOrders().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
