#!/bin/bash
set -e

node --version
npm --version

pm2 stop --silent ${DEPLOYMENT_ENV}
pm2 delete --silent ${DEPLOYMENT_ENV}
npm install
pm2 start ecosystem.config.js \
    --only ${DEPLOYMENT_ENV} \
    --max-memory-restart 1G \
    --log-date-format 'YYYY-MM-DD HH:mm Z'

pm2 save
