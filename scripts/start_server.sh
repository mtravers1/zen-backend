#!/bin/bash
DEPLOYMENT_ENV=dev
pm2 stop --silent ${DEPLOYMENT_ENV}
pm2 delete --silent ${DEPLOYMENT_ENV}
npm install
pm2 start ecosystem.config.js --only ${DEPLOYMENT_ENV} --max-memory-restart 1G --log-date-format 'DD-MM HH:mm:ss.SSS'

pm2 save