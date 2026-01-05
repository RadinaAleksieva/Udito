# UDITO app

Next.js app for Wix OAuth, order webhooks, and monthly audit XML export.

## What it does
- Connects to Wix via OAuth and stores tokens in Postgres.
- Receives Wix order webhooks and stores orders.
- Shows recent orders in `/overview`.
- Exports monthly XML via `/api/audit/monthly`.

## Local dev
1) Install deps:
```bash
npm install
```
2) Set env vars in `.env.local` (see below).
3) Run:
```bash
npm run dev
```

## Required env vars
These must be set in Vercel and for local dev.
- `APP_BASE_URL` (e.g. `http://localhost:3000` or `https://udito-app.vercel.app`)
- `WIX_APP_ID`
- `WIX_APP_SECRET`
- `WIX_OAUTH_SCOPES` (space-delimited, must match Wix permissions)
- `ADMIN_SECRET` (for admin endpoints)
- Postgres env vars from Vercel/Neon (`POSTGRES_*`)

## Important routes
- Dashboard: `/overview`
- OAuth callback: `/api/oauth/callback`
- Wix webhooks: `/api/webhooks/wix/orders`
- Monthly XML: `/api/audit/monthly?month=YYYY-MM`
- Admin init DB: `POST /api/admin/init-db` (Bearer `ADMIN_SECRET`)
- Admin backfill: `POST /api/admin/backfill` (Bearer `ADMIN_SECRET`)

## Deploy (Vercel)
1) Push repo to GitHub.
2) Ensure Vercel project is linked to the repo.
3) Set env vars in Vercel.
4) Redeploy to pick up new env vars.

## Wix setup
- App URL: `https://udito-app.vercel.app`
- Redirect URL: `https://udito-app.vercel.app/api/oauth/callback`
- Permissions: read site/business/email + read eCommerce + Wix Stores read orders.
