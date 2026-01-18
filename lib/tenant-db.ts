/**
 * Tenant-based database architecture
 *
 * Всеки магазин (tenant) има собствена PostgreSQL схема:
 * - {schema_name}.orders
 * - {schema_name}.receipts
 * - {schema_name}.audit_logs
 * - {schema_name}.webhook_logs
 * - {schema_name}.sync_state
 * - {schema_name}.monthly_usage
 * - {schema_name}.pending_refunds
 *
 * Споделени таблици (в public schema):
 * - companies
 * - wix_tokens
 * - businesses
 * - subscription_plans
 * - billing_companies
 * - store_connections
 */

import { sql } from "@/lib/supabase-sql";

// =============================================================================
// SCHEMA CACHE & LOOKUP
// =============================================================================

// In-memory cache for schema lookups (siteId -> schemaName)
const schemaCache = new Map<string, string>();

/**
 * Взима schema name за даден siteId от базата или кеша
 */
export async function getSchemaForSite(siteId: string): Promise<string> {
  // Check cache first
  const cached = schemaCache.get(siteId);
  if (cached) {
    return cached;
  }

  // Lookup from store_connections
  const result = await sql.query(`
    SELECT schema_name FROM store_connections WHERE site_id = $1 LIMIT 1
  `, [siteId]);

  if (result.rows.length > 0 && result.rows[0].schema_name) {
    const schemaName = result.rows[0].schema_name;
    schemaCache.set(siteId, schemaName);
    return schemaName;
  }

  // Fallback: try companies table
  const companyResult = await sql.query(`
    SELECT schema_name FROM companies WHERE site_id = $1 LIMIT 1
  `, [siteId]);

  if (companyResult.rows.length > 0 && companyResult.rows[0].schema_name) {
    const schemaName = companyResult.rows[0].schema_name;
    schemaCache.set(siteId, schemaName);
    return schemaName;
  }

  // No schema found - throw error
  throw new Error(`No schema found for site ${siteId}. Please ensure the store is properly configured.`);
}

/**
 * Инвалидира кеша за даден siteId (при промяна на schema)
 */
export function invalidateSchemaCache(siteId?: string): void {
  if (siteId) {
    schemaCache.delete(siteId);
  } else {
    schemaCache.clear();
  }
}

// =============================================================================
// HELPER FUNCTIONS (Legacy - kept for backwards compatibility)
// =============================================================================

/**
 * Нормализира siteId за използване в име на таблица
 * @deprecated Use getSchemaForSite instead
 */
export function normalizeSiteId(siteId: string): string {
  return siteId.replace(/-/g, "_").replace(/[^a-zA-Z0-9_]/g, "");
}

/**
 * Генерира schema-qualified име на таблица
 */
