/**
 * Tenant-based database architecture
 *
 * Всеки магазин (tenant) има собствена PostgreSQL схема:
 * - {schema_name}.users         - потребители с достъп до магазина
 * - {schema_name}.sessions      - активни сесии
 * - {schema_name}.accounts      - OAuth акаунти (Google)
 * - {schema_name}.company       - фирмени данни (един ред)
 * - {schema_name}.orders        - поръчки
 * - {schema_name}.receipts      - бележки
 * - {schema_name}.audit_logs    - одит логове
 * - {schema_name}.webhook_logs  - логове на webhooks
 * - {schema_name}.sync_state    - състояние на синхронизация
 * - {schema_name}.monthly_usage - месечна статистика
 * - {schema_name}.pending_refunds - чакащи рефунди
 *
 * Споделени таблици (в public schema) - САМО за маршрутизация:
 * - store_connections (site_id -> schema_name mapping)
 * - wix_tokens (Wix API токени)
 *
 * PRICING:
 * - €5/месец до 50 поръчки
 * - €15/месец до 300 поръчки
 * - €15/месец + €0.10/поръчка (corporate, над 300)
 * - Trial: 10 дни, изисква карта
 */

import { sql } from "@/lib/sql";

// =============================================================================
// SCHEMA CACHE & LOOKUP
// =============================================================================

// In-memory cache for schema lookups (siteId -> schemaName)
const schemaCache = new Map<string, string>();

/**
 * Взима schema name за даден siteId от базата или кеша
 * Автоматично поправя липсващи schema_name стойности
 * Връща null ако schema не е намерена (вместо да хвърля грешка)
 */
export async function getSchemaForSite(siteId: string): Promise<string | null> {
  // Check cache first
  const cached = schemaCache.get(siteId);
  if (cached) {
    return cached;
  }

  // Lookup from store_connections
  const result = await sql.query(`
    SELECT id, schema_name FROM store_connections WHERE site_id = $1 LIMIT 1
  `, [siteId]);

  if (result.rows.length > 0 && result.rows[0].schema_name) {
    const schemaName = result.rows[0].schema_name;
    schemaCache.set(siteId, schemaName);
    return schemaName;
  }

  // AUTO-FIX: If store_connection exists but schema_name is NULL, try to find and fix it
  if (result.rows.length > 0 && !result.rows[0].schema_name) {
    const connectionId = result.rows[0].id;
    const expectedSchema = `site_${normalizeSiteId(siteId)}`;

    // Check if schema actually exists in PostgreSQL
    const schemaExists = await sql.query(`
      SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1
    `, [expectedSchema]);

    if (schemaExists.rows.length > 0) {
      // Schema exists! Auto-fix the store_connection
      await sql.query(`
        UPDATE store_connections SET schema_name = $1 WHERE id = $2
      `, [expectedSchema, connectionId]);
      console.log(`[getSchemaForSite] AUTO-FIXED: Set schema_name=${expectedSchema} for site ${siteId}`);
      schemaCache.set(siteId, expectedSchema);
      return expectedSchema;
    }
  }

  // Fallback: try companies table (legacy)
  try {
    const companyResult = await sql.query(`
      SELECT schema_name FROM companies WHERE site_id = $1 LIMIT 1
    `, [siteId]);

    if (companyResult.rows.length > 0 && companyResult.rows[0].schema_name) {
      const schemaName = companyResult.rows[0].schema_name;
      schemaCache.set(siteId, schemaName);

      // Also fix store_connections if it exists
      if (result.rows.length > 0) {
        await sql.query(`
          UPDATE store_connections SET schema_name = $1 WHERE site_id = $2 AND schema_name IS NULL
        `, [schemaName, siteId]);
        console.log(`[getSchemaForSite] AUTO-FIXED from companies table: ${schemaName}`);
      }

      return schemaName;
    }
  } catch {
    // companies table might not exist
  }

  // Last resort: check if schema exists by pattern
  const expectedSchema = `site_${normalizeSiteId(siteId)}`;
  const schemaCheck = await sql.query(`
    SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1
  `, [expectedSchema]);

  if (schemaCheck.rows.length > 0) {
    console.log(`[getSchemaForSite] Found orphan schema ${expectedSchema}, caching it`);
    schemaCache.set(siteId, expectedSchema);

    // Try to fix store_connections
    if (result.rows.length > 0) {
      await sql.query(`
        UPDATE store_connections SET schema_name = $1 WHERE site_id = $2
      `, [expectedSchema, siteId]);
      console.log(`[getSchemaForSite] AUTO-FIXED orphan: Set schema_name=${expectedSchema}`);
    }

    return expectedSchema;
  }

  // No schema found - return null (let caller decide what to do)
  return null;
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
export async function getTableName(baseName: string, siteId: string): Promise<string | null> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) return null;
  return `"${schema}"."${baseName}"`;
}

