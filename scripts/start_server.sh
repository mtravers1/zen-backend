#!/bin/bash
set -e
set -x # Print every command to the log *before* it runs (SUPER HELPFUL)

echo "--- DEBUG: Starting deployment script ---"
echo "--- DEBUG: Current user: $(whoami)"
echo "--- DEBUG: Current directory: $(pwd)"
echo "--- DEBUG: Files in directory: ---"
ls -la

node --version
npm --version

echo "--- DEBUG: Starting PM2 ---"
# Use pm2 reload for zero-downtime deployments and --no-daemon for loud logging
pm2 reload ecosystem.config.js \
    --only ${DEPLOYMENT_ENV} \
    --name ${DEPLOYMENT_ENV} \
    --max-memory-restart 1G \
    --log-date-format 'YYYY-MM-DD HH:mm Z' \
    --no-daemon

pm2 save