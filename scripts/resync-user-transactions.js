import mongoose from 'mongoose';
import connectDB from '../database/database.js';
import User from '../database/models/User.js';
import PlaidAccount from '../database/models/PlaidAccount.js';
import Transaction from '../database/models/Transaction.js';
import Liability from '../database/models/Liability.js';
import plaidService from '../services/plaid.service.js';
import structuredLogger from '../lib/structuredLogger.js';

async function processItem(itemId, isDryRun) {
  structuredLogger.logInfo(`
--- Processing item: ${itemId} ---`);
  let accounts, plaidAccountIds;

  try {
    accounts = await PlaidAccount.find({ itemId: itemId });
    plaidAccountIds = accounts.map(a => a.plaid_account_id);

    const accessToken = await plaidService.getAccessTokenFromItemId(itemId);
    if (!accessToken) {
        const reason = 'Could not get decrypted access token';
        structuredLogger.logError(`${reason} for item ID: ${itemId}.`);

        if (isDryRun) {
            structuredLogger.logWarning(`[DRY RUN] Would mark item ${itemId} as bad.`);
        } else {
            try {
                const updateResult = await PlaidAccount.updateMany(
                    { itemId: itemId },
                    { $set: { status: 'bad' } }
                );
                structuredLogger.logInfo(`Marked ${updateResult.nModified} accounts as bad for item ID: ${itemId}`);
            } catch (dbError) {
                structuredLogger.logErrorBlock(dbError, {
                    operation: 'mark-bad-item-db-update',
                    itemId: itemId,
                    message: `Failed to update PlaidAccount documents in the database for item ID: ${itemId}.`,
                });
                // We still return a failure, but with a more specific DB error reason
                return { success: false, reason: `DB error while marking bad item: ${dbError.message}`, accounts: plaidAccountIds };
            }
        }
        return { success: false, reason: reason, accounts: plaidAccountIds };
    }

    // Health Check
    try {
      await plaidService.getItemWithAccessToken(accessToken);
      structuredLogger.logSuccess(`Health check PASSED for item: ${itemId}`);
    } catch (error) {
      structuredLogger.logError(`Health check FAILED for item: ${itemId}. Plaid API error: ${error.message}. Skipping.`);
      if (!isDryRun) {
        await plaidService.handlePlaidError(error, itemId);
      } else {
        structuredLogger.logWarning(`[DRY RUN] Would mark item as expired due to health check failure.`);
      }
      return { success: false, reason: `Health check failed: ${error.message}`, accounts: plaidAccountIds };
    }

    if (!accounts || accounts.length === 0) {
        structuredLogger.logWarning(`No Plaid accounts found for item ID during loop: ${itemId}`);
        return { success: true }; // Not a failure, just nothing to do.
    }

    const numTransactionsToDelete = await Transaction.countDocuments({ plaidAccountId: { $in: plaidAccountIds } });
    const numLiabilitiesToDelete = await Liability.countDocuments({ accountId: { $in: plaidAccountIds } });

    if (isDryRun) {
      structuredLogger.logInfo(`[DRY RUN] Would fetch new transactions for item ${itemId}.`);
      structuredLogger.logInfo(`[DRY RUN] Would delete ${numTransactionsToDelete} transactions for ${accounts.length} accounts.`);
      structuredLogger.logInfo(`[DRY RUN] Would delete ${numLiabilitiesToDelete} liabilities.`);
      structuredLogger.logInfo(`[DRY RUN] Would clear sync cursor.`);
      structuredLogger.logInfo(`[DRY RUN] Would trigger transaction update to save.`);
      return { success: true };
    }

    // ----- Live Mode -----

    // Step 1: Fetch new transactions first (safer)
    structuredLogger.logInfo("Fetching fresh transactions from Plaid...");
    await plaidService.fetchTransactions(itemId);
    structuredLogger.logSuccess(`Successfully fetched all transactions for item ${itemId}.`);

    // Step 2: Delete existing transactions and liabilities
    structuredLogger.logInfo(`Deleting ${numTransactionsToDelete} existing transactions for ${accounts.length} accounts.`);
    if (numTransactionsToDelete > 0) {
      const deleteResult = await Transaction.deleteMany({ plaidAccountId: { $in: plaidAccountIds } });
      structuredLogger.logSuccess(`Deleted ${deleteResult.deletedCount} transactions.`);
    }

    structuredLogger.logInfo(`Deleting ${numLiabilitiesToDelete} existing liabilities.`);
    if (numLiabilitiesToDelete > 0) {
      const liabilityDeleteResult = await Liability.deleteMany({ accountId: { $in: plaidAccountIds } });
      structuredLogger.logSuccess(`Deleted ${liabilityDeleteResult.deletedCount} liabilities.`);
    }
    // Step 3: Clear the sync cursor
    structuredLogger.logInfo("Clearing the transaction sync cursor by setting nextCursor to null.");
    await PlaidAccount.updateMany({ itemId: itemId }, { $set: { nextCursor: null } });
    structuredLogger.logSuccess("Successfully cleared the sync cursor.");

    // Step 4: Trigger the transaction update to save the fresh data.
    structuredLogger.logInfo("Triggering plaidService.updateTransactions to save fresh data.");
    await plaidService.updateTransactions(itemId);
    
    structuredLogger.logSuccess(`Transaction re-sync completed successfully for item: ${itemId}`);
    return { success: true };

  } catch (error) {
    if (isDryRun) {
        structuredLogger.logErrorBlock(error, { operation: "resync-item (dry-run)", itemId: itemId, message: "Failed during read-only phase of dry run." });
    } else {
        structuredLogger.logErrorBlock(error, { operation: "resync-item (live-run)", itemId: itemId, message: `Failed to resync item. It may be expired or invalid.` });
    }
    return { success: false, reason: `Generic error during processing: ${error.message}`, accounts: plaidAccountIds };
  }
}

