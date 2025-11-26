import connectDB from '../database/database.js';
import User from '../database/models/User.js';
import { getUserDek, DecryptionError } from '../database/encryption.js';
import { createSafeEncrypt, createSafeDecrypt } from '../lib/encryptionHelper.js';
import migrateUsers from './migration/user.js';
import migrateBusinesses from './migration/business.js';
import migratePlaidAccounts from './migration/plaidAccount.js';
import migrateTransactions from './migration/transaction.js';
import migrateTrips from './migration/trip.js';
import structuredLogger from '../lib/structuredLogger.js';
import PlaidAccount from '../database/models/PlaidAccount.js';
import plaidService from '../services/plaid.service.js';
import crypto from 'crypto';
import readline from 'readline';

import { spawnSync } from 'child_process';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function prompt(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

const isBase64 = (str) => {
  if (typeof str !== 'string') {
    return false;
  }
  const base64Regex = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  return base64Regex.test(str);
}

async function migrate() {
  const args = process.argv.slice(2);
  const isCI = process.env.CI === 'true';
  const manualVerification = args.includes('--manual-verification') && !isCI;
  const testRun = args.includes('--test-run');
  const noDryRun = args.includes('--no-dry-run');
  const isDryRun = !noDryRun;

  const userId = (args.find(arg => arg.startsWith('--user-id=')) || '').split('=')[1];
  const firebaseUid = (args.find(arg => arg.startsWith('--firebase-uid=')) || '').split('=')[1];
  
  let dryRunLimit = 0;
  if (isDryRun) {
    const dryRunArg = args.find(arg => arg.startsWith('--dry-run'));
    if (dryRunArg) {
        const parts = dryRunArg.split('=');
        dryRunLimit = parts.length > 1 ? parseInt(parts[1], 10) : 5;
    } else {
        dryRunLimit = 5; // Default limit for dry run
    }
  }

  const changesToEncrypt = [];
  const failedDecryptions = [];
  const accountsToRefresh = new Set();

  await connectDB();

  structuredLogger.logSuccess('Starting migration...');

  let users;
  if (userId) {
    users = await User.find({ _id: userId });
  } else if (firebaseUid) {
    users = await User.find({ authUid: firebaseUid });
  } else if (isDryRun) {
    users = await User.find({}).limit(dryRunLimit);
  } else if (testRun) {
    users = await User.find({}).limit(5);
  } else {
    users = await User.find({});
  }

  for (const user of users) {
    let dek;
    try {
      dek = await getUserDek(user.authUid);
      const dekHash = crypto.createHash('sha256').update(dek[0]).digest('hex');
      console.error(`[DEK_HASH] Migration script for user ${user._id}: ${dekHash}`);
    } catch (error) {
      if (error.message.includes('DEK not found')) {
        // TODO: Add admin alert mechanism
        structuredLogger.logCritical('DEK not found for user during migration', { userId: user._id });
      } else {
        structuredLogger.logErrorBlock(error, { userId: user._id, error: error.message });
      }
      continue; // Skip this user
    }

    const safeEncrypt = createSafeEncrypt(user.authUid, dek);
    const safeDecrypt = createSafeDecrypt(user.authUid, dek);

    const encryptIfPlaintext = async (value, context, documentId) => {
      console.log(`[encryptIfPlaintext] Processing field: ${context.field}, value: ${value}`);
      if (value === null || value === undefined || value === '') {
        return value;
      }

      try {
        await safeDecrypt(value, context);
        console.log(`[encryptIfPlaintext] Field ${context.field} is already encrypted.`);
        return value; // Already encrypted and decrypted successfully
      } catch (error) {
        if (error instanceof DecryptionError) {
          console.log(`[encryptIfPlaintext] Field ${context.field} failed initial decryption. Error: ${error.message}`);
          const isValBase64 = isBase64(value);
          console.log(`[encryptIfPlaintext] Field ${context.field} isBase64: ${isValBase64}`);

          if (isValBase64) {
            console.log(`[encryptIfPlaintext] Field ${context.field} is base64, assuming encrypted but corrupted.`);
            // If it's a base64 string, it's likely an encrypted value that failed to decrypt.
            failedDecryptions.push({
              userId: user._id.toString(),
              documentId: documentId.toString(),
              field: context.field,
              encryptedValue: value,
              error: error.message,
            });
            if (context.field.startsWith('plaidAccount')) {
              accountsToRefresh.add(documentId.toString());
            }
            return value; // Return original value
          } else {
            console.log(`[encryptIfPlaintext] Field ${context.field} is not base64, assuming plaintext.`);
            // If it's not a base64 string, it's likely plaintext.
            if (isDryRun) {
              changesToEncrypt.push({
                userId: user._id.toString(),
                documentId: documentId.toString(),
                field: context.field,
                plaintextValue: value,
              });
              return value;
            }
            if (manualVerification) {
              const answer = await prompt(`Found plaintext value in '${context.field}': "${value}". Encrypt it? (y/n) `);
              if (answer.toLowerCase() !== 'y') {
                return value; // Skip encryption
              }
            }
            return await safeEncrypt(value, context);
          }
        } else {
          console.error(`[encryptIfPlaintext] Field ${context.field} encountered an unexpected error.`);
          throw error;
        }
      }
    };

    await migrateUsers(user, encryptIfPlaintext, user._id);
    await migrateBusinesses(user, encryptIfPlaintext, user._id);
    await migratePlaidAccounts(user, encryptIfPlaintext, user._id);
    await migrateTransactions(user, encryptIfPlaintext, user._id);
    await migrateTrips(user, encryptIfPlaintext, user._id);
  }

  structuredLogger.logSuccess('Migration complete');

  if (isDryRun) {
    console.log('\n--- Dry Run Summary ---\n');
    if (changesToEncrypt.length > 0) {
      console.table(changesToEncrypt);
    } else {
      console.log('No plaintext values found that require encryption.');
    }
  }

  if (failedDecryptions.length > 0) {
    console.log('\n--- Decryption Failures Summary ---\n');
    console.table(failedDecryptions);
  }

  if (accountsToRefresh.size > 0) {
    await refreshPlaidAccounts(accountsToRefresh);
  }

  rl.close();
  process.exit(0);
}

async function refreshPlaidAccounts(accountIds) {
  console.log('\n--- Refreshing Plaid Accounts ---');
  for (const accountId of accountIds) {
    try {
      console.log(`Refreshing account: ${accountId}`);
      const plaidAccount = await PlaidAccount.findById(accountId);
      if (!plaidAccount) {
        console.error(`Plaid account not found: ${accountId}`);
        continue;
      }

      const user = await User.findById(plaidAccount.owner_id);
      if (!user) {
        console.error(`User not found for plaid account: ${accountId}`);
        continue;
      }

      const dek = await getUserDek(user.authUid);
      const safeDecrypt = createSafeDecrypt(user.authUid, dek);
      const safeEncrypt = createSafeEncrypt(user.authUid, dek);

      let decryptedAccessToken;
      console.log('[PLAID_REFRESH] Is access token base64?', isBase64(plaidAccount.accessToken));
      if (isBase64(plaidAccount.accessToken)) {
        console.log('[PLAID_REFRESH] Attempting to decrypt access token...');
        try {
          decryptedAccessToken = await safeDecrypt(plaidAccount.accessToken);
          console.log('[PLAID_REFRESH] Decryption call completed.');
        } catch (error) {
          console.error(
            `[PLAID_REFRESH] Decryption of access token failed for account ${accountId}.`,
            error,
          );
          continue; // Skip to the next account
        }
      } else {
        decryptedAccessToken = plaidAccount.accessToken;
      }

      console.log(`[PLAID_REFRESH] Decrypted access token (first 10 chars): ${decryptedAccessToken.substring(0, 10)}`);
      const accountsResponse = await plaidService.getAccountsWithAccessToken(decryptedAccessToken);
      const accounts = accountsResponse.accounts;
      const plaidAccountData = accounts.find(a => a.account_id === plaidAccount.plaid_account_id);

      if (plaidAccountData) {
        plaidAccount.account_name = await safeEncrypt(plaidAccountData.name, { account_id: plaidAccount._id, field: 'account_name' });
        plaidAccount.account_official_name = await safeEncrypt(plaidAccountData.official_name, { account_id: plaidAccount._id, field: 'account_official_name' });
        plaidAccount.account_type = await safeEncrypt(plaidAccountData.type, { account_id: plaidAccount._id, field: 'account_type' });
        plaidAccount.account_subtype = await safeEncrypt(plaidAccountData.subtype, { account_id: plaidAccount._id, field: 'account_subtype' });
        plaidAccount.currentBalance = await safeEncrypt(plaidAccountData.balances.current, { account_id: plaidAccount._id, field: 'currentBalance' });
        plaidAccount.availableBalance = await safeEncrypt(plaidAccountData.balances.available, { account_id: plaidAccount._id, field: 'availableBalance' });
        plaidAccount.mask = await safeEncrypt(plaidAccountData.mask, { account_id: plaidAccount._id, field: 'mask' });

        await plaidAccount.save();
        console.log(`Account refreshed successfully: ${accountId}`);
      } else {
        console.error(`Could not find matching account data from Plaid for account: ${accountId}`);
      }

    } catch (error) {
      console.error(`Failed to refresh account ${accountId}:`, error);
    }
  }
}

migrate();