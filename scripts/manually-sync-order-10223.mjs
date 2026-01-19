import { sql } from '../lib/sql.js';
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
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
      'wix-site-id': SITE_ID,
    },
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data?.order || data;
}

async function upsertOrder(order) {
  const mapped = {
    id: order.id,
    siteId: SITE_ID,
    businessId: null,
    number: order.number,
    status: order.status,
    paymentStatus: order.paymentStatus,
    createdAt: order.createdDate,
    updatedAt: order.updatedDate,
    paidAt: null,
    currency: order.currency,
    subtotal: parseFloat(order.priceSummary?.subtotal?.amount || '0'),
    taxTotal: parseFloat(order.priceSummary?.tax?.amount || '0'),
    shippingTotal: parseFloat(order.priceSummary?.shipping?.amount || '0'),
    discountTotal: parseFloat(order.priceSummary?.discount?.amount || '0'),
    total: parseFloat(order.priceSummary?.total?.amount || '0'),
    raw: order,
  };

  await sql`
    INSERT INTO orders (
      id, site_id, business_id, number, status, payment_status,
      created_at, updated_at, paid_at, currency,
      subtotal, tax_total, shipping_total, discount_total, total, raw
    )
    VALUES (
      ${mapped.id}, ${mapped.siteId}, ${mapped.businessId}, ${mapped.number},
      ${mapped.status}, ${mapped.paymentStatus}, ${mapped.createdAt}, ${mapped.updatedAt},
      ${mapped.paidAt}, ${mapped.currency}, ${mapped.subtotal}, ${mapped.taxTotal},
      ${mapped.shippingTotal}, ${mapped.discountTotal}, ${mapped.total}, ${JSON.stringify(mapped.raw)}::jsonb
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      payment_status = EXCLUDED.payment_status,
      updated_at = EXCLUDED.updated_at,
      raw = EXCLUDED.raw
  `;
}

async function main() {
  const token = await getAccessToken();
  if (!token) {
    console.log('No access token found');
    process.exit(1);
  }

  console.log('Fetching order 10223...');
  const order = await fetchOrderFromWix(token, ORDER_ID);

  if (!order) {
    console.log('Order not found');
    process.exit(1);
  }

  console.log('Upserting order to database...');
  await upsertOrder(order);

  console.log('✅ Order 10223 synced successfully!');
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
