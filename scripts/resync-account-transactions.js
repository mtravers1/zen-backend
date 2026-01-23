
import connectDB from '../database/database.js';
import PlaidAccount from '../database/models/PlaidAccount.js';
import Transaction from '../database/models/Transaction.js';
import plaidService from '../services/plaid.service.js';
import structuredLogger from '../lib/structuredLogger.js';

async function resyncAccountTransactions() {
  await connectDB();

  const itemId = process.argv[2]; // Expecting item ID as the first argument
  if (!itemId) {
    console.error("Usage: node -r dotenv/config scripts/resync-account-transactions.js <itemId>");
    process.exit(1);
  }

  structuredLogger.logInfo(`Starting transaction re-sync for item: ${itemId}`);

  try {
    // Step 1: Find all accounts for the given item ID
    const accounts = await PlaidAccount.find({ itemId: itemId });
    if (!accounts || accounts.length === 0) {
      structuredLogger.logError(`No Plaid accounts found for item ID: ${itemId}`);
      process.exit(1);
    }
    structuredLogger.logInfo(`Found ${accounts.length} accounts for item ID: ${itemId}`);
    const plaidAccountIds = accounts.map(a => a.plaid_account_id);

    // Step 2: Delete all existing transactions for these accounts
    structuredLogger.logInfo(`Deleting existing transactions for ${plaidAccountIds.length} accounts.`);
    const deleteResult = await Transaction.deleteMany({ plaidAccountId: { $in: plaidAccountIds } });
    structuredLogger.logSuccess(`Deleted ${deleteResult.deletedCount} transactions.`);

    // Step 3: Clear the sync cursor
    structuredLogger.logInfo("Clearing the transaction sync cursor by setting nextCursor to null.");
    await PlaidAccount.updateMany({ itemId: itemId }, { $set: { nextCursor: null } });
    structuredLogger.logSuccess("Successfully cleared the sync cursor.");

    // Step 4: Trigger the transaction update
    structuredLogger.logInfo("Triggering plaidService.updateTransactions to fetch fresh data.");
    await plaidService.updateTransactions(itemId);
    structuredLogger.logSuccess("Transaction re-sync completed successfully.");

  } catch (error) {
    structuredLogger.logErrorBlock(error, { operation: "resync-account-transactions", itemId: itemId });
    process.exit(1);
  }

  console.log("\n--- Re-sync script finished ---");
  process.exit(0);
}

resyncAccountTransactions();
