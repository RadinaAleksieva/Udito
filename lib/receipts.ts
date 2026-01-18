import { sql } from "@/lib/supabase-sql";
import {
  issueTenantReceipt,
  getTenantSaleReceiptByOrderId,
  listTenantReceipts,
  countTenantReceipts,
  TenantReceipt,
  normalizeSiteId,
} from "./tenant-db";

// Legacy getNextReceiptId removed - using tenant tables now

export async function issueReceipt(params: {
  orderId: string;
  payload: unknown;
  businessId?: string | null;
  issuedAt?: string | null;
  siteId?: string | null;
}): Promise<{ created: boolean; receiptId: number | null }> {
  const issuedAt = params.issuedAt ? new Date(params.issuedAt).toISOString() : null;

  // Get siteId - required for tenant tables
  const siteId = params.siteId ?? (params.payload as any)?.site_id ?? (params.payload as any)?.siteId ?? null;

  if (!siteId) {
    throw new Error("siteId is required for issuing receipts");
  }

  const tenantReceipt: TenantReceipt = {
    orderId: params.orderId,
    payload: params.payload,
    type: 'sale',
    issuedAt: issuedAt,
  };

  const result = await issueTenantReceipt(siteId, tenantReceipt);
  console.log("✅ Receipt saved to tenant table:", params.orderId, "created:", result.created);

  return result;
}

/**
 * Issue a refund receipt (сторно бележка) for an order.
 * This creates a new receipt with the next sequential number,
 * negative amount, and reference to the original receipt.
 */
export async function issueRefundReceipt(params: {
  orderId: string;
  payload: unknown;
  businessId?: string | null;
  issuedAt?: string | null;
  refundAmount: number;
  siteId?: string | null;
}) {
  const issuedAt = params.issuedAt ? new Date(params.issuedAt).toISOString() : null;

  // Get siteId - required for tenant tables
  const siteId = params.siteId ?? (params.payload as any)?.site_id ?? (params.payload as any)?.siteId ?? null;

  if (!siteId) {
    throw new Error("siteId is required for issuing refund receipts");
  }

  // Get the original sale receipt to reference it (from tenant table)
  const originalReceipt = await getTenantSaleReceiptByOrderId(siteId, params.orderId);
  const referenceReceiptId = originalReceipt?.id ?? null;

  // Create the refund receipt with negative amount in payload
  const refundPayload = {
    ...(params.payload as object),
    total: -Math.abs(params.refundAmount),
    isRefund: true,
    originalReceiptId: referenceReceiptId,
  };

  const tenantReceipt: TenantReceipt = {
    orderId: params.orderId,
    payload: refundPayload,
    type: 'refund',
    issuedAt: issuedAt,
    referenceReceiptId: referenceReceiptId,
    refundAmount: -Math.abs(params.refundAmount),
  };

  const result = await issueTenantReceipt(siteId, tenantReceipt);
  console.log("✅ Refund receipt saved to tenant table:", params.orderId, "created:", result.created);

  return result;
}

/**
 * Count receipts for a period and site
 */
export async function countReceiptsForPeriodForSite(
  startIso: string,
  endIso: string,
  siteId: string
): Promise<number> {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT COUNT(*) as total
    FROM receipts_${n}
    WHERE issued_at BETWEEN $1 AND $2
  `, [startIso, endIso]);

  return Number(result.rows[0]?.total ?? 0);
}

/**
 * Check if a refund receipt already exists for an order.
 * Now requires siteId for tenant tables.
 */
export async function hasRefundReceipt(siteId: string, orderId: string): Promise<boolean> {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT 1 FROM receipts_${n}
    WHERE order_id = $1
      AND type = 'refund'
    LIMIT 1
  `, [orderId]);

  return result.rows.length > 0;
}

/**
 * Get the original sale receipt for an order.
 * Now requires siteId for tenant tables.
 */
