import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

// First, let's fetch order 10224 from Wix to get its ID
async function syncOrder() {
  console.log('Fetching order 10224 from Wix...');
  
  const response = await fetch(
    `https://www.wixapis.com/ecom/v1/orders?query={"filter": {"number": "10224"}}`,
    {
      headers: {
        'Authorization': env.WIX_ACCESS_TOKEN,
        'wix-site-id': SITE_ID,
      },
    }
  );
  
  const data = await response.json();
  
  if (!data.orders || data.orders.length === 0) {
    console.error('Order 10224 not found in Wix');
    process.exit(1);
  }
  
  const order = data.orders[0];
  console.log('Found order:', order._id);
  console.log('Number:', order.number);
  console.log('Status:', order.status);
  console.log('Payment Status:', order.paymentStatus);
  
  // Now sync it
  console.log('\nSyncing to UDITO...');
  const syncResponse = await fetch('https://udito.vercel.app/api/admin/sync-order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: order._id,
      siteId: SITE_ID,
      adminSecret: env.ADMIN_SECRET,
    }),
  });
  
  const syncResult = await syncResponse.json();
  console.log('Sync result:', syncResult);
  
  process.exit(0);
}

syncOrder().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
