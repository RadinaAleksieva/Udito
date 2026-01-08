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
    SELECT
      number,
      payment_status,
      raw #>> '{udito,transactionRef}' as tx_ref,
      raw #>> '{udito,paymentSummary,cardBrand}' as card_brand,
      raw #>> '{udito,paymentSummary,cardLast4}' as card_last4,
      raw -> 'orderTransactions' -> 'payments' as payments
    FROM orders
    WHERE site_id = ${SITE_ID}
    AND number::text IN ('10221', '10219', '10203', '10202', '10201', '10200')
    ORDER BY number DESC
  `;

  for (const order of orders.rows) {
    console.log(`\n=== Order ${order.number} (${order.payment_status}) ===`);
    console.log(`Transaction Ref: ${order.tx_ref || '—'}`);
    console.log(`Card: ${order.card_brand || '—'} •••• ${order.card_last4 || '—'}`);

    if (order.payments) {
      const payments = typeof order.payments === 'string'
        ? JSON.parse(order.payments)
        : order.payments;
      console.log(`\nPayments in orderTransactions: ${payments.length}`);
      payments.forEach((p, i) => {
        const status = p?.regularPaymentDetails?.status;
        const txId = p?.regularPaymentDetails?.providerTransactionId ||
                     p?.regularPaymentDetails?.gatewayTransactionId ||
                     p?.id;
        const brand = p?.regularPaymentDetails?.paymentMethodDetails?.card?.brand;
        const last4 = p?.regularPaymentDetails?.paymentMethodDetails?.card?.last4;
        console.log(`  [${i}] ${status}: ${txId}`);
        if (brand || last4) {
          console.log(`      Card: ${brand || '?'} •••• ${last4 || '?'}`);
        }
      });
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
