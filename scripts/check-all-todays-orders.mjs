import { sql } from '../lib/sql.js';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function checkOrders() {
  console.log('All orders created today (2026-01-09):');
  const today = '2026-01-09';
  
  const result = await sql`
    SELECT id, number, site_id, status, payment_status, created_at, updated_at
    FROM orders
    WHERE created_at::date = ${today}::date
    ORDER BY created_at DESC
  `;
  
  console.table(result.rows);
  console.log(`\nTotal: ${result.rows.length} orders created today`);
  
  console.log('\n\nAll orders for site (regardless of date):');
  const all = await sql`
    SELECT id, number, site_id, status, payment_status, created_at
    FROM orders
    WHERE site_id = ${SITE_ID}
    ORDER BY created_at DESC
    LIMIT 20
  `;
  console.table(all.rows);
  
  process.exit(0);
}

checkOrders().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
