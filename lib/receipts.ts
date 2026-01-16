import { sql } from "@vercel/postgres";

/**
 * Get the next receipt ID (MAX + 1, not using sequence)
 * This ensures deleted receipt numbers can be reused
 */
async function getNextReceiptId(): Promise<number> {
  const result = await sql`SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM receipts`;
  return result.rows[0].next_id;
}

export async function issueReceipt(params: {
  orderId: string;
  payload: unknown;
  businessId?: string | null;
  issuedAt?: string | null;
}) {
  const businessId =
    params.businessId ??
    null;
  const issuedAt = params.issuedAt ? new Date(params.issuedAt).toISOString() : null;

  // Check if sale receipt already exists for this order
  const existing = await sql`
    select id from receipts
    where order_id = ${params.orderId}
      and type = 'sale'
    limit 1;
  `;

  if (existing.rows.length > 0) {
    // Sale receipt already exists, don't create duplicate
    return;
  }

  // Get next ID (MAX + 1) instead of using sequence
  const nextId = await getNextReceiptId();

  await sql`
    insert into receipts (id, order_id, business_id, issued_at, status, payload, type)
    values (
      ${nextId},
      ${params.orderId},
      ${businessId},
      ${issuedAt},
      ${"issued"},
      ${JSON.stringify(params.payload)},
      ${"sale"}
    );
  `;
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
}) {
  const businessId = params.businessId ?? null;
  const issuedAt = params.issuedAt ? new Date(params.issuedAt).toISOString() : null;

  // Get the original sale receipt to reference it
  const originalReceipt = await sql`
    select id from receipts
    where order_id = ${params.orderId}
      and type = 'sale'
    limit 1;
  `;
  const referenceReceiptId = originalReceipt.rows[0]?.id ?? null;

  // Check if refund receipt already exists for this order
  const existingRefund = await sql`
    select id from receipts
    where order_id = ${params.orderId}
      and type = 'refund'
    limit 1;
  `;

  if (existingRefund.rows.length > 0) {
    // Refund receipt already exists, don't create duplicate
    return { created: false, receiptId: existingRefund.rows[0].id };
  }

  // Create the refund receipt with negative amount in payload
  const refundPayload = {
    ...(params.payload as object),
    total: -Math.abs(params.refundAmount),
    isRefund: true,
    originalReceiptId: referenceReceiptId,
  };

  // Get next ID (MAX + 1) instead of using sequence
  const nextId = await getNextReceiptId();

  await sql`
    insert into receipts (id, order_id, business_id, issued_at, status, payload, type, reference_receipt_id, refund_amount)
    values (
      ${nextId},
      ${params.orderId},
      ${businessId},
      ${issuedAt},
      ${"issued"},
      ${JSON.stringify(refundPayload)},
      ${"refund"},
      ${referenceReceiptId},
      ${-Math.abs(params.refundAmount)}
    );
  `;

  return { created: true, receiptId: nextId };
}

/**
 * Count receipts for a period and site
 */
export async function countReceiptsForPeriodForSite(
  startIso: string,
  endIso: string,
  siteId: string
): Promise<number> {
  const result = await sql`
    SELECT COUNT(*) as total
    FROM receipts r
    LEFT JOIN orders o ON o.id = r.order_id
    WHERE o.site_id = ${siteId}
      AND r.issued_at BETWEEN ${startIso} AND ${endIso}
  `;
  return Number(result.rows[0]?.total ?? 0);
}

/**
 * Check if a refund receipt already exists for an order.
 */
export async function hasRefundReceipt(orderId: string): Promise<boolean> {
  const result = await sql`
    select 1 from receipts
    where order_id = ${orderId}
      and type = 'refund'
    limit 1;
  `;
  return result.rows.length > 0;
}

/**
 * Get the original sale receipt for an order.
 */
export async function getSaleReceiptByOrderId(orderId: string) {
  const result = await sql`
    select id, issued_at, payload, type
    from receipts
    where order_id = ${orderId}
      and type = 'sale'
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function getReceiptByOrderId(orderId: string) {
  const result = await sql`
    select id, issued_at, payload
    from receipts
    where order_id = ${orderId}
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function getReceiptByOrderIdAndType(orderId: string, type: string) {
  const result = await sql`
    select id, issued_at, payload, type, refund_amount, reference_receipt_id, return_payment_type
    from receipts
    where order_id = ${orderId}
      and type = ${type}
    limit 1;
  `;
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
  const result = await sql`
    select receipts.order_id,
      receipts.id as receipt_id,
      receipts.issued_at,
      receipts.status,
      receipts.payload,
      receipts.type as receipt_type,
      receipts.reference_receipt_id,
      receipts.refund_amount,
      orders.number as order_number,
      orders.customer_name,
      orders.total,
      orders.currency
    from receipts
    left join orders on orders.id = receipts.order_id
    where orders.site_id = ${siteId}
    order by receipts.id desc
    limit ${limit};
  `;
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
  const result = await sql`
    select receipts.order_id,
      receipts.id as receipt_id,
      receipts.issued_at,
      receipts.status,
      receipts.payload,
      receipts.type as receipt_type,
      receipts.reference_receipt_id,
      receipts.refund_amount,
      orders.number as order_number,
      orders.customer_name,
      orders.total,
      orders.currency,
      orders.raw as order_raw
    from receipts
    left join orders on orders.id = receipts.order_id
    where (orders.site_id = ${siteId})
      and receipts.issued_at between ${startIso} and ${endIso}
    order by receipts.id desc;
  `;
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
  const result = await sql`
    select
      orders.id,
      orders.number,
      orders.created_at,
      orders.paid_at,
      orders.total,
      orders.currency,
      orders.customer_name,
      orders.customer_email,
      orders.status,
      orders.payment_status,
      sale_receipts.id as receipt_id,
      sale_receipts.issued_at as receipt_issued_at,
      sale_receipts.type as receipt_type
    from receipts as sale_receipts
    inner join orders on orders.id = sale_receipts.order_id
    where (orders.site_id = ${siteId})
      and sale_receipts.type = 'sale'
      and sale_receipts.issued_at between ${startIso} and ${endIso}
    order by sale_receipts.id desc;
  `;
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
  const result = await sql`
    select
      orders.id,
      orders.number,
      orders.created_at,
      orders.paid_at,
      orders.total,
      orders.currency,
      orders.raw,
      refund_receipts.id as receipt_id,
      refund_receipts.issued_at as receipt_issued_at,
      refund_receipts.refund_amount,
      refund_receipts.reference_receipt_id,
      refund_receipts.return_payment_type
    from receipts as refund_receipts
    inner join orders on orders.id = refund_receipts.order_id
    where (orders.site_id = ${siteId})
      and refund_receipts.type = 'refund'
      and refund_receipts.issued_at between ${startIso} and ${endIso}
    order by refund_receipts.id asc;
  `;
  return result.rows;
}
