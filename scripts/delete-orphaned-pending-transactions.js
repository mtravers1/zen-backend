
import mongoose from 'mongoose';
import Transaction from '../database/models/Transaction.js';
import User from '../database/models/User.js';
import { getUserDek } from '../database/encryption.js';
import { createSafeDecrypt } from '../lib/encryptionHelper.js';
import structuredLogger from '../lib/structuredLogger.js';

const findOrphanedPendingTransactions = async () => {
  const isDryRun = !process.argv.includes('--no-dry-run');
  const plaidAccountIdArg = process.argv.find(arg => arg.startsWith('--plaidAccountId='));
  const plaidAccountId = plaidAccountIdArg ? plaidAccountIdArg.split('=')[1] : null;

  if (isDryRun) {
    structuredLogger.logInfo('Running in DRY-RUN mode. No data will be deleted.');
  } else {
    structuredLogger.logWarning('Running in LIVE mode. Orphaned transactions will be deleted.');
  }

  try {
    structuredLogger.logInfo('Connecting to the database...');
    const mongoDB = process.env.MONGODB_URI;
    const user = process.env.MONGODB_USER;
    const pass = process.env.MONGODB_PASS;
    const dbName = process.env.MONGODB_DB;

    if (!mongoDB || !user || !pass || !dbName) {
      throw new Error("Missing required MONGODB environment variables");
    }

    await mongoose.connect(mongoDB, {
      user,
      pass,
      dbName,
    });
    structuredLogger.logInfo('Database connected.');

    structuredLogger.logInfo('Finding posted transactions with a pending_transaction_id...');
    const findQuery = { pending_transaction_id: { $ne: null } };
    if (plaidAccountId) {
      findQuery.plaidAccountId = plaidAccountId;
      structuredLogger.logInfo(`Filtering by plaidAccountId: ${plaidAccountId}`);
    }
    const postedTransactions = await Transaction.find(findQuery).lean();
    structuredLogger.logInfo(`Found ${postedTransactions.length} posted transactions with a pending_transaction_id.`);

    const orphanedPairs = [];
    const orphanedIdsToDelete = [];
    const userDeks = new Map();
    const safeDecryptors = new Map();

    for (const postedTransaction of postedTransactions) {
      const pendingTransactionId = postedTransaction.pending_transaction_id;

      console.log(`Searching for pending transaction with plaidTransactionId: ${pendingTransactionId}`);

      const pendingTransaction = await Transaction.findOne({ plaidTransactionId: pendingTransactionId }).lean();

      if (pendingTransaction) {
        orphanedIdsToDelete.push(pendingTransaction._id);
        // We found a pair. Now, let's get the user's DEK to decrypt the data for logging if it's a dry run.
        if (isDryRun) {
            const user = await User.findOne({ plaidAccounts: pendingTransaction.accountId });
            if (!user) {
              structuredLogger.logWarning(`User not found for accountId ${pendingTransaction.accountId}. Skipping decryption for this pair.`);
              continue;
            }
            const uid = user.authUid;

            let safeDecrypt = safeDecryptors.get(uid);
            if (!safeDecrypt) {
              let dek = userDeks.get(uid);
              if (!dek) {
                dek = await getUserDek(uid);
                userDeks.set(uid, dek);
              }
              safeDecrypt = createSafeDecrypt(uid, dek);
              safeDecryptors.set(uid, safeDecrypt);
            }

            const [
              decryptedPendingAmount,
              decryptedPendingName,
              decryptedPostedAmount,
              decryptedPostedName,
            ] = await Promise.all([
              pendingTransaction.amount ? safeDecrypt(pendingTransaction.amount, { transaction_id: pendingTransaction.plaidTransactionId, field: 'amount' }) : Promise.resolve(null),
              pendingTransaction.merchant && pendingTransaction.merchant.name ? safeDecrypt(pendingTransaction.merchant.name, { transaction_id: pendingTransaction.plaidTransactionId, field: 'name' }) : Promise.resolve(null),
              postedTransaction.amount ? safeDecrypt(postedTransaction.amount, { transaction_id: postedTransaction.plaidTransactionId, field: 'amount' }) : Promise.resolve(null),
              postedTransaction.merchant && postedTransaction.merchant.name ? safeDecrypt(postedTransaction.merchant.name, { transaction_id: postedTransaction.plaidTransactionId, field: 'name' }) : Promise.resolve(null),
            ]);

            orphanedPairs.push({
              orphaned_pending_transaction: {
                transaction_id_db: pendingTransaction._id.toString(),
                plaidTransactionId: pendingTransaction.plaidTransactionId,
                amount: decryptedPendingAmount,
                date: pendingTransaction.transactionDate,
                name: decryptedPendingName,
              },
              posted_transaction: {
                transaction_id_db: postedTransaction._id.toString(),
                plaidTransactionId: postedTransaction.plaidTransactionId,
                pending_transaction_id: postedTransaction.pending_transaction_id,
                amount: decryptedPostedAmount,
                date: postedTransaction.transactionDate,
                name: decryptedPostedName,
              },
            });
        }
      }
    }

    if (isDryRun) {
      structuredLogger.logInfo(`Found ${orphanedPairs.length} orphaned pending transactions.`);
      console.log(JSON.stringify(orphanedPairs, null, 2));
    } else {
      if (orphanedIdsToDelete.length > 0) {
        structuredLogger.logInfo(`Deleting ${orphanedIdsToDelete.length} orphaned pending transactions...`);
        const deleteResult = await Transaction.deleteMany({ _id: { $in: orphanedIdsToDelete } });
        structuredLogger.logSuccess(`Successfully deleted ${deleteResult.deletedCount} transactions.`);
      } else {
        structuredLogger.logInfo('No orphaned transactions to delete.');
      }
    }

  } catch (error) {
    console.error('An error occurred during the script execution:', error);
  } finally {
    await mongoose.disconnect();
    structuredLogger.logInfo('Database disconnected.');
  }
};

findOrphanedPendingTransactions();
