import connectDB from '../database/database.js';
import User from '../database/models/User.js';
import PlaidAccount from '../database/models/PlaidAccount.js';
import { getUserDek, DecryptionError } from '../database/encryption.js';
import { createSafeDecrypt } from '../lib/encryptionHelper.js';
import structuredLogger from '../lib/structuredLogger.js';

async function isInvalidToken(plaidAccount, safeDecrypt) {
  console.log(`[isInvalidToken] Checking account: ${plaidAccount._id}`);
  const fieldsToTest = [
    'accessToken',
    'account_name',
    'account_official_name',
    'account_type',
    'account_subtype',
    'currentBalance',
    'availableBalance',
    'mask',
  ];

  for (const field of fieldsToTest) {
    const value = plaidAccount[field];
    if (value === null || value === undefined || value === '') {
      continue; // Skip empty fields
    }

    console.log(`[isInvalidToken]   Testing field: ${field}`);
    try {
      const decryptedValue = await safeDecrypt(value);
      console.log(`[isInvalidToken]     ✅ Decryption successful`);

      if (field === 'accessToken') {
        if (typeof decryptedValue !== 'string' || !decryptedValue.startsWith('access-')) {
          console.log(`[isInvalidToken]     ❌ Invalid access token format`);
          return true; // Invalid access token format
        }
      }
    } catch (e) {
      if (e instanceof DecryptionError) {
        console.log(`[isInvalidToken]     ❌ Decryption failed`);
        return true;
      } else {
        structuredLogger.logError(`Error checking field ${field}`, { error: e });
        return true;
      }
    }
  }

  console.log(`[isInvalidToken] Account ${plaidAccount._id} is valid.`);
  return false;
}

async function deleteInvalidPlaidAccounts() {
  const isDryRun = process.argv.includes('--dry-run');
  const userId = (process.argv.find(arg => arg.startsWith('--user-id=')) || '').split('=')[1];
  const firebaseUid = (process.argv.find(arg => arg.startsWith('--firebase-uid=')) || '').split('=')[1];

  await connectDB();

  let allPlaidAccounts;
  if (userId) {
    allPlaidAccounts = await PlaidAccount.find({ owner_id: userId });
  } else if (firebaseUid) {
    console.log(`[Main] Looking up user with firebaseUid: ${firebaseUid}`);
    const user = await User.findOne({ authUid: firebaseUid });
    if (user) {
      console.log(`[Main] Found user with ID: ${user._id}`);
      allPlaidAccounts = await PlaidAccount.find({ owner_id: user._id });
      console.log(`[Main] Found ${allPlaidAccounts.length} Plaid accounts for this user.`);
    } else {
      console.log(`[Main] User not found with firebaseUid: ${firebaseUid}`);
      allPlaidAccounts = [];
    }
  } else {
    allPlaidAccounts = await PlaidAccount.find({});
  }

  let deletedCount = 0;
  const accountsToDelete = [];

  for (const plaidAccount of allPlaidAccounts) {
    const user = await User.findById(plaidAccount.owner_id);
    if (!user) {
      structuredLogger.logError('User not found for Plaid account', { plaidAccountId: plaidAccount._id });
      continue;
    }

    const dek = await getUserDek(user.authUid);
    const safeDecrypt = createSafeDecrypt(user.authUid, dek);

    if (await isInvalidToken(plaidAccount, safeDecrypt)) {
      if (isDryRun) {
        accountsToDelete.push({
          plaidAccountId: plaidAccount._id.toString(),
          userId: user._id.toString(),
          accessTokenPreview: plaidAccount.accessToken ? plaidAccount.accessToken.substring(0, 20) : 'N/A',
        });
      } else {
        console.log('Deleting invalid Plaid account', { plaidAccountId: plaidAccount._id, userId: user._id });
        await PlaidAccount.findByIdAndDelete(plaidAccount._id);
        deletedCount++;
      }
    }
  }

  if (isDryRun) {
    console.log('\n--- Dry Run: Invalid Plaid Accounts to be Deleted ---\n');
    if (accountsToDelete.length > 0) {
      console.table(accountsToDelete);
    } else {
      console.log('No invalid Plaid accounts found.');
    }
  } else {
    structuredLogger.logSuccess(`Finished. Deleted ${deletedCount} invalid Plaid accounts.`);
  }

  process.exit(0);
}

deleteInvalidPlaidAccounts();