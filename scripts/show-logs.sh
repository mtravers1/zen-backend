#!/bin/bash
set -e

echo "--- Displaying logs from PM2 ---"
# The DEPLOYMENT_ENV variable would need to be set in the CI environment.
pm2 logs ${DEPLOYMENT_ENV} --lines 200 --nostream

echo "--- Displaying log files from /var/log/zentavos/ ---"
# This may require running the script with sudo.
cat /var/log/zentavos/api-out.log || echo "Could not read /var/log/zentavos/api-out.log"
cat /var/log/zentavos/api-error.log || echo "Could not read /var/log/zentavos/api-error.log"
