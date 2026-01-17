/**
 * Tenant-based database architecture
 *
 * Всеки магазин (tenant) има собствени таблици:
 * - orders_{siteId}
 * - receipts_{siteId}
 * - users_{siteId}
 * - webhook_logs_{siteId}
 * - sync_state_{siteId}
 * - monthly_usage_{siteId}
 *
 * Споделени таблици (общи за всички):
 * - companies
 * - wix_tokens
 * - businesses
 * - subscription_plans
 * - billing_companies
 */

import { sql } from "@vercel/postgres";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Нормализира siteId за използване в име на таблица
 * Премахва тирета и специални символи
 */
export function normalizeSiteId(siteId: string): string {
  return siteId.replace(/-/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
}

/**
 * Генерира име на таблица за даден tenant
 */
export function getTableName(baseName: string, siteId: string): string {
  const normalized = normalizeSiteId(siteId);
  return `${baseName}_${normalized}`;
}

/**
 * Списък на всички tenant-specific таблици
 */
export const TENANT_TABLES = [
  "orders",
  "receipts",
  "users",
  "webhook_logs",
  "sync_state",
  "monthly_usage",
  "pending_refunds",
] as const;

// =============================================================================
// CREATE TENANT TABLES
// =============================================================================

/**
 * Създава всички таблици за нов tenant (магазин)
 */
export async function createTenantTables(siteId: string): Promise<void> {
  const n = normalizeSiteId(siteId);

  console.log(`Creating tenant tables for site: ${siteId} (normalized: ${n})`);

  // orders_{siteId}
  // is_synced = true означава стара поръчка (от initial sync)
  // is_synced = false означава нова поръчка (от webhook след регистрация) - таксуема
  await sql.query(`
    CREATE TABLE IF NOT EXISTS orders_${n} (
      id text PRIMARY KEY,
      number text,
      status text,
      payment_status text,
      created_at timestamptz,
      updated_at timestamptz,
      paid_at timestamptz,
      currency text,
      subtotal numeric,
      tax_total numeric,
      shipping_total numeric,
      discount_total numeric,
      total numeric,
      customer_email text,
      customer_name text,
      source text,
      is_synced boolean DEFAULT false,
      imported_at timestamptz DEFAULT now(),
      raw jsonb
    )
  `);

  // receipts_{siteId}
  await sql.query(`
    CREATE TABLE IF NOT EXISTS receipts_${n} (
      id bigserial PRIMARY KEY,
      order_id text,
      issued_at timestamptz DEFAULT now(),
      status text DEFAULT 'issued',
      payload jsonb,
      type text DEFAULT 'sale',
      reference_receipt_id bigint,
      refund_amount numeric,
      return_payment_type integer DEFAULT 2
    )
  `);

  // Unique constraint: one sale + one refund per order
  await sql.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS receipts_${n}_order_type_idx
    ON receipts_${n} (order_id, type)
  `);

  // users_{siteId}
  await sql.query(`
    CREATE TABLE IF NOT EXISTS users_${n} (
      id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      email text UNIQUE NOT NULL,
      name text,
      password_hash text,
      password_salt text,
      email_verified timestamptz,
      image text,
      role text DEFAULT 'member',
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);

  // webhook_logs_{siteId}
  await sql.query(`
    CREATE TABLE IF NOT EXISTS webhook_logs_${n} (
      id bigserial PRIMARY KEY,
      event_type text,
      event_id text,
      order_id text,
      order_number text,
      status text,
      error_message text,
      payload_preview text,
      created_at timestamptz DEFAULT now()
    )
  `);

  // Index for idempotency check
  await sql.query(`
    CREATE INDEX IF NOT EXISTS webhook_logs_${n}_event_id_idx
    ON webhook_logs_${n} (event_id)
  `);

  // sync_state_{siteId}
  await sql.query(`
    CREATE TABLE IF NOT EXISTS sync_state_${n} (
      id bigserial PRIMARY KEY,
      cursor text,
      status text,
      last_error text,
      updated_at timestamptz DEFAULT now()
    )
  `);

  // monthly_usage_{siteId}
  await sql.query(`
    CREATE TABLE IF NOT EXISTS monthly_usage_${n} (
      id bigserial PRIMARY KEY,
      year_month text NOT NULL UNIQUE,
      orders_count integer DEFAULT 0,
      receipts_count integer DEFAULT 0,
      updated_at timestamptz DEFAULT now()
    )
  `);

  // pending_refunds_{siteId} - queue for refund receipts that need processing
  await sql.query(`
    CREATE TABLE IF NOT EXISTS pending_refunds_${n} (
      id bigserial PRIMARY KEY,
      order_id text NOT NULL,
      refund_amount numeric,
      reason text,
      event_payload jsonb,
      status text DEFAULT 'pending',
      attempts integer DEFAULT 0,
      last_error text,
      created_at timestamptz DEFAULT now(),
      processed_at timestamptz
    )
  `);

  // Index for processing pending refunds
  await sql.query(`
    CREATE INDEX IF NOT EXISTS pending_refunds_${n}_status_idx
    ON pending_refunds_${n} (status, created_at)
    WHERE status = 'pending'
  `);

  console.log(`Tenant tables created for site: ${siteId}`);
}

/**
 * Изтрива всички таблици за tenant (при изтриване на магазин)
 */
export async function dropTenantTables(siteId: string): Promise<void> {
  const n = normalizeSiteId(siteId);

  console.log(`Dropping tenant tables for site: ${siteId}`);

  for (const table of TENANT_TABLES) {
    await sql.query(`DROP TABLE IF EXISTS ${table}_${n} CASCADE`);
  }

  console.log(`Tenant tables dropped for site: ${siteId}`);
}

/**
 * Проверява дали tenant таблиците съществуват
 */
export async function tenantTablesExist(siteId: string): Promise<boolean> {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = 'orders_${n}'
    ) as exists
  `);

  return result.rows[0]?.exists === true;
}

// =============================================================================
// ORDERS
// =============================================================================

export interface TenantOrder {
  id: string;
  number?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  paidAt?: string | null;
  currency?: string | null;
  subtotal?: number | null;
  taxTotal?: number | null;
  shippingTotal?: number | null;
  discountTotal?: number | null;
  total?: number | null;
  customerEmail?: string | null;
  customerName?: string | null;
  source?: string | null;
  isSynced?: boolean; // true = стара поръчка (sync), false = нова (webhook) - таксуема
  raw?: any;
}

export async function upsertTenantOrder(siteId: string, order: TenantOrder): Promise<void> {
  const n = normalizeSiteId(siteId);

  const createdAt = order.createdAt ? new Date(order.createdAt).toISOString() : null;
  const updatedAt = order.updatedAt ? new Date(order.updatedAt).toISOString() : null;
  const paidAt = order.paidAt ? new Date(order.paidAt).toISOString() : null;
  const isSynced = order.isSynced ?? false;

  await sql.query(`
    INSERT INTO orders_${n} (
      id, number, status, payment_status, created_at, updated_at, paid_at,
      currency, subtotal, tax_total, shipping_total, discount_total, total,
      customer_email, customer_name, source, is_synced, raw
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    ON CONFLICT (id) DO UPDATE SET
      number = EXCLUDED.number,
      status = EXCLUDED.status,
      payment_status = EXCLUDED.payment_status,
      created_at = EXCLUDED.created_at,
      updated_at = EXCLUDED.updated_at,
      paid_at = CASE
        -- If payment just changed to PAID and we have a new paid_at, use it
        WHEN EXCLUDED.payment_status = 'PAID' AND EXCLUDED.paid_at IS NOT NULL THEN EXCLUDED.paid_at
        -- If payment just changed to PAID but no paid_at, use current time
        WHEN EXCLUDED.payment_status = 'PAID' AND orders_${n}.paid_at IS NULL THEN NOW()
        -- Otherwise keep existing paid_at (don't let null overwrite a valid timestamp)
        ELSE COALESCE(orders_${n}.paid_at, EXCLUDED.paid_at)
      END,
      currency = EXCLUDED.currency,
      subtotal = EXCLUDED.subtotal,
      tax_total = EXCLUDED.tax_total,
      shipping_total = EXCLUDED.shipping_total,
      discount_total = EXCLUDED.discount_total,
      total = EXCLUDED.total,
      customer_email = EXCLUDED.customer_email,
      customer_name = EXCLUDED.customer_name,
      source = CASE WHEN orders_${n}.source = 'webhook' THEN 'webhook' ELSE EXCLUDED.source END,
      is_synced = orders_${n}.is_synced,
      raw = EXCLUDED.raw
  `, [
    order.id,
    order.number,
    order.status,
    order.paymentStatus,
    createdAt,
    updatedAt,
    paidAt,
    order.currency,
    order.subtotal,
    order.taxTotal,
    order.shippingTotal,
    order.discountTotal,
    order.total,
    order.customerEmail,
    order.customerName,
    order.source,
    isSynced,
    JSON.stringify(order.raw),
  ]);
}

export async function getTenantOrderById(siteId: string, orderId: string): Promise<any | null> {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT * FROM orders_${n} WHERE id = $1 LIMIT 1
  `, [orderId]);

  return result.rows[0] || null;
}

export async function listTenantOrders(siteId: string, options?: {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}): Promise<any[]> {
  const n = normalizeSiteId(siteId);
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let query = `SELECT * FROM orders_${n}`;
  const params: any[] = [];
  const conditions: string[] = [];

  if (options?.startDate) {
    params.push(options.startDate);
    conditions.push(`created_at >= $${params.length}`);
  }

  if (options?.endDate) {
    params.push(options.endDate);
    conditions.push(`created_at <= $${params.length}`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await sql.query(query, params);
  return result.rows;
}

export async function countTenantOrders(siteId: string, options?: {
  startDate?: string;
  endDate?: string;
  isSynced?: boolean;
}): Promise<number> {
  const n = normalizeSiteId(siteId);

  let query = `SELECT COUNT(*) as count FROM orders_${n}`;
  const params: any[] = [];
  const conditions: string[] = [];

  if (options?.startDate) {
    params.push(options.startDate);
    conditions.push(`created_at >= $${params.length}`);
  }

  if (options?.endDate) {
    params.push(options.endDate);
    conditions.push(`created_at <= $${params.length}`);
  }

  if (options?.isSynced !== undefined) {
    params.push(options.isSynced);
    conditions.push(`is_synced = $${params.length}`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  const result = await sql.query(query, params);
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

/**
 * Връща пълни статистики за tenant (за админ панел)
 */
export async function getTenantStats(siteId: string): Promise<{
  totalOrders: number;
  syncedOrders: number;
  newOrders: number;
  totalReceipts: number;
  saleReceipts: number;
  refundReceipts: number;
  currentMonthUsage: { ordersCount: number; receiptsCount: number };
}> {
  const n = normalizeSiteId(siteId);

  // Count orders
  const ordersResult = await sql.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_synced = true) as synced,
      COUNT(*) FILTER (WHERE is_synced = false) as new
    FROM orders_${n}
  `);

  // Count receipts
  const receiptsResult = await sql.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE type = 'sale') as sales,
      COUNT(*) FILTER (WHERE type = 'refund') as refunds
    FROM receipts_${n}
  `);

  // Current month usage
  const usage = await getTenantMonthlyUsage(siteId);

  return {
    totalOrders: parseInt(ordersResult.rows[0]?.total ?? '0', 10),
    syncedOrders: parseInt(ordersResult.rows[0]?.synced ?? '0', 10),
    newOrders: parseInt(ordersResult.rows[0]?.new ?? '0', 10),
    totalReceipts: parseInt(receiptsResult.rows[0]?.total ?? '0', 10),
    saleReceipts: parseInt(receiptsResult.rows[0]?.sales ?? '0', 10),
    refundReceipts: parseInt(receiptsResult.rows[0]?.refunds ?? '0', 10),
    currentMonthUsage: usage,
  };
}

// =============================================================================
// RECEIPTS
// =============================================================================

export interface TenantReceipt {
  orderId: string;
  payload: any;
  type?: 'sale' | 'refund';
  issuedAt?: string | null;
  referenceReceiptId?: number | null;
  refundAmount?: number | null;
  returnPaymentType?: number | null;
}

export async function getNextTenantReceiptId(siteId: string): Promise<number> {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM receipts_${n}
  `);

  return parseInt(result.rows[0]?.next_id ?? '1', 10);
}

export async function issueTenantReceipt(siteId: string, receipt: TenantReceipt): Promise<{
  created: boolean;
  receiptId: number | null;
}> {
  const n = normalizeSiteId(siteId);
  const type = receipt.type ?? 'sale';
  const issuedAt = receipt.issuedAt ? new Date(receipt.issuedAt).toISOString() : new Date().toISOString();

  // Use atomic INSERT with ON CONFLICT to prevent race conditions
  // The UNIQUE index on (order_id, type) ensures only one receipt per order+type
  // We use a subquery to get the next ID atomically
  try {
    const result = await sql.query(`
      INSERT INTO receipts_${n} (
        id, order_id, issued_at, payload, type,
        reference_receipt_id, refund_amount, return_payment_type
      )
      SELECT
        COALESCE(MAX(id), 0) + 1,
        $1, $2, $3, $4, $5, $6, $7
      FROM receipts_${n}
      ON CONFLICT (order_id, type) DO NOTHING
      RETURNING id
    `, [
      receipt.orderId,
      issuedAt,
      JSON.stringify(receipt.payload),
      type,
      receipt.referenceReceiptId,
      receipt.refundAmount,
      receipt.returnPaymentType ?? 2,
    ]);

    if (result.rows.length > 0) {
      // Insert succeeded - log audit event
      const receiptId = result.rows[0].id;
      try {
        await logAuditEvent(siteId, {
          action: type === 'refund' ? 'refund.issued' : 'receipt.issued',
          orderId: receipt.orderId,
          receiptId,
          details: { type },
        });
      } catch (auditError) {
        console.warn("Could not log audit event:", auditError);
      }
      return { created: true, receiptId };
    }

    // ON CONFLICT triggered - receipt already exists, fetch its ID
    const existing = await sql.query(`
      SELECT id FROM receipts_${n}
      WHERE order_id = $1 AND type = $2
      LIMIT 1
    `, [receipt.orderId, type]);

    return { created: false, receiptId: existing.rows[0]?.id ?? null };
  } catch (error) {
    // Handle any remaining race condition edge cases
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('duplicate key') || errorMessage.includes('unique constraint')) {
      // Another process inserted first - fetch the existing receipt
      const existing = await sql.query(`
        SELECT id FROM receipts_${n}
        WHERE order_id = $1 AND type = $2
        LIMIT 1
      `, [receipt.orderId, type]);

      return { created: false, receiptId: existing.rows[0]?.id ?? null };
    }
    throw error; // Re-throw other errors
  }
}

export async function getTenantReceiptById(siteId: string, receiptId: number): Promise<any | null> {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT * FROM receipts_${n} WHERE id = $1 LIMIT 1
  `, [receiptId]);

  return result.rows[0] || null;
}

export async function getTenantSaleReceiptByOrderId(siteId: string, orderId: string): Promise<any | null> {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT * FROM receipts_${n}
    WHERE order_id = $1 AND type = 'sale'
    LIMIT 1
  `, [orderId]);

  return result.rows[0] || null;
}

export async function listTenantReceipts(siteId: string, options?: {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  type?: 'sale' | 'refund';
}): Promise<any[]> {
  const n = normalizeSiteId(siteId);
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let query = `SELECT * FROM receipts_${n}`;
  const params: any[] = [];
  const conditions: string[] = [];

  if (options?.startDate) {
    params.push(options.startDate);
    conditions.push(`issued_at >= $${params.length}`);
  }

  if (options?.endDate) {
    params.push(options.endDate);
    conditions.push(`issued_at <= $${params.length}`);
  }

  if (options?.type) {
    params.push(options.type);
    conditions.push(`type = $${params.length}`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDER BY issued_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(limit, offset);

  const result = await sql.query(query, params);
  return result.rows;
}

export async function countTenantReceipts(siteId: string, options?: {
  startDate?: string;
  endDate?: string;
  type?: 'sale' | 'refund';
}): Promise<number> {
  const n = normalizeSiteId(siteId);

  let query = `SELECT COUNT(*) as count FROM receipts_${n}`;
  const params: any[] = [];
  const conditions: string[] = [];

  if (options?.startDate) {
    params.push(options.startDate);
    conditions.push(`issued_at >= $${params.length}`);
  }

  if (options?.endDate) {
    params.push(options.endDate);
    conditions.push(`issued_at <= $${params.length}`);
  }

  if (options?.type) {
    params.push(options.type);
    conditions.push(`type = $${params.length}`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  const result = await sql.query(query, params);
  return parseInt(result.rows[0]?.count ?? '0', 10);
}

export async function deleteTenantReceipt(siteId: string, receiptId: number): Promise<boolean> {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    DELETE FROM receipts_${n} WHERE id = $1 RETURNING id
  `, [receiptId]);

  return result.rows.length > 0;
}

// =============================================================================
// USERS
// =============================================================================

export async function getTenantUserByEmail(siteId: string, email: string): Promise<any | null> {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT * FROM users_${n} WHERE email = $1 LIMIT 1
  `, [email]);

  return result.rows[0] || null;
}

export async function createTenantUser(siteId: string, user: {
  email: string;
  name?: string;
  passwordHash?: string;
  passwordSalt?: string;
  role?: string;
}): Promise<string> {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    INSERT INTO users_${n} (email, name, password_hash, password_salt, role)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id
  `, [
    user.email,
    user.name,
    user.passwordHash,
    user.passwordSalt,
    user.role ?? 'member',
  ]);

  return result.rows[0].id;
}

export async function listTenantUsers(siteId: string): Promise<any[]> {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT id, email, name, role, created_at FROM users_${n}
    ORDER BY created_at DESC
  `);

  return result.rows;
}

// =============================================================================
// WEBHOOK LOGS
// =============================================================================

export async function logTenantWebhook(siteId: string, params: {
  eventType: string;
  eventId?: string;
  orderId?: string;
  orderNumber?: string;
  status: 'received' | 'processed' | 'error';
  errorMessage?: string;
  payloadPreview?: string;
}): Promise<void> {
  const n = normalizeSiteId(siteId);

  await sql.query(`
    INSERT INTO webhook_logs_${n} (
      event_type, event_id, order_id, order_number, status, error_message, payload_preview
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
  `, [
    params.eventType,
    params.eventId,
    params.orderId,
    params.orderNumber,
    params.status,
    params.errorMessage,
    params.payloadPreview,
  ]);
}

export async function webhookAlreadyProcessed(siteId: string, eventId: string): Promise<boolean> {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT id FROM webhook_logs_${n}
    WHERE event_id = $1 AND status = 'processed'
    LIMIT 1
  `, [eventId]);

  return result.rows.length > 0;
}

// =============================================================================
// SYNC STATE
// =============================================================================

export async function getTenantSyncState(siteId: string): Promise<any | null> {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT * FROM sync_state_${n} ORDER BY id DESC LIMIT 1
  `);

  return result.rows[0] || null;
}

export async function updateTenantSyncState(siteId: string, state: {
  cursor?: string | null;
  status: string;
  lastError?: string | null;
}): Promise<void> {
  const n = normalizeSiteId(siteId);

  await sql.query(`
    INSERT INTO sync_state_${n} (cursor, status, last_error, updated_at)
    VALUES ($1, $2, $3, NOW())
  `, [state.cursor, state.status, state.lastError]);
}

// =============================================================================
// MONTHLY USAGE
// =============================================================================

export async function incrementTenantOrderCount(siteId: string): Promise<void> {
  const n = normalizeSiteId(siteId);
  const yearMonth = new Date().toISOString().slice(0, 7); // "2026-01"

  await sql.query(`
    INSERT INTO monthly_usage_${n} (year_month, orders_count, updated_at)
    VALUES ($1, 1, NOW())
    ON CONFLICT (year_month) DO UPDATE SET
      orders_count = monthly_usage_${n}.orders_count + 1,
      updated_at = NOW()
  `, [yearMonth]);
}

export async function incrementTenantReceiptCount(siteId: string): Promise<void> {
  const n = normalizeSiteId(siteId);
  const yearMonth = new Date().toISOString().slice(0, 7);

  await sql.query(`
    INSERT INTO monthly_usage_${n} (year_month, receipts_count, updated_at)
    VALUES ($1, 1, NOW())
    ON CONFLICT (year_month) DO UPDATE SET
      receipts_count = monthly_usage_${n}.receipts_count + 1,
      updated_at = NOW()
  `, [yearMonth]);
}

export async function getTenantMonthlyUsage(siteId: string, yearMonth?: string): Promise<{
  ordersCount: number;
  receiptsCount: number;
}> {
  const n = normalizeSiteId(siteId);
  const ym = yearMonth ?? new Date().toISOString().slice(0, 7);

  const result = await sql.query(`
    SELECT orders_count, receipts_count FROM monthly_usage_${n}
    WHERE year_month = $1
    LIMIT 1
  `, [ym]);

  return {
    ordersCount: result.rows[0]?.orders_count ?? 0,
    receiptsCount: result.rows[0]?.receipts_count ?? 0,
  };
}

// =============================================================================
// FIND USER ACROSS ALL TENANTS
// =============================================================================

/**
 * Намира потребител по email във ВСИЧКИ tenant таблици
 * Използва се при login за да се определи до кои магазини има достъп
 */
export async function findUserAcrossAllTenants(email: string): Promise<Array<{
  siteId: string;
  userId: string;
  role: string;
  storeName: string;
}>> {
  // Get all companies (sites)
  const companies = await sql`
    SELECT site_id, store_name FROM companies WHERE site_id IS NOT NULL
  `;

  const results: Array<{
    siteId: string;
    userId: string;
    role: string;
    storeName: string;
  }> = [];

  for (const company of companies.rows) {
    const n = normalizeSiteId(company.site_id);

    try {
      const userResult = await sql.query(`
        SELECT id, role FROM users_${n} WHERE email = $1 LIMIT 1
      `, [email]);

      if (userResult.rows.length > 0) {
        results.push({
          siteId: company.site_id,
          userId: userResult.rows[0].id,
          role: userResult.rows[0].role,
          storeName: company.store_name,
        });
      }
    } catch (e) {
      // Table might not exist yet, skip
      console.warn(`Could not check users_${n}:`, e);
    }
  }

  return results;
}

// =============================================================================
// PENDING REFUNDS QUEUE
// =============================================================================

export interface PendingRefund {
  orderId: string;
  refundAmount?: number | null;
  reason?: string | null;
  eventPayload?: any;
}

/**
 * Добавя refund в опашката за обработка
 */
export async function queuePendingRefund(siteId: string, refund: PendingRefund): Promise<number> {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    INSERT INTO pending_refunds_${n} (order_id, refund_amount, reason, event_payload)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `, [
    refund.orderId,
    refund.refundAmount,
    refund.reason,
    JSON.stringify(refund.eventPayload),
  ]);

  const queueId = result.rows[0].id;

  // Log audit event
  try {
    await logAuditEvent(siteId, {
      action: 'refund.queued',
      orderId: refund.orderId,
      details: {
        queueId,
        refundAmount: refund.refundAmount,
        reason: refund.reason,
      },
    });
  } catch (auditError) {
    console.warn("Could not log audit event:", auditError);
  }

  return queueId;
}

