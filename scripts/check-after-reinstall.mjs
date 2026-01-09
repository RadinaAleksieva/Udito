import { sql } from '@vercel/postgres';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function check() {
  console.log('1. Checking access token...');
  const tokenResult = await sql`
    SELECT site_id, access_token, refresh_token, expires_at, created_at
    FROM wix_tokens
    WHERE site_id = ${SITE_ID}
    ORDER BY created_at DESC
    LIMIT 1
  `;
  
  if (tokenResult.rows.length === 0) {
    console.log('❌ No token found');
  } else {
    const token = tokenResult.rows[0];
    console.log('Token status:');
    console.log('  Has access_token:', token.access_token ? '✅ YES' : '❌ NO');
    console.log('  Has refresh_token:', token.refresh_token ? '✅ YES' : '❌ NO');
    console.log('  Expires at:', token.expires_at || 'NULL');
    console.log('  Created at:', token.created_at);
  }
  
  console.log('\n2. Checking for order 10224...');
  const orderResult = await sql`
    SELECT number, status, payment_status, created_at
    FROM orders
    WHERE number = '10224'
  `;
  
  if (orderResult.rows.length === 0) {
    console.log('❌ Order 10224 NOT in database');
  } else {
    console.log('✅ Order 10224 found:', orderResult.rows[0]);
  }
  
  console.log('\n3. Total orders count:');
  const countResult = await sql`
    SELECT COUNT(*) as count
    FROM orders
    WHERE site_id = ${SITE_ID}
  `;
  console.log('Total orders:', countResult.rows[0].count);
  
  console.log('\n4. Latest orders:');
  const latestResult = await sql`
    SELECT number, created_at, updated_at
    FROM orders
    WHERE site_id = ${SITE_ID}
    ORDER BY created_at DESC
    LIMIT 5
  `;
  console.table(latestResult.rows);
  
  process.exit(0);
}

check().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
