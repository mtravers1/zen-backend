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
  const isCI = process.env.CI === 'true';
  const manualVerification = process.argv.includes('--manual-verification') && !isCI;
  const testRun = process.argv.includes('--test-run');
  const userId = (process.argv.find(arg => arg.startsWith('--user-id=')) || '').split('=')[1];
  const firebaseUid = (process.argv.find(arg => arg.startsWith('--firebase-uid=')) || '').split('=')[1];
  let dryRunLimit = 0;
  const dryRunArg = process.argv.find(arg => arg.startsWith('--dry-run'));
  if (dryRunArg) {
    const parts = dryRunArg.split('=');
    dryRunLimit = parts.length > 1 ? parseInt(parts[1], 10) : 5; // Default to 5 if no number specified
  }
  const isDryRun = dryRunLimit > 0;

  const changesToEncrypt = [];
  const failedDecryptions = [];

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
      if (value === null || value === undefined || value === '') {
        return value;
      }

      try {
        await safeDecrypt(value, context);
        return value; // Already encrypted and decrypted successfully
      } catch (error) {
        if (error instanceof DecryptionError) {
          // This could be a plaintext value or a real decryption failure.
          if (isBase64(value)) {
            // If it's a base64 string, it's likely an encrypted value that failed to decrypt.
            failedDecryptions.push({
              userId: user._id.toString(),
              documentId: documentId.toString(),
              field: context.field,
              encryptedValue: value,
              error: error.message,
            });
            return value; // Return original value
          } else {
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
          // Some other unexpected error
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

  rl.close();
  process.exit(0);
}

migrate();