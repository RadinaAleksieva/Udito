import { sql } from '@vercel/postgres';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';
const ORDER_ID = 'a256adde-11da-4c85-b200-4f9ae78b414f';

async function fixOrder() {
  console.log('Updating order 10223 site_id to:', SITE_ID);
  
  await sql`
    UPDATE orders
    SET site_id = ${SITE_ID}
    WHERE id = ${ORDER_ID}
  `;
  
  console.log('✓ Updated successfully');
  
  // Verify
  const result = await sql`
    SELECT id, number, site_id
    FROM orders
    WHERE id = ${ORDER_ID}
  `;
  
  console.log('Verification:');
  console.log(result.rows[0]);
  
  process.exit(0);
}

fixOrder().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
