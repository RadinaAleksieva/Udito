import { sql } from '../lib/supabase-sql.js';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function checkToken() {
  const result = await sql`
    SELECT access_token
    FROM wix_tokens
    WHERE site_id = ${SITE_ID}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  
  if (result.rows.length === 0 || !result.rows[0].access_token) {
    console.log('❌ No access token');
    process.exit(1);
  }
  
  const token = result.rows[0].access_token;
  console.log('Access token info:');
  console.log('  Length:', token.length);
  console.log('  First 30 chars:', token.substring(0, 30));
  console.log('  Starts with "Bearer":', token.startsWith('Bearer'));
  console.log('  Starts with "JWS":', token.startsWith('JWS'));
  
  // Try to use it
  console.log('\nTrying to fetch orders from Wix API...');
  const response = await fetch(
    `https://www.wixapis.com/ecom/v1/orders?limit=1`,
    {
      headers: {
        'Authorization': token,
        'wix-site-id': SITE_ID,
      },
    }
  );
  
  console.log('Response status:', response.status);
  
  if (!response.ok) {
    const errorText = await response.text();
    console.log('Error:', errorText);
  } else {
    const data = await response.json();
    console.log('Success! Orders count:', data.orders?.length || 0);
    if (data.orders && data.orders.length > 0) {
      console.log('First order number:', data.orders[0].number);
    }
  }
  
  process.exit(0);
}

checkToken().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
