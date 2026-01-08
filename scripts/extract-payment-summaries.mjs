import { sql } from '@vercel/postgres';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';

function extractPaymentSummaryFromPayment(payment) {
  if (!payment) return null;
  const methodLabel =
    (payment?.regularPaymentDetails?.offlinePayment ? "Offline" : null) ??
    payment?.regularPaymentDetails?.paymentMethod ??
    payment?.method?.displayName ??
    payment?.method?.name ??
    payment?.method?.type ??
    payment?.paymentMethodDetails?.displayName ??
    payment?.paymentMethodDetails?.name ??
    payment?.paymentMethodDetails?.type ??
    payment?.paymentMethod?.displayName ??
    payment?.paymentMethod?.name ??
    payment?.paymentMethod?.type ??
    payment?.paymentMethod ??
    payment?.paymentMethodType ??
    payment?.method ??
    payment?.type ??
    payment?.provider ??
    payment?.paymentType ??
    null;
  const methodText = String(methodLabel ?? "").toLowerCase();
  const card =
    payment?.regularPaymentDetails?.creditCardDetails ??
    payment?.card ??
    payment?.paymentMethodDetails?.card ??
    payment?.paymentMethod?.card ??
    null;
  const cardBrand =
    card?.brand ??
    card?.type ??
    card?.brandName ??
    payment?.cardBrand ??
    payment?.cardProvider ??
    payment?.cardType ??
    null;
  const cardLast4 =
    card?.last4 ??
    card?.lastFourDigits ??
    payment?.cardLast4 ??
    payment?.last4 ??
    null;
  return {
    methodText: methodText || null,
    methodLabel: methodLabel ? String(methodLabel) : null,
    cardBrand: cardBrand || null,
    cardLast4: cardLast4 || null,
  };
}

async function main() {
  // Get all orders with orderTransactions
  const orders = await sql`
    SELECT id, number, raw
    FROM orders
    WHERE site_id = ${SITE_ID}
    AND raw -> 'orderTransactions' -> 'payments' IS NOT NULL
    ORDER BY number DESC
  `;

  console.log(`Processing ${orders.rows.length} orders with orderTransactions...\n`);

  let updated = 0;
  let skipped = 0;

  for (const order of orders.rows) {
    try {
      const raw = order.raw;
      const payments = raw?.orderTransactions?.payments;

      if (!Array.isArray(payments) || payments.length === 0) {
        skipped++;
        console.log(`⏭️  Order ${order.number}: No payments array`);
        continue;
      }

      // Pick best payment (APPROVED/COMPLETED/REFUNDED over others)
      const validStatuses = ['APPROVED', 'COMPLETED', 'REFUNDED'];
      const bestPayment = payments.find(
        p => validStatuses.includes(p?.regularPaymentDetails?.status)
      ) || payments[0];

      // Extract payment summary
      const paymentSummary = extractPaymentSummaryFromPayment(bestPayment);

      if (!paymentSummary || (!paymentSummary.cardBrand && !paymentSummary.cardLast4)) {
        skipped++;
        console.log(`⏭️  Order ${order.number}: No card details found`);
        continue;
      }

      // Update raw with paymentSummary
      const updatedRaw = {
        ...raw,
        udito: {
          ...(raw.udito || {}),
          paymentSummary,
        },
      };

      await sql`
        UPDATE orders
        SET raw = ${JSON.stringify(updatedRaw)}::jsonb
        WHERE id = ${order.id}
      `;

      updated++;
      console.log(`✅ Order ${order.number}: ${paymentSummary.cardBrand || '?'} •••• ${paymentSummary.cardLast4 || '?'}`);
    } catch (error) {
      console.log(`💥 Order ${order.number}: ${error.message}`);
    }
  }

  console.log(`\n✅ Updated: ${updated} orders`);
  console.log(`⏭️  Skipped: ${skipped} orders`);

  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
