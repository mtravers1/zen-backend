#!/bin/bash
set -e

# Ensure the port is free before starting a new process
echo "--- Ensuring port 3002 is free ---"

# Find PID using ss and kill it. Robustly handles no process found.
PID_TO_KILL=$(ss -lptn 'sport = :3002' 2>/dev/null | awk -F'pid=' '{print $2}' | cut -d',' -f1)
if [ -n "$PID_TO_KILL" ]; then
  echo "Killing process $PID_TO_KILL on port 3002"
  kill -9 "$PID_TO_KILL" || true
else
  echo "Port 3002 is already free."
fi

# Navigate to the app directory if it exists
if [ -d "/home/zentavos/zentavos_api" ]; then
  cd /home/zentavos/zentavos_api || exit
fi

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  echo "--- Loading environment variables from .env file ---"
  export $(cat .env | sed 's/#.*//g' | xargs)
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

echo '--- DEBUG: Starting PM2 ---'



echo "--> Stopping and deleting ALL existing PM2 processes to ensure a clean environment..."
pm2 delete all || true

echo "--> Starting new PM2 process for '${DEPLOYMENT_ENV}'..."
pm2 start ecosystem.config.cjs \
    --only ${DEPLOYMENT_ENV} \
    --name ${DEPLOYMENT_ENV} \
    --max-memory-restart 1G \
    --log-date-format 'YYYY-MM-DD HH:mm Z'

pm2 save

echo "--- Displaying final PM2 status ---"
pm2 list
