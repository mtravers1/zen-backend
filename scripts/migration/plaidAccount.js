import PlaidAccount from '../../database/models/PlaidAccount.js';
import User from '../../database/models/User.js';
import structuredLogger from '../../lib/structuredLogger.js';
import { getUserDek } from '../../database/encryption.js';
import { createSafeEncrypt } from '../../lib/encryptionHelper.js';

async function migratePlaidAccounts(user, encryptIfPlaintext, documentId, isDryRun) {
  const plaidAccounts = await PlaidAccount.find({ owner_id: user._id });
  for (const account of plaidAccounts) {
    try {
      account.accessToken = await encryptIfPlaintext(account.accessToken, { field: 'plaidAccount.accessToken' }, account._id);
      account.account_name = await encryptIfPlaintext(account.account_name, { field: 'plaidAccount.account_name' }, account._id);
      account.account_official_name = await encryptIfPlaintext(account.account_official_name, { field: 'plaidAccount.account_official_name' }, account._id);
      account.account_type = await encryptIfPlaintext(account.account_type, { field: 'plaidAccount.account_type' }, account._id);
      account.account_subtype = await encryptIfPlaintext(account.account_subtype, { field: 'plaidAccount.account_subtype' }, account._id);
      account.currentBalance = await encryptIfPlaintext(account.currentBalance, { field: 'plaidAccount.currentBalance' }, account._id);
      account.availableBalance = await encryptIfPlaintext(account.availableBalance, { field: 'plaidAccount.availableBalance' }, account._id);
      account.mask = await encryptIfPlaintext(account.mask, { field: 'plaidAccount.mask' }, account._id);

      const dek = await getUserDek(user.authUid, { noCache: true }); // Bypassing cache to ensure we get a fresh DEK
      const safeDecrypt = createSafeDecrypt(user.authUid, dek);

      // Ensure required hash fields exist for legacy documents before saving
      if (!account.hashAccountMask || !account.hashAccountName || !account.hashAccountInstitutionId) {
        console.log(`[MIGRATE_TRACE] Hash fields missing for account ${account._id}. Regenerating...`);
        const decryptedMask = await safeDecrypt(account.mask, { field: 'plaidAccount.mask' });
        const decryptedAccountName = await safeDecrypt(account.account_name, { field: 'plaidAccount.account_name' });

        // institution_id is not encrypted, so we can use it directly
        account.hashAccountMask = hashValue(decryptedMask);
        account.hashAccountName = hashValue(decryptedAccountName);
        account.hashAccountInstitutionId = hashValue(account.institution_id);
      }

      if (!isDryRun) {
        await account.save();
      }
      structuredLogger.logSuccess('PlaidAccount migrated successfully', { accountId: account._id });
    } catch (error) {
      structuredLogger.logErrorBlock(error, { accountId: account._id, error: error.message });
    }
  }
}

export default migratePlaidAccounts;
