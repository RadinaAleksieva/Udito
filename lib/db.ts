import { sql } from "@vercel/postgres";

export type StoredOrder = {
  id: string;
  businessId: string | null;
  siteId: string | null;
  number: string | null;
  status: string | null;
  paymentStatus: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  paidAt: string | null;
  currency: string | null;
  subtotal: string | number | null;
  taxTotal: string | number | null;
  shippingTotal: string | number | null;
  discountTotal: string | number | null;
  total: string | number | null;
  customerEmail: string | null;
  customerName: string | null;
  source: "webhook" | "backfill";
  raw: unknown;
};

export type BusinessProfile = {
  businessId: string;
  storeName: string | null;
  legalName: string | null;
  vatNumber: string | null;
  bulstat: string | null;
  storeId?: string | null;
  logoUrl?: string | null;
  logoWidth?: number | null;
  logoHeight?: number | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  iban: string | null;
  bankName: string | null;
  mol: string | null;
  receiptTemplate: string | null;
};

export type CompanyProfile = {
  businessId: string | null;
  siteId: string;
  instanceId: string | null;
  storeName: string | null;
  storeDomain?: string | null;
  legalName: string | null;
  vatNumber: string | null;
  bulstat: string | null;
  storeId?: string | null;
  logoUrl?: string | null;
  logoWidth?: number | null;
  logoHeight?: number | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  iban: string | null;
  bankName: string | null;
  mol: string | null;
  receiptTemplate: string | null;
  receiptNumberStart?: number | null;
  codReceiptsEnabled?: boolean | null;
};

