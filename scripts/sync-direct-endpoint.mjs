import { sql } from '../lib/supabase-sql.js';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

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

async function fetchTransactionForOrder(token, orderId) {
  const endpoints = [
    `https://manage.wix.com/_api/ecom-payments/v1/payments/orders/${orderId}`,
    `https://www.wixapis.com/_api/ecom-payments/v1/payments/orders/${orderId}`,
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'wix-site-id': SITE_ID,
        },
      });

      if (!response.ok) continue;

      const data = await response.json();
      const orderTx = data?.orderTransactions || data;
      const payments = orderTx?.payments || [];

      if (payments.length === 0) continue;

      // Pick best payment
      const validStatuses = ['APPROVED', 'COMPLETED', 'REFUNDED'];
      const validPayment = payments.find(
        p => validStatuses.includes(p?.regularPaymentDetails?.status)
      );
      const bestPayment = validPayment || payments[0];

      if (!bestPayment) continue;

      return (
        bestPayment.regularPaymentDetails?.providerTransactionId ||
        bestPayment.regularPaymentDetails?.gatewayTransactionId ||
        bestPayment.id ||
        null
      );
    } catch (e) {
      // Try next endpoint
      continue;
    }
  }

  return null;
}

async function main() {
  const token = await getAccessToken();

  if (!token) {
    console.log('No access token found');
    process.exit(1);
  }

  // Get all paid orders from database
  const orders = await sql`
    SELECT id, number, payment_status
    FROM orders
    WHERE site_id = ${SITE_ID}
    AND payment_status IN ('PAID', 'FULLY_REFUNDED', 'PARTIALLY_REFUNDED')
    ORDER BY number DESC
  `;

  console.log(`Found ${orders.rows.length} paid orders in database\n`);

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const order of orders.rows) {
    try {
      const transactionRef = await fetchTransactionForOrder(token, order.id);

      if (transactionRef) {
        // Get existing raw data
        const existing = await sql`SELECT raw FROM orders WHERE id = ${order.id}`;
        const currentRaw = existing.rows[0]?.raw || {};
        const currentUdito = currentRaw.udito || {};

        // Build updated udito object
        const updatedUdito = { ...currentUdito, transactionRef };
        const updatedRaw = { ...currentRaw, udito: updatedUdito };

        // Update order
        await sql`
          UPDATE orders
          SET raw = ${JSON.stringify(updatedRaw)}::jsonb
          WHERE id = ${order.id}
        `;

        updated++;
        console.log(`✅ Order ${order.number}: ${transactionRef}`);
      } else {
        notFound++;
        console.log(`❌ Order ${order.number}: No transaction ref found`);
      }

      // Delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      errors++;
      console.log(`💥 Order ${order.number}: ${error.message}`);
    }
  }

  console.log(`\n✅ Updated: ${updated} orders`);
  console.log(`❌ Not found: ${notFound} orders`);
  console.log(`💥 Errors: ${errors} orders`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
