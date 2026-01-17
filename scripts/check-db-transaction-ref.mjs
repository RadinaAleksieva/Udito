import { sql } from '../lib/supabase-sql.js';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const ORDER_NUMBER = process.argv[2] || '10221';

async function main() {
  const result = await sql`
    SELECT id, number, raw->'udito'->'transactionRef' as tx_ref
    FROM orders
    WHERE number = ${ORDER_NUMBER}
    LIMIT 1
  `;

  if (result.rows.length === 0) {
    console.log(`Order ${ORDER_NUMBER} not found`);
    process.exit(1);
  }

  const order = result.rows[0];
  console.log(`Order: ${order.number}`);
  console.log(`Transaction Ref in DB:`, order.tx_ref);

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
