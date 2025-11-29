
import db from '../database/database.js';
import User from '../database/models/User.js';
import PlaidAccount from '../database/models/PlaidAccount.js';
import Transaction from '../database/models/Transaction.js';
import { createSafeDecrypt } from '../lib/encryptionHelper.js';
import { getUserDek } from '../database/encryption.js';
import structuredLogger from '../lib/structuredLogger.js';

async function main() {
  await db.connect();
  structuredLogger.logInfo('Starting merchant category migration...');

  const users = await User.find({});
  structuredLogger.logInfo(`Found ${users.length} users to process.`);

  for (const user of users) {
    try {
      const dek = await getUserDek(user.authUid);
      const safeDecrypt = createSafeDecrypt(user.authUid, dek);

      const userAccounts = await PlaidAccount.find({ owner_id: user._id });
      if (userAccounts.length === 0) {
        continue;
      }
      const accountIds = userAccounts.map(acc => acc._id);

      const transactions = await Transaction.find({
        accountId: { $in: accountIds },
        'merchant.merchantCategory': { $exists: true, $ne: null }
      });

      if (transactions.length > 0) {
        structuredLogger.logInfo(`Found ${transactions.length} transactions to migrate for user ${user.authUid}`);
      }

      for (const transaction of transactions) {
        if (typeof transaction.merchant.merchantCategory !== 'string' || transaction.merchant.merchantCategory.length < 10) {
            // Likely already plaintext, skip
            continue;
        }

        try {
          const decryptedCategory = await safeDecrypt(transaction.merchant.merchantCategory, {
            transaction_id: transaction._id,
            field: "merchant.merchantCategory",
          });

          if (decryptedCategory !== transaction.merchant.merchantCategory) {
            transaction.merchant.merchantCategory = decryptedCategory;
            await transaction.save();
            structuredLogger.logSuccess(`Migrated merchantCategory for transaction ${transaction._id}`);
          }
        } catch (e) {
          structuredLogger.logInfo(
            `Skipping transaction ${transaction._id} for user ${user.authUid} - value is already plaintext.`
          );
        }
      }
    } catch (error) {
      structuredLogger.logError(`Failed to process user ${user.authUid}`, { error: error.message });
    }
  }

  structuredLogger.logInfo('Merchant category migration complete.');
  await db.disconnect();
}

main().catch(err => {
  structuredLogger.logError('Unhandled error during migration', { error: err.message });
  process.exit(1);
});