/**
 * Списък на всички tenant-specific таблици
 */
export const TENANT_TABLES = [
  "users",
  "sessions",
  "accounts",
  "company",
  "orders",
  "receipts",
  "webhook_logs",
  "sync_state",
  "monthly_usage",
  "pending_refunds",
  "audit_logs",
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

  // ALWAYS ensure schema_name is set in store_connections
  // First try to update existing row
  const updateResult = await sql.query(`
    UPDATE store_connections
    SET schema_name = COALESCE(schema_name, $2)
    WHERE site_id = $1
    RETURNING id
  `, [siteId, schema]);

  // If no row exists, we need to log this - the row should be created by register API
  if (updateResult.rowCount === 0) {
    console.warn(`[createTenantTables] No store_connection found for site ${siteId}, schema_name not saved to DB`);
    // Still cache it locally for this request
  }

  // Cache it for fast lookup
  schemaCache.set(siteId, schema);
  console.log(`[createTenantTables] Cached schema ${schema} for site ${siteId}`);

  // ==========================================================================
  // USERS TABLE - потребители с достъп до магазина
  // ==========================================================================
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".users (
      id text PRIMARY KEY,
      email text UNIQUE NOT NULL,
      name text,
      password_hash text,
      password_salt text,
      image text,
      email_verified timestamptz,
      role text DEFAULT 'member',
      created_at timestamptz DEFAULT now()
    )
  `);

  // ==========================================================================
  // SESSIONS TABLE - активни сесии
  // ==========================================================================
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".sessions (
      id bigserial PRIMARY KEY,
      user_id text NOT NULL REFERENCES "${schema}".users(id) ON DELETE CASCADE,
      session_token text UNIQUE NOT NULL,
      expires_at timestamptz NOT NULL,
      created_at timestamptz DEFAULT now()
    )
  `);

  await sql.query(`
    CREATE INDEX IF NOT EXISTS sessions_token_idx ON "${schema}".sessions (session_token)
  `);

  // ==========================================================================
  // ACCOUNTS TABLE - OAuth акаунти (Google)
  // ==========================================================================
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".accounts (
      id text PRIMARY KEY,
      user_id text NOT NULL REFERENCES "${schema}".users(id) ON DELETE CASCADE,
      type text NOT NULL,
      provider text NOT NULL,
      provider_account_id text NOT NULL,
      refresh_token text,
      access_token text,
      expires_at bigint,
      token_type text,
      scope text,
      id_token text,
      session_state text,
      UNIQUE(provider, provider_account_id)
    )
  `);

  // ==========================================================================
  // COMPANY TABLE - фирмени данни (един ред на магазин)
  // ==========================================================================
  await sql.query(`
    CREATE TABLE IF NOT EXISTS "${schema}".company (
      id bigserial PRIMARY KEY,
      site_id text UNIQUE,
      instance_id text,
      store_name text,
      store_domain text,
      legal_name text,
      vat_number text,
      bulstat text,
      store_id text,
      logo_url text,
      logo_width integer,
      logo_height integer,
      address_line1 text,
      address_line2 text,
      city text,
      postal_code text,
      country text DEFAULT 'BG',
      email text,
      phone text,
      iban text,
      bank_name text,
      mol text,
      receipt_template text,
      receipt_number_start bigint DEFAULT 1,
      cod_receipts_enabled boolean DEFAULT false,
      receipts_start_date timestamptz,
      accent_color text DEFAULT 'green',
      trial_ends_at timestamptz,
      subscription_status text DEFAULT 'trial',
      plan_id text DEFAULT 'starter',
      subscription_expires_at timestamptz,
      stripe_customer_id text,
      stripe_subscription_id text,
      stripe_payment_method_id text,
      onboarding_completed boolean DEFAULT false,
      onboarding_step integer DEFAULT 0,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    )
  `);

  // Insert initial company row with site_id
  await sql.query(`
    INSERT INTO "${schema}".company (site_id, trial_ends_at)
    VALUES ($1, NOW() + INTERVAL '10 days')
    ON CONFLICT (site_id) DO NOTHING
  `, [siteId]);

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
      return_payment_type integer DEFAULT 2,
      transaction_ref text
    )
  `);

  // Add transaction_ref column if it doesn't exist (for existing tables)
  await sql.query(`
    ALTER TABLE "${schema}".receipts
    ADD COLUMN IF NOT EXISTS transaction_ref text
  `).catch(() => {});

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
    if (!schema) {
      console.log(`No schema found for site: ${siteId}, nothing to drop`);
      return;
    }
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
    if (!schema) return false;

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
  if (!schema) {
    console.error(`[upsertTenantOrder] No schema found for site ${siteId}. Creating tenant tables...`);
    await createTenantTables(siteId);
    const newSchema = await getSchemaForSite(siteId);
    if (!newSchema) {
      throw new Error(`Failed to create tenant schema for site ${siteId}`);
    }
    return upsertTenantOrder(siteId, order); // Retry with new schema
  }

  const createdAt = order.createdAt ? new Date(order.createdAt).toISOString() : null;
  const updatedAt = order.updatedAt ? new Date(order.updatedAt).toISOString() : null;
  const paidAt = order.paidAt ? new Date(order.paidAt).toISOString() : null;
  const isSynced = order.isSynced ?? false;

  // CRITICAL FIX: Extract totals from raw JSON as fallback when direct values are null
  // This ensures we never lose financial data even if the webhook payload structure varies
  const raw = order.raw || {};
  const priceSummary = raw?.priceSummary || raw?.totals || raw?.payNow || raw?.balanceSummary || {};

  const extractAmount = (value: any): number | null => {
    if (value == null) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value.replace(',', '.'));
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof value === 'object') {
      const amount = value?.amount ?? value?.value ?? value?.total ?? null;
      if (amount != null) return extractAmount(amount);
    }
    return null;
  };

  // Use order values if present, otherwise extract from raw
  const total = order.total ?? extractAmount(priceSummary?.total ?? priceSummary?.totalAmount ?? priceSummary?.paid);
  const subtotal = order.subtotal ?? extractAmount(priceSummary?.subtotal);
  const taxTotal = order.taxTotal ?? extractAmount(priceSummary?.tax ?? priceSummary?.taxAmount);
  const shippingTotal = order.shippingTotal ?? extractAmount(priceSummary?.shipping ?? priceSummary?.shippingAmount);
  const discountTotal = order.discountTotal ?? extractAmount(priceSummary?.discount?.amount ?? priceSummary?.discount);
  const currency = order.currency ?? priceSummary?.currency ?? raw?.currency ?? 'EUR';

  // Also extract customer info from raw if missing
  const buyerInfo = raw?.buyerInfo || raw?.buyer || raw?.customerInfo || {};
  const billingContact = raw?.billingInfo?.contactDetails || raw?.billingInfo || {};
  const customerName = order.customerName ||
    [buyerInfo?.firstName, buyerInfo?.lastName].filter(Boolean).join(' ') ||
    [billingContact?.firstName, billingContact?.lastName].filter(Boolean).join(' ') ||
    null;
  const customerEmail = order.customerEmail || buyerInfo?.email || billingContact?.email || null;

  // Debug log if we're using fallback extraction
  if (order.total == null && total != null) {
    console.log(`[upsertTenantOrder] Order ${order.number}: Using fallback total extraction: ${total} ${currency}`);
  }

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
    currency, // Use extracted value with fallback
    subtotal, // Use extracted value with fallback
    taxTotal, // Use extracted value with fallback
    shippingTotal, // Use extracted value with fallback
    discountTotal, // Use extracted value with fallback
    total, // Use extracted value with fallback
    customerEmail, // Use extracted value with fallback
    customerName, // Use extracted value with fallback
    order.source,
    isSynced,
    JSON.stringify(order.raw),
  ]);
}

