import { sql } from "@vercel/postgres";

export type StoredOrder = {
  id: string;
  siteId: string | null;
  number: string | null;
  status: string | null;
  paymentStatus: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  paidAt: string | null;
  currency: string | null;
  subtotal: string | null;
  taxTotal: string | null;
  shippingTotal: string | null;
  discountTotal: string | null;
  total: string | null;
  customerEmail: string | null;
  customerName: string | null;
  source: "webhook" | "backfill";
  raw: unknown;
};

export async function initDb() {
  await sql`
    create table if not exists orders (
      id text primary key,
      site_id text,
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
      raw jsonb,
      inserted_at timestamptz default now()
    );
  `;

  await sql`
    create table if not exists backfill_runs (
      id bigserial primary key,
      started_at timestamptz default now(),
      finished_at timestamptz,
      status text,
      start_date text,
      notes text
    );
  `;

  await sql`
    create table if not exists wix_tokens (
      id bigserial primary key,
      instance_id text,
      site_id text,
      access_token text,
      refresh_token text,
      expires_at timestamptz,
      created_at timestamptz default now()
    );
  `;
}

export async function upsertOrder(order: StoredOrder) {
  const createdAt = order.createdAt
    ? new Date(order.createdAt).toISOString()
    : null;
  const updatedAt = order.updatedAt
    ? new Date(order.updatedAt).toISOString()
    : null;
  const paidAt = order.paidAt ? new Date(order.paidAt).toISOString() : null;
  const subtotal = order.subtotal ? Number(order.subtotal) : null;
  const taxTotal = order.taxTotal ? Number(order.taxTotal) : null;
  const shippingTotal = order.shippingTotal ? Number(order.shippingTotal) : null;
  const discountTotal = order.discountTotal ? Number(order.discountTotal) : null;
  const total = order.total ? Number(order.total) : null;

  await sql`
    insert into orders (
      id,
      site_id,
      number,
      status,
      payment_status,
      created_at,
      updated_at,
      paid_at,
      currency,
      subtotal,
      tax_total,
      shipping_total,
      discount_total,
      total,
      customer_email,
      customer_name,
      source,
      raw
    ) values (
      ${order.id},
      ${order.siteId},
      ${order.number},
      ${order.status},
      ${order.paymentStatus},
      ${createdAt},
      ${updatedAt},
      ${paidAt},
      ${order.currency},
      ${subtotal},
      ${taxTotal},
      ${shippingTotal},
      ${discountTotal},
      ${total},
      ${order.customerEmail},
      ${order.customerName},
      ${order.source},
      ${JSON.stringify(order.raw)}
    )
    on conflict (id) do update set
      site_id = excluded.site_id,
      number = excluded.number,
      status = excluded.status,
      payment_status = excluded.payment_status,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      paid_at = excluded.paid_at,
      currency = excluded.currency,
      subtotal = excluded.subtotal,
      tax_total = excluded.tax_total,
      shipping_total = excluded.shipping_total,
      discount_total = excluded.discount_total,
      total = excluded.total,
      customer_email = excluded.customer_email,
      customer_name = excluded.customer_name,
      source = excluded.source,
      raw = excluded.raw
  `;
}

export async function saveWixTokens(params: {
  instanceId?: string | null;
  siteId?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
}) {
  const expiresAt = params.expiresAt
    ? new Date(params.expiresAt).toISOString()
    : null;
  await sql`
    insert into wix_tokens (
      instance_id,
      site_id,
      access_token,
      refresh_token,
      expires_at
    ) values (
      ${params.instanceId ?? null},
      ${params.siteId ?? null},
      ${params.accessToken ?? null},
      ${params.refreshToken ?? null},
      ${expiresAt}
    );
  `;
}

export async function getLatestWixToken() {
  const result = await sql`
    select instance_id, site_id, access_token, refresh_token, expires_at
    from wix_tokens
    order by created_at desc
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function listRecentOrders(limit = 10) {
  const result = await sql`
    select id, number, payment_status, created_at, total, currency, source
    from orders
    order by created_at desc nulls last
    limit ${limit};
  `;
  return result.rows;
}

export async function listOrdersForPeriod(startIso: string, endIso: string) {
  const result = await sql`
    select id, number, created_at, paid_at, total, currency, customer_name, customer_email
    from orders
    where (paid_at between ${startIso} and ${endIso})
       or (paid_at is null and created_at between ${startIso} and ${endIso})
    order by created_at asc nulls last;
  `;
  return result.rows;
}