export async function getSaleReceiptByOrderId(siteId: string, orderId: string) {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT id, issued_at, payload, type
    FROM receipts_${n}
    WHERE order_id = $1
      AND type = 'sale'
    LIMIT 1
  `, [orderId]);

  return result.rows[0] ?? null;
}

export async function getReceiptByOrderId(siteId: string, orderId: string) {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT id, issued_at, payload
    FROM receipts_${n}
    WHERE order_id = $1
    LIMIT 1
  `, [orderId]);

  return result.rows[0] ?? null;
}

export async function getReceiptByOrderIdAndType(siteId: string, orderId: string, type: string) {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT id, issued_at, payload, type, refund_amount, reference_receipt_id, return_payment_type
    FROM receipts_${n}
    WHERE order_id = $1
      AND type = $2
    LIMIT 1
  `, [orderId, type]);

  return result.rows[0] ?? null;
}

export async function listRecentReceipts(limit = 20) {
  const result = await sql`
    select id as receipt_id, order_id, issued_at, status, payload
    from receipts
    order by issued_at desc
    limit ${limit};
  `;
  return result.rows;
}

export async function listReceiptsForPeriod(startIso: string, endIso: string) {
  const result = await sql`
    select id as receipt_id, order_id, issued_at, status, payload
    from receipts
    where issued_at between ${startIso} and ${endIso}
    order by issued_at desc;
  `;
  return result.rows;
}

export async function listReceiptsWithOrders(limit = 200) {
  const result = await sql`
    select receipts.order_id,
      receipts.id as receipt_id,
      receipts.issued_at,
      receipts.status,
      receipts.payload,
      orders.number as order_number,
      orders.customer_name,
      orders.total,
      orders.currency
    from receipts
    left join orders on orders.id = receipts.order_id
    where (orders.status is null
       or lower(orders.status) not like 'archiv%')
    order by coalesce(orders.paid_at, receipts.issued_at) desc nulls last
    limit ${limit};
  `;
  return result.rows;
}

export async function listReceiptsWithOrdersForSite(
  siteId: string,
  limit = 200
) {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT r.order_id,
      r.id as receipt_id,
      r.issued_at,
      r.status,
      r.payload,
      r.type as receipt_type,
      r.reference_receipt_id,
      r.refund_amount,
      o.number as order_number,
      o.customer_name,
      o.total,
      o.currency
    FROM receipts_${n} r
    LEFT JOIN orders_${n} o ON o.id = r.order_id
    ORDER BY r.id DESC
    LIMIT $1
  `, [limit]);

  return result.rows;
}

export async function listReceiptsWithOrdersForBusiness(
  businessId: string,
  limit = 200
) {
  const result = await sql`
    select receipts.order_id,
      receipts.id as receipt_id,
      receipts.issued_at,
      receipts.status,
      receipts.payload,
      orders.number as order_number,
      orders.customer_name,
      orders.total,
      orders.currency
    from receipts
    left join orders on orders.id = receipts.order_id
    where orders.business_id = ${businessId}
      and (orders.status is null
        or lower(orders.status) not like 'archiv%')
    order by coalesce(orders.paid_at, receipts.issued_at) desc nulls last
    limit ${limit};
  `;
  return result.rows;
}

export async function listReceiptsWithOrdersForPeriod(
  startIso: string,
  endIso: string
) {
  const result = await sql`
    select receipts.order_id,
      receipts.id as receipt_id,
      receipts.issued_at,
      receipts.status,
      receipts.payload,
      orders.number as order_number,
      orders.customer_name,
      orders.total,
      orders.currency
    from receipts
    left join orders on orders.id = receipts.order_id
    where orders.paid_at between ${startIso} and ${endIso}
      and (orders.status is null
        or lower(orders.status) not like 'archiv%')
    order by coalesce(orders.paid_at, receipts.issued_at) desc nulls last;
  `;
  return result.rows;
}

