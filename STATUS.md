# UDITO status (saved context)

## Overview
Project: Next.js app in `/Users/mac/udito-app` with Wix OAuth + webhooks + Vercel Postgres.
Goal: Show real orders, store Wix tokens, generate monthly audit XML export.

## Code changes made
1) Dashboard shows real data
- File: `/Users/mac/udito-app/app/overview/page.tsx`
- Shows Wix connection status, last 8 orders, and XML export link.

2) Real XML export from DB
- File: `/Users/mac/udito-app/app/api/audit/monthly/route.ts`
- Reads orders from DB and supports `?month=YYYY-MM` or `?start=YYYY-MM-DD&end=YYYY-MM-DD`.

3) OAuth callback redirects to dashboard
- File: `/Users/mac/udito-app/app/api/oauth/callback/route.ts`
- Redirects to `/overview?connected=1` after token exchange.

4) DB helpers
- File: `/Users/mac/udito-app/lib/db.ts`
- Added `listRecentOrders()` and `listOrdersForPeriod()`.

## Wix configuration status
- OAuth App ID: `49beecc5-cd33-4ced-872e-96d198af5e17`
- OAuth App URL: `https://udito-app.vercel.app`
- Redirect URL: `https://udito-app.vercel.app/api/oauth/callback`
- Permissions currently enabled in Wix:
  - Read site/business/email details
  - Read eCommerce – all read permissions
  - Wix Stores – Read Orders

## Vercel environment variables
- `WIX_APP_SECRET` was updated in Vercel (confirmed success message).
- Other required vars expected:
  - `APP_BASE_URL=https://udito-app.vercel.app`
  - `WIX_APP_ID=49beecc5-cd33-4ced-872e-96d198af5e17`
  - `WIX_OAUTH_SCOPES` (must align with Wix permissions)
  - `ADMIN_SECRET` (already set; needed for admin endpoints)
  - Postgres vars (already present from Neon)

## Outstanding steps (in order)
1) Redeploy in Vercel so updated `WIX_APP_SECRET` takes effect.
2) Confirm/adjust `WIX_OAUTH_SCOPES` in Vercel to match Wix permissions.
3) Initialize DB: `POST /api/admin/init-db` with `Authorization: Bearer <ADMIN_SECRET>`.
4) Connect Wix: open `/overview` and click “Connect Wix” to complete OAuth.
5) Optional backfill: `POST /api/admin/backfill` to load historical orders.
6) Test export: `/api/audit/monthly?month=2024-01` (or custom date range).

## Notes
- Webhook endpoint exists: `https://udito-app.vercel.app/api/webhooks/wix/orders`.
- Audit XML currently uses merchant data from env vars if set; defaults are in code.
- Vercel redeploy was triggered and completed successfully, but production UI stayed old because the repo still lacks code.
- GitHub repo `https://github.com/RadinaAleksieva/Udito` is empty; started populating via web UI:
  - Committed: `package.json`, `.gitignore`, `next-env.d.ts`.
