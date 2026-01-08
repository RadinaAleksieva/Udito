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
const ORDER_NUMBER = process.argv[2] || '10184';

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

async function checkOrder() {
  const accessToken = await getAccessToken();

  const response = await fetch(`${WIX_API_BASE}/ecom/v1/orders/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'wix-site-id': SITE_ID,
    },
    body: JSON.stringify({
      query: {
        filter: { number: ORDER_NUMBER },
        paging: { limit: 1 }
      }
    })
  });

  const data = await response.json();
  const order = data.orders?.[0];

  if (!order) {
    console.log('Order', ORDER_NUMBER, 'not found in Wix');
    return;
  }

  const activities = order.activities || [];
  const paidActivity = activities.find(a => a.type === 'ORDER_PAID');

  console.log('Order', ORDER_NUMBER, 'from Wix:');
  console.log('  created:', order.createdDate?.slice(0, 10));
  console.log('  ORDER_PAID activity:', paidActivity?.createdDate?.slice(0, 19) || 'NOT FOUND');
  console.log('  total:', order.priceSummary?.total?.amount, order.currency);
  console.log('  paymentStatus:', order.paymentStatus);
}

checkOrder().catch(console.error);
