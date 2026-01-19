import { sql } from '../lib/sql.js';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const ORDER_NUMBER = process.argv[2] || '10203';

async function main() {
  const result = await sql`
    SELECT id, number, payment_status, raw
    FROM orders
    WHERE number = ${ORDER_NUMBER}
    LIMIT 1
  `;

  if (result.rows.length === 0) {
    console.log(`Order ${ORDER_NUMBER} not found`);
    return;
  }

  const order = result.rows[0];
  console.log(`Order: ${order.number} (${order.id})`);
  console.log(`Payment Status: ${order.payment_status}`);
  console.log(`\nChecking for transaction refs in raw data:\n`);

  const raw = order.raw;

  // Check all possible locations for transaction ID
  console.log('udito.transactionRef:', raw?.udito?.transactionRef);
  console.log('orderTransactions.payments:', raw?.orderTransactions?.payments?.length || 0);

  if (raw?.orderTransactions?.payments) {
    raw.orderTransactions.payments.forEach((p, i) => {
      console.log(`\nPayment ${i}:`);
      console.log('  status:', p?.regularPaymentDetails?.status);
      console.log('  providerTransactionId:', p?.regularPaymentDetails?.providerTransactionId);
      console.log('  offlinePayment:', p?.regularPaymentDetails?.offlinePayment);
    });
  }

  console.log('\npayments array:', raw?.payments?.length || 0);
  if (raw?.payments) {
    raw.payments.forEach((p, i) => {
      console.log(`\nPayment ${i}:`, p);
    });
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
