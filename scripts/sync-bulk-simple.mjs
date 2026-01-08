import { sql } from '@vercel/postgres';
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

async function main() {
  const token = await getAccessToken();

  if (!token) {
    console.log('No access token found');
    process.exit(1);
  }

  console.log('Fetching ALL payments from Wix (single request, limit 500)...\n');

  const response = await fetch('https://manage.wix.com/_api/ecom-payments/v1/payments/query', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'wix-site-id': SITE_ID,
    },
    body: JSON.stringify({
      paging: { limit: 500 },
    }),
  });

  if (!response.ok) {
    console.log(`Failed: ${response.status}`);
    process.exit(1);
  }

  const data = await response.json();
  const orderTransactions = data.orderTransactions || [];

  console.log(`Fetched ${orderTransactions.length} order transactions\n`);

  // Build map: orderId -> transaction ref
  const txMap = new Map();

  for (const tx of orderTransactions) {
    const orderId = tx.orderId;
    const payments = tx.payments || [];

    if (payments.length === 0) continue;

    // Pick best payment (prioritize APPROVED/COMPLETED/REFUNDED)
    const validStatuses = ['APPROVED', 'COMPLETED', 'REFUNDED'];
    const validPayment = payments.find(
      p => validStatuses.includes(p?.regularPaymentDetails?.status)
    );
    const bestPayment = validPayment || payments[0];

    if (!bestPayment) continue;

    const transactionRef =
      bestPayment.regularPaymentDetails?.providerTransactionId ||
      bestPayment.regularPaymentDetails?.gatewayTransactionId ||
      bestPayment.id ||
      null;

    if (transactionRef) {
      // Only store if we don't have this orderId yet (keep first occurrence)
      if (!txMap.has(orderId)) {
        txMap.set(orderId, transactionRef);
      }
    }
  }

  console.log(`Extracted ${txMap.size} unique order transaction IDs\n`);

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

  for (const order of orders.rows) {
    const transactionRef = txMap.get(order.id);

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
      console.log(`❌ Order ${order.number}: Not in Wix response`);
    }
  }

  console.log(`\n✅ Updated: ${updated} orders`);
  console.log(`❌ Not found: ${notFound} orders`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