export async function getTableName(baseName: string, siteId: string): Promise<string> {
  const schema = await getSchemaForSite(siteId);
  return `"${schema}"."${baseName}"`;
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
 * Създава всички таблици за нов tenant (магазин) в собствена schema
 */
export async function createTenantTables(siteId: string, schemaName?: string): Promise<void> {
  // Generate schema name from store name or use provided
  const schema = schemaName || `site_${normalizeSiteId(siteId)}`;

  console.log(`Creating tenant schema and tables for site: ${siteId} (schema: ${schema})`);

  // Create the schema
  await sql.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);

  // Store schema_name in store_connections and companies
  await sql.query(`
    UPDATE store_connections SET schema_name = $1 WHERE site_id = $2
  `, [schema, siteId]);
  await sql.query(`
    UPDATE companies SET schema_name = $1 WHERE site_id = $2
  `, [schema, siteId]);

  // Cache it
  schemaCache.set(siteId, schema);

  // orders table
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".orders (
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

  // receipts table
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".receipts (
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
    CREATE UNIQUE INDEX IF NOT EXISTS receipts_order_type_idx
    ON "${schema}".receipts (order_id, type)
  `);

  // webhook_logs table
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".webhook_logs (
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
    CREATE INDEX IF NOT EXISTS webhook_logs_event_id_idx
    ON "${schema}".webhook_logs (event_id)
  `);

  // sync_state table
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".sync_state (
      id bigserial PRIMARY KEY,
      cursor text,
      status text,
      last_error text,
      updated_at timestamptz DEFAULT now()
    )
  `);

  // monthly_usage table
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".monthly_usage (
      id bigserial PRIMARY KEY,
      year_month text NOT NULL UNIQUE,
      orders_count integer DEFAULT 0,
      receipts_count integer DEFAULT 0,
      updated_at timestamptz DEFAULT now()
    )
  `);

  // pending_refunds table
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".pending_refunds (
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
    CREATE INDEX IF NOT EXISTS pending_refunds_status_idx
    ON "${schema}".pending_refunds (status, created_at)
    WHERE status = 'pending'
  `);

  // audit_logs table
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".audit_logs (
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

  await sql.query(`
    CREATE INDEX IF NOT EXISTS audit_logs_action_idx
    ON "${schema}".audit_logs (action, created_at DESC)
  `);

  console.log(`Tenant schema and tables created for site: ${siteId} (schema: ${schema})`);
}

/**
 * Изтрива schema и всички таблици за tenant
 */
export async function dropTenantTables(siteId: string): Promise<void> {
  try {
    const schema = await getSchemaForSite(siteId);
    console.log(`Dropping tenant schema for site: ${siteId} (schema: ${schema})`);

    await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);

    // Clear from cache
    schemaCache.delete(siteId);

    console.log(`Tenant schema dropped for site: ${siteId}`);
  } catch (error) {
    console.warn(`Could not drop tenant schema for ${siteId}:`, error);
  }
}

/**
 * Проверява дали tenant schema съществува
 */
export async function tenantTablesExist(siteId: string): Promise<boolean> {
  try {
    const schema = await getSchemaForSite(siteId);

    const result = await sql.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = 'orders'
      ) as exists
    `, [schema]);

    return result.rows[0]?.exists === true;
  } catch (error) {
    // No schema found
    return false;
  }
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
  const schema = await getSchemaForSite(siteId);

  const createdAt = order.createdAt ? new Date(order.createdAt).toISOString() : null;
  const updatedAt = order.updatedAt ? new Date(order.updatedAt).toISOString() : null;
  const paidAt = order.paidAt ? new Date(order.paidAt).toISOString() : null;
  const isSynced = order.isSynced ?? false;

  await sql.query(`
    INSERT INTO "${schema}".orders (
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
        WHEN EXCLUDED.payment_status = 'PAID' AND EXCLUDED.paid_at IS NOT NULL THEN EXCLUDED.paid_at
        WHEN EXCLUDED.payment_status = 'PAID' AND "${schema}".orders.paid_at IS NULL THEN NOW()
        ELSE COALESCE("${schema}".orders.paid_at, EXCLUDED.paid_at)
      END,
      currency = EXCLUDED.currency,
      subtotal = EXCLUDED.subtotal,
      tax_total = EXCLUDED.tax_total,
      shipping_total = EXCLUDED.shipping_total,
      discount_total = EXCLUDED.discount_total,
      total = EXCLUDED.total,
      customer_email = EXCLUDED.customer_email,
      customer_name = EXCLUDED.customer_name,
      source = CASE WHEN "${schema}".orders.source = 'webhook' THEN 'webhook' ELSE EXCLUDED.source END,
      is_synced = "${schema}".orders.is_synced,
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
  const schema = await getSchemaForSite(siteId);

  const result = await sql.query(`
    SELECT * FROM "${schema}".orders WHERE id = $1 LIMIT 1
  `, [orderId]);

  return result.rows[0] || null;
}

export async function listTenantOrders(siteId: string, options?: {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
}): Promise<any[]> {
  const schema = await getSchemaForSite(siteId);
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let query = `SELECT * FROM "${schema}".orders`;
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
  const schema = await getSchemaForSite(siteId);

  let query = `SELECT COUNT(*) as count FROM "${schema}".orders`;
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
  const schema = await getSchemaForSite(siteId);

  // Count orders
  const ordersResult = await sql.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_synced = true) as synced,
      COUNT(*) FILTER (WHERE is_synced = false) as new
    FROM "${schema}".orders
  `);

  // Count receipts
  const receiptsResult = await sql.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE type = 'sale') as sales,
      COUNT(*) FILTER (WHERE type = 'refund') as refunds
    FROM "${schema}".receipts
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
  const schema = await getSchemaForSite(siteId);

  const result = await sql.query(`
    SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM "${schema}".receipts
  `);

  return parseInt(result.rows[0]?.next_id ?? '1', 10);
}

