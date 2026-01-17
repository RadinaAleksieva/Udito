# UDITO Internal API Reference

## Authentication

All protected endpoints require a valid NextAuth session. Admin endpoints require either:
- `ADMIN_SECRET` header (for CLI/cron)
- `ADMIN_EMAILS` environment variable (for web UI)

## Public Endpoints

### `POST /api/auth/register`
Register a new user with email/password.

### `POST /api/auth/[...nextauth]`
NextAuth.js authentication (Google OAuth + Credentials).

### `GET /api/auth/check-email?email=xxx`
Check if email is already registered.

### `POST /api/contact`
Submit contact form.

---

## User Endpoints (Require Session)

### `GET /api/user/stores`
List all stores connected to current user.

### `POST /api/stores/connect`
Connect a store by instanceId.

### `POST /api/stores/join`
Join a store using access code.

### `DELETE /api/stores/delete`
Remove store connection.

### `POST /api/site/select`
Set active store for session.

---

## Company/Settings Endpoints

### `GET /api/company`
Get company settings for active store.

### `POST /api/company`
Update company settings (name, EIK, VAT, address, etc.).

### `GET /api/receipts/settings`
Get receipt settings (start date, COD enabled, etc.).

### `POST /api/receipts/settings`
Update receipt settings.

### `GET /api/receipts/appearance`
Get receipt appearance settings (logo, colors).

### `POST /api/receipts/appearance`
Update receipt appearance.

---

## Orders & Receipts

### `GET /api/orders/list`
List orders with receipts for active store.
Query params: `startDate`, `endDate`, `limit`

### `POST /api/receipts/cancel`
Cancel/void a receipt.
Body: `{ receiptId: number }`

### `POST /api/receipts/return-type`
Update refund receipt return payment type.
Body: `{ receiptId: number, returnPaymentType: number }`

---

## Reports & Audit

### `GET /api/reports/monthly`
Get monthly summary report.
Query params: `year`, `month`

### `GET /api/audit/monthly`
Generate XML audit file for NAP.
Query params: `year`, `month`

### `GET /api/usage`
Get current usage stats and plan limits.

---

## Access Management

### `GET /api/access/list`
List all users with access to current store.

### `POST /api/access/generate-code`
Generate access code for inviting users.

### `POST /api/stores/access-code`
Validate access code.

### `GET /api/stores/users`
List users for store management.

---

## Onboarding

### `GET /api/onboarding/status`
Get current onboarding status.

### `POST /api/onboarding/company`
Save company details (step 1).

### `POST /api/onboarding/settings`
Save receipt settings (step 2).

### `POST /api/onboarding/plan`
Select subscription plan (step 3).

### `POST /api/onboarding/complete`
Mark onboarding as complete.

---

## Wix Integration

### `GET /api/oauth/start`
Start Wix OAuth flow.

### `GET /api/oauth/authorize`
Handle Wix OAuth authorization.

### `GET /api/oauth/callback`
Wix OAuth callback (token exchange).

### `POST /api/webhooks/wix/orders`
Wix order webhooks (create, update, payment status).

### `GET /api/instance`
Get Wix instance details.

---

## Sync & Backfill

### `POST /api/sync/initial`
Start initial order sync from Wix.

### `POST /api/backfill`
Backfill orders (with receipts).

### `POST /api/backfill/fast`
Fast backfill (orders only, no receipts).

---

## Subscription & Billing

### `GET /api/subscription/status`
Get current subscription status.

### `POST /api/stripe/setup-intent`
Create Stripe SetupIntent for card.

### `POST /api/stripe/verify-card`
Verify saved card.

---

## Cron Jobs

### `GET /api/cron/process-refunds`
Process pending refund queue.
Auth: `CRON_SECRET` Bearer token.

### `GET /api/sync/cron`
Daily sync cron job.

---

## Admin Endpoints

All require `ADMIN_SECRET` or `ADMIN_EMAILS` authorization.

### `GET /api/admin/dashboard`
Admin dashboard stats.

### `GET /api/admin/businesses`
List all businesses.

### `GET /api/admin/orders`
List orders (admin view).

### `GET /api/admin/webhook-logs`
View webhook logs.

### `POST /api/admin/init-db`
Initialize database tables.

### `POST /api/admin/migrate-tenants`
Migrate data to tenant tables.

### `POST /api/admin/backfill`
Admin backfill with site selection.

### `POST /api/admin/fix-receipts`
Fix receipt issues.

---

## Tenant Architecture

Each store has its own tables:
- `orders_{siteId}` - Orders with `is_synced` flag
- `receipts_{siteId}` - Receipts with unique (order_id, type)
- `webhook_logs_{siteId}` - Webhook history
- `pending_refunds_{siteId}` - Refund queue
- `monthly_usage_{siteId}` - Usage tracking
- `audit_logs_{siteId}` - Audit trail

Key functions in `lib/tenant-db.ts`:
- `createTenantTables(siteId)`
- `upsertTenantOrder(siteId, order)`
- `issueTenantReceipt(siteId, receipt)`
- `logAuditEvent(siteId, entry)`
- `queuePendingRefund(siteId, refund)`