/**
 * Взема следващите refunds за обработка
 */
export async function getPendingRefunds(siteId: string, limit = 10): Promise<Array<{
  id: number;
  orderId: string;
  refundAmount: number | null;
  reason: string | null;
  eventPayload: any;
  attempts: number;
  createdAt: string;
}>> {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT id, order_id, refund_amount, reason, event_payload, attempts, created_at
    FROM pending_refunds_${n}
    WHERE status = 'pending'
    AND attempts < 3
    ORDER BY created_at ASC
    LIMIT $1
  `, [limit]);

  return result.rows.map(row => ({
    id: row.id,
    orderId: row.order_id,
    refundAmount: row.refund_amount,
    reason: row.reason,
    eventPayload: row.event_payload,
    attempts: row.attempts,
    createdAt: row.created_at,
  }));
}

/**
 * Маркира refund като обработен
 */
export async function markRefundProcessed(siteId: string, refundId: number): Promise<void> {
  const n = normalizeSiteId(siteId);

  await sql.query(`
    UPDATE pending_refunds_${n}
    SET status = 'processed', processed_at = NOW()
    WHERE id = $1
  `, [refundId]);
}

/**
 * Маркира refund като неуспешен (увеличава опитите)
 */
export async function markRefundFailed(siteId: string, refundId: number, error: string): Promise<void> {
  const n = normalizeSiteId(siteId);

  await sql.query(`
    UPDATE pending_refunds_${n}
    SET attempts = attempts + 1, last_error = $2,
        status = CASE WHEN attempts >= 2 THEN 'failed' ELSE 'pending' END
    WHERE id = $1
  `, [refundId, error]);
}

/**
 * Проверява дали има pending refund за поръчка
 */
export async function hasPendingRefund(siteId: string, orderId: string): Promise<boolean> {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT 1 FROM pending_refunds_${n}
    WHERE order_id = $1 AND status = 'pending'
    LIMIT 1
  `, [orderId]);

  return result.rows.length > 0;
}