export async function listReceiptsWithOrdersForPeriodForSite(
  startIso: string,
  endIso: string,
  siteId: string
) {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT r.order_id,
      r.id as receipt_id,
      r.issued_at,
      r.status,
      r.payload,
      r.type as receipt_type,
      r.reference_receipt_id,
      r.refund_amount,
      o.number as order_number,
      o.customer_name,
      o.total,
      o.currency,
      o.raw as order_raw
    FROM receipts_${n} r
    LEFT JOIN orders_${n} o ON o.id = r.order_id
    WHERE r.issued_at BETWEEN $1 AND $2
    ORDER BY r.id DESC
  `, [startIso, endIso]);

  return result.rows;
}

export async function listReceiptsWithOrdersForPeriodForBusiness(
  startIso: string,
  endIso: string,
  businessId: string
) {
  const result = await sql`
    select receipts.order_id,
      receipts.id as receipt_id,
      receipts.issued_at,
      receipts.status,
      receipts.payload,
      orders.number as order_number,
      orders.customer_name,
      orders.total,
      orders.currency
    from receipts
    left join orders on orders.id = receipts.order_id
    where orders.business_id = ${businessId}
      and orders.paid_at between ${startIso} and ${endIso}
      and (orders.status is null
        or lower(orders.status) not like 'archiv%')
    order by coalesce(orders.paid_at, receipts.issued_at) desc nulls last;
  `;
  return result.rows;
}

/**
 * Get orders with SALE receipts for audit file generation.
 * Sales go in the <order> section of the audit XML.
 */
export async function listOrdersWithReceiptsForAudit(
  startIso: string,
  endIso: string,
  siteId: string
) {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT
      o.id,
      o.number,
      o.created_at,
      o.paid_at,
      o.total,
      o.currency,
      o.customer_name,
      o.customer_email,
      o.status,
      o.payment_status,
      r.id as receipt_id,
      r.issued_at as receipt_issued_at,
      r.type as receipt_type
    FROM receipts_${n} r
    INNER JOIN orders_${n} o ON o.id = r.order_id
    WHERE r.type = 'sale'
      AND r.issued_at BETWEEN $1 AND $2
    ORDER BY r.id DESC
  `, [startIso, endIso]);

  return result.rows;
}

/**
 * Get REFUND receipts for audit file generation.
 * Refunds go in the <rorder> section of the audit XML.
 */
export async function listRefundReceiptsForAudit(
  startIso: string,
  endIso: string,
  siteId: string
) {
  const n = normalizeSiteId(siteId);

  const result = await sql.query(`
    SELECT
      o.id,
      o.number,
      o.created_at,
      o.paid_at,
      o.total,
      o.currency,
      o.raw,
      r.id as receipt_id,
      r.issued_at as receipt_issued_at,
      r.refund_amount,
      r.reference_receipt_id,
      r.return_payment_type
    FROM receipts_${n} r
    INNER JOIN orders_${n} o ON o.id = r.order_id
    WHERE r.type = 'refund'
      AND r.issued_at BETWEEN $1 AND $2
    ORDER BY r.id ASC
  `, [startIso, endIso]);

  return result.rows;
}

// =============================================================================
// TENANT-SPECIFIC FUNCTIONS
// These functions query tenant-specific tables (receipts_{siteId})
// =============================================================================

/**
 * List receipts from tenant-specific table (not legacy shared table)
 */
export async function listTenantReceiptsForSite(
  siteId: string,
  options?: {
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
    type?: 'sale' | 'refund';
  }
) {
  return listTenantReceipts(siteId, options);
}

/**
 * Count receipts from tenant-specific table (not legacy shared table)
 */
export async function countTenantReceiptsForSite(
  siteId: string,
  options?: {
    startDate?: string;
    endDate?: string;
    type?: 'sale' | 'refund';
  }
) {
  return countTenantReceipts(siteId, options);
}

/**
 * Get sale receipt from tenant-specific table
 */
export async function getTenantSaleReceipt(siteId: string, orderId: string) {
  return getTenantSaleReceiptByOrderId(siteId, orderId);
}
