#!/bin/bash

set -e

DRY_RUN=true
if [ "$1" == "--no-dry-run" ]; then
  DRY_RUN=false
fi

if [ "$DRY_RUN" = true ]; then
  echo "--- Starting user data wipe DRY RUN ---"
  echo "This is a dry run. No data will be deleted."
  echo "Run with --no-dry-run to execute."

  echo "Step 1: Running delete-all-users script (dry run)..."
  node -r dotenv/config scripts/delete-all-users.js --dry-run

  echo "Step 2: Running cleanup for orphaned database records (dry run)..."
  node -r dotenv/config scripts/cleanup-orphaned-data.js --dry-run

  echo "Step 3: Running cleanup for orphaned Firebase users (dry run)..."
  node -r dotenv/config scripts/cleanup-firebase-users.js --dry-run

  echo "--- Dry run finished ---"
else
  echo "--- Starting complete user data wipe EXECUTION ---"

  echo "Step 1: Running delete-all-users script..."
  node -r dotenv/config scripts/delete-all-users.js --confirmed-delete-users

  echo "Step 2: Running cleanup for orphaned database records..."
  node -r dotenv/config scripts/cleanup-orphaned-data.js --no-dry-run

  echo "Step 3: Running cleanup for orphaned Firebase users..."
  node -r dotenv/config scripts/cleanup-firebase-users.js --no-dry-run

  echo "--- Complete user data wipe finished successfully ---"
fi