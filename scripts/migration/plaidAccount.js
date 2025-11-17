import PlaidAccount from '../../database/models/PlaidAccount.js';
import User from '../../database/models/User.js';
import structuredLogger from '../../lib/structuredLogger.js';
import { getUserDek } from '../../database/encryption.js';
import { createSafeEncrypt } from '../../lib/encryptionHelper.js';

async function migratePlaidAccounts(user, encryptIfPlaintext, documentId) {
  const plaidAccounts = await PlaidAccount.find({ owner_id: user._id });
  for (const account of plaidAccounts) {
    try {
      account.accessToken = await encryptIfPlaintext(account.accessToken, { field: 'plaidAccount.accessToken' }, documentId);
      account.account_name = await encryptIfPlaintext(account.account_name, { field: 'plaidAccount.account_name' }, documentId);
      account.account_official_name = await encryptIfPlaintext(account.account_official_name, { field: 'plaidAccount.account_official_name' }, documentId);
      account.currentBalance = await encryptIfPlaintext(account.currentBalance, { field: 'plaidAccount.currentBalance' }, documentId);
      account.availableBalance = await encryptIfPlaintext(account.availableBalance, { field: 'plaidAccount.availableBalance' }, documentId);
      account.mask = await encryptIfPlaintext(account.mask, { field: 'plaidAccount.mask' }, documentId);

      await account.save();
      structuredLogger.logSuccess('PlaidAccount migrated successfully', { accountId: account._id });
    } catch (error) {
      structuredLogger.logErrorBlock(error, { accountId: account._id, error: error.message });
    }
  }
}

export default migratePlaidAccounts;
