import { sql } from '../lib/supabase-sql.js';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function main() {
  const result = await sql`
    SELECT
      number,
      raw -> 'orderTransactions' -> 'payments' as payments_raw
    FROM orders
    WHERE site_id = ${SITE_ID}
    AND number::text = '10219'
  `;

  const order = result.rows[0];
  const payments = typeof order.payments_raw === 'string'
    ? JSON.parse(order.payments_raw)
    : order.payments_raw;

  console.log('\n=== Order 10219 Payment Details ===\n');
  console.log(JSON.stringify(payments[0], null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
