import { sql } from '../lib/supabase-sql.ts';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SCHEMA = 'thewhiterabbitshop';

async function syncOrders() {
  console.log('Checking orders in database...\n');

  // Show latest orders with status
  const latest = await sql`
    SELECT number, status, payment_status, raw->>'archived' as archived, raw->>'isArchived' as is_archived
    FROM thewhiterabbitshop.orders
    ORDER BY created_at DESC
    LIMIT 15
  `;

  console.log('Latest 15 orders:');
  for (const o of latest.rows) {
    const isArch = o.archived === 'true' || o.is_archived === 'true';
    console.log(`  #${o.number}: status=${o.status}, payment=${o.payment_status}${isArch ? ' [ARCHIVED]' : ''}`);
  }

  process.exit(0);
}

syncOrders().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
