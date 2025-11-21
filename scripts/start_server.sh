#!/bin/bash
set -e

# Ensure the port is free before starting a new process
echo "--- Ensuring port 3002 is free ---"
fuser -k 3002/tcp || true

# Navigate to the app directory if it exists
if [ -d "/home/zentavos/zentavos_api" ]; then
  cd /home/zentavos/zentavos_api || exit
fi

# Load environment variables from .env file if it exists
if [ -f .env ]; then
set -x # Print every command to the log *before* it runs (SUPER HELPFUL)

echo "--- DEBUG: Starting deployment script ---"
echo "--- DEBUG: Current user: $(whoami)"
echo "--- DEBUG: Current directory: $(pwd)"
echo "--- DEBUG: Files in directory: ---"
ls -la

if [ -f .env ]; then
  export $(cat .env | sed 's/#.*//g' | xargs)
fi

node --version
npm --version

echo '--- DEBUG: Starting PM2 ---'

pm2 startOrReload ecosystem.config.cjs \
    --only ${DEPLOYMENT_ENV} \
    --name ${DEPLOYMENT_ENV} \
    --max-memory-restart 1G \
    --log-date-format 'YYYY-MM-DD HH:mm Z'

# Wait for a moment to let the app initialize or crash
sleep 5

# Display the latest logs to the CI output
echo "--- Displaying latest logs from PM2 ---"
pm2 logs ${DEPLOYMENT_ENV} --lines 100 --nostream

echo "--- Displaying final PM2 status ---"
pm2 list

pm2 save