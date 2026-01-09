#!/bin/bash

# Manual order sync script
# Usage: ./scripts/manual-sync-order.sh ORDER_ID

ORDER_ID=$1
SITE_ID="6240f8a5-7af4-4fdf-96c1-d1f22b205408"

if [ -z "$ORDER_ID" ]; then
  echo "Usage: $0 ORDER_ID"
  echo "Example: $0 a256adde-11da-4c85-b200-4f9ae78b414f"
  exit 1
fi

# Load ADMIN_SECRET from .env.local
ADMIN_SECRET=$(grep "^ADMIN_SECRET=" .env.local | cut -d'=' -f2 | tr -d '"')

if [ -z "$ADMIN_SECRET" ]; then
  echo "Error: ADMIN_SECRET not found in .env.local"
  exit 1
fi

echo "Syncing order $ORDER_ID for site $SITE_ID..."

curl -X POST https://udito.vercel.app/api/admin/sync-order \
  -H "Content-Type: application/json" \
  -d "{\"orderId\":\"$ORDER_ID\",\"siteId\":\"$SITE_ID\",\"adminSecret\":\"$ADMIN_SECRET\"}"

echo ""
echo "Done!"
