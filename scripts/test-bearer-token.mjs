import { sql } from '../lib/sql.js';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function test() {
  const result = await sql`
    SELECT access_token
    FROM wix_tokens
    WHERE site_id = ${SITE_ID}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  
  const token = result.rows[0].access_token;
  
  console.log('Test 1: Without Bearer prefix');
  let response = await fetch(
    `https://www.wixapis.com/ecom/v1/orders?limit=1`,
    {
      headers: {
        'Authorization': token,
        'wix-site-id': SITE_ID,
      },
    }
  );
  console.log('  Status:', response.status);
  if (!response.ok) {
    const text = await response.text();
    console.log('  Error:', text.substring(0, 200));
  }
  
  console.log('\nTest 2: With Bearer prefix');
  response = await fetch(
    `https://www.wixapis.com/ecom/v1/orders?limit=1`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'wix-site-id': SITE_ID,
      },
    }
  );
  console.log('  Status:', response.status);
  if (!response.ok) {
    const text = await response.text();
    console.log('  Error:', text.substring(0, 200));
  } else {
    const data = await response.json();
    console.log('  SUCCESS! Orders count:', data.orders?.length || 0);
  }
  
  process.exit(0);
}

test().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
