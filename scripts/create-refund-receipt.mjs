import { sql } from '@vercel/postgres';
import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const ORDER_ID = process.argv[2];

if (!ORDER_ID) {
  console.log('Usage: node scripts/create-refund-receipt.mjs <order_id>');
  console.log('Example: node scripts/create-refund-receipt.mjs abc123-def456');
  process.exit(1);
}

async function createRefundReceipt() {
  // Get the order
  const orderResult = await sql`
    select id, number, total, currency, customer_name, site_id, raw
    from orders
    where id = ${ORDER_ID}
    limit 1;
  `;

  const order = orderResult.rows[0];
  if (!order) {
    console.log('Order not found:', ORDER_ID);
    return;
  }

  console.log('Found order:', order.number, '- Total:', order.total, order.currency);

  // Check if sale receipt exists
  const saleResult = await sql`
    select id, issued_at
    from receipts
    where order_id = ${ORDER_ID} and type = 'sale'
    limit 1;
  `;

  const saleReceipt = saleResult.rows[0];
  if (!saleReceipt) {
    console.log('No sale receipt found for this order');
    return;
  }

  console.log('Sale receipt ID:', saleReceipt.id);

  // Check if refund receipt already exists
  const refundResult = await sql`
    select id from receipts
    where order_id = ${ORDER_ID} and type = 'refund'
    limit 1;
  `;

  if (refundResult.rows.length > 0) {
    console.log('Refund receipt already exists:', refundResult.rows[0].id);
    return;
  }

  // Create refund receipt
  const refundAmount = Number(order.total) || 0;
  const refundPayload = {
    id: order.id,
    number: order.number,
    total: -Math.abs(refundAmount),
    currency: order.currency,
    customerName: order.customer_name,
    isRefund: true,
    originalReceiptId: saleReceipt.id,
    refundReason: 'refunded',
  };

  const result = await sql`
    insert into receipts (order_id, business_id, issued_at, status, payload, type, reference_receipt_id, refund_amount)
    values (
      ${ORDER_ID},
      ${null},
      ${new Date().toISOString()},
      ${'issued'},
      ${JSON.stringify(refundPayload)},
      ${'refund'},
      ${saleReceipt.id},
      ${-Math.abs(refundAmount)}
    )
    returning id;
  `;

  console.log('Created refund receipt:', result.rows[0].id);
  console.log('Amount:', -Math.abs(refundAmount), order.currency);
}

createRefundReceipt().catch(console.error);