async function resyncUserTransactions() {
  await connectDB();

  const args = process.argv.slice(2);
  const runForAllUsers = args.includes('--all-users');
  const userIdArg = args.find(arg => !arg.startsWith('--'));
  const isDryRun = !args.includes('--no-dry-run');

  if (!userIdArg && !runForAllUsers) {
    console.error("Usage: node -r dotenv/config scripts/resync-user-transactions.js <user_id_or_auth_uid> [--no-dry-run]");
    console.error("   or: node -r dotenv/config scripts/resync-user-transactions.js --all-users [--no-dry-run]");
    process.exit(1);
  }

  if (isDryRun) {
    structuredLogger.logWarning("--- Running in DRY RUN mode. No data will be modified. Use --no-dry-run to execute. ---");
  } else {
    structuredLogger.logWarning("--- Running in LIVE mode. Data will be deleted and updated. ---");
  }

  let usersToProcess = [];
  const failedItems = [];
  let totalSuccessCount = 0; // Initialize global success counter
  let totalFailureCount = 0; // Initialize global failure counter

  try {
    if (runForAllUsers) {
      structuredLogger.logInfo("Running for all users...");
      usersToProcess = await User.find({});
      structuredLogger.logInfo(`Found ${usersToProcess.length} users to process.`);
    } else {
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
      usersToProcess.push(user);
    }

    for (const user of usersToProcess) {
      structuredLogger.logInfo(`
>>> Starting transaction re-sync for user: ${user.email[0].email} (_id: ${user._id})`);
      
      const userAccounts = await PlaidAccount.find({ owner_id: user._id });
      if (!userAccounts || userAccounts.length === 0) {
          structuredLogger.logInfo(`No Plaid accounts found for user: ${user._id}. Skipping.`);
          continue;
      }
      const itemIds = [...new Set(userAccounts.map(acc => acc.itemId))];
      structuredLogger.logInfo(`Found ${itemIds.length} unique items to resync for user ${user._id}.`);
  
      let successCount = 0;
      let failureCount = 0;
  
      for (const itemId of itemIds) {
        const result = await processItem(itemId, isDryRun);
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
          failedItems.push({
            user: { id: user._id, authUid: user.authUid },
            itemId: itemId,
            reason: result.reason,
            accounts: result.accounts
          });
        }
      }
  
      structuredLogger.logInfo(`--- Resync Summary for user ${user._id} ---`);
      structuredLogger.logSuccess(`Successfully processed ${successCount} items.`);
      if (failureCount > 0) {
          structuredLogger.logWarning(`Failed to process ${failureCount} items. Check logs above for details.`);
      } else {
          structuredLogger.logInfo(`All items were processed without any failures.`);
      }
      totalSuccessCount += successCount; // Accumulate global success
      totalFailureCount += failureCount; // Accumulate global failure
    }

  } catch (error) {
    structuredLogger.logErrorBlock(error, { operation: "resync-user-transactions", userIdArg: userIdArg, allUsers: runForAllUsers });
    process.exit(1);
  }

  if (failedItems.length > 0) {
    console.log('\n');
    structuredLogger.logWarning('--- Summary of Failed Items ---');
    const flattenedFailures = [];
    for (const failedItem of failedItems) {
        if (failedItem.accounts && failedItem.accounts.length > 0) {
            for (const accountId of failedItem.accounts) {
                flattenedFailures.push({
                    userId: failedItem.user.id,
                    userAuthUid: failedItem.user.authUid,
                    itemId: failedItem.itemId,
                    accountId: accountId,
                    reason: failedItem.reason
                });
            }
        } else {
             flattenedFailures.push({
                userId: failedItem.user.id,
                userAuthUid: failedItem.user.authUid,
                itemId: failedItem.itemId,
                accountId: 'N/A',
                reason: failedItem.reason
            });
        }
    }
    console.table(flattenedFailures);
  }

  console.log('\n');
  structuredLogger.logSuccess(`--- Global Resync Summary ---`);
  structuredLogger.logSuccess(`Total successful items processed: ${totalSuccessCount}`);
  structuredLogger.logWarning(`Total failed items: ${totalFailureCount}`);

  console.log("\n--- User re-sync script finished ---");
  process.exit(0);
}

resyncUserTransactions();
