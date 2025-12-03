import Transaction from '../../database/models/Transaction.js';
import PlaidAccount from '../../database/models/PlaidAccount.js';
import User from '../../database/models/User.js';
import structuredLogger from '../../lib/structuredLogger.js';
import { getUserDek } from '../../database/encryption.js';
import { createSafeEncrypt } from '../../lib/encryptionHelper.js';

async function migrateTransactions(user, encryptIfPlaintext, documentId, isDryRun) {
  const accounts = await PlaidAccount.find({ owner_id: user._id });
  const accountIds = accounts.map(a => a._id);
  const transactions = await Transaction.find({ accountId: { $in: accountIds } });

  for (const transaction of transactions) {
    try {
      transaction.amount = await encryptIfPlaintext(transaction.amount, { field: 'transaction.amount' }, documentId);
      transaction.notes = await encryptIfPlaintext(transaction.notes, { field: 'transaction.notes' }, documentId);
      if (transaction.merchant) {
        transaction.merchant.merchantName = await encryptIfPlaintext(transaction.merchant.merchantName, { field: 'transaction.merchant.merchantName' }, documentId);
        transaction.merchant.name = await encryptIfPlaintext(transaction.merchant.name, { field: 'transaction.merchant.name' }, documentId);
      }

      transaction.description = await encryptIfPlaintext(transaction.description, { field: 'transaction.description' }, documentId);
      transaction.name = await encryptIfPlaintext(transaction.name, { field: 'transaction.name' }, documentId);
      transaction.fees = await encryptIfPlaintext(transaction.fees, { field: 'transaction.fees' }, documentId);
      transaction.price = await encryptIfPlaintext(transaction.price, { field: 'transaction.price' }, documentId);
      transaction.quantity = await encryptIfPlaintext(transaction.quantity, { field: 'transaction.quantity' }, documentId);
      if (transaction.tags) {
        transaction.tags = await Promise.all(transaction.tags.map(t => encryptIfPlaintext(t, { field: 'transaction.tags' }, documentId)));
      }

      if (!isDryRun) {
        await transaction.save();
      }
      structuredLogger.logSuccess('Transaction migrated successfully', { transactionId: transaction._id });
    } catch (error) {
      structuredLogger.logErrorBlock(error, { transactionId: transaction._id, error: error.message });
    }
  }
}

export default migrateTransactions;