export async function getTenantOrderById(siteId: string, orderId: string): Promise<any | null> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) return null;

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
  if (!schema) return [];
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let query = `SELECT * FROM "${schema}".orders`;
  const params: any[] = [];
  const conditions: string[] = [];

  // Filter: exclude CANCELED orders, but show archived orders that are not canceled
  conditions.push(`(status IS NULL OR UPPER(status) NOT IN ('CANCELED', 'CANCELLED'))`);
  conditions.push(`(status IS NULL OR LOWER(status) NOT LIKE 'archiv%')`);

  if (options?.startDate) {
    params.push(options.startDate);
    conditions.push(`created_at >= $${params.length}`);
  }

  if (options?.endDate) {
    params.push(options.endDate);
    conditions.push(`created_at <= $${params.length}`);
  }

  query += ` WHERE ${conditions.join(' AND ')}`;
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
  if (!schema) return 0;

  let query = `SELECT COUNT(*) as count FROM "${schema}".orders`;
  const params: any[] = [];
  const conditions: string[] = [];

  // Filter: exclude CANCELED orders, but show archived orders that are not canceled
  conditions.push(`(status IS NULL OR UPPER(status) NOT IN ('CANCELED', 'CANCELLED'))`);
  conditions.push(`(status IS NULL OR LOWER(status) NOT LIKE 'archiv%')`);

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

  query += ` WHERE ${conditions.join(' AND ')}`;

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
  if (!schema) {
    return {
      totalOrders: 0,
      syncedOrders: 0,
      newOrders: 0,
      totalReceipts: 0,
      saleReceipts: 0,
      refundReceipts: 0,
      currentMonthUsage: { ordersCount: 0, receiptsCount: 0 },
    };
  }

  // Count orders (exclude CANCELED, but show archived non-canceled orders)
  const ordersResult = await sql.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_synced = true) as synced,
      COUNT(*) FILTER (WHERE is_synced = false) as new
    FROM "${schema}".orders
    WHERE (status IS NULL OR UPPER(status) NOT IN ('CANCELED', 'CANCELLED'))
      AND (status IS NULL OR LOWER(status) NOT LIKE 'archiv%')
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
  transactionRef?: string | null;
}

