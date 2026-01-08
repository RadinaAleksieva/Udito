#!/usr/bin/env node
import { sql } from '@vercel/postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env
const envContent = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

// Import lib functions dynamically
const { fetchTransactionRefForOrder } = await import('../lib/wix.ts');

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

async function main() {
  // Get all paid orders from database
  const orders = await sql`
    SELECT id, number, payment_status
    FROM orders
    WHERE site_id = ${SITE_ID}
    AND payment_status IN ('PAID', 'FULLY_REFUNDED', 'PARTIALLY_REFUNDED')
    ORDER BY number DESC
  `;

  console.log(`Found ${orders.rows.length} paid orders in database\n`);

  let updated = 0;
  let notFound = 0;
  let errors = 0;

  for (const order of orders.rows) {
    try {
      // Use lib function to fetch transaction ref
      const transactionRef = await fetchTransactionRefForOrder({
        orderId: order.id,
        siteId: SITE_ID,
      });

      if (transactionRef) {
        // Get existing raw data
        const existing = await sql`SELECT raw FROM orders WHERE id = ${order.id}`;
        const currentRaw = existing.rows[0]?.raw || {};
        const currentUdito = currentRaw.udito || {};

        // Build updated udito object
        const updatedUdito = { ...currentUdito, transactionRef };
        const updatedRaw = { ...currentRaw, udito: updatedUdito };

        // Update order
        await sql`
          UPDATE orders
          SET raw = ${JSON.stringify(updatedRaw)}::jsonb
          WHERE id = ${order.id}
        `;

        updated++;
        console.log(`✅ Order ${order.number}: ${transactionRef}`);
      } else {
        notFound++;
        console.log(`❌ Order ${order.number}: No transaction ref found`);
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      errors++;
      console.log(`💥 Order ${order.number}: Error - ${error.message}`);
    }
  }

  console.log(`\n✅ Updated: ${updated} orders`);
  console.log(`❌ Not found: ${notFound} orders`);
  console.log(`💥 Errors: ${errors} orders`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
