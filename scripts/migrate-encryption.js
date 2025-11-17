import connectDB from '../database/database.js';
import User from '../database/models/User.js';
import { getUserDek, DecryptionError } from '../database/encryption.js';
import { createSafeEncrypt, createSafeDecrypt } from '../lib/encryptionHelper.js';
import migrateUsers from './migration/user.js';
import migrateBusinesses from './migration/business.js';
import migratePlaidAccounts from './migration/plaidAccount.js';
import migrateTransactions from './migration/transaction.js';
import structuredLogger from '../lib/structuredLogger.js';
import readline from 'readline';

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

  await connectDB();

  structuredLogger.logInfo('Starting migration...');

  const users = await User.find({});
  for (const user of users) {
    let dek;
    try {
      dek = await getUserDek(user.authUid);
    } catch (error) {
      if (error.message.includes('DEK not found')) {
        // TODO: Add admin alert mechanism
        structuredLogger.logCritical('DEK not found for user during migration', { userId: user._id });
      } else {
        structuredLogger.logError('Error fetching DEK for user during migration', { userId: user._id, error: error.message });
      }
      continue; // Skip this user
    }

    const safeEncrypt = createSafeEncrypt(user.authUid, dek);
    const safeDecrypt = createSafeDecrypt(user.authUid, dek);

    const encryptIfPlaintext = async (value, context) => {
      try {
        await safeDecrypt(value, context);
        return value; // Already encrypted
      } catch (error) {
        if (error instanceof DecryptionError) {
          if (manualVerification) {
            const answer = await prompt(`Found plaintext value in '${context.field}': "${value}". Encrypt it? (y/n) `);
            if (answer.toLowerCase() !== 'y') {
              return value; // Skip encryption
            }
          }
          return await safeEncrypt(value, context); // Plaintext, so encrypt it
        }
        throw error; // Other error
      }
    };

    await migrateUsers(user, encryptIfPlaintext);
    await migrateBusinesses(user, encryptIfPlaintext);
    await migratePlaidAccounts(user, encryptIfPlaintext);
    await migrateTransactions(user, encryptIfPlaintext);
  }

  structuredLogger.logInfo('Migration complete');
  rl.close();
  process.exit(0);
}

migrate();

