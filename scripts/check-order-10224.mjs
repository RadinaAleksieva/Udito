import { sql } from '../lib/supabase-sql.js';
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

async function checkOrder() {
  const result = await sql`
    SELECT number, payment_status, total, currency, subtotal, raw
    FROM orders
    WHERE number = '10222'
    ORDER BY created_at DESC
    LIMIT 1
  `;

  if (result.rows.length > 0) {
    const order = result.rows[0];
    console.log('Order 10222:');
    console.log(`  Status: ${order.payment_status}`);
    console.log(`  Total: ${order.total} ${order.currency}`);
    console.log(`  Subtotal: ${order.subtotal}`);
    
    // Check raw data
    const raw = order.raw;
    console.log(`\n  Raw priceSummary:`, JSON.stringify(raw?.priceSummary, null, 2));
  }

  process.exit(0);
}

checkOrder().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
