import { sql } from '../lib/supabase-sql.js';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const WIX_API_BASE = 'https://www.wixapis.com';
const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function getAccessToken() {
  const result = await sql`
    SELECT access_token, refresh_token
    FROM wix_tokens
    WHERE site_id = ${SITE_ID}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return result.rows[0]?.access_token;
}

async function fetchOrders() {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.error('No access token found');
    return;
  }

  // Fetch orders from Wix
  const response = await fetch(`${WIX_API_BASE}/ecom/v1/orders/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'wix-site-id': SITE_ID,
    },
    body: JSON.stringify({
      query: {
        filter: {
          paymentStatus: 'PAID'
        },
        sort: [{ fieldName: 'createdDate', order: 'DESC' }],
        paging: { limit: 30 }
      }
    })
  });

  if (!response.ok) {
    console.error('Failed to fetch orders:', response.status, await response.text());
    return;
  }

  const data = await response.json();
  const orders = data.orders || [];

  console.log('Orders from Wix API (PAID):');
  console.log('----------------------------');

  for (const order of orders) {
    const number = order.number;
    const createdDate = order.createdDate;
    const activities = order.activities || [];

    // Find ORDER_PAID activity
    const paidActivity = activities.find(a => a.type === 'ORDER_PAID');
    const paidDate = paidActivity?.createdDate || 'N/A';

    const total = order.priceSummary?.total?.amount || order.totals?.total || '?';
    const currency = order.currency || order.priceSummary?.total?.currency || '?';

    console.log(`Order ${number}: created=${createdDate?.slice(0,10)} PAID=${paidDate?.slice(0,10)} total=${total} ${currency}`);
  }
}

fetchOrders().catch(console.error);
