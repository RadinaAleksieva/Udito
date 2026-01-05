# UDITO Handoff

## Remaining steps (from STATUS.md)

1) Confirm Vercel deploy
- Open the deploy inspect link and ensure build succeeds.
- Production alias should point to `https://udito-app.vercel.app`.

Latest deploy info:
- Inspect: https://vercel.com/radinas-projects-94b61aff/udito-app/DhiV43hHtZdQivhx5chDAfX9Z7Ah
- Production (queued at time of deploy): https://udito-m37vtcqk1-radinas-projects-94b61aff.vercel.app

2) Ensure Vercel environment variables
- `APP_BASE_URL=https://udito-app.vercel.app`
- `WIX_APP_ID=49beecc5-cd33-4ced-872e-96d198af5e17`
- `WIX_APP_SECRET` (already updated)
- `WIX_OAUTH_SCOPES` (must align with Wix permissions)
- `ADMIN_SECRET` (already set)
- Postgres vars (already present from Neon)

3) Initialize DB
Run:
```bash
curl -X POST https://udito-app.vercel.app/api/admin/init-db \
  -H "Authorization: Bearer <ADMIN_SECRET>"
```

4) Connect Wix (OAuth)
- Open `https://udito-app.vercel.app/overview`
- Click “Connect Wix” to complete OAuth
- Should redirect to `/overview?connected=1`

5) Optional: Backfill historical orders
```bash
curl -X POST https://udito-app.vercel.app/api/admin/backfill \
  -H "Authorization: Bearer <ADMIN_SECRET>"
```

6) Test export
```bash
curl "https://udito-app.vercel.app/api/audit/monthly?month=2024-01"
```

## Notes
- Webhook endpoint: `https://udito-app.vercel.app/api/webhooks/wix/orders`
- Audit XML uses merchant data from env vars if set; defaults exist in code.
- Git author fixed to `RadinaAleksieva <radina.aleksieva@designedbypo.com>`.
