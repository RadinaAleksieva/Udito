# UDITO Handoff (Full Documentation)

**Production URL:** https://udito.vercel.app
**Last Updated:** 2026-01-09

## 1) Executive summary

UDITO е Next.js приложение за Wix Stores, което синхронизира поръчки, издава електронни бележки и генерира месечни одиторски XML файлове за НАП (алтернативен режим по Наредба Н-18). Приложението работи без касов апарат - използва електронни бележки и стандартизиран одиторски файл.

---

## 2) Current State (What Works)

### 2.1 Електронни бележки
- Номер на бележка: автоматичен (bigserial), показва се с водещи нули
- Дата/час: момента на плащане (paidAt от Wix ORDER_PAID activity)
- QR код с данни за НАП
- EUR/BGN равностойност (1 EUR = 1.95583 BGN)

### 2.2 Сторно бележки (Refunds) - NEW
- При възстановяване на суми се издава електронна бележка с **минус** стойност
- Показва се като "Сторно (възстановени суми)" в списъка с бележки
- Червен стил за визуално разграничение
- **Одиторски файл логика:**
  - Продажба + сторно в **същия месец** → НЕ влиза в одиторския файл
  - Продажба в месец А + сторно в месец Б → Продажбата влиза в месец А
  - Сторно бележките **никога** не влизат в одиторския файл (те са банкови преводи)

### 2.3 Одиторски файл
- XML формат по Приложение 38 от Наредба Н-18
- Филтрира само продажби (без сторнирани в същия месец)
- Изтегляне само за изтекли месеци
- Показва брой поръчки, включени в експорта

### 2.4 Wix интеграция
- OAuth връзка с Wix
- Webhook за нови поръчки и промяна на payment status
- Автоматично издаване на бележки при плащане
- Sync на исторически поръчки

### 2.5 Достъп
- Вход чрез Wix OAuth
- Алтернативен вход с код за достъп (instanceId)
- Logout за смяна на магазин

---

## 3) Database Schema

### receipts table (updated)
```sql
id bigserial primary key,
business_id text,
order_id text,
issued_at timestamptz,
status text,
payload jsonb,
type text default 'sale',           -- 'sale' or 'refund'
reference_receipt_id bigint,        -- за сторно: ID на оригиналната бележка
refund_amount numeric               -- отрицателна сума за сторно
```

### orders table
```sql
id text primary key,
site_id text,
number text,
status text,
payment_status text,
created_at timestamptz,
paid_at timestamptz,               -- момент на плащане
total numeric,
currency text,
customer_name text,
customer_email text,
raw jsonb                          -- пълни данни от Wix
```

---

## 4) Key Files

### Receipts & Refunds
- `lib/receipts.ts` - issueReceipt(), issueRefundReceipt(), listOrdersWithReceiptsForAudit()
- `app/receipts/page.tsx` - списък с бележки (продажби + сторно)
- `app/receipts/[orderId]/page.tsx` - детайли на бележка

### Webhooks
- `app/api/webhooks/wix/orders/route.ts` - обработка на Wix събития
  - При PAID → издава бележка
  - При REFUNDED → издава сторно бележка

### Sync
- `lib/sync.ts` - syncOrdersForSite() за batch синхронизация
- `app/api/sync/cron/route.ts` - Vercel cron job

### Audit
- `app/audit/page.tsx` - преглед на одиторски файл
- `app/api/audit/monthly/route.ts` - генериране на XML

---

## 5) Deployment

### Vercel
```bash
vercel --prod
```

**Note:** Free tier има лимит 100 deployments/day. Ако получиш грешка "Resource is limited", изчакай посочените минути.

### Environment Variables (Vercel)
- `POSTGRES_URL` - Vercel Postgres connection string
- `WIX_APP_ID` - Wix app ID
- `WIX_APP_SECRET` - Wix app secret
- `WIX_APP_PUBLIC_KEY` - за webhook verification

### GitHub → Vercel
GitHub repo: https://github.com/RadinaAleksieva/Udito
Vercel project: `udito` (linked to this repo)

---

## 6) Known Issues / TODO

### 6.1 Transaction ID
- Offline плащания показват грешен transaction ID
- `extractTransactionRef()` в `lib/wix.ts` трябва да се подобри

### 6.2 QR код
- Трябва верификация на формата спрямо изискванията на НАП

### 6.3 Частични рефундове
- В момента се поддържат само пълни рефундове
- За частични рефундове трябва да се извлича точната сума от Wix

---

## 7) Scripts (за debugging)

```bash
# Провери конкретна поръчка в Wix
node scripts/check-order.mjs 10200

# Виж последните платени поръчки от Wix
node scripts/fetch-wix-orders.mjs

# Reset на бележки (ВНИМАНИЕ: изтрива всички!)
node scripts/reset-receipts.mjs
```

---

## 8) Prompt for Next Developer

"You are taking over UDITO (Next.js + Wix + Vercel Postgres). Current state:

1. **Receipts work** - electronic receipts are issued on payment via webhook
2. **Refunds work** - refund receipts (сторно) are created with negative amounts
3. **Audit file** - excludes refunded orders in same month, never includes refund receipts

Remaining issues:
- Transaction ID extraction for offline payments is incorrect (see extractTransactionRef in lib/wix.ts)
- QR code format needs verification against NAP requirements
- Partial refunds not supported (only full refunds)

Deploy with: `vercel --prod`
Production: https://udito.vercel.app"

---

## 9) Recent Changes (2026-01-09)

1. Added refund receipt (сторно бележка) support
2. Refunds show as "Сторно (възстановени суми)"
3. Audit file excludes orders refunded in same month
4. Refund receipts never appear in audit file
5. Added CSS styling for refund rows (red border)
6. Renamed "касови бележки" to "електронни бележки" everywhere
7. Added payment date (paidAt) capture from webhook event timestamp
8. Only issue receipts for orders paid >= 2026-01-01
9. **Fixed unique constraint** - now allows both sale and refund receipt per order
10. Database migration drops old `order_id` unique constraint, adds `(order_id, type)` unique index

---

## 10) Contacts

- **GitHub:** https://github.com/RadinaAleksieva/Udito
- **Vercel Project:** radinas-projects-ed60b3ae/udito
