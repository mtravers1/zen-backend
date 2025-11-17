import Transaction from '../../database/models/Transaction.js';
import PlaidAccount from '../../database/models/PlaidAccount.js';
import User from '../../database/models/User.js';
import structuredLogger from '../../lib/structuredLogger.js';
import { getUserDek } from '../../database/encryption.js';
import { createSafeEncrypt } from '../../lib/encryptionHelper.js';

async function migrateTransactions(user, encryptIfPlaintext) {
  const accounts = await PlaidAccount.find({ owner_id: user._id });
  const accountIds = accounts.map(a => a._id);
  const transactions = await Transaction.find({ accountId: { $in: accountIds } });

  for (const transaction of transactions) {
    try {
      transaction.amount = await encryptIfPlaintext(transaction.amount, { field: 'transaction.amount' });
      transaction.notes = await encryptIfPlaintext(transaction.notes, { field: 'transaction.notes' });
      if (transaction.merchant) {
        transaction.merchant.merchantName = await encryptIfPlaintext(transaction.merchant.merchantName, { field: 'transaction.merchant.merchantName' });
        transaction.merchant.name = await encryptIfPlaintext(transaction.merchant.name, { field: 'transaction.merchant.name' });
        transaction.merchant.website = await encryptIfPlaintext(transaction.merchant.website, { field: 'transaction.merchant.website' });
      }
      transaction.description = await encryptIfPlaintext(transaction.description, { field: 'transaction.description' });
      transaction.name = await encryptIfPlaintext(transaction.name, { field: 'transaction.name' });
      transaction.fees = await encryptIfPlaintext(transaction.fees, { field: 'transaction.fees' });
      transaction.price = await encryptIfPlaintext(transaction.price, { field: 'transaction.price' });
      transaction.quantity = await encryptIfPlaintext(transaction.quantity, { field: 'transaction.quantity' });

      await transaction.save();
      structuredLogger.logInfo('Transaction migrated successfully', { transactionId: transaction._id });
    } catch (error) {
      structuredLogger.logError('Error migrating transaction', { transactionId: transaction._id, error: error.message });
    }
  }
}

export default migrateTransactions;
