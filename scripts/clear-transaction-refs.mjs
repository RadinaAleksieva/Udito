import { sql } from '@vercel/postgres';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

async function main() {
  console.log('Clearing udito.transactionRef from all orders...\n');

  const result = await sql`
    UPDATE orders
    SET raw = raw - 'udito'
    WHERE raw ? 'udito'
    AND raw #> '{udito,transactionRef}' IS NOT NULL
  `;

  console.log(`✅ Cleared transaction refs from ${result.rowCount} orders`);
  console.log('\nNow orders will use the new extractTransactionRef() logic!');

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
