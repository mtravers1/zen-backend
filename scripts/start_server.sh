#!/bin/bash
set -e
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