// =============================================================================
// AUDIT LOGGING
// =============================================================================

export type AuditAction =
  | 'receipt.issued'
  | 'receipt.cancelled'
  | 'refund.issued'
  | 'refund.queued'
  | 'settings.updated'
  | 'company.updated'
  | 'access.granted'
  | 'access.revoked'
  | 'sync.started'
  | 'sync.completed';

export interface AuditLogEntry {
  action: AuditAction;
  userId?: string | null;
  orderId?: string | null;
  receiptId?: number | null;
  details?: Record<string, any> | null;
  ipAddress?: string | null;
}

/**
 * Logs an audit event to the tenant's audit_logs table
 * Creates the table if it doesn't exist
 */
export async function logAuditEvent(siteId: string, entry: AuditLogEntry): Promise<void> {
  const n = normalizeSiteId(siteId);

  // Ensure audit_logs table exists
  await sql.query(`
    CREATE TABLE IF NOT EXISTS audit_logs_${n} (
      id bigserial PRIMARY KEY,
      action text NOT NULL,
      user_id text,
      order_id text,
      receipt_id bigint,
      details jsonb,
      ip_address text,
      created_at timestamptz DEFAULT now()
    )
  `);

  // Create index for efficient querying
  await sql.query(`
    CREATE INDEX IF NOT EXISTS audit_logs_${n}_action_idx
    ON audit_logs_${n} (action, created_at DESC)
  `);

  await sql.query(`
    INSERT INTO audit_logs_${n} (action, user_id, order_id, receipt_id, details, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [
    entry.action,
    entry.userId ?? null,
    entry.orderId ?? null,
    entry.receiptId ?? null,
    entry.details ? JSON.stringify(entry.details) : null,
    entry.ipAddress ?? null,
  ]);
}

/**
 * Get recent audit logs for a tenant
 */
export async function getAuditLogs(siteId: string, options?: {
  limit?: number;
  offset?: number;
  action?: AuditAction;
  startDate?: string;
  endDate?: string;
}): Promise<Array<{
  id: number;
  action: AuditAction;
  userId: string | null;
  orderId: string | null;
  receiptId: number | null;
  details: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
}>> {
  const n = normalizeSiteId(siteId);
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  // Check if table exists
  const tableExists = await sql.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name = 'audit_logs_${n}'
    ) as exists
  `);

  if (!tableExists.rows[0]?.exists) {
    return [];
  }

  let query = `SELECT * FROM audit_logs_${n}`;
  const params: any[] = [];
  const conditions: string[] = [];

  if (options?.action) {
    params.push(options.action);
    conditions.push(`action = $${params.length}`);
  }

  if (options?.startDate) {
    params.push(options.startDate);
    conditions.push(`created_at >= $${params.length}`);
  }

  if (options?.endDate) {
    params.push(options.endDate);
    conditions.push(`created_at <= $${params.length}`);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` ORDER BY created_at DESC`;
  params.push(limit);
  query += ` LIMIT $${params.length}`;
  params.push(offset);
  query += ` OFFSET $${params.length}`;

  const result = await sql.query(query, params);

  return result.rows.map(row => ({
    id: row.id,
    action: row.action as AuditAction,
    userId: row.user_id,
    orderId: row.order_id,
    receiptId: row.receipt_id,
    details: row.details,
    ipAddress: row.ip_address,
    createdAt: row.created_at,
  }));
}