export async function getNextTenantReceiptId(siteId: string): Promise<number> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) {
    throw new Error(`No schema found for site ${siteId}`);
  }

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
  if (!schema) {
    throw new Error(`No schema found for site ${siteId}`);
  }
  const type = receipt.type ?? 'sale';
  const issuedAt = receipt.issuedAt ? new Date(receipt.issuedAt).toISOString() : new Date().toISOString();

  try {
    const result = await sql.query(`
      INSERT INTO "${schema}".receipts (
        id, order_id, issued_at, payload, type,
        reference_receipt_id, refund_amount, return_payment_type, transaction_ref
      )
      SELECT
        COALESCE(MAX(id), 0) + 1,
        $1, $2, $3, $4, $5, $6, $7, $8
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
      receipt.transactionRef ?? null,
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
  if (!schema) return null;

  const result = await sql.query(`
    SELECT * FROM "${schema}".receipts WHERE id = $1 LIMIT 1
  `, [receiptId]);

  return result.rows[0] || null;
}

export async function getTenantSaleReceiptByOrderId(siteId: string, orderId: string): Promise<any | null> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) return null;

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
  if (!schema) return [];
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
  if (!schema) return 0;

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
  if (!schema) return false;

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
  if (!schema) {
    console.warn(`[logTenantWebhook] No schema for site ${siteId}, skipping log`);
    return;
  }

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
  if (!schema) return false;

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
  if (!schema) return null;

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
  if (!schema) {
    console.warn(`[updateTenantSyncState] No schema for site ${siteId}`);
    return;
  }

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
  if (!schema) {
    console.warn(`[incrementTenantOrderCount] No schema for site ${siteId}`);
    return;
  }
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
  if (!schema) {
    console.warn(`[incrementTenantReceiptCount] No schema for site ${siteId}`);
    return;
  }
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
  if (!schema) {
    return { ordersCount: 0, receiptsCount: 0 };
  }
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
  if (!schema) {
    throw new Error(`No schema found for site ${siteId}`);
  }

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
  if (!schema) return [];

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
  if (!schema) return;

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
  if (!schema) return;

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
  if (!schema) return false;

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
  if (!schema) {
    console.warn(`[logAuditEvent] No schema for site ${siteId}, skipping audit log`);
    return;
  }

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
  if (!schema) return [];
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

// =============================================================================
// TENANT USERS (за NextAuth)
// =============================================================================

export interface TenantUser {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  emailVerified?: Date | null;
  role?: string;
}

export async function createTenantUser(siteId: string, user: Omit<TenantUser, 'id'>): Promise<TenantUser> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) {
    throw new Error(`No schema found for site ${siteId}`);
  }

  const id = crypto.randomUUID();
  await sql.query(`
    INSERT INTO "${schema}".users (id, email, name, image, email_verified, role)
    VALUES ($1, $2, $3, $4, $5, $6)
  `, [id, user.email, user.name ?? null, user.image ?? null, user.emailVerified?.toISOString() ?? null, user.role ?? 'member']);

  return {
    id,
    email: user.email,
    name: user.name ?? null,
    image: user.image ?? null,
    emailVerified: user.emailVerified ?? null,
    role: user.role ?? 'member',
  };
}

export async function getTenantUser(siteId: string, userId: string): Promise<TenantUser | null> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) return null;

  const result = await sql.query(`
    SELECT * FROM "${schema}".users WHERE id = $1
  `, [userId]);

  if (result.rows.length === 0) return null;
  const user = result.rows[0];
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    image: user.image ?? null,
    emailVerified: user.email_verified ? new Date(user.email_verified) : null,
    role: user.role ?? 'member',
  };
}

export async function getTenantUserByEmail(siteId: string, email: string): Promise<TenantUser | null> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) return null;

  const result = await sql.query(`
    SELECT * FROM "${schema}".users WHERE email = $1
  `, [email]);

  if (result.rows.length === 0) return null;
  const user = result.rows[0];
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    image: user.image ?? null,
    emailVerified: user.email_verified ? new Date(user.email_verified) : null,
    role: user.role ?? 'member',
  };
}

export async function updateTenantUser(siteId: string, userId: string, data: Partial<TenantUser>): Promise<TenantUser | null> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) return null;

  const result = await sql.query(`
    UPDATE "${schema}".users
    SET email = COALESCE($2, email),
        name = COALESCE($3, name),
        image = COALESCE($4, image),
        email_verified = COALESCE($5, email_verified),
        role = COALESCE($6, role)
    WHERE id = $1
    RETURNING *
  `, [userId, data.email ?? null, data.name ?? null, data.image ?? null, data.emailVerified?.toISOString() ?? null, data.role ?? null]);

  if (result.rows.length === 0) return null;
  const user = result.rows[0];
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    image: user.image ?? null,
    emailVerified: user.email_verified ? new Date(user.email_verified) : null,
    role: user.role ?? 'member',
  };
}

// =============================================================================
// TENANT ACCOUNTS (OAuth - Google)
// =============================================================================

export interface TenantAccount {
  id: string;
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
}

export async function linkTenantAccount(siteId: string, account: TenantAccount): Promise<TenantAccount> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) {
    throw new Error(`No schema found for site ${siteId}`);
  }

  await sql.query(`
    INSERT INTO "${schema}".accounts (id, user_id, type, provider, provider_account_id, refresh_token, access_token, expires_at, token_type, scope, id_token, session_state)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    ON CONFLICT (provider, provider_account_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      expires_at = EXCLUDED.expires_at
  `, [
    account.id,
    account.userId,
    account.type,
    account.provider,
    account.providerAccountId,
    account.refresh_token ?? null,
    account.access_token ?? null,
    account.expires_at ?? null,
    account.token_type ?? null,
    account.scope ?? null,
    account.id_token ?? null,
    account.session_state ?? null,
  ]);

  return account;
}

export async function getTenantUserByAccount(siteId: string, provider: string, providerAccountId: string): Promise<TenantUser | null> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) return null;

  const result = await sql.query(`
    SELECT u.* FROM "${schema}".users u
    JOIN "${schema}".accounts a ON u.id = a.user_id
    WHERE a.provider = $1 AND a.provider_account_id = $2
  `, [provider, providerAccountId]);

  if (result.rows.length === 0) return null;
  const user = result.rows[0];
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    image: user.image ?? null,
    emailVerified: user.email_verified ? new Date(user.email_verified) : null,
    role: user.role ?? 'member',
  };
}

// =============================================================================
// TENANT SESSIONS
// =============================================================================

export interface TenantSession {
  sessionToken: string;
  userId: string;
  expires: Date;
}

export async function createTenantSession(siteId: string, session: TenantSession): Promise<TenantSession> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) {
    throw new Error(`No schema found for site ${siteId}`);
  }

  await sql.query(`
    INSERT INTO "${schema}".sessions (user_id, session_token, expires_at)
    VALUES ($1, $2, $3)
  `, [session.userId, session.sessionToken, session.expires.toISOString()]);

  return session;
}

export async function getTenantSessionAndUser(siteId: string, sessionToken: string): Promise<{ session: TenantSession; user: TenantUser } | null> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) return null;

  const result = await sql.query(`
    SELECT s.*, u.id as user_id, u.email, u.name, u.image, u.email_verified, u.role
    FROM "${schema}".sessions s
    JOIN "${schema}".users u ON s.user_id = u.id
    WHERE s.session_token = $1 AND s.expires_at > NOW()
  `, [sessionToken]);

  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    session: {
      sessionToken: row.session_token,
      userId: row.user_id,
      expires: new Date(row.expires_at),
    },
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name ?? null,
      image: row.image ?? null,
      emailVerified: row.email_verified ? new Date(row.email_verified) : null,
      role: row.role ?? 'member',
    },
  };
}

export async function updateTenantSession(siteId: string, sessionToken: string, expires: Date): Promise<TenantSession | null> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) return null;

  const result = await sql.query(`
    UPDATE "${schema}".sessions SET expires_at = $2
    WHERE session_token = $1
    RETURNING *
  `, [sessionToken, expires.toISOString()]);

  if (result.rows.length === 0) return null;
  return {
    sessionToken: result.rows[0].session_token,
    userId: result.rows[0].user_id,
    expires: new Date(result.rows[0].expires_at),
  };
}

export async function deleteTenantSession(siteId: string, sessionToken: string): Promise<void> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) return;

  await sql.query(`DELETE FROM "${schema}".sessions WHERE session_token = $1`, [sessionToken]);
}

// =============================================================================
// TENANT COMPANY (фирмени данни)
// =============================================================================

export interface TenantCompany {
  siteId: string;
  instanceId?: string | null;
  storeName?: string | null;
  storeDomain?: string | null;
  legalName?: string | null;
  vatNumber?: string | null;
  bulstat?: string | null;
  storeId?: string | null;  // Фискален код - ЗАДЪЛЖИТЕЛЕН
  logoUrl?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postalCode?: string | null;
  country?: string | null;
  email?: string | null;
  phone?: string | null;
  iban?: string | null;
  bankName?: string | null;
  mol?: string | null;
  receiptTemplate?: string | null;
  receiptNumberStart?: number | null;
  codReceiptsEnabled?: boolean | null;
  receiptsStartDate?: Date | null;
  accentColor?: string | null;
  // Billing
  trialEndsAt?: Date | null;
  subscriptionStatus?: string | null;  // trial, active, past_due, expired, cancelled
  planId?: string | null;  // starter, business, corporate
  subscriptionExpiresAt?: Date | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePaymentMethodId?: string | null;
  // Onboarding
  onboardingCompleted?: boolean | null;
  onboardingStep?: number | null;
}

export async function getTenantCompany(siteId: string): Promise<TenantCompany | null> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) return null;

  const result = await sql.query(`
    SELECT * FROM "${schema}".company WHERE site_id = $1 LIMIT 1
  `, [siteId]);

  if (result.rows.length === 0) return null;
  const c = result.rows[0];
  return {
    siteId: c.site_id,
    instanceId: c.instance_id,
    storeName: c.store_name,
    storeDomain: c.store_domain,
    legalName: c.legal_name,
    vatNumber: c.vat_number,
    bulstat: c.bulstat,
    storeId: c.store_id,
    logoUrl: c.logo_url,
    addressLine1: c.address_line1,
    addressLine2: c.address_line2,
    city: c.city,
    postalCode: c.postal_code,
    country: c.country,
    email: c.email,
    phone: c.phone,
    iban: c.iban,
    bankName: c.bank_name,
    mol: c.mol,
    receiptTemplate: c.receipt_template,
    receiptNumberStart: c.receipt_number_start,
    codReceiptsEnabled: c.cod_receipts_enabled,
    receiptsStartDate: c.receipts_start_date ? new Date(c.receipts_start_date) : null,
    accentColor: c.accent_color,
    trialEndsAt: c.trial_ends_at ? new Date(c.trial_ends_at) : null,
    subscriptionStatus: c.subscription_status,
    planId: c.plan_id,
    subscriptionExpiresAt: c.subscription_expires_at ? new Date(c.subscription_expires_at) : null,
    stripeCustomerId: c.stripe_customer_id,
    stripeSubscriptionId: c.stripe_subscription_id,
    stripePaymentMethodId: c.stripe_payment_method_id,
    onboardingCompleted: c.onboarding_completed,
    onboardingStep: c.onboarding_step,
  };
}

export async function updateTenantCompany(siteId: string, data: Partial<TenantCompany>): Promise<TenantCompany | null> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) return null;

  const result = await sql.query(`
    UPDATE "${schema}".company
    SET
      instance_id = COALESCE($2, instance_id),
      store_name = COALESCE($3, store_name),
      store_domain = COALESCE($4, store_domain),
      legal_name = COALESCE($5, legal_name),
      vat_number = COALESCE($6, vat_number),
      bulstat = COALESCE($7, bulstat),
      store_id = COALESCE($8, store_id),
      logo_url = COALESCE($9, logo_url),
      address_line1 = COALESCE($10, address_line1),
      address_line2 = COALESCE($11, address_line2),
      city = COALESCE($12, city),
      postal_code = COALESCE($13, postal_code),
      country = COALESCE($14, country),
      email = COALESCE($15, email),
      phone = COALESCE($16, phone),
      iban = COALESCE($17, iban),
      bank_name = COALESCE($18, bank_name),
      mol = COALESCE($19, mol),
      receipt_template = COALESCE($20, receipt_template),
      receipt_number_start = COALESCE($21, receipt_number_start),
      cod_receipts_enabled = COALESCE($22, cod_receipts_enabled),
      receipts_start_date = COALESCE($23, receipts_start_date),
      accent_color = COALESCE($24, accent_color),
      trial_ends_at = COALESCE($25, trial_ends_at),
      subscription_status = COALESCE($26, subscription_status),
      plan_id = COALESCE($27, plan_id),
      subscription_expires_at = COALESCE($28, subscription_expires_at),
      stripe_customer_id = COALESCE($29, stripe_customer_id),
      stripe_subscription_id = COALESCE($30, stripe_subscription_id),
      stripe_payment_method_id = COALESCE($31, stripe_payment_method_id),
      onboarding_completed = COALESCE($32, onboarding_completed),
      onboarding_step = COALESCE($33, onboarding_step),
      updated_at = NOW()
    WHERE site_id = $1
    RETURNING *
  `, [
    siteId,
    data.instanceId ?? null,
    data.storeName ?? null,
    data.storeDomain ?? null,
    data.legalName ?? null,
    data.vatNumber ?? null,
    data.bulstat ?? null,
    data.storeId ?? null,
    data.logoUrl ?? null,
    data.addressLine1 ?? null,
    data.addressLine2 ?? null,
    data.city ?? null,
    data.postalCode ?? null,
    data.country ?? null,
    data.email ?? null,
    data.phone ?? null,
    data.iban ?? null,
    data.bankName ?? null,
    data.mol ?? null,
    data.receiptTemplate ?? null,
    data.receiptNumberStart ?? null,
    data.codReceiptsEnabled ?? null,
    data.receiptsStartDate?.toISOString() ?? null,
    data.accentColor ?? null,
    data.trialEndsAt?.toISOString() ?? null,
    data.subscriptionStatus ?? null,
    data.planId ?? null,
    data.subscriptionExpiresAt?.toISOString() ?? null,
    data.stripeCustomerId ?? null,
    data.stripeSubscriptionId ?? null,
    data.stripePaymentMethodId ?? null,
    data.onboardingCompleted ?? null,
    data.onboardingStep ?? null,
  ]);

  if (result.rows.length === 0) return null;
  return getTenantCompany(siteId);
}

// =============================================================================
// BILLING HELPERS
// =============================================================================

/**
 * Pricing:
 * - Starter: €5/месец до 50 поръчки
 * - Business: €15/месец до 300 поръчки
 * - Corporate: €15/месец + €0.10/поръчка (над 300)
 */
export const PRICING = {
  starter: { price: 5, maxOrders: 50 },
  business: { price: 15, maxOrders: 300 },
  corporate: { basePrice: 15, perOrderPrice: 0.10 },
  trialDays: 10,
} as const;

export async function checkAndUpgradePlan(siteId: string): Promise<{ upgraded: boolean; newPlan: string | null }> {
  const schema = await getSchemaForSite(siteId);
  if (!schema) return { upgraded: false, newPlan: null };

  const company = await getTenantCompany(siteId);
  if (!company) return { upgraded: false, newPlan: null };

  const usage = await getTenantMonthlyUsage(siteId);
  const currentPlan = company.planId ?? 'starter';

  let newPlan: string | null = null;

  if (currentPlan === 'starter' && usage.ordersCount > PRICING.starter.maxOrders) {
    newPlan = 'business';
  } else if (currentPlan === 'business' && usage.ordersCount > PRICING.business.maxOrders) {
    newPlan = 'corporate';
  }

  if (newPlan) {
    await updateTenantCompany(siteId, { planId: newPlan });
    return { upgraded: true, newPlan };
  }

  return { upgraded: false, newPlan: null };
}

export async function isSubscriptionActive(siteId: string): Promise<boolean> {
  const company = await getTenantCompany(siteId);
  if (!company) return false;

  const status = company.subscriptionStatus;
  if (status === 'active') return true;
  if (status === 'trial' && company.trialEndsAt && company.trialEndsAt > new Date()) return true;

  return false;
}

export async function canIssueReceipts(siteId: string): Promise<{ allowed: boolean; reason?: string }> {
  const company = await getTenantCompany(siteId);
  if (!company) return { allowed: false, reason: 'Магазинът не е конфигуриран' };

  if (!company.onboardingCompleted) {
    return { allowed: false, reason: 'Моля, завършете onboarding процеса' };
  }

  if (!company.storeId) {
    return { allowed: false, reason: 'Липсва код на търговски обект (store_id)' };
  }

  const isActive = await isSubscriptionActive(siteId);
  if (!isActive) {
    return { allowed: false, reason: 'Абонаментът е изтекъл. Моля, подновете плащането.' };
  }

  return { allowed: true };
}
