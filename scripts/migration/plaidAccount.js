import PlaidAccount from '../../database/models/PlaidAccount.js';
import User from '../../database/models/User.js';
import structuredLogger from '../../lib/structuredLogger.js';
import { getUserDek } from '../../database/encryption.js';
import { createSafeEncrypt } from '../../lib/encryptionHelper.js';

async function migratePlaidAccounts(user, encryptIfPlaintext) {
  const plaidAccounts = await PlaidAccount.find({ owner_id: user._id });
  for (const account of plaidAccounts) {
    try {
      account.accessToken = await encryptIfPlaintext(account.accessToken, { field: 'plaidAccount.accessToken' });
      account.account_name = await encryptIfPlaintext(account.account_name, { field: 'plaidAccount.account_name' });
      account.account_official_name = await encryptIfPlaintext(account.account_official_name, { field: 'plaidAccount.account_official_name' });
      account.currentBalance = await encryptIfPlaintext(account.currentBalance, { field: 'plaidAccount.currentBalance' });
      account.availableBalance = await encryptIfPlaintext(account.availableBalance, { field: 'plaidAccount.availableBalance' });
      account.mask = await encryptIfPlaintext(account.mask, { field: 'plaidAccount.mask' });

      await account.save();
      structuredLogger.logInfo('PlaidAccount migrated successfully', { accountId: account._id });
    } catch (error) {
      structuredLogger.logError('Error migrating PlaidAccount', { accountId: account._id, error: error.message });
    }
  }
}

export default migratePlaidAccounts;
