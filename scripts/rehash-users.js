import dotenv from 'dotenv';
import mongoose from 'mongoose';
import connectDB from '../database/database.js';
import User from '../database/models/User.js';
import { getUserDek, decryptValue, hashEmail } from '../database/encryption.js';

// Load environment variables from .env file
dotenv.config();

/**
 * This script regenerates the emailHash for all users in the database.
 * It should be run after the HASH_SALT environment variable has been changed.
 *
 * HOW TO RUN:
 * 1. Ensure your environment is configured to connect to the correct database (e.g., staging).
 * 2. MAKE SURE the HASH_SALT environment variable is set to the NEW salt value.
 * 3. From the project root, run the script:
 *    node scripts/rehash-users.js
 */
const rehashUsers = async () => {
  const isDryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
  const userIdArg = process.argv.find(arg => arg.startsWith('--user-id='));
  const authUidArg = process.argv.find(arg => arg.startsWith('--auth-uid='));

  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
  const userId = userIdArg ? userIdArg.split('=')[1] : null;
  const authUid = authUidArg ? authUidArg.split('=')[1] : null;

  let errorCount = 0; // Declare errorCount in the outer scope

  try {
    console.log('--- Starting User Email Hash Migration ---');
    if (isDryRun) {
      console.log('\n*** DRY RUN MODE ENABLED: No changes will be saved to the database. ***\n');
    }
    if (userId) {
      console.log(`*** SINGLE USER MODE (ID): Processing user with _id: ${userId} ***\n`);
    } else if (authUid) {
      console.log(`*** SINGLE USER MODE (Auth UID): Processing user with authUid: ${authUid} ***\n`);
    } else if (limit) {
      console.log(`*** LIMIT MODE: Processing a maximum of ${limit} user(s). ***\n`);
    }

    if (!process.env.HASH_SALT) {
      console.error('FATAL: HASH_SALT environment variable is not set. Exiting.');
      process.exit(1);
    }

    console.log('Connecting to the database...');
    await connectDB();
    console.log('Database connection successful.');

    let query;
    if (userId) {
      query = User.find({ _id: userId });
    } else if (authUid) {
      query = User.find({ authUid: authUid });
    } else {
      query = User.find({});
      if (limit) {
        query = query.limit(limit); // Correctly chain the limit
      }
    }

    const users = await query;
    
    console.log(`Found ${users.length} user(s) to process.`);

    let successCount = 0;
    const changes = [];

    for (const user of users) {
      try {
        const dek = await getUserDek(user.authUid);
        if (!dek || dek.length === 0) {
          throw new Error(`No DEK found for user.`);
        }

        const primaryEmailObject = user.email.find(e => e.isPrimary) || user.email[0];
        if (!primaryEmailObject || !primaryEmailObject.email) {
          throw new Error(`No email found for user.`);
        }

        const encryptedEmail = primaryEmailObject.email;
        const decryptedEmail = await decryptValue(encryptedEmail, dek);

        if (!decryptedEmail) {
          throw new Error('Failed to decrypt email.');
        }

        const oldHash = user.emailHash;
        const newHash = hashEmail(decryptedEmail);

        if (oldHash !== newHash) {
          changes.push({ 
            userId: user._id,
            authUid: user.authUid,
            oldHash,
            newHash 
          });

          if (!isDryRun) {
            user.emailHash = newHash;
            await user.save();
          }
        }
        successCount++;
      } catch (error) {
        console.error(`  - FAILED to process user ${user._id}: ${error.message}`);
        errorCount++;
      }
    }

    if (isDryRun) {
      console.log('\n--- DRY RUN: Proposed Changes ---');
      if (changes.length > 0) {
        console.table(changes);
      } else {
        console.log('No users require a hash update.');
      }
    } else if (changes.length > 0) {
        console.log('\n--- Applied Changes ---');
        console.table(changes);
    }

    console.log('\n--- Migration Complete ---');
    console.log(`Successfully processed users: ${successCount}`);
    console.log(`Users requiring changes:    ${changes.length}`);
    console.log(`Failed to process:          ${errorCount}`);

  } catch (error) {
    console.error('An unexpected error occurred during the migration process:', error);
  } finally {
    console.log('Closing database connection.');
    await mongoose.connection.close();
    process.exit(errorCount > 0 ? 1 : 0);
  }
};

rehashUsers();
