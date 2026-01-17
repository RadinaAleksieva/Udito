import { sql } from '../lib/supabase-sql.js';
import fs from 'fs';

const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function checkRecentUpdates() {
  const latest = await sql`
    SELECT number, created_at, updated_at, payment_status
    FROM orders
    WHERE site_id = ${SITE_ID}
    ORDER BY updated_at DESC
    LIMIT 10
  `;

  console.log('Latest 10 order updates (by updated_at):');
  latest.rows.forEach(row => {
    const timeSince = Math.floor((Date.now() - new Date(row.updated_at).getTime()) / 1000);
    console.log(`  #${row.number}: updated ${timeSince}s ago - ${row.payment_status}`);
  });

  process.exit(0);
}

checkRecentUpdates().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
