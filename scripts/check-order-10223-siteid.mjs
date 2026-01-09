import { sql } from '@vercel/postgres';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const EXPECTED_SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function checkOrder() {
  console.log('Expected site_id:', EXPECTED_SITE_ID);
  console.log('');
  
  const result = await sql`
    SELECT id, number, site_id, status, payment_status
    FROM orders
    WHERE number = '10223'
    LIMIT 1
  `;
  
  if (result.rows.length === 0) {
    console.log('Order 10223 NOT FOUND in database');
  } else {
    const order = result.rows[0];
    console.log('Order 10223 in database:');
    console.log('  site_id:', order.site_id);
    console.log('  Match:', order.site_id === EXPECTED_SITE_ID ? 'YES ✓' : 'NO ✗');
    console.log('  number:', order.number);
    console.log('  status:', order.status);
    console.log('  payment_status:', order.payment_status);
  }
  
  console.log('');
  console.log('Other orders for comparison:');
  const others = await sql`
    SELECT number, site_id
    FROM orders
    WHERE site_id = ${EXPECTED_SITE_ID}
    ORDER BY number DESC
    LIMIT 5
  `;
  console.log(others.rows);
  
  process.exit(0);
}

checkOrder().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
