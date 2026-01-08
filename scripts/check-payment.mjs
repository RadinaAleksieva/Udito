import { sql } from '@vercel/postgres';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const WIX_API_BASE = 'https://www.wixapis.com';
const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';
const PAYMENT_ID = process.argv[2] || '2fa3389e-a041-48d0-b6db-fea336c5b170';

async function getAccessToken() {
  const result = await sql`
    SELECT access_token
    FROM wix_tokens
    WHERE site_id = ${SITE_ID}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return result.rows[0]?.access_token;
}

async function main() {
  const token = await getAccessToken();

  if (!token) {
    console.log('No access token found');
    process.exit(1);
  }

  console.log(`Fetching payment: ${PAYMENT_ID}\n`);

  // Try the ecom-payments query endpoint
  const queryUrl = 'https://manage.wix.com/_api/ecom-payments/v1/payments/query';

  const response = await fetch(queryUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'wix-site-id': SITE_ID,
    },
    body: JSON.stringify({
      filter: { id: { $eq: PAYMENT_ID } },
      paging: { limit: 1 },
    }),
  });

  if (!response.ok) {
    console.log(`Query failed: ${response.status}`);
    console.log(await response.text());
    process.exit(1);
  }

  const data = await response.json();

  console.log('Full response:');
  console.log(JSON.stringify(data, null, 2));

  if (data.orderTransactions && data.orderTransactions[0]) {
    const tx = data.orderTransactions[0];
    console.log('\n\nOrder ID:', tx.orderId);
    console.log('Payments:', tx.payments?.length || 0);

    if (tx.payments) {
      tx.payments.forEach((p, i) => {
        console.log(`\nPayment ${i}:`);
        console.log('  id:', p.id);
        console.log('  status:', p.regularPaymentDetails?.status);
        console.log('  providerTransactionId:', p.regularPaymentDetails?.providerTransactionId);
        console.log('  offlinePayment:', p.regularPaymentDetails?.offlinePayment);
        console.log('  paymentMethod:', p.regularPaymentDetails?.paymentMethod);
      });
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
