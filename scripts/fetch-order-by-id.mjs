import { sql } from '../lib/supabase-sql.js';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';
const ORDER_ID = 'a256adde-11da-4c85-b200-4f9ae78b414f';

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

async function fetchOrderFromWix(token, orderId) {
  const endpoint = `https://www.wixapis.com/ecom/v1/orders/${orderId}`;

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json',
        'wix-site-id': SITE_ID,
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch order:', response.status, response.statusText);
      const text = await response.text();
      console.error('Response:', text);
      return null;
    }

    const data = await response.json();
    return data?.order || data;
  } catch (error) {
    console.error('Error fetching order:', error);
    return null;
  }
}

async function main() {
  const token = await getAccessToken();

  if (!token) {
    console.log('No access token found');
    process.exit(1);
  }

  console.log('Fetching order', ORDER_ID, 'from Wix...\n');

  const order = await fetchOrderFromWix(token, ORDER_ID);

  if (!order) {
    console.log('Order not found');
    process.exit(1);
  }

  console.log('✅ Order fetched from Wix:');
  console.log('Number:', order.number);
  console.log('Status:', order.status);
  console.log('Payment Status:', order.paymentStatus);
  console.log('Created:', order._createdDate);
  console.log('Total:', order.priceSummary?.total);
  console.log('\nFull order data:');
  console.log(JSON.stringify(order, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