export async function initDb() {
  await sql`
    create table if not exists orders (
      id text primary key,
      business_id text,
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

  // Add transaction_ref column if it doesn't exist (migration)
  await sql`
    alter table orders add column if not exists transaction_ref text;
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
      business_id text,
      instance_id text,
      site_id text,
      access_token text,
      refresh_token text,
      expires_at timestamptz,
      created_at timestamptz default now()
    );
  `;

  await sql`
    create table if not exists sync_state (
      site_id text primary key,
      cursor text,
      status text,
      last_error text,
      updated_at timestamptz default now()
    );
  `;

  await sql`
    create table if not exists receipts (
      id bigserial primary key,
      business_id text,
      order_id text,
      issued_at timestamptz default now(),
      status text,
      payload jsonb
    );
  `;

  // Add refund support columns
  await sql`alter table receipts add column if not exists type text default 'sale';`;
  await sql`alter table receipts add column if not exists reference_receipt_id bigint;`;
  await sql`alter table receipts add column if not exists refund_amount numeric;`;
  await sql`alter table receipts add column if not exists return_payment_type integer default 2;`; // 1=cash, 2=bank, 3=other form, 4=other

  // Drop old unique constraint on order_id (if exists) to allow both sale and refund for same order
  await sql`
    alter table receipts drop constraint if exists receipts_order_id_key;
  `;

  // Create unique index on (order_id, type) to allow one sale and one refund per order
  await sql`
    create unique index if not exists receipts_order_type_idx
    on receipts (order_id, type)
    where type is not null;
  `;

  await sql`
    create table if not exists companies (
      site_id text primary key,
      business_id text,
      instance_id text,
      store_name text,
      store_domain text,
      legal_name text,
      vat_number text,
      bulstat text,
      store_id text,
      logo_url text,
      address_line1 text,
      address_line2 text,
      city text,
      postal_code text,
      country text,
      email text,
      phone text,
      iban text,
      bank_name text,
      mol text,
      receipt_template text,
      updated_at timestamptz default now()
    );
  `;

  await sql`
    alter table companies
    add column if not exists store_domain text;
  `;

  await sql`
    create table if not exists business_profiles (
      business_id text primary key,
      store_name text,
      legal_name text,
      vat_number text,
      bulstat text,
      store_id text,
      logo_url text,
      address_line1 text,
      address_line2 text,
      city text,
      postal_code text,
      country text,
      email text,
      phone text,
      iban text,
      bank_name text,
      mol text,
      receipt_template text,
      updated_at timestamptz default now()
    );
  `;

  await sql`
    create table if not exists businesses (
      id text primary key,
      name text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );
  `;

  await sql`
    create table if not exists users (
      id text primary key,
      email text unique not null,
      password_hash text not null,
      password_salt text not null,
      created_at timestamptz default now()
    );
  `;

  await sql`
    create table if not exists business_users (
      business_id text not null,
      user_id text not null,
      role text,
      created_at timestamptz default now(),
      primary key (business_id, user_id)
    );
  `;

  await sql`
    create table if not exists sessions (
      id bigserial primary key,
      user_id text not null,
      token_hash text unique not null,
      created_at timestamptz default now(),
      expires_at timestamptz
    );
  `;

  await sql`
    create table if not exists store_connections (
      id bigserial primary key,
      business_id text not null,
      site_id text,
      instance_id text,
      provider text default 'wix',
      connected_at timestamptz default now()
    );
  `;

  await sql`
    create table if not exists stripe_connections (
      business_id text primary key,
      stripe_account_id text,
      access_token text,
      refresh_token text,
      status text,
      connected_at timestamptz default now()
    );
  `;

  await sql`alter table orders add column if not exists business_id text;`;
  await sql`create index if not exists orders_business_id_idx on orders (business_id);`;

  await sql`alter table wix_tokens add column if not exists business_id text;`;
  await sql`create index if not exists wix_tokens_business_id_idx on wix_tokens (business_id);`;

  await sql`alter table receipts add column if not exists business_id text;`;
  await sql`create index if not exists receipts_business_id_idx on receipts (business_id);`;

  // Migration: ensure store_id column exists
  await sql`alter table companies add column if not exists store_id text;`;
  // Copy data from fiscal_store_id to store_id if applicable (safe: ignore if fiscal_store_id doesn't exist)
  try {
    await sql`
      update companies
      set store_id = fiscal_store_id
      where store_id is null and fiscal_store_id is not null;
    `;
  } catch (e) {
    // fiscal_store_id column might not exist, which is fine
  }
  await sql`alter table companies add column if not exists logo_url text;`;
  await sql`alter table companies add column if not exists logo_width integer;`;
  await sql`alter table companies add column if not exists logo_height integer;`;
  await sql`alter table business_profiles add column if not exists store_id text;`;
  // Copy data from fiscal_store_id to store_id if applicable (safe: ignore if fiscal_store_id doesn't exist)
  try {
    await sql`
      update business_profiles
      set store_id = fiscal_store_id
      where store_id is null and fiscal_store_id is not null;
    `;
  } catch (e) {
    // fiscal_store_id column might not exist, which is fine
  }
  await sql`alter table business_profiles add column if not exists logo_url text;`;

  await sql`alter table companies add column if not exists business_id text;`;
  await sql`
    create unique index if not exists companies_business_id_key
    on companies (business_id)
    where business_id is not null;
  `;

  // Receipt settings migrations
  await sql`alter table companies add column if not exists receipt_number_start bigint;`;
  await sql`alter table companies add column if not exists cod_receipts_enabled boolean default false;`;
  await sql`alter table companies add column if not exists receipts_start_date timestamptz;`;

  await sql`
    create unique index if not exists store_connections_site_id_key
    on store_connections (site_id)
    where site_id is not null;
  `;
  await sql`
    create unique index if not exists store_connections_instance_id_key
    on store_connections (instance_id)
    where instance_id is not null;
  `;
}

export async function upsertOrder(order: StoredOrder) {
  const normalizeNumber = (value: string | number | null) => {
    if (value == null) return null;
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const createdAt = order.createdAt
    ? new Date(order.createdAt).toISOString()
    : null;
  const updatedAt = order.updatedAt
    ? new Date(order.updatedAt).toISOString()
    : null;
  const paidAt = order.paidAt ? new Date(order.paidAt).toISOString() : null;
  const subtotal = normalizeNumber(order.subtotal);
  const taxTotal = normalizeNumber(order.taxTotal);
  const shippingTotal = normalizeNumber(order.shippingTotal);
  const discountTotal = normalizeNumber(order.discountTotal);
  const total = normalizeNumber(order.total);

  await sql`
    insert into orders (
      id,
      business_id,
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
      ${order.businessId},
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
      business_id = excluded.business_id,
      site_id = excluded.site_id,
      number = excluded.number,
      status = excluded.status,
      payment_status = excluded.payment_status,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      paid_at = CASE
        -- If payment just changed to PAID and we have a new paid_at, use it
        WHEN excluded.payment_status = 'PAID' AND excluded.paid_at IS NOT NULL THEN excluded.paid_at
        -- If payment just changed to PAID but no paid_at, use current time
        WHEN excluded.payment_status = 'PAID' AND orders.paid_at IS NULL THEN NOW()
        -- Otherwise keep existing paid_at
        ELSE COALESCE(excluded.paid_at, orders.paid_at)
      END,
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
  businessId?: string | null;
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
      business_id,
      instance_id,
      site_id,
      access_token,
      refresh_token,
      expires_at
    ) values (
      ${params.businessId ?? null},
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

export async function getLatestWixTokenForSite(params: {
  siteId?: string | null;
  instanceId?: string | null;
  businessId?: string | null;
}) {
  if (!params.siteId && !params.instanceId && !params.businessId) {
    return getLatestWixToken();
  }
  const result = await sql`
    select instance_id, site_id, access_token, refresh_token, expires_at
    from wix_tokens
    where (${params.siteId ?? null}::text is null or site_id = ${params.siteId})
      and (${params.instanceId ?? null}::text is null or instance_id = ${params.instanceId})
      and (${params.businessId ?? null}::text is null or business_id = ${params.businessId})
    order by created_at desc
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function getSyncState(siteId: string) {
  const result = await sql`
    select site_id, cursor, status, last_error, updated_at
    from sync_state
    where site_id = ${siteId}
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function upsertSyncState(params: {
  siteId: string;
  cursor: string | null;
  status: string;
  lastError?: string | null;
}) {
  await sql`
    insert into sync_state (site_id, cursor, status, last_error, updated_at)
    values (
      ${params.siteId},
      ${params.cursor},
      ${params.status},
      ${params.lastError ?? null},
      now()
    )
    on conflict (site_id) do update set
      cursor = excluded.cursor,
      status = excluded.status,
      last_error = excluded.last_error,
      updated_at = now();
  `;
}

export async function listSyncSites(limit = 50) {
  const result = await sql`
    select distinct site_id
    from wix_tokens
    where site_id is not null
    order by site_id
    limit ${limit};
  `;
  return result.rows.map((row) => row.site_id as string);
}

export async function listRecentOrders(limit = 10) {
  const result = await sql`
    select id, number, payment_status, created_at, total, currency, source, raw
    from orders
    order by created_at desc nulls last
    limit ${limit};
  `;
  return result.rows;
}

export async function listRecentOrdersForSite(siteId: string, limit = 10) {
  const result = await sql`
    select id, number, payment_status, created_at, total, currency, source, raw
    from orders
    where site_id = ${siteId}
      and (status is null or lower(status) not like 'archiv%')
    order by created_at desc nulls last
    limit ${limit};
  `;
  return result.rows;
}

export async function listRecentOrdersForPeriodForSite(
  startIso: string,
  endIso: string,
  siteId: string,
  limit = 10
) {
  const result = await sql`
    select id, number, payment_status, created_at, total, currency, source, raw
    from orders
    where (site_id = ${siteId} OR site_id IS NULL)
      and (status is null or lower(status) not like 'archiv%')
      and coalesce(raw->>'archived', 'false') <> 'true'
      and coalesce(raw->>'isArchived', 'false') <> 'true'
      and raw->>'archivedAt' is null
      and raw->>'archivedDate' is null
      and raw->>'archiveDate' is null
      and created_at between ${startIso} and ${endIso}
    order by created_at desc nulls last
    limit ${limit};
  `;
  return result.rows;
}

export async function listPaginatedOrdersForSite(
  siteId: string,
  limit = 20,
  offset = 0,
  startIso: string | null = null,
  endIso: string | null = null
) {
  // Count total
  const countResult = startIso && endIso
    ? await sql`
        select count(*) as total
        from orders
        where (site_id = ${siteId} OR site_id IS NULL)
          and (status is null or lower(status) not like 'archiv%')
          and coalesce(raw->>'archived', 'false') <> 'true'
          and coalesce(raw->>'isArchived', 'false') <> 'true'
          and raw->>'archivedAt' is null
          and raw->>'archivedDate' is null
          and raw->>'archiveDate' is null
          and created_at between ${startIso} and ${endIso};
      `
    : await sql`
        select count(*) as total
        from orders
        where (site_id = ${siteId} OR site_id IS NULL)
          and (status is null or lower(status) not like 'archiv%')
          and coalesce(raw->>'archived', 'false') <> 'true'
          and coalesce(raw->>'isArchived', 'false') <> 'true'
          and raw->>'archivedAt' is null
          and raw->>'archivedDate' is null
          and raw->>'archiveDate' is null;
      `;
  const total = Number(countResult.rows[0]?.total || 0);

  // Get paginated results
  const ordersResult = startIso && endIso
    ? await sql`
        select id, number, payment_status, status, created_at, paid_at, total, currency, customer_name, customer_email, raw, source
        from orders
        where (site_id = ${siteId} OR site_id IS NULL)
          and (status is null or lower(status) not like 'archiv%')
          and coalesce(raw->>'archived', 'false') <> 'true'
          and coalesce(raw->>'isArchived', 'false') <> 'true'
          and raw->>'archivedAt' is null
          and raw->>'archivedDate' is null
          and raw->>'archiveDate' is null
          and created_at between ${startIso} and ${endIso}
        order by created_at desc nulls last
        limit ${limit} offset ${offset};
      `
    : await sql`
        select id, number, payment_status, status, created_at, paid_at, total, currency, customer_name, customer_email, raw, source
        from orders
        where (site_id = ${siteId} OR site_id IS NULL)
          and (status is null or lower(status) not like 'archiv%')
          and coalesce(raw->>'archived', 'false') <> 'true'
          and coalesce(raw->>'isArchived', 'false') <> 'true'
          and raw->>'archivedAt' is null
          and raw->>'archivedDate' is null
          and raw->>'archiveDate' is null
        order by created_at desc nulls last
        limit ${limit} offset ${offset};
      `;

  return { orders: ordersResult.rows, total };
}

export async function countOrdersForSite(siteId: string) {
  const result = await sql`
    select count(*) as total
    from orders
    where (site_id = ${siteId} OR site_id IS NULL)
      and (status is null or lower(status) not like 'archiv%')
      and coalesce(raw->>'archived', 'false') <> 'true'
      and coalesce(raw->>'isArchived', 'false') <> 'true'
      and raw->>'archivedAt' is null
      and raw->>'archivedDate' is null
      and raw->>'archiveDate' is null;
  `;
  return Number(result.rows[0]?.total ?? 0);
}

export async function countOrdersForPeriodForSite(
  startIso: string,
  endIso: string,
  siteId: string
) {
  const result = await sql`
    select count(*) as total
    from orders
    where (site_id = ${siteId} OR site_id IS NULL)
      and (status is null or lower(status) not like 'archiv%')
      and coalesce(raw->>'archived', 'false') <> 'true'
      and coalesce(raw->>'isArchived', 'false') <> 'true'
      and raw->>'archivedAt' is null
      and raw->>'archivedDate' is null
      and raw->>'archiveDate' is null
      and created_at between ${startIso} and ${endIso};
  `;
  return Number(result.rows[0]?.total ?? 0);
}

export async function listRecentOrdersForBusiness(
  businessId: string,
  limit = 10
) {
  const result = await sql`
    select id, number, payment_status, created_at, total, currency, source
    from orders
    where business_id = ${businessId}
    order by created_at desc nulls last
    limit ${limit};
  `;
  return result.rows;
}

export async function listDetailedOrders(limit = 50) {
  const result = await sql`
    select id,
      number,
      payment_status,
      status,
      created_at,
      paid_at,
      total,
      currency,
      customer_name,
      customer_email,
      raw,
      source
    from orders
    order by created_at desc nulls last
    limit ${limit};
  `;
  return result.rows;
}

export async function listDetailedOrdersForSite(siteId: string, limit = 50) {
  const result = await sql`
    select id,
      number,
      payment_status,
      status,
      created_at,
      paid_at,
      total,
      currency,
      customer_name,
      customer_email,
      raw,
      source
    from orders
    where site_id = ${siteId}
    order by created_at desc nulls last
    limit ${limit};
  `;
  return result.rows;
}

export async function listDetailedOrdersForBusiness(
  businessId: string,
  limit = 50
) {
  const result = await sql`
    select id,
      number,
      payment_status,
      status,
      created_at,
      paid_at,
      total,
      currency,
      customer_name,
      customer_email,
      raw,
      source
    from orders
    where business_id = ${businessId}
    order by created_at desc nulls last
    limit ${limit};
  `;
  return result.rows;
}

export async function listAllDetailedOrders() {
  const result = await sql`
    select id,
      number,
      payment_status,
      status,
      created_at,
      paid_at,
      total,
      currency,
      customer_name,
      customer_email,
      raw,
      source
    from orders
    order by created_at desc nulls last;
  `;
  return result.rows;
}

export async function listAllDetailedOrdersForSite(siteId: string) {
  const result = await sql`
    select id,
      number,
      payment_status,
      status,
      created_at,
      paid_at,
      total,
      currency,
      customer_name,
      customer_email,
      raw,
      source
    from orders
    where (site_id = ${siteId} OR site_id IS NULL)
    order by created_at desc nulls last;
  `;
  return result.rows;
}

export async function listAllDetailedOrdersForBusiness(businessId: string) {
  const result = await sql`
    select id,
      number,
      payment_status,
      status,
      created_at,
      paid_at,
      total,
      currency,
      customer_name,
      customer_email,
      raw,
      source
    from orders
    where business_id = ${businessId}
    order by created_at desc nulls last;
  `;
  return result.rows;
}

export async function listDetailedOrdersForPeriod(
  startIso: string,
  endIso: string
) {
  const result = await sql`
    select id,
      number,
      payment_status,
      status,
      created_at,
      paid_at,
      total,
      currency,
      customer_name,
      customer_email,
      raw,
      source
    from orders
    where (paid_at between ${startIso} and ${endIso})
       or (paid_at is null and created_at between ${startIso} and ${endIso})
    order by created_at desc nulls last;
  `;
  return result.rows;
}

export async function listDetailedOrdersForPeriodForSite(
  startIso: string,
  endIso: string,
  siteId: string
) {
  const result = await sql`
    select id,
      number,
      payment_status,
      status,
      created_at,
      paid_at,
      total,
      currency,
      customer_name,
      customer_email,
      raw,
      source
    from orders
    where (site_id = ${siteId} OR site_id IS NULL)
      and created_at between ${startIso} and ${endIso}
    order by created_at desc nulls last;
  `;
  return result.rows;
}

export async function listDetailedOrdersForPeriodForBusiness(
  startIso: string,
  endIso: string,
  businessId: string
) {
  const result = await sql`
    select id,
      number,
      payment_status,
      status,
      created_at,
      paid_at,
      total,
      currency,
      customer_name,
      customer_email,
      raw,
      source
    from orders
    where business_id = ${businessId}
      and ((paid_at between ${startIso} and ${endIso})
        or (paid_at is null and created_at between ${startIso} and ${endIso}))
    order by created_at desc nulls last;
  `;
  return result.rows;
}

export async function listOrdersForPeriod(startIso: string, endIso: string) {
  const result = await sql`
    select id, number, created_at, paid_at, total, currency, customer_name, customer_email, status, payment_status
    from orders
    where (paid_at between ${startIso} and ${endIso})
       or (paid_at is null and created_at between ${startIso} and ${endIso})
    order by created_at asc nulls last;
  `;
  return result.rows;
}

export async function listOrdersForPeriodForSite(
  startIso: string,
  endIso: string,
  siteId: string
) {
  const result = await sql`
    select id, number, created_at, paid_at, total, currency, customer_name, customer_email, status, payment_status
    from orders
    where site_id = ${siteId}
      and ((paid_at between ${startIso} and ${endIso})
        or (paid_at is null and created_at between ${startIso} and ${endIso}))
    order by created_at asc nulls last;
  `;
  return result.rows;
}

export async function listOrdersForPeriodForBusiness(
  startIso: string,
  endIso: string,
  businessId: string
) {
  const result = await sql`
    select id, number, created_at, paid_at, total, currency, customer_name, customer_email
    from orders
    where business_id = ${businessId}
      and ((paid_at between ${startIso} and ${endIso})
        or (paid_at is null and created_at between ${startIso} and ${endIso}))
    order by created_at asc nulls last;
  `;
  return result.rows;
}

export async function getOrderById(orderId: string) {
  const result = await sql`
    select id,
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
      raw
    from orders
    where id = ${orderId}
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function getOrderByIdForSite(orderId: string, siteId: string) {
  const result = await sql`
    select id,
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
      raw
    from orders
    where id = ${orderId}
      and (site_id = ${siteId} OR site_id IS NULL)
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function getOrderByIdForBusiness(
  orderId: string,
  businessId: string
) {
  const result = await sql`
    select id,
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
      raw
    from orders
    where id = ${orderId}
      and business_id = ${businessId}
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function getCompanyBySite(siteId: string | null, instanceId?: string | null) {
  if (!siteId && !instanceId) return null;

  const result = await sql`
    select site_id,
      instance_id,
      store_name,
      store_domain,
      legal_name,
      vat_number,
      bulstat,
      store_id,
      logo_url,
      logo_width,
      logo_height,
      address_line1,
      address_line2,
      city,
      postal_code,
      country,
      email,
      phone,
      iban,
      bank_name,
      mol,
      receipt_template,
      receipt_number_start,
      cod_receipts_enabled,
      receipts_start_date,
      updated_at
    from companies
    where (site_id = ${siteId} OR instance_id = ${instanceId})
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function getBusinessProfile(businessId: string) {
  const result = await sql`
    select business_id,
      store_name,
      legal_name,
      vat_number,
      bulstat,
      store_id,
      logo_url,
      address_line1,
      address_line2,
      city,
      postal_code,
      country,
      email,
      phone,
      iban,
      bank_name,
      mol,
      receipt_template,
      updated_at
    from business_profiles
    where business_id = ${businessId}
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function getCompanyByBusiness(businessId: string) {
  const result = await sql`
    select site_id,
      business_id,
      instance_id,
      store_name,
      store_domain,
      legal_name,
      vat_number,
      bulstat,
      store_id,
      logo_url,
      address_line1,
      address_line2,
      city,
      postal_code,
      country,
      email,
      phone,
      iban,
      bank_name,
      mol,
      receipt_template,
      updated_at
    from companies
    where business_id = ${businessId}
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function upsertCompany(profile: CompanyProfile) {
  await sql`
    insert into companies (
      business_id,
      site_id,
      instance_id,
      store_name,
      store_domain,
      legal_name,
      vat_number,
      bulstat,
      store_id,
      logo_url,
      logo_width,
      logo_height,
      address_line1,
      address_line2,
      city,
      postal_code,
      country,
      email,
      phone,
      iban,
      bank_name,
      mol,
      receipt_template,
      updated_at
    ) values (
      ${profile.businessId},
      ${profile.siteId},
      ${profile.instanceId},
      ${profile.storeName},
      ${profile.storeDomain ?? null},
      ${profile.legalName},
      ${profile.vatNumber},
      ${profile.bulstat},
      ${profile.storeId ?? null},
      ${profile.logoUrl ?? null},
      ${profile.logoWidth ?? null},
      ${profile.logoHeight ?? null},
      ${profile.addressLine1},
      ${profile.addressLine2},
      ${profile.city},
      ${profile.postalCode},
      ${profile.country},
      ${profile.email},
      ${profile.phone},
      ${profile.iban},
      ${profile.bankName},
      ${profile.mol},
      ${profile.receiptTemplate},
      now()
    )
    on conflict (site_id) do update set
      business_id = excluded.business_id,
      instance_id = excluded.instance_id,
      store_name = excluded.store_name,
      store_domain = excluded.store_domain,
      legal_name = excluded.legal_name,
      vat_number = excluded.vat_number,
      bulstat = excluded.bulstat,
      store_id = excluded.store_id,
      logo_url = excluded.logo_url,
      logo_width = excluded.logo_width,
      logo_height = excluded.logo_height,
      address_line1 = excluded.address_line1,
      address_line2 = excluded.address_line2,
      city = excluded.city,
      postal_code = excluded.postal_code,
      country = excluded.country,
      email = excluded.email,
      phone = excluded.phone,
      iban = excluded.iban,
      bank_name = excluded.bank_name,
      mol = excluded.mol,
      receipt_template = excluded.receipt_template,
      updated_at = now();
  `;
}

export async function upsertBusinessProfile(profile: BusinessProfile) {
  await sql`
    insert into business_profiles (
      business_id,
      store_name,
      legal_name,
      vat_number,
      bulstat,
      store_id,
      logo_url,
      address_line1,
      address_line2,
      city,
      postal_code,
      country,
      email,
      phone,
      iban,
      bank_name,
      mol,
      receipt_template,
      updated_at
    ) values (
      ${profile.businessId},
      ${profile.storeName},
      ${profile.legalName},
      ${profile.vatNumber},
      ${profile.bulstat},
      ${profile.storeId ?? null},
      ${profile.logoUrl ?? null},
      ${profile.addressLine1},
      ${profile.addressLine2},
      ${profile.city},
      ${profile.postalCode},
      ${profile.country},
      ${profile.email},
      ${profile.phone},
      ${profile.iban},
      ${profile.bankName},
      ${profile.mol},
      ${profile.receiptTemplate},
      now()
    )
    on conflict (business_id) do update set
      store_name = excluded.store_name,
      legal_name = excluded.legal_name,
      vat_number = excluded.vat_number,
      bulstat = excluded.bulstat,
      store_id = excluded.store_id,
      logo_url = excluded.logo_url,
      address_line1 = excluded.address_line1,
      address_line2 = excluded.address_line2,
      city = excluded.city,
      postal_code = excluded.postal_code,
      country = excluded.country,
      email = excluded.email,
      phone = excluded.phone,
      iban = excluded.iban,
      bank_name = excluded.bank_name,
      mol = excluded.mol,
      receipt_template = excluded.receipt_template,
      updated_at = now();
  `;
}

export async function createBusiness(params: { id: string; name?: string | null }) {
  await sql`
    insert into businesses (id, name, created_at, updated_at)
    values (${params.id}, ${params.name ?? null}, now(), now())
    on conflict (id) do update set
      name = excluded.name,
      updated_at = now();
  `;
}

export async function createUser(params: {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
}) {
  await sql`
    insert into users (id, email, password_hash, password_salt, created_at)
    values (
      ${params.id},
      ${params.email},
      ${params.passwordHash},
      ${params.passwordSalt},
      now()
    );
  `;
}

export async function getUserByEmail(email: string) {
  const result = await sql`
    select id, email, password_hash, password_salt
    from users
    where email = ${email}
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function getUserById(userId: string) {
  const result = await sql`
    select id, email
    from users
    where id = ${userId}
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function addBusinessUser(params: {
  businessId: string;
  userId: string;
  role?: string | null;
}) {
  await sql`
    insert into business_users (business_id, user_id, role, created_at)
    values (
      ${params.businessId},
      ${params.userId},
      ${params.role ?? "owner"},
      now()
    )
    on conflict (business_id, user_id) do update set
      role = excluded.role;
  `;
}

export async function getPrimaryBusinessForUser(userId: string) {
  const result = await sql`
    select business_id
    from business_users
    where user_id = ${userId}
    order by created_at asc
    limit 1;
  `;
  return result.rows[0]?.business_id ?? null;
}

export async function createSession(params: {
  userId: string;
  tokenHash: string;
  expiresAt: string;
}) {
  await sql`
    insert into sessions (user_id, token_hash, created_at, expires_at)
    values (${params.userId}, ${params.tokenHash}, now(), ${params.expiresAt});
  `;
}

export async function getSessionByTokenHash(tokenHash: string) {
  const result = await sql`
    select sessions.user_id, sessions.expires_at
    from sessions
    where token_hash = ${tokenHash}
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function deleteSessionByTokenHash(tokenHash: string) {
  await sql`
    delete from sessions
    where token_hash = ${tokenHash};
  `;
}

export async function upsertStoreConnection(params: {
  businessId: string;
  siteId?: string | null;
  instanceId?: string | null;
}) {
  if (params.siteId) {
    await sql`
      insert into store_connections (business_id, site_id, instance_id, provider, connected_at)
      values (${params.businessId}, ${params.siteId}, ${params.instanceId ?? null}, 'wix', now())
      on conflict (site_id) do update set
        business_id = excluded.business_id,
        instance_id = excluded.instance_id,
        connected_at = now();
    `;
    await sql`
      update orders
      set business_id = ${params.businessId}
      where site_id = ${params.siteId}
        and business_id is null;
    `;
    await sql`
      update receipts
      set business_id = ${params.businessId}
      where order_id in (
        select id from orders where site_id = ${params.siteId}
      )
        and business_id is null;
    `;
    await sql`
      insert into business_profiles (
        business_id,
        store_name,
        legal_name,
        vat_number,
        bulstat,
        address_line1,
        address_line2,
        city,
        postal_code,
        country,
        email,
        phone,
        iban,
        bank_name,
        mol,
        receipt_template,
        updated_at
      )
      select
        ${params.businessId},
        store_name,
        legal_name,
        vat_number,
        bulstat,
        address_line1,
        address_line2,
        city,
        postal_code,
        country,
        email,
        phone,
        iban,
        bank_name,
        mol,
        receipt_template,
        updated_at
      from companies
      where site_id = ${params.siteId}
      on conflict (business_id) do nothing;
    `;
    return;
  }

  if (params.instanceId) {
    await sql`
      insert into store_connections (business_id, site_id, instance_id, provider, connected_at)
      values (${params.businessId}, ${params.siteId ?? null}, ${params.instanceId}, 'wix', now())
      on conflict (instance_id) do update set
        business_id = excluded.business_id,
        site_id = excluded.site_id,
        connected_at = now();
    `;
  }
}

export async function getStoreConnectionBySite(siteId: string) {
  const result = await sql`
    select business_id, site_id, instance_id
    from store_connections
    where site_id = ${siteId}
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function getStoreConnectionByInstance(instanceId: string) {
  const result = await sql`
    select business_id, site_id, instance_id
    from store_connections
    where instance_id = ${instanceId}
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function getStoreConnectionsForBusiness(businessId: string) {
  const result = await sql`
    select business_id, site_id, instance_id
    from store_connections
    where business_id = ${businessId}
    order by connected_at desc;
  `;
  return result.rows;
}

export async function getOrdersMissingTransactionRef(siteId: string | null, limit = 20) {
  // Use coalesce pattern to handle null siteId - when siteId is null, match all sites
  const siteFilter = siteId ?? '';
  const result = await sql`
    select id, number, payment_status, created_at
    from orders
    where (${siteFilter} = '' or site_id = ${siteFilter})
      and payment_status = 'PAID'
      and (transaction_ref is null or transaction_ref = '')
    order by created_at desc
    limit ${limit};
  `;
  return result.rows as Array<{ id: string; number: string; payment_status: string; created_at: string }>;
}

export async function updateOrderTransactionRef(orderId: string, transactionRef: string) {
  await sql`
    update orders
    set transaction_ref = ${transactionRef},
        updated_at = now()
    where id = ${orderId};
  `;
}

export async function updateReceiptSettings(
  siteId: string,
  settings: { receiptNumberStart?: number | null; codReceiptsEnabled?: boolean | null }
) {
  await sql`
    update companies
    set receipt_number_start = ${settings.receiptNumberStart ?? null},
        cod_receipts_enabled = ${settings.codReceiptsEnabled ?? false},
        updated_at = now()
    where site_id = ${siteId};
  `;
}

export async function getReceiptSettings(siteId: string) {
  const result = await sql`
    select receipt_number_start, cod_receipts_enabled
    from companies
    where site_id = ${siteId}
    limit 1;
  `;
  return result.rows[0] ?? null;
}

/**
 * Update return payment type for a refund receipt
 * @param receiptId - The receipt ID
 * @param returnPaymentType - 1=cash, 2=bank, 3=other form, 4=other
 */
export async function updateReturnPaymentType(receiptId: number, returnPaymentType: number) {
  await sql`
    update receipts
    set return_payment_type = ${returnPaymentType}
    where id = ${receiptId}
      and type = 'refund';
  `;
}

/**
 * Get receipt by ID
 */
export async function getReceiptById(receiptId: number) {
  const result = await sql`
    select id, order_id, type, return_payment_type, refund_amount, reference_receipt_id, issued_at
    from receipts
    where id = ${receiptId}
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function getReceiptWithSiteById(receiptId: number) {
  const result = await sql`
    select r.id, r.order_id, r.type, o.site_id
    from receipts r
    left join orders o on o.id = r.order_id
    where r.id = ${receiptId}
    limit 1;
  `;
  return result.rows[0] ?? null;
}

export async function deleteReceiptById(receiptId: number) {
  await sql`
    delete from receipts
    where id = ${receiptId};
  `;
}

export async function deleteRefundReceiptsByReference(referenceReceiptId: number) {
  await sql`
    delete from receipts
    where reference_receipt_id = ${referenceReceiptId};
  `;
}
