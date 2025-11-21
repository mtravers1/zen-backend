#!/bin/bash
set -e

# Ensure the port is free before starting a new process
echo "--- Ensuring port 3002 is free ---"
# Use lsof to find the PID on TCP port 3002 and kill it.
# The command is wrapped to prevent errors if the port is already free.
lsof -t -i:3002 | xargs -r kill -9 || true

# Navigate to the app directory if it exists
if [ -d "/home/zentavos/zentavos_api" ]; then
  cd /home/zentavos/zentavos_api || exit
fi

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  echo "--- Loading environment variables from .env file ---"
  set -a # Automatically export all variables from now on
  source .env
  set +a # Stop automatically exporting
fi

# DEPLOYMENT_ENV is set by the export above.
# We still need to lowercase it for PM2.
DEPLOYMENT_ENV=$(echo $ENVIRONMENT | tr '[:upper:]' '[:lower:]')

# Check if DEPLOYMENT_ENV is set
if [ -z "$DEPLOYMENT_ENV" ]; then
    echo "Error: ENVIRONMENT variable was not found in .env file."
    exit 1
fi

node --version
npm --version

echo '--- DEBUG: Starting PM2 ---

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
