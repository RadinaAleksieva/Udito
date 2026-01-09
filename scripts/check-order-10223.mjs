import { sql } from '@vercel/postgres';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

async function checkOrder() {
  const result = await sql`
    SELECT id, number, status, payment_status, created_at, updated_at
    FROM orders
    WHERE number = '10223'
    LIMIT 1
  `;
  
  if (result.rows.length === 0) {
    console.log('Order 10223 NOT FOUND in database');
  } else {
    console.log('Order 10223 found in database:');
    console.log(JSON.stringify(result.rows[0], null, 2));
  }
  process.exit(0);
}

checkOrder().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
