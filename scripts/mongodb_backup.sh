#!/usr/bin/env bash
set -euo pipefail

LOG_TS() {
  date +'%F %T'
}

# 1) Require env file
if [[ ! -f /root/.mongo_backup_env ]]; then
  echo "$(LOG_TS) ERROR: Missing /root/.mongo_backup_env. Backup aborted." >&2
  exit 1
fi

# shellcheck source=/root/.mongo_backup_env
. /root/.mongo_backup_env

# 2) Require MONGO_BACKUP_URI to be set
if [[ -z "${MONGO_BACKUP_URI:-}" ]]; then
  echo "$(LOG_TS) ERROR: MONGO_BACKUP_URI is not set. Backup aborted." >&2
  exit 1
fi

MONGO_URI="$MONGO_BACKUP_URI"

# 3) Paths and retention
BACKUP_ROOT="/var/backups/mongodb"
DAILY_DIR="$BACKUP_ROOT/daily"
WEEKLY_DIR="$BACKUP_ROOT/weekly"

DAILY_KEEP_DAYS=30      # daily for ~1 month
WEEKLY_KEEP_DAYS=365    # weekly for ~12 months

TODAY_DATE="$(date +%F)"    # YYYY-MM-DD
DAY_OF_WEEK="$(date +%u)"   # 1–7 (Mon–Sun)

mkdir -p "$DAILY_DIR" "$WEEKLY_DIR"
chmod -R 700 /var/backups/mongodb

DAILY_FILE="$DAILY_DIR/zentavos-$TODAY_DATE.archive.gz"

# 4) Run mongodump
/usr/bin/mongodump \
  --uri="$MONGO_URI" \
  --archive="$DAILY_FILE" \
  --gzip

# 5) Prune old daily backups
find "$DAILY_DIR" -type f -mtime +"$DAILY_KEEP_DAYS" -print -delete

# 6) Once a week (Sunday), copy to weekly
if [[ "$DAY_OF_WEEK" -eq 7 ]]; then
  WEEKLY_FILE="$WEEKLY_DIR/zentavos-$TODAY_DATE.archive.gz"
  cp "$DAILY_FILE" "$WEEKLY_FILE"
fi

# 7) Prune old weekly backups
find "$WEEKLY_DIR" -type f -mtime +"$WEEKLY_KEEP_DAYS" -print -delete

echo "$(LOG_TS) INFO: MongoDB backup completed successfully."
