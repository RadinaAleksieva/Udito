import { sql } from '@vercel/postgres';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function main() {
  const orders = await sql`
    SELECT number, payment_status, created_at, updated_at
    FROM orders
    WHERE site_id = ${SITE_ID}
    ORDER BY number DESC
    LIMIT 10
  `;

  console.log('\nПоследни 10 поръчки в базата данни:\n');
  for (const order of orders.rows) {
    console.log(`${order.number}: ${order.payment_status} (създадена: ${order.created_at}, обновена: ${order.updated_at})`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
