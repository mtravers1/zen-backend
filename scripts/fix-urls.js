import connectDB from '../database/database.js';
import User from '../database/models/User.js';
import Business from '../database/models/Businesses.js';
import PlaidAccount from '../database/models/PlaidAccount.js';
import Transaction from '../database/models/Transaction.js';
import { createSafeDecrypt } from '../lib/encryptionHelper.js';
import { getUserDek } from '../database/encryption.js';
import structuredLogger from '../lib/structuredLogger.js';

/**
 * This script finds all transactions with encrypted merchant logos and websites and nullifies them.
 * This is a one-time fix to clean up data that was incorrectly encrypted.
 * By default, it runs in dry-run mode. Use the --no-dry-run flag to apply the changes.
 * You can also filter by user with the --user-id or --firebase-uid flag (can be a database ID or Firebase UID).
 */
async function fixUrls() {
  const isDryRun = !process.argv.includes('--no-dry-run');
  const userIdArg = process.argv.find(arg => arg.startsWith('--user-id='))
  const firebaseUidArg = process.argv.find(arg => arg.startsWith('--firebase-uid='))
  const userId = userIdArg ? userIdArg.split('=')[1] : null;
  const firebaseUid = firebaseUidArg ? firebaseUidArg.split('=')[1] : null;

  await connectDB();

  let users;
  if (userId) {
    users = await User.find({ _id: userId });
  } else if (firebaseUid) {
    users = await User.find({ authUid: firebaseUid });
  } else {
    users = await User.find({});
  }

  if (users.length === 0) {
    console.error('User not found.');
    process.exit(1);
  }


  const transactionsToUpdate = [];
  const processedTransactions = new Set();

  for (const user of users) {
    const userWithPlaid = await User.findById(user._id).populate('plaidAccounts');
    for (const account of userWithPlaid.plaidAccounts) {
        const transactions = await Transaction.find({
            plaidAccountId: account.plaid_account_id,
            $or: [
                { 'merchant.logo': { $ne: null } },
                { 'merchant.website': { $ne: null } },
            ],
        });

        for (const transaction of transactions) {
            if (processedTransactions.has(transaction._id.toString())) {
                continue;
            }
            processedTransactions.add(transaction._id.toString());

            transactionsToUpdate.push({
                transactionId: transaction._id,
                userId: user._id,
                logo: transaction.merchant.logo,
                website: transaction.merchant.website,
            });

            if (!isDryRun) {
                transaction.merchant.logo = null;
                transaction.merchant.website = null;
                await transaction.save();
            }
        }
    }

    const businesses = await Business.find({ userId: user._id }).populate('plaidAccountIds');
    for (const business of businesses) {
        for (const account of business.plaidAccountIds) {
            const transactions = await Transaction.find({
                plaidAccountId: account.plaid_account_id,
                $or: [
                    { 'merchant.logo': { $ne: null } },
                    { 'merchant.website': { $ne: null } },
                ],
            });

            for (const transaction of transactions) {
                if (processedTransactions.has(transaction._id.toString())) {
                    continue;
                }
                processedTransactions.add(transaction._id.toString());

                transactionsToUpdate.push({
                    transactionId: transaction._id,
                    userId: user._id,
                    logo: transaction.merchant.logo,
                    website: transaction.merchant.website,
                });

                if (!isDryRun) {
                    transaction.merchant.logo = null;
                    transaction.merchant.website = null;
                    await transaction.save();
                }
            }
        }
    }
  }

  if (isDryRun) {
    console.log('Dry run complete. The following transactions would be updated:');
    console.table(transactionsToUpdate);
  } else {
    structuredLogger.logSuccess(`Finished. Updated ${transactionsToUpdate.length} transactions.`);
  }

  process.exit(0);
}

fixUrls();