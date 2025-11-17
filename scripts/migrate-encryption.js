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

async function migrate() {
  const manualVerification = process.argv.includes('--manual-verification');
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
      try {
        await safeDecrypt(value, context);
        return value; // Already encrypted
      } catch (error) {
        if (error instanceof DecryptionError) {
          if (isDryRun) {
            changesToEncrypt.push({
              userId: user._id.toString(),
              documentId: documentId.toString(),
              field: context.field,
              plaintextValue: value,
            });
            return value; // In dry run, return original value
          }
          return (async () => {
            if (manualVerification) {
              const answer = await prompt(`Found plaintext value in '${context.field}': "${value}". Encrypt it? (y/n) `);
              if (answer.toLowerCase() !== 'y') {
                return value; // Skip encryption
              }
            }
            return await safeEncrypt(value, context); // Plaintext, so encrypt it
          })();
        }
        throw error; // Other error
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
    console.log('\n--- Dry Run Summary ---');
    if (changesToEncrypt.length > 0) {
      console.table(changesToEncrypt);
      const confirm = await prompt('Do you want to proceed with the actual encryption based on the dry run? (y/n) ');
      if (confirm.toLowerCase() === 'y') {
        console.log('Proceeding with actual encryption...');
        // Re-run the script without the --dry-run flag
        const args = process.argv.filter(arg => !arg.startsWith('--dry-run'));
        spawnSync(process.argv[0], args.slice(1), { stdio: 'inherit' });
      } else {
        console.log('Dry run complete. No changes applied.');
      }
    } else {
      console.log('No plaintext values found that require encryption.');
    }
  }

  rl.close();
  process.exit(0);
}

migrate();