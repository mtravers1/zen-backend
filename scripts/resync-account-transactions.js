
import connectDB from '../database/database.js';
import PlaidAccount from '../database/models/PlaidAccount.js';
import Transaction from '../database/models/Transaction.js';
import AccessToken from '../database/models/AccessToken.js';
import plaidService from '../services/plaid.service.js';
import structuredLogger from '../lib/structuredLogger.js';

async function resyncAccountTransactions() {
  await connectDB();

  const isDryRun = process.argv.includes('--dry-run');
  const runForAllUsers = process.argv.includes('--all-users');
  // Find the first argument that is not a flag.
  const itemId = process.argv.slice(2).find(arg => !arg.startsWith('--'));

  if (isDryRun) {
    structuredLogger.logInfo('Running in DRY-RUN mode. No data will be changed.');
  }

  if (runForAllUsers) {
    structuredLogger.logInfo('Running for all users...');
    const allItems = await AccessToken.find({ isAccessTokenExpired: { $ne: true } }).distinct('itemId');
    structuredLogger.logInfo(`Found ${allItems.length} items to process.`);
    for (const singleItemId of allItems) {
      await processItem(singleItemId, isDryRun);
    }
  } else if (itemId) {
    await processItem(itemId, isDryRun);
  } else {
    console.error("Usage: node -r dotenv/config scripts/resync-account-transactions.js [--all-users | <itemId>] [--dry-run]");
    process.exit(1);
  }

  console.log("\n--- Re-sync script finished ---");
  process.exit(0);
}

async function processItem(itemId, isDryRun) {
  structuredLogger.logInfo(`\nProcessing item: ${itemId}`);

  try {
    const accessToken = await plaidService.getAccessTokenFromItemId(itemId);
    if (!accessToken) {
        structuredLogger.logError(`Could not get decrypted access token for item ID: ${itemId}. Skipping.`);
        return;
    }

    // Health Check
    try {
      await plaidService.getItemWithAccessToken(accessToken);
      structuredLogger.logSuccess(`Health check PASSED for item: ${itemId}`);
    } catch (error) {
      structuredLogger.logError(`Health check FAILED for item: ${itemId}. Plaid API error: ${error.message}. Skipping.`);
      await plaidService.handlePlaidError(error, itemId);
      return; 
    }

    if (isDryRun) {
      return; // In dry-run, we only perform the health check.
    }

    // --- LIVE RUN ---
    structuredLogger.logInfo(`Starting live re-sync for item: ${itemId}`);

    // Step 1: Fetch new transactions first
    structuredLogger.logInfo("Fetching fresh transactions from Plaid...");
    // Note: The new fetchTransactions function returns a result that is not yet used here.
    // The subsequent call to updateTransactions will re-fetch.
    // This is safer than the original script, but could be optimized in the future.
    await plaidService.fetchTransactions(itemId);
    structuredLogger.logSuccess(`Successfully fetched all transactions for item ${itemId}.`);

    // Step 2: Find all accounts for the given item ID
    const accounts = await PlaidAccount.find({ itemId: itemId });
    if (!accounts || accounts.length === 0) {
      structuredLogger.logWarning(`No Plaid accounts found for item ID: ${itemId}. Cannot delete transactions if there are no accounts.`);
    } else {
        const plaidAccountIds = accounts.map(a => a.plaid_account_id);
        // Step 3: Delete all existing transactions for these accounts
        structuredLogger.logInfo(`Deleting existing transactions for ${plaidAccountIds.length} accounts.`);
        const deleteResult = await Transaction.deleteMany({ plaidAccountId: { $in: plaidAccountIds } });
        structuredLogger.logSuccess(`Deleted ${deleteResult.deletedCount} transactions.`);
    }

    // Step 4: Clear the sync cursor to ensure a full resync
    structuredLogger.logInfo("Clearing the transaction sync cursor by setting nextCursor to null.");
    await PlaidAccount.updateMany({ itemId: itemId }, { $set: { nextCursor: null } });
    structuredLogger.logSuccess("Successfully cleared the sync cursor.");

    // Step 5: Trigger the transaction update to save the fresh data.
    structuredLogger.logInfo("Triggering plaidService.updateTransactions to save fresh data.");
    await plaidService.updateTransactions(itemId);
    structuredLogger.logSuccess("Transaction re-sync completed successfully.");

  } catch (error) {
    structuredLogger.logErrorBlock(error, { operation: "resync-account-transactions", itemId: itemId });
  }
}

resyncAccountTransactions();
