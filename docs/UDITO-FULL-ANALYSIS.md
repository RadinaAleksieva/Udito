# UDITO - Пълен Анализ на Приложението

**Дата на анализ:** 2026-01-17
**Версия:** 1.0

---

## Съдържание

1. [Какво е UDITO?](#1-какво-е-udito)
2. [Технологичен стек](#2-технологичен-стек)
3. [Структура на проекта](#3-структура-на-проекта)
4. [База данни](#4-база-данни)
5. [API Endpoints](#5-api-endpoints)
6. [Как работи приложението](#6-как-работи-приложението)
7. [Multi-tenant архитектура](#7-multi-tenant-архитектура)
8. [Намерени проблеми](#8-намерени-проблеми)
9. [План за решаване](#9-план-за-решаване)
10. [Приоритизиран списък на задачи](#10-приоритизиран-списък-на-задачи)

---

## 1. Какво е UDITO?

**UDITO е SaaS приложение за български e-commerce магазини с Wix**, което автоматично издава **електронни касови бележки** (фискални бонове) при всяка платена поръчка.

### Основни функции:

1. **Автоматично издаване на бележки** - при всяко плащане чрез webhook от Wix
2. **Сторно бележки** - при възстановяване на суми (refund)
3. **Данъчен одит** - генериране на XML файлове по Наредба Н-18, Приложение 38
4. **Multi-tenant архитектура** - много магазини, много потребители
5. **Subscription модел** - Starter (50 поръчки), Business (300), Corporate (неограничен)

### Ценообразуване:

| План | Лимит | Цена | Над лимита |
|------|-------|------|------------|
| Starter | 50 поръчки/месец | 5 EUR/месец | +0.10 EUR/поръчка |
| Business | 300 поръчки/месец | 15 EUR/месец | +0.10 EUR/поръчка |
| Corporate | Без лимит | 15 EUR + 0.10 EUR/поръчка | N/A |

---

## 2. Технологичен стек

| Категория | Технология | Версия |
|-----------|------------|--------|
| Framework | Next.js (App Router) | 14.2.5 |
| Database | Vercel Postgres (Neon) | - |
| Auth | NextAuth.js | 4.24.13 |
| Frontend | React | 18.3.1 |
| PDF Generation | react-pdf, jsPDF, html2canvas | - |
| QR Code | qrcode | - |
| API Clients | Wix SDK, Stripe SDK | - |
| Hosting | Vercel | - |

### Environment Variables:

```bash
# Wix Integration
WIX_APP_ID
WIX_APP_SECRET
WIX_APP_PUBLIC_KEY
WIX_API_BASE (optional, defaults to https://www.wixapis.com)

# Database
POSTGRES_URL (Vercel Postgres)

# Auth
NEXTAUTH_SECRET
NEXTAUTH_URL

# Google OAuth
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET

# Stripe
STRIPE_PUBLIC_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET

# App Config
APP_BASE_URL (e.g., https://udito.vercel.app)
ADMIN_SECRET (for admin endpoints)
```

---

## 3. Структура на проекта

```
/Users/mac/udito-app/
├── app/                    # Next.js app directory
│   ├── api/               # 99 API routes organized by feature
│   │   ├── auth/          # Authentication endpoints
│   │   ├── oauth/         # Wix OAuth flow
│   │   ├── orders/        # Order management
│   │   ├── receipts/      # Receipt operations
│   │   ├── stores/        # Store management
│   │   ├── sync/          # Order sync
│   │   ├── webhooks/      # Wix webhooks
│   │   ├── admin/         # Admin endpoints (31)
│   │   ├── debug/         # Debug endpoints (27)
│   │   ├── onboarding/    # Onboarding flow
│   │   ├── stripe/        # Stripe integration
│   │   └── ...
│   ├── components/        # 13 reusable React components
│   ├── overview/          # Dashboard
│   ├── orders/            # Order management pages
│   ├── receipts/          # Receipt management pages
│   ├── settings/          # Store settings
│   ├── onboarding/        # User onboarding flow
│   ├── billing/           # Billing & subscription
│   ├── audit/             # Tax audit files
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Landing page
├── lib/                   # Core business logic (15 modules)
│   ├── db.ts              # Database operations (55 KB)
│   ├── auth.ts            # Authentication (13 KB)
│   ├── wix.ts             # Wix SDK integration (41 KB)
│   ├── sync.ts            # Order synchronization (9.7 KB)
│   ├── receipts.ts        # Receipt management (11.5 KB)
│   ├── receipt-pdf.tsx    # PDF generation (51 KB)
│   ├── auditXml.ts        # Tax audit XML (8.8 KB)
│   ├── stripe.ts          # Stripe helpers
│   ├── wix-context.ts     # Wix context handling
│   └── ...
├── hooks/                 # React custom hooks (2)
├── types/                 # TypeScript definitions
├── public/                # Static assets
├── middleware.ts          # Next.js middleware
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
└── vercel.json            # Vercel deployment config
```

### Статистики:

| Категория | Брой |
|-----------|------|
| API Routes | 99 |
| Components | 13 |
| Library Modules | 15 |
| Pages | 25+ |
| Database Tables | 18 |

---

## 4. База данни

### Основни таблици:

#### orders
```sql
CREATE TABLE orders (
  id text PRIMARY KEY,
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
  raw jsonb
);
```

#### receipts
```sql
CREATE TABLE receipts (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL,
  business_id text,
  issued_at timestamptz DEFAULT now(),
  status text DEFAULT 'issued',
  payload jsonb,
  type text DEFAULT 'sale',  -- 'sale' or 'refund'
  reference_receipt_id bigint,
  refund_amount numeric,
  return_payment_type text
);
```

#### companies
```sql
CREATE TABLE companies (
  site_id text PRIMARY KEY,
  business_id text UNIQUE,
  instance_id text UNIQUE,
  store_name text,
  legal_name text,
  vat_number text,
  bulstat text,
  address text,
  city text,
  phone text,
  email text,
  iban text,
  bank_name text,
  mol text,
  logo_url text,
  store_id text,  -- Fiscal device ID
  receipt_number_start integer,
  receipts_start_date timestamptz,
  cod_receipts_enabled boolean DEFAULT false,
  receipt_template jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### wix_tokens
```sql
CREATE TABLE wix_tokens (
  id bigserial PRIMARY KEY,
  business_id text,
  site_id text,
  instance_id text,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### store_connections
```sql
CREATE TABLE store_connections (
  id bigserial PRIMARY KEY,
  business_id text,
  site_id text,
  instance_id text,
  user_id text NOT NULL,
  role text DEFAULT 'member',  -- owner, admin, member, accountant
  access_code text,
  expires_at timestamptz,
  invited_by text,
  invited_at timestamptz,
  connected_at timestamptz DEFAULT now(),
  UNIQUE(site_id, user_id),
  UNIQUE(instance_id, user_id)
);
```

#### businesses
```sql
CREATE TABLE businesses (
  id text PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  trial_ends_at timestamptz,
  subscription_status text DEFAULT 'trialing',
  plan_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  onboarding_completed boolean DEFAULT false,
  onboarding_step integer DEFAULT 0,
  selected_plan_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

#### monthly_usage
```sql
CREATE TABLE monthly_usage (
  id bigserial PRIMARY KEY,
  business_id text NOT NULL,
  year_month text NOT NULL,  -- '2026-01'
  orders_count integer DEFAULT 0,
  receipts_count integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(business_id, year_month)
);
```

#### webhook_logs
```sql
CREATE TABLE webhook_logs (
  id bigserial PRIMARY KEY,
  event_type text,
  order_id text,
  order_number text,
  site_id text,
  instance_id text,
  status text,  -- 'received', 'processed', 'error'
  error_message text,
  payload_preview text,
  created_at timestamptz DEFAULT now()
);
```

### Допълнителни таблици:

| Таблица | Описание |
|---------|----------|
| users | NextAuth потребители |
| accounts | OAuth provider връзки |
| sessions | Active sessions |
| verification_tokens | Email verification |
| business_profiles | Business profile данни |
| business_users | User access to businesses |
| subscription_plans | Available plans |
| billing_companies | Invoice billing info |
| access_codes | Shareable store access codes |
| sync_state | Order sync progress/cursor |

---

## 5. API Endpoints

### Authentication & OAuth (6 routes)
- `POST /api/auth/register` - User registration
- `POST /api/auth/check-email` - Verify email availability
- `POST /api/auth/link-store` - Connect store to user account
- `POST /api/auth/check-wix-store` - Validate Wix store
- `GET/POST /api/auth/[...nextauth]` - NextAuth endpoints
- `POST /api/oauth/callback` - OAuth callback handler

### Store Management (8 routes)
- `POST /api/stores/connect` - Connect a Wix store
- `POST /api/stores/join` - Join store with access code
- `DELETE /api/stores/delete` - Disconnect store
- `GET /api/stores/access-code` - List stores' access codes
- `POST /api/stores/users` - Manage store users
- `PUT /api/stores/update` - Update store settings
- `GET /api/sites` - List user's sites
- `POST /api/site/select` - Select active site

### Receipts (5 routes)
- `POST /api/receipts/cancel` - Cancel/delete a receipt
- `GET/POST /api/receipts/settings` - Get/update receipt settings
- `PUT /api/receipts/return-type` - Update refund payment type
- `GET/POST /api/receipts/appearance` - Customize receipt appearance

### Orders & Sync (8 routes)
- `GET /api/orders/list` - List orders
- `POST /api/sync/initial` - Initial order sync
- `POST /api/sync/auto` - Auto-sync orders
- `GET /api/sync/cron` - Cron job trigger
- `POST /api/backfill` - Backfill historical orders
- `POST /api/backfill/fast` - Fast backfill

### Webhooks (1 route)
- `POST /api/webhooks/wix/orders` - Wix order webhook handler

### Reports & Auditing (2 routes)
- `GET /api/audit/monthly` - Generate audit XML for month
- `GET /api/reports/monthly` - Monthly report

### Onboarding (5 routes)
- `POST /api/onboarding/company` - Save company profile
- `POST /api/onboarding/plan` - Select subscription plan
- `POST /api/onboarding/settings` - Save onboarding settings
- `POST /api/onboarding/complete` - Mark onboarding complete
- `GET /api/onboarding/status` - Get current status

### Billing & Stripe (4 routes)
- `POST /api/stripe/setup-intent` - Create Stripe setup intent
- `POST /api/stripe/verify-card` - Verify card
- `GET /api/subscription/status` - Get subscription status

### Admin Endpoints (31 routes)
- `/api/admin/init-db` - Initialize database
- `/api/admin/seed-demo` - Seed demo data
- `/api/admin/backfill` - Backfill orders
- `/api/admin/sync-order` - Sync specific order
- `/api/admin/enrich-orders` - Enrich order data
- `/api/admin/fix-*` - Various data fixes
- `/api/admin/webhook-logs` - View webhook logs
- etc.

### Debug Endpoints (27 routes)
- `/api/debug/order` - Inspect order
- `/api/debug/payment` - Inspect payment
- `/api/debug/receipt-check` - Check receipt status
- etc.

---

## 6. Как работи приложението

### 6.1 Поток на нова поръчка (Webhook)

```
┌─────────────────┐
│   Клиент прави  │
│    поръчка      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌─────────────────┐
│  Wix изпраща    │─────►│  /api/webhooks/ │
│  webhook (JWS)  │      │  wix/orders     │
└─────────────────┘      └────────┬────────┘
                                  │
         ┌────────────────────────┼────────────────────────┐
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│ 1. Decode JWS   │    │ 2. Запис в      │    │ 3. Ако PAID:    │
│    token        │    │    orders       │    │    issueReceipt │
│    извличане    │    │    таблица      │    │                 │
│    siteId       │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 6.2 Детайли на webhook обработката

1. **Получаване на webhook** (`POST /api/webhooks/wix/orders`)
   - Wix изпраща JWS (JSON Web Signature) token
   - Body format: `header.payload.signature`

2. **Декодиране на JWS**
   - Извличане на base64 payload
   - Парсване на JSON данните
   - Извличане на `instanceId` от вложения `instance` JWT token

3. **Идентификация на магазина**
   - Приоритет 1: URL параметри (`?instanceId=...&siteId=...`)
   - Приоритет 2: HTTP headers (`x-wix-instance`)
   - Приоритет 3: JWS payload
   - Fallback: Търсене в companies таблицата по instanceId

4. **Запис на поръчката**
   - UPSERT в orders таблицата
   - Обогатяване с payment данни от Wix API
   - Извличане на transaction ref

5. **Издаване на бележка** (ако поръчката е платена)
   - Проверка за receipts_start_date
   - Проверка за fiscal store_id
   - Проверка за transaction ref
   - Генериране на receipt номер
   - Запис в receipts таблицата

### 6.3 Sync механизъм

```
POST /api/sync/initial
         │
         ▼
┌─────────────────────────────────────┐
│  syncOrdersForSite(siteId)          │
├─────────────────────────────────────┤
│  1. Get Wix access token            │
│  2. Query orders with cursor        │
│  3. Pre-fetch all site payments     │
│  4. For each order:                 │
│     - Check if needs enrichment     │
│     - Fetch full order details      │
│     - Extract delivery method       │
│     - Extract transaction ref       │
│     - Upsert to database            │
│     - Auto-issue receipt (if PAID   │
│       AND current month)            │
│  5. Update sync cursor              │
│  6. Repeat until no more pages      │
└─────────────────────────────────────┘
```

### 6.4 Receipt издаване

**Условия за автоматично издаване:**
1. `payment_status = 'PAID'`
2. `receipts_start_date` е конфигуриран
3. `paidAt >= receipts_start_date`
4. `store_id` (fiscal code) е наличен
5. `transaction_ref` е наличен
6. `total > 0`
7. (За COD) `cod_receipts_enabled = true`
8. (За sync) Поръчката е платена в текущия месец

**Receipt номерация:**
- `MAX(id) + 1` от receipts таблицата
- Позволява повторно използване на изтрити номера

### 6.5 Refund (сторно) бележки

1. Webhook получава `payment_status = 'REFUNDED'`
2. Търсене на оригиналната sale receipt
3. Ако съществува → създаване на refund receipt
4. Refund amount = отрицателна стойност
5. Reference към оригиналната бележка

---

## 7. Multi-tenant архитектура

### 7.1 Три нива на идентификация

| Идентификатор | Какво е | Използва се за |
|---------------|---------|----------------|
| `site_id` | Уникален ID на Wix сайта | Основен ключ за филтриране |
| `instance_id` | ID на app инсталацията | Wix OAuth, fallback |
| `business_id` | ID на бизнеса в UDITO | Subscription, billing |

### 7.2 Връзка между entities

```
┌─────────────────────────────────────────────────────────────┐
│                        BUSINESSES                           │
│  (абонаменти, billing, trial)                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    │
│   │  Business 1 │    │  Business 2 │    │  Business 3 │    │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    │
│          │                  │                  │            │
│   ┌──────┴──────┐    ┌──────┴──────┐    ┌──────┴──────┐    │
│   │   Site A    │    │   Site B    │    │   Site C    │    │
│   │   (shop1)   │    │   (shop2)   │    │   Site D    │    │
│   └──────┬──────┘    └─────────────┘    └─────────────┘    │
│          │                                                  │
│   ┌──────┴──────────────────────────────────┐              │
│   │             store_connections           │              │
│   │  user_1 → Site A (owner)                │              │
│   │  user_2 → Site A (accountant)           │              │
│   │  user_3 → Site B (owner)                │              │
│   └─────────────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 Определяне на активен магазин

**Функция: `getActiveStore()`**

3-степенен приоритет:
1. **URL параметри** (най-висок) - `?siteId=abc` или `?instanceId=xyz`
2. **NextAuth сесия** - от `store_connections` таблицата
3. **Wix cookies** (най-нисък) - `udito_instance_id`, `udito_site_id`

```typescript
export async function getActiveStore(options?: {
  searchParams?: URLSearchParams;
  cookies?: RequestCookies | ReadonlyRequestCookies;
  session?: Session | null;
}): Promise<ActiveStore | null> {
  // 1. Check URL params
  const urlSiteId = searchParams?.get('siteId');
  const urlInstanceId = searchParams?.get('instanceId');
  if (urlSiteId || urlInstanceId) {
    return { siteId: urlSiteId, instanceId: urlInstanceId };
  }

  // 2. Check NextAuth session
  if (session?.user?.id) {
    const stores = await getUserStores(session.user.id);
    if (stores.length > 0) {
      return stores[0];
    }
  }

  // 3. Check Wix cookies
  const cookieSiteId = cookies?.get('udito_site_id')?.value;
  const cookieInstanceId = cookies?.get('udito_instance_id')?.value;
  return { siteId: cookieSiteId, instanceId: cookieInstanceId };
}
```

### 7.4 Текущи магазини в системата

```
Магазин A (The White Rabbit Shop):
  - site_id: 6240f8a5-7af4-4fdf-96c1-d1f22b205408
  - instance_id: 8865cc09-0949-43c4-a09c-5fdfbb352edf
  - receipts_start_date: 2024-12-14
  - cod_receipts_enabled: true

Магазин B (www.fst.bg):
  - site_id: de34f1c3-7bff-4501-9e04-bd90f3c43ae5
  - instance_id: fb0c3881-1957-4835-9f46-50862ef24379
  - receipts_start_date: NULL
  - cod_receipts_enabled: false
```

---

## 8. Намерени проблеми

### 8.1 КРИТИЧНИ ПРОБЛЕМИ (Multi-tenancy data leaks)

| # | Проблем | Файл:Ред | Описание | Въздействие |
|---|---------|----------|----------|-------------|
| 1 | `getNextReceiptId()` без site_id | receipts.ts:7-9 | `MAX(id)` от ВСИЧКИ бележки | Номерата са споделени между клиенти |
| 2 | `listRecentReceipts()` без филтър | receipts.ts:185-193 | Няма WHERE site_id | Показва бележки от всички магазини |
| 3 | `listReceiptsForPeriod()` без филтър | receipts.ts:195-203 | Няма WHERE site_id | Data leak в отчетите |
| 4 | `listReceiptsWithOrders()` без филтър | receipts.ts:205-224 | Филтрира само по order status | Data leak |
| 5 | `listRecentOrders()` без филтър | db.ts:765-773 | Връща поръчки от всички сайтове | Data leak |
| 6 | `listDetailedOrders()` без филтър | db.ts:927-946 | Пълни данни от всички сайтове | Data leak |
| 7 | `listAllDetailedOrders()` без филтър | db.ts:995-1013 | ВСИЧКИ поръчки с имена/имейли | Критичен data leak |
| 8 | Receipt cancel - null check | cancel/route.ts:52 | `!receiptSiteId` позволява достъп | Unauthorized deletes |

### 8.2 КРИТИЧНИ ПРОБЛЕМИ (Race conditions)

| # | Проблем | Файл | Описание | Въздействие |
|---|---------|------|----------|-------------|
| 9 | Webhook vs Sync race | route.ts + sync.ts | Няма row-level locking | paidAt се презаписва |
| 10 | Duplicate receipt issuance | receipts.ts:24-50 | Check и INSERT не са в transaction | 2 бележки за 1 поръчка |
| 11 | Silent receipt failure | route.ts:551-559 | Няма return value от issueReceipt | План лимити се изразходват без бележка |
| 12 | paidAt timestamp race | route.ts:370-376,493-502 | Read-after-write race | Грешен timestamp в бележка |

### 8.3 ВИСОКИ ПРОБЛЕМИ (Webhook/Sync)

| # | Проблем | Файл:Ред | Описание | Въздействие |
|---|---------|----------|----------|-------------|
| 13 | JWS base64 decode | route.ts:690 | Няма URL-safe decode | Webhook не се обработва |
| 14 | Triple-nested JSON | route.ts:715-724 | Assumptions за структурата | Грешни данни |
| 15 | Sync cursor validation | sync.ts:263-265 | Няма валидация | API waste |
| 16 | Sync error recovery | sync.ts:262-265 | Няма try-catch | Duplicate orders |
| 17 | Refund receipt lost | route.ts:575-606 | Ако sale не е издадена | Непълен audit |
| 18 | No webhook idempotency | route.ts:628 | Няма event_id check | Duplicate processing |

### 8.4 СРЕДНИ ПРОБЛЕМИ

| # | Проблем | Файл | Описание | Въздействие |
|---|---------|------|----------|-------------|
| 19 | siteId/instanceId mixing | orders/list:14-17 | OR fallback логика | Потенциален data leak |
| 20 | OR logic в settings | receipts/settings | Може да match-не грешна company | Data corruption |
| 21 | Webhook fallback routing | route.ts:268-280 | 1 active company fallback | Грешен магазин |
| 22 | Usage tracking OR logic | db.ts:1944-1968 | getBusinessIdFromStore OR | Грешен billing |

---

## 9. План за решаване

### Фаза 1: КРИТИЧНИ ПОПРАВКИ (веднага)

#### 1.1 Добавяне на site_id към receipts таблицата

```sql
-- Migration
ALTER TABLE receipts ADD COLUMN site_id text;

-- Backfill
UPDATE receipts
SET site_id = (
  SELECT site_id FROM orders WHERE orders.id = receipts.order_id
);

-- Index
CREATE INDEX idx_receipts_site_id ON receipts(site_id);
```

#### 1.2 Поправяне на getNextReceiptId()

```typescript
// ПРЕДИ (ГРЕШНО)
async function getNextReceiptId(): Promise<number> {
  const result = await sql`
    SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM receipts
  `;
  return result.rows[0].next_id;
}

// СЛЕД (ПРАВИЛНО)
async function getNextReceiptId(siteId: string): Promise<number> {
  const result = await sql`
    SELECT COALESCE(MAX(id), 0) + 1 as next_id
    FROM receipts
    WHERE site_id = ${siteId}
  `;
  return result.rows[0].next_id;
}
```

#### 1.3 Премахване/поправяне на data leak функции

**Вариант A: Изтриване**
```typescript
// Изтриване на:
// - listRecentReceipts()
// - listReceiptsForPeriod()
// - listReceiptsWithOrders()
// - listRecentOrders()
// - listDetailedOrders()
// - listAllDetailedOrders()
```

**Вариант B: Добавяне на задължителен siteId**
```typescript
// Добавяне на siteId параметър:
async function listRecentReceipts(siteId: string, limit = 20) {
  return await sql`
    SELECT ... FROM receipts
    WHERE site_id = ${siteId}
    ORDER BY issued_at DESC
    LIMIT ${limit}
  `;
}
```

#### 1.4 Fix receipt cancel auth

```typescript
// ПРЕДИ (ГРЕШНО)
const isOwner = !receiptSiteId ||  // <-- Проблем!
                receiptSiteId === store.siteId ||
                receiptSiteId === store.instanceId;

// СЛЕД (ПРАВИЛНО)
const isOwner = receiptSiteId === store.siteId ||
                receiptSiteId === store.instanceId;
```

### Фаза 2: RACE CONDITIONS (тази седмица)

#### 2.1 Transaction за receipt issuance

```typescript
export async function issueReceipt(params: IssueReceiptParams): Promise<{
  created: boolean;
  receiptId: number | null;
  error?: string;
}> {
  return await sql.begin(async (tx) => {
    // Check for existing receipt WITH LOCK
    const existing = await tx`
      SELECT id FROM receipts
      WHERE order_id = ${params.orderId} AND type = 'sale'
      FOR UPDATE
    `;

    if (existing.rows.length > 0) {
      return { created: false, receiptId: existing.rows[0].id };
    }

    // Get next ID for this site
    const nextId = await tx`
      SELECT COALESCE(MAX(id), 0) + 1 as next_id
      FROM receipts
      WHERE site_id = ${params.siteId}
      FOR UPDATE
    `;

    // Insert new receipt
    const result = await tx`
      INSERT INTO receipts (id, order_id, site_id, payload, type)
      VALUES (${nextId.rows[0].next_id}, ${params.orderId}, ${params.siteId}, ${params.payload}, 'sale')
      RETURNING id
    `;

    return { created: true, receiptId: result.rows[0].id };
  });
}
```

#### 2.2 Webhook idempotency

```typescript
// В webhook handler:
const eventId = parsedPayload?.eventId ?? `${orderId}-${eventType}-${Date.now()}`;

const exists = await sql`
  SELECT id FROM webhook_logs
  WHERE event_id = ${eventId}
  LIMIT 1
`;

if (exists.rows.length > 0) {
  console.log('Duplicate webhook, skipping:', eventId);
  return NextResponse.json({ ok: true, duplicate: true });
}

// Log with event_id
await logWebhook({
  eventId,
  eventType,
  orderId,
  // ...
});
```

#### 2.3 Sync vs Webhook coordination

```typescript
// Добавяне на source_timestamp поле
ALTER TABLE orders ADD COLUMN source_timestamp timestamptz;

// При UPSERT: запазване на по-новия timestamp
await sql`
  INSERT INTO orders (id, paid_at, source_timestamp, ...)
  VALUES (${id}, ${paidAt}, ${sourceTimestamp}, ...)
  ON CONFLICT (id) DO UPDATE SET
    paid_at = CASE
      WHEN excluded.source_timestamp > orders.source_timestamp
      THEN excluded.paid_at
      ELSE orders.paid_at
    END,
    source_timestamp = GREATEST(excluded.source_timestamp, orders.source_timestamp),
    ...
`;
```

### Фаза 3: ПОДОБРЕНИЯ (следващата седмица)

#### 3.1 Подобряване на webhook site identification

```typescript
// В POST handler:
if (!urlSiteId && !urlInstanceId && !headerSiteId && !headerInstanceId) {
  console.error('Webhook missing site context');
  await logWebhook({
    eventType: 'unknown',
    status: 'error',
    errorMessage: 'Missing site context',
  });
  return NextResponse.json({
    ok: false,
    error: 'Missing site context in webhook'
  }, { status: 400 });
}
```

#### 3.2 Sync error recovery

```typescript
export async function syncOrdersForSite(siteId: string, options?: SyncOptions) {
  let cursor = null;
  let pages = 0;
  const maxPages = options?.maxPages ?? 100;

  try {
    do {
      cursor = await runPage(cursor);
      pages += 1;

      // Save progress after each page
      await upsertSyncState({
        siteId,
        cursor,
        status: cursor ? 'partial' : 'done',
        lastError: null,
      });
    } while (cursor && pages < maxPages);

    return { success: true, pages };
  } catch (error) {
    // Save error state
    await upsertSyncState({
      siteId,
      cursor,
      status: 'error',
      lastError: (error as Error).message,
    });

    throw error;
  }
}
```

#### 3.3 Refund receipt queue

```sql
-- Нова таблица
CREATE TABLE pending_refunds (
  id bigserial PRIMARY KEY,
  order_id text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now(),
  attempts integer DEFAULT 0,
  last_attempt timestamptz,
  last_error text
);
```

```typescript
// В webhook handler:
if (isRefunded && !originalReceipt) {
  // Queue for later processing
  await sql`
    INSERT INTO pending_refunds (order_id)
    VALUES (${orderId})
    ON CONFLICT (order_id) DO NOTHING
  `;
  console.log('Refund queued for order:', orderId);
}

// Cron job за обработка на pending refunds
export async function processPendingRefunds() {
  const pending = await sql`
    SELECT order_id FROM pending_refunds
    WHERE attempts < 5
    AND (last_attempt IS NULL OR last_attempt < NOW() - INTERVAL '1 hour')
    LIMIT 10
  `;

  for (const { order_id } of pending.rows) {
    const originalReceipt = await getSaleReceiptByOrderId(order_id);
    if (originalReceipt) {
      await issueRefundReceipt({ orderId: order_id, ... });
      await sql`DELETE FROM pending_refunds WHERE order_id = ${order_id}`;
    } else {
      await sql`
        UPDATE pending_refunds
        SET attempts = attempts + 1, last_attempt = NOW()
        WHERE order_id = ${order_id}
      `;
    }
  }
}
```

### Фаза 4: CLEANUP (ongoing)

- Премахване на debug endpoints в production
- Добавяне на audit logging за sensitive операции
- Rate limiting за API endpoints
- Документация на API endpoints

---

## 10. Приоритизиран списък на задачи

| Приоритет | Задача | Файл | Сложност | Риск ако НЕ се направи |
|-----------|--------|------|----------|------------------------|
| 🔴 P0 | Добави site_id към receipts | lib/db.ts, lib/receipts.ts | Medium | Data leak между клиенти |
| 🔴 P0 | Поправи getNextReceiptId() | lib/receipts.ts | Easy | Грешни номера на бележки |
| 🔴 P0 | Премахни/поправи data leak функции | lib/db.ts, lib/receipts.ts | Easy | Data leak |
| 🔴 P0 | Fix receipt cancel null check | api/receipts/cancel | Easy | Unauthorized deletes |
| 🟠 P1 | Transaction за receipt issuance | lib/receipts.ts | Medium | Duplicate receipts |
| 🟠 P1 | Webhook idempotency | api/webhooks | Medium | Duplicate processing |
| 🟠 P1 | Sync error recovery | lib/sync.ts | Medium | Lost/duplicate data |
| 🟠 P1 | Fix paidAt race condition | api/webhooks, lib/sync.ts | Medium | Wrong timestamps |
| 🟡 P2 | Webhook site validation | api/webhooks | Easy | Wrong site routing |
| 🟡 P2 | Refund receipt queue | lib/receipts.ts | Medium | Missing refunds |
| 🟡 P2 | Fix OR logic in settings | api/receipts/settings | Easy | Wrong company match |
| 🟢 P3 | Remove debug endpoints | api/debug/* | Easy | Security |
| 🟢 P3 | Add audit logging | lib/db.ts | Medium | Compliance |
| 🟢 P3 | API documentation | docs/ | Medium | Maintainability |

---

## Заключение

**UDITO е функционално приложение**, което изпълнява основната си задача - издаване на бележки при плащане. Обаче има **сериозни multi-tenancy проблеми**, които могат да доведат до:

1. **Data leaks** между клиенти (критично)
2. **Грешни номера на бележки** (критично)
3. **Race conditions** при паралелни операции
4. **Загубени refund бележки**

### Препоръчителен план:

1. **Веднага** - Фаза 1 поправки (P0 задачи)
2. **Тази седмица** - Фаза 2 поправки (P1 задачи)
3. **Следващата седмица** - Фаза 3 подобрения (P2 задачи)
4. **Ongoing** - Фаза 4 cleanup (P3 задачи)

**Не се препоръчва добавянето на нови клиенти преди завършване на Фаза 1.**

---

*Документ генериран от Claude Code анализ*
