# UDITO - Deployment Documentation

## Server Info

- **Server IP**: 78.47.173.82
- **Domain**: app.uditodevelopment.website
- **SSH User**: root
- **App Location**: /var/www/udito-app

## SSH Access

```bash
ssh root@78.47.173.82
```

**Root Password**: ijLWkrVUeHP4

SSH Public Key (вече е добавен на сървъра):
```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJetgWtJUOV92q/AwvJxV7tES+PMsKpusS6zyT8F98h4 mac@192.168.100.13
```

SSH Private Key Location: `~/.ssh/id_ed25519`

## Database

- **Type**: PostgreSQL
- **Host**: 127.0.0.1 (локално на сървъра)
- **Port**: 5432
- **Database**: udito
- **User**: udito_user
- **Password**: udito_password

Connection string (от сървъра):
```
postgresql://udito_user:udito_password@127.0.0.1:5432/udito
```

Connection string (отвън, за локална разработка):
```
postgresql://udito_user:udito_password@78.47.173.82:5432/udito
```

## How to Deploy

**ВАЖНО**: GitHub push НЕ deploy-ва автоматично! Трябва ръчен deploy.

### Стъпки за deploy:

1. **Sync кода към сървъра**:
```bash
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude '.git' /Users/mac/udito-app/ root@78.47.173.82:/var/www/udito-app/
```

2. **Build на сървъра**:
```bash
ssh root@78.47.173.82 "cd /var/www/udito-app && npm run build"
```

3. **Restart приложението**:
```bash
ssh root@78.47.173.82 "pm2 restart udito"
```

### Всичко в една команда:
```bash
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude '.git' /Users/mac/udito-app/ root@78.47.173.82:/var/www/udito-app/ && ssh root@78.47.173.82 "cd /var/www/udito-app && npm run build && pm2 restart udito"
```

## Logs

Виж логовете:
```bash
ssh root@78.47.173.82 "pm2 logs udito --lines 50"
```

Само error логове:
```bash
ssh root@78.47.173.82 "pm2 logs udito --err --lines 50"
```

Real-time логове:
```bash
ssh root@78.47.173.82 "pm2 logs udito"
```

## PM2 Commands

```bash
# Статус
ssh root@78.47.173.82 "pm2 status"

# Restart
ssh root@78.47.173.82 "pm2 restart udito"

# Stop
ssh root@78.47.173.82 "pm2 stop udito"

# Start
ssh root@78.47.173.82 "pm2 start udito"
```

## Environment Variables

Production env файлът е на сървъра: `/var/www/udito-app/.env.production`

Съдържа:
- DATABASE_URL
- APP_BASE_URL
- NEXTAUTH_URL
- NEXTAUTH_SECRET
- WIX_APP_ID
- WIX_APP_SECRET
- WIX_APP_PUBLIC_KEY
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- CRON_SECRET

## Architecture

```
                    ┌─────────────────────────┐
                    │   Cloudflare (DNS/SSL)  │
                    └───────────┬─────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────┐
│                Server: 78.47.173.82                      │
│  ┌─────────────────┐    ┌─────────────────────────────┐ │
│  │   PostgreSQL    │    │     Next.js App (PM2)       │ │
│  │   Port 5432     │◄───│     Port 3000               │ │
│  │   DB: udito     │    │     /var/www/udito-app      │ │
│  └─────────────────┘    └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Tenant Architecture

Всеки Wix магазин има собствена PostgreSQL schema:
- `public` - общи таблици (users, businesses, wix_tokens, store_connections)
- `site_{siteId}` - tenant-specific таблици (orders, receipts, companies)

Пример: `site_6240f8a5_7af4_4fdf_96c1_d1f22b205408`
