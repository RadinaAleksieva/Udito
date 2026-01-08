import { sql } from '@vercel/postgres';

// Set env from .env.local manually
const envContent = await import('fs').then(fs => fs.readFileSync('.env.local', 'utf8'));
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

async function reset() {
  // Delete all receipts
  await sql`DELETE FROM receipts`;
  console.log('All receipts deleted');

  // Reset sequence
  await sql`ALTER SEQUENCE receipts_id_seq RESTART WITH 1`;
  console.log('Sequence reset to 1');

  // Confirm
  const result = await sql`SELECT COUNT(*) as count FROM receipts`;
  console.log('Remaining receipts:', result.rows[0].count);
}

reset().catch(console.error);
