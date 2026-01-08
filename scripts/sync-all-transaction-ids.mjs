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

async function fetchAllPayments(token) {
  console.log('Fetching ALL payments from Wix...\n');

  let allTransactions = [];
  let cursor = null;
  let pageNum = 0;

  while (true) {
    const pagingParam = cursor ? { cursor } : { limit: 50 };

    const response = await fetch('https://manage.wix.com/_api/ecom-payments/v1/payments/query', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'wix-site-id': SITE_ID,
      },
      body: JSON.stringify({
        paging: pagingParam,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch payments: ${response.status}`);
    }

    const data = await response.json();
    const transactions = data.orderTransactions || [];
    const metadata = data.metadata || {};

    allTransactions = allTransactions.concat(transactions);
    pageNum++;

    console.log(`Page ${pageNum}: Fetched ${transactions.length} transactions (total so far: ${allTransactions.length})`);

    // Check if there are more pages
    const hasNext = metadata.hasNext || false;
    const nextCursor = metadata.cursors?.next || null;

    if (!hasNext || !nextCursor) {
      console.log('No more pages\n');
      break;
    }

    cursor = nextCursor;

    // Safety limit
    if (pageNum >= 20) {
      console.log('Reached safety limit of 20 pages');
      break;
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return allTransactions;
}

function pickBestPayment(payments) {
  if (!Array.isArray(payments) || payments.length === 0) return null;

  const validStatuses = ['APPROVED', 'COMPLETED', 'REFUNDED'];
  const validPayment = payments.find(
    p => validStatuses.includes(p?.regularPaymentDetails?.status)
  );

  return validPayment || payments[0];
}

async function main() {
  const token = await getAccessToken();

  if (!token) {
    console.log('No access token found');
    process.exit(1);
  }

  // Fetch all payments from Wix
  const orderTransactions = await fetchAllPayments(token);
  console.log(`Found ${orderTransactions.length} order transactions in Wix\n`);

  // Group orderTransactions by orderId (there can be multiple per order)
  const orderTxGroups = new Map();

  for (const tx of orderTransactions) {
    const orderId = tx.orderId;
    if (!orderTxGroups.has(orderId)) {
      orderTxGroups.set(orderId, []);
    }
    orderTxGroups.get(orderId).push(tx);
  }

  console.log(`Grouped ${orderTransactions.length} transactions into ${orderTxGroups.size} unique orders`);

  // Build a map: orderId -> transactionRef
  const txMap = new Map();
  let noPayments = 0;
  let noTransactionRef = 0;
  let success = 0;

  for (const [orderId, txList] of orderTxGroups) {
    // Get all payments from all orderTransactions for this order
    const allPayments = txList.flatMap(tx => tx.payments || []);

    if (allPayments.length === 0) {
      noPayments++;
      continue;
    }

    // Pick the best payment across all transactions
    const bestPayment = pickBestPayment(allPayments);

    if (bestPayment) {
      const transactionRef =
        bestPayment.regularPaymentDetails?.providerTransactionId ||
        bestPayment.regularPaymentDetails?.gatewayTransactionId ||
        bestPayment.id ||
        null;

      if (transactionRef) {
        txMap.set(orderId, transactionRef);
        success++;
      } else {
        noTransactionRef++;
      }
    }
  }

  console.log(`Extracted ${txMap.size} transaction IDs`);
  console.log(`  - Success: ${success}`);
  console.log(`  - No payments array: ${noPayments}`);
  console.log(`  - No transaction ref: ${noTransactionRef}\n`);

  // Get all orders from database
  const orders = await sql`
    SELECT id, number, payment_status
    FROM orders
    WHERE site_id = ${SITE_ID}
    AND payment_status IN ('PAID', 'FULLY_REFUNDED', 'PARTIALLY_REFUNDED')
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
      console.log(`❌ Order ${order.number}: No transaction ref found`);
    }
  }

  console.log(`\n✅ Updated ${updated} orders`);
  console.log(`❌ Not found: ${notFound} orders`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
