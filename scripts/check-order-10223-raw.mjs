import { sql } from '../lib/supabase-sql.js';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

async function checkOrder() {
  const result = await sql`
    SELECT raw
    FROM orders
    WHERE number = '10223'
    LIMIT 1
  `;
  
  if (result.rows.length === 0) {
    console.log('Order 10223 NOT FOUND in database');
  } else {
    const raw = result.rows[0].raw;
    console.log('Order 10223 raw data:');
    console.log('archived:', raw?.archived ?? 'null');
    console.log('isArchived:', raw?.isArchived ?? 'null');
    console.log('archivedAt:', raw?.archivedAt ?? 'null');
    console.log('archivedDate:', raw?.archivedDate ?? 'null');
    console.log('archiveDate:', raw?.archiveDate ?? 'null');
    console.log('status:', raw?.status ?? 'null');
    console.log('paymentStatus:', raw?.paymentStatus ?? 'null');
    console.log('createdDate:', raw?.createdDate ?? 'null');
    console.log('number:', raw?.number ?? 'null');
  }
  process.exit(0);
}

checkOrder().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
