import { sql } from "@vercel/postgres";

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
  await sql`
    insert into receipts (order_id, business_id, issued_at, status, payload)
    values (
      ${params.orderId},
      ${businessId},
      ${issuedAt},
      ${"issued"},
      ${JSON.stringify(params.payload)}
    )
    on conflict (order_id) do nothing;
  `;
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
       or lower(orders.status) not like 'cancel%')
      and (orders.status is null
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
      orders.number as order_number,
      orders.customer_name,
      orders.total,
      orders.currency
    from receipts
    left join orders on orders.id = receipts.order_id
    where orders.site_id = ${siteId}
      and (orders.status is null
        or lower(orders.status) not like 'cancel%')
      and (orders.status is null
        or lower(orders.status) not like 'archiv%')
    order by coalesce(orders.paid_at, receipts.issued_at) desc nulls last
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
        or lower(orders.status) not like 'cancel%')
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
        or lower(orders.status) not like 'cancel%')
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
      orders.number as order_number,
      orders.customer_name,
      orders.total,
      orders.currency
    from receipts
    left join orders on orders.id = receipts.order_id
    where orders.site_id = ${siteId}
      and orders.paid_at between ${startIso} and ${endIso}
      and (orders.status is null
        or lower(orders.status) not like 'cancel%')
      and (orders.status is null
        or lower(orders.status) not like 'archiv%')
    order by coalesce(orders.paid_at, receipts.issued_at) desc nulls last;
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
        or lower(orders.status) not like 'cancel%')
      and (orders.status is null
        or lower(orders.status) not like 'archiv%')
    order by coalesce(orders.paid_at, receipts.issued_at) desc nulls last;
  `;
  return result.rows;
}
