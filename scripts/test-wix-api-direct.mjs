import { sql } from '../lib/sql.js';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function testWixAPI() {
  // Get instance_id from database
  const result = await sql`
    SELECT instance_id
    FROM wix_tokens
    WHERE site_id = ${SITE_ID}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  
  if (!result.rows[0]?.instance_id) {
    console.error('No instance_id found');
    process.exit(1);
  }
  
  const instanceId = result.rows[0].instance_id;
  console.log('Instance ID:', instanceId);
  
  // Get access token using client_credentials flow
  console.log('\nGetting access token via client_credentials...');
  const tokenResponse = await fetch('https://www.wixapis.com/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: process.env.WIX_APP_ID,
      client_secret: process.env.WIX_APP_SECRET,
      instance_id: instanceId,
    }),
  });
  
  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    console.error('Token request failed:', error);
    process.exit(1);
  }
  
  const tokenData = await tokenResponse.json();
  console.log('✅ Got access token!');
  console.log('Token length:', tokenData.access_token.length);
  console.log('Token prefix:', tokenData.access_token.substring(0, 30));
  console.log('Expires in:', tokenData.expires_in, 'seconds');
  
  // Try to fetch orders
  console.log('\nFetching orders from Wix API...');
  const ordersResponse = await fetch(
    'https://www.wixapis.com/ecom/v1/orders?limit=5',
    {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'wix-site-id': SITE_ID,
      },
    }
  );
  
  console.log('Orders API status:', ordersResponse.status);
  
  if (!ordersResponse.ok) {
    const error = await ordersResponse.text();
    console.error('Orders request failed:', error);
  } else {
    const ordersData = await ordersResponse.json();
    console.log('✅ SUCCESS!');
    console.log('Orders count:', ordersData.orders?.length || 0);
    console.log('Response keys:', Object.keys(ordersData));
    if (ordersData.orders && ordersData.orders.length > 0) {
      console.log('\nFirst 3 order numbers:');
      ordersData.orders.slice(0, 3).forEach(o => {
        console.log('  -', o.number, '(', o.paymentStatus, ')');
      });
    } else {
      console.log('\n⚠️ API returned 0 orders!');
      console.log('Full response:', JSON.stringify(ordersData, null, 2));
    }
  }
  
  process.exit(0);
}

testWixAPI().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
