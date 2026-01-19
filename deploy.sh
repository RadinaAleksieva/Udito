#!/bin/bash
# Deploy script - excludes .env.local and user uploads to preserve server data
rsync -avz --exclude 'node_modules' --exclude '.next' --exclude '.git' --exclude '.env.local' --exclude 'public/uploads' /Users/mac/udito-app/ root@78.47.173.82:/var/www/udito-app/
ssh root@78.47.173.82 "cd /var/www/udito-app && npm run build && pm2 restart udito --update-env"
