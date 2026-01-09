import { sql } from '@vercel/postgres';
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

async function checkOrder() {
  const result = await sql`
    SELECT number, payment_status, total, currency, subtotal, created_at
    FROM orders
    WHERE number IN ('10222', '10003', '10002', '10001')
    ORDER BY number DESC
  `;

  console.log('Orders with issues:');
  result.rows.forEach(row => {
    console.log(`\n#${row.number}:`);
    console.log(`  Status: ${row.payment_status}`);
    console.log(`  Total: ${row.total}`);
    console.log(`  Currency: ${row.currency}`);
    console.log(`  Subtotal: ${row.subtotal}`);
    console.log(`  Created: ${row.created_at}`);
  });

  process.exit(0);
}

checkOrder().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
