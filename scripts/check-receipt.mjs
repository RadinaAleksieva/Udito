import { sql } from '@vercel/postgres';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const ORDER_NUMBER = process.argv[2] || '10221';

async function main() {
  // First get order ID
  const orderResult = await sql`
    SELECT id FROM orders WHERE number = ${ORDER_NUMBER} LIMIT 1
  `;

  if (orderResult.rows.length === 0) {
    console.log(`Order ${ORDER_NUMBER} not found`);
    process.exit(1);
  }

  const orderId = orderResult.rows[0].id;

  // Get receipt
  const receiptResult = await sql`
    SELECT id, order_id, type, issued_at, payload
    FROM receipts
    WHERE order_id = ${orderId}
    ORDER BY id DESC
    LIMIT 2
  `;

  console.log(`Found ${receiptResult.rows.length} receipts for order ${ORDER_NUMBER}:\n`);

  receiptResult.rows.forEach(receipt => {
    console.log(`Receipt #${receipt.id} (${receipt.type}):`);
    console.log(`  transactionRef:`, receipt.payload?.transactionRef || 'null');
    console.log(`  paymentMethod:`, receipt.payload?.paymentMethod || 'null');
    console.log('');
  });

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
