import mongoose from 'mongoose';
import connectDB from '../database/database.js';
import User from '../database/models/User.js';
import PlaidAccount from '../database/models/PlaidAccount.js';
import Transaction from '../database/models/Transaction.js';
import Liability from '../database/models/Liability.js';
import plaidService from '../services/plaid.service.js';
import structuredLogger from '../lib/structuredLogger.js';

async function resyncUserTransactions() {
  await connectDB();

  const args = process.argv.slice(2);
  const userIdArg = args.find(arg => !arg.startsWith('--'));
  const isDryRun = !args.includes('--no-dry-run');

  if (!userIdArg) {
    console.error("Usage: node -r dotenv/config scripts/resync-user-transactions.js <user_id_or_auth_uid> [--no-dry-run]");
    process.exit(1);
  }

  if (isDryRun) {
    structuredLogger.logWarning("--- Running in DRY RUN mode. No data will be modified. Use --no-dry-run to execute. ---");
  } else {
    structuredLogger.logWarning("--- Running in LIVE mode. Data will be deleted and updated. ---");
  }

  structuredLogger.logInfo(`Starting transaction re-sync for user: ${userIdArg}`);

  try {
    // Step 1: Find the user by authUid or _id
    let user;
    if (mongoose.Types.ObjectId.isValid(userIdArg)) {
        user = await User.findById(userIdArg);
    } else {
        user = await User.findOne({ authUid: userIdArg });
    }
    
    if (!user) {
      structuredLogger.logError(`User not found with identifier: ${userIdArg}`);
      process.exit(1);
    }
    structuredLogger.logInfo(`Found user: ${user.email[0].email} (_id: ${user._id})`);

    // Step 2: Find all unique itemIds associated with the user's Plaid accounts
    const userAccounts = await PlaidAccount.find({ owner_id: user._id });
    if (!userAccounts || userAccounts.length === 0) {
        structuredLogger.logInfo(`No Plaid accounts found for user: ${user._id}`);
        process.exit(0);
    }
    const itemIds = [...new Set(userAccounts.map(acc => acc.itemId))];
    structuredLogger.logInfo(`Found ${itemIds.length} unique items to resync for user ${user._id}.`);

    let successCount = 0;
    let failureCount = 0;

    // Step 3: Iterate through each itemId and perform the resync
    for (const itemId of itemIds) {
      structuredLogger.logInfo(`--- Processing item: ${itemId} ---`);
      try {
        const accounts = await PlaidAccount.find({ itemId: itemId });
        if (!accounts || accounts.length === 0) {
          structuredLogger.logWarning(`No Plaid accounts found for item ID during loop: ${itemId}`);
          continue;
        }
        const plaidAccountIds = accounts.map(a => a.plaid_account_id);

        const numTransactionsToDelete = await Transaction.countDocuments({ plaidAccountId: { $in: plaidAccountIds } });
        const numLiabilitiesToDelete = await Liability.countDocuments({ accountId: { $in: plaidAccountIds } });

        if (isDryRun) {
          structuredLogger.logInfo(`[DRY RUN] Would delete ${numTransactionsToDelete} transactions for ${accounts.length} accounts.`);
          structuredLogger.logInfo(`[DRY RUN] Would delete ${numLiabilitiesToDelete} liabilities.`);
          structuredLogger.logInfo(`[DRY RUN] Would clear sync cursor.`);
          structuredLogger.logInfo(`[DRY RUN] Would trigger transaction update.`);
          successCount++;
          continue;
        }

        // ----- Live Mode -----
        structuredLogger.logInfo(`Deleting existing transactions for ${accounts.length} accounts.`);
        const deleteResult = await Transaction.deleteMany({ plaidAccountId: { $in: plaidAccountIds } });
        structuredLogger.logSuccess(`Deleted ${deleteResult.deletedCount} transactions.`);

        structuredLogger.logInfo(`Deleting existing liabilities.`);
        const liabilityDeleteResult = await Liability.deleteMany({ accountId: { $in: plaidAccountIds } });
        structuredLogger.logSuccess(`Deleted ${liabilityDeleteResult.deletedCount} liabilities.`);

        structuredLogger.logInfo("Clearing the transaction sync cursor by setting nextCursor to null.");
        await PlaidAccount.updateMany({ itemId: itemId }, { $set: { nextCursor: null } });
        structuredLogger.logSuccess("Successfully cleared the sync cursor.");

        structuredLogger.logInfo("Triggering plaidService.updateTransactions to fetch fresh data.");
        await plaidService.updateTransactions(itemId);
        
        structuredLogger.logSuccess(`Transaction re-sync completed successfully for item: ${itemId}`);
        successCount++;

      } catch (error) {
        if (isDryRun) {
            structuredLogger.logErrorBlock(error, { operation: "resync-user-transactions (dry-run)", itemId: itemId, message: "Failed during read-only phase of dry run." });
        } else {
            structuredLogger.logErrorBlock(error, { operation: "resync-user-transactions (live-run)", itemId: itemId, message: `Failed to resync item. It may be expired or invalid.` });
        }
        failureCount++;
      }
    }

    structuredLogger.logInfo(`--- Resync Summary for user ${user._id} ---`);
    structuredLogger.logSuccess(`Successfully processed ${successCount} items.`);
    if (failureCount > 0) {
        structuredLogger.logWarning(`Failed to process ${failureCount} items. Check logs above for details.`);
    } else {
        structuredLogger.logInfo(`All items were processed without any failures.`);
    }


  } catch (error) {
    structuredLogger.logErrorBlock(error, { operation: "resync-user-transactions", userIdArg: userIdArg });
    process.exit(1);
  }

  console.log("\n--- User re-sync script finished ---");
  process.exit(0);
}

resyncUserTransactions();