export async function issueTenantReceipt(siteId: string, receipt: TenantReceipt): Promise<{
  created: boolean;
  receiptId: number | null;
}> {
  const schema = await getSchemaForSite(siteId);
  const type = receipt.type ?? 'sale';
  const issuedAt = receipt.issuedAt ? new Date(receipt.issuedAt).toISOString() : new Date().toISOString();

  try {
    const result = await sql.query(`
      INSERT INTO "${schema}".receipts (
        id, order_id, issued_at, payload, type,
        reference_receipt_id, refund_amount, return_payment_type
      )
      SELECT
        COALESCE(MAX(id), 0) + 1,
        $1, $2, $3, $4, $5, $6, $7
      FROM "${schema}".receipts
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

    const existing = await sql.query(`
      SELECT id FROM "${schema}".receipts
      WHERE order_id = $1 AND type = $2
      LIMIT 1
    `, [receipt.orderId, type]);

    return { created: false, receiptId: existing.rows[0]?.id ?? null };
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('duplicate key') || errorMessage.includes('unique constraint')) {
      const existing = await sql.query(`
        SELECT id FROM "${schema}".receipts
        WHERE order_id = $1 AND type = $2
        LIMIT 1
      `, [receipt.orderId, type]);

      return { created: false, receiptId: existing.rows[0]?.id ?? null };
    }
    throw error;
  }
}

export async function getTenantReceiptById(siteId: string, receiptId: number): Promise<any | null> {
  const schema = await getSchemaForSite(siteId);

  const result = await sql.query(`
    SELECT * FROM "${schema}".receipts WHERE id = $1 LIMIT 1
  `, [receiptId]);

  return result.rows[0] || null;
}

export async function getTenantSaleReceiptByOrderId(siteId: string, orderId: string): Promise<any | null> {
  const schema = await getSchemaForSite(siteId);

  const result = await sql.query(`
    SELECT * FROM "${schema}".receipts
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
  const schema = await getSchemaForSite(siteId);
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let query = `SELECT * FROM "${schema}".receipts`;
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
  const schema = await getSchemaForSite(siteId);

  let query = `SELECT COUNT(*) as count FROM "${schema}".receipts`;
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
  const schema = await getSchemaForSite(siteId);

  const result = await sql.query(`
    DELETE FROM "${schema}".receipts WHERE id = $1 RETURNING id
  `, [receiptId]);

  return result.rows.length > 0;
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
  const schema = await getSchemaForSite(siteId);

  await sql.query(`
    INSERT INTO "${schema}".webhook_logs (
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
  const schema = await getSchemaForSite(siteId);

  const result = await sql.query(`
    SELECT id FROM "${schema}".webhook_logs
    WHERE event_id = $1 AND status = 'processed'
    LIMIT 1
  `, [eventId]);

  return result.rows.length > 0;
}

// =============================================================================
// SYNC STATE
// =============================================================================

export async function getTenantSyncState(siteId: string): Promise<any | null> {
  const schema = await getSchemaForSite(siteId);

  const result = await sql.query(`
    SELECT * FROM "${schema}".sync_state ORDER BY id DESC LIMIT 1
  `);

  return result.rows[0] || null;
}

export async function updateTenantSyncState(siteId: string, state: {
  cursor?: string | null;
  status: string;
  lastError?: string | null;
}): Promise<void> {
  const schema = await getSchemaForSite(siteId);

  await sql.query(`
    INSERT INTO "${schema}".sync_state (cursor, status, last_error, updated_at)
    VALUES ($1, $2, $3, NOW())
  `, [state.cursor, state.status, state.lastError]);
}

// =============================================================================
// MONTHLY USAGE
// =============================================================================

export async function incrementTenantOrderCount(siteId: string): Promise<void> {
  const schema = await getSchemaForSite(siteId);
  const yearMonth = new Date().toISOString().slice(0, 7);

  await sql.query(`
    INSERT INTO "${schema}".monthly_usage (year_month, orders_count, updated_at)
    VALUES ($1, 1, NOW())
    ON CONFLICT (year_month) DO UPDATE SET
      orders_count = "${schema}".monthly_usage.orders_count + 1,
      updated_at = NOW()
  `, [yearMonth]);
}

export async function incrementTenantReceiptCount(siteId: string): Promise<void> {
  const schema = await getSchemaForSite(siteId);
  const yearMonth = new Date().toISOString().slice(0, 7);

  await sql.query(`
    INSERT INTO "${schema}".monthly_usage (year_month, receipts_count, updated_at)
    VALUES ($1, 1, NOW())
    ON CONFLICT (year_month) DO UPDATE SET
      receipts_count = "${schema}".monthly_usage.receipts_count + 1,
      updated_at = NOW()
  `, [yearMonth]);
}

export async function getTenantMonthlyUsage(siteId: string, yearMonth?: string): Promise<{
  ordersCount: number;
  receiptsCount: number;
}> {
  const schema = await getSchemaForSite(siteId);
  const ym = yearMonth ?? new Date().toISOString().slice(0, 7);

  const result = await sql.query(`
    SELECT orders_count, receipts_count FROM "${schema}".monthly_usage
    WHERE year_month = $1
    LIMIT 1
  `, [ym]);

  return {
    ordersCount: result.rows[0]?.orders_count ?? 0,
    receiptsCount: result.rows[0]?.receipts_count ?? 0,
  };
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
  const schema = await getSchemaForSite(siteId);

  const result = await sql.query(`
    INSERT INTO "${schema}".pending_refunds (order_id, refund_amount, reason, event_payload)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `, [
    refund.orderId,
    refund.refundAmount,
    refund.reason,
    JSON.stringify(refund.eventPayload),
  ]);

  const queueId = result.rows[0].id;

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
  const schema = await getSchemaForSite(siteId);

  const result = await sql.query(`
    SELECT id, order_id, refund_amount, reason, event_payload, attempts, created_at
    FROM "${schema}".pending_refunds
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
  const schema = await getSchemaForSite(siteId);

  await sql.query(`
    UPDATE "${schema}".pending_refunds
    SET status = 'processed', processed_at = NOW()
    WHERE id = $1
  `, [refundId]);
}

/**
 * Маркира refund като неуспешен (увеличава опитите)
 */
export async function markRefundFailed(siteId: string, refundId: number, error: string): Promise<void> {
  const schema = await getSchemaForSite(siteId);

  await sql.query(`
    UPDATE "${schema}".pending_refunds
    SET attempts = attempts + 1, last_error = $2,
        status = CASE WHEN attempts >= 2 THEN 'failed' ELSE 'pending' END
    WHERE id = $1
  `, [refundId, error]);
}

/**
 * Проверява дали има pending refund за поръчка
 */
export async function hasPendingRefund(siteId: string, orderId: string): Promise<boolean> {
  const schema = await getSchemaForSite(siteId);

  const result = await sql.query(`
    SELECT 1 FROM "${schema}".pending_refunds
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
 */
export async function logAuditEvent(siteId: string, entry: AuditLogEntry): Promise<void> {
  const schema = await getSchemaForSite(siteId);

  await sql.query(`
    INSERT INTO "${schema}".audit_logs (action, user_id, order_id, receipt_id, details, ip_address)
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
  const schema = await getSchemaForSite(siteId);
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let query = `SELECT * FROM "${schema}".audit_logs`;
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
