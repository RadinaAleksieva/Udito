import fs from 'fs';

// Load env
const envContent = fs.readFileSync('.env.local', 'utf8');
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)="?([^"]*)"?$/);
  if (match) process.env[match[1]] = match[2];
});

const { sql } = await import('../lib/supabase-sql.js');
const { queryOrders, pickOrderFields, extractTransactionRef, extractDeliveryMethodFromOrder } = await import('../lib/wix.js');
const { getSchemaForSite } = await import('../lib/tenant-db.js');

const SITE_ID = '6240f8a5-7af4-4fdf-96c1-d1f22b205408';
const DAYS = 7;

async function syncRecentOrders() {
  console.log(`Syncing orders for last ${DAYS} days...`);

  // Calculate start date
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - DAYS);
  const startDateIso = startDate.toISOString();

  // Get schema for tenant
  const schema = await getSchemaForSite(SITE_ID);
  console.log(`Using schema: ${schema}`);

  let syncedCount = 0;
  let archivedCount = 0;
  let cursor = null;
  const limit = 50;

  do {
    const page = await queryOrders({
      startDateIso,
      cursor,
      limit,
      siteId: SITE_ID,
      instanceId: null,
    });

    const orders = page?.orders ?? [];
    cursor = page?.cursor ?? null;

    console.log(`Fetched ${orders.length} orders from Wix`);

    for (const rawOrder of orders) {
      const base = pickOrderFields(rawOrder, 'backfill');
      let orderRaw = rawOrder;

      // Check if archived
      const isArchived = rawOrder?.archived === true ||
        rawOrder?.isArchived === true ||
        rawOrder?.archivedAt ||
        rawOrder?.archivedDate ||
        String(rawOrder?.status ?? '').toLowerCase().includes('archived');

      // Check if canceled/rejected
      const isCanceled = String(rawOrder?.status ?? '').toLowerCase().includes('cancel') ||
        String(rawOrder?.paymentStatus ?? '').toLowerCase().includes('cancel');

      if (isArchived) {
        archivedCount++;
        console.log(`  #${base.number}: ARCHIVED`);
      } else if (isCanceled) {
        console.log(`  #${base.number}: CANCELED (status: ${rawOrder?.status})`);
      }

      // Extract delivery method
      const deliveryMethod = extractDeliveryMethodFromOrder(orderRaw);
      if (deliveryMethod) {
        orderRaw = {
          ...orderRaw,
          udito: { ...(orderRaw.udito ?? {}), deliveryMethod },
        };
      }

      // Extract transaction ref
      const transactionRef = extractTransactionRef(orderRaw);
      if (transactionRef) {
        orderRaw = {
          ...orderRaw,
          udito: { ...(orderRaw.udito ?? {}), transactionRef },
        };
      }

      const mapped = pickOrderFields(orderRaw, 'backfill');

      // Ensure siteId is set
      if (!mapped.siteId) {
        mapped.siteId = SITE_ID;
      }

      // Update in tenant table
      await sql.query(`
        UPDATE "${schema}".orders
        SET
          status = $2,
          payment_status = $3,
          raw = $4,
          updated_at = NOW()
        WHERE id = $1
      `, [
        mapped.id,
        mapped.status,
        mapped.paymentStatus,
        JSON.stringify(orderRaw)
      ]);

      // Also update legacy table
      await sql`
        UPDATE orders
        SET
          status = ${mapped.status},
          payment_status = ${mapped.paymentStatus},
          raw = ${JSON.stringify(orderRaw)},
          updated_at = NOW()
        WHERE id = ${mapped.id}
      `;

      syncedCount++;
    }

    console.log(`Synced ${syncedCount} orders so far...`);
  } while (cursor);

  console.log(`\n✅ Sync complete:`);
  console.log(`   Total synced: ${syncedCount}`);
  console.log(`   Archived: ${archivedCount}`);

  // Show current status of recent orders
  console.log('\n📋 Current status of recent orders:');
  const recentOrders = await sql.query(`
    SELECT number, status, payment_status,
           raw->>'archived' as archived,
           raw->>'isArchived' as is_archived
    FROM "${schema}".orders
    ORDER BY created_at DESC
    LIMIT 10
  `);

  for (const order of recentOrders.rows) {
    const isArch = order.archived === 'true' || order.is_archived === 'true';
    console.log(`   #${order.number}: ${order.status} / ${order.payment_status}${isArch ? ' [ARCHIVED]' : ''}`);
  }

  process.exit(0);
}

syncRecentOrders().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
