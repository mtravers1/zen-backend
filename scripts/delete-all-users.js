import mongoose from "mongoose";
import admin from "../lib/firebaseAdmin.js";
import User from "../database/models/User.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import Transaction from "../database/models/Transaction.js";
import Liability from "../database/models/Liability.js";
import Assets from "../database/models/Assets.js";
import Business from "../database/models/Businesses.js";
import AccessToken from "../database/models/AccessToken.js";
import Files from "../database/models/Files.js";
import Trips from "../database/models/Trips.js";
import VerificationCode from "../database/models/VerificationCode.js";
import connectDB from "../database/database.js";
import {
  getUserDek,
  getBucket,
} from "../database/encryption.js";
import { createSafeDecrypt } from "../lib/encryptionHelper.js";
import plaidService from "../services/plaid.service.js";
import structuredLogger from "../lib/structuredLogger.js";
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const findAndRenameDekFiles = async (user, uid) => {
  const bucketKey = user._id.toString();
  const primaryBucket = await getBucket();
  const legacyBucket = await getBucket(process.env.LEGACY_GCS_BUCKET_NAME);

  const searchAndUpdate = async (bucket, key) => {
    const dekFilePath = `keys/${key}.key`;
    const dekFile = bucket.file(dekFilePath);

    if ((await dekFile.exists())[0]) {
      const newDekFilePath = `${dekFilePath}.deleted`;
      const newDekFile = bucket.file(newDekFilePath);

      try {
        await newDekFile.getMetadata();
        console.log(`DEK file already copied to ${newDekFilePath}. Skipping.`);
        return;
      } catch (error) {
        if (error.code === 404) {
          // File does not exist, proceed with copy
          console.log(`Copying DEK file in ${bucket.name} from ${dekFilePath} to ${newDekFilePath}...`);
          await dekFile.copy(newDekFilePath);
          console.log("DEK file copied successfully.");
        } else {
          // Another error occurred, rethrow or handle appropriately
          throw error;
        }
      }
    }
  };

  // Search in primary bucket with databaseId
  await searchAndUpdate(primaryBucket, bucketKey);

  // Search in legacy bucket with databaseId
  await searchAndUpdate(legacyBucket, bucketKey);

  // Search in legacy bucket with firebaseUid
  await searchAndUpdate(legacyBucket, uid);
};

const deleteUser = async (user) => {
  const uid = user.authUid;
  if (!uid) {
    console.error("User has no authUid, skipping.");
    return;
  }

  try {
    console.log(`Deleting user: ${user._id} (${uid})`);
    const userIdOrString = { $in: [user._id, user._id.toString()] };


    // 1. Soft-delete the user first to make the operation more robust.
    console.log("Soft-deleting user...");
    user.deleted = true;
    await user.save();
    console.log("User soft-deleted.");

    // 2. Rename all instances of the DEK file in primary and legacy buckets.
    await findAndRenameDekFiles(user, uid);

    try {
      const dek = await getUserDek(uid);
      const safeDecrypt = createSafeDecrypt(uid, dek);
      const accessTokens = await AccessToken.find({ userId: userIdOrString });

      for (const accessToken of accessTokens) {
        if (accessToken.accessToken) {
            const decryptedAccessToken = await safeDecrypt(accessToken.accessToken, {
              user_id: user._id,
              field: "accessToken",
            });

            if (decryptedAccessToken) {
              try {
                console.log(`Invalidating Plaid access token for itemID: ${accessToken.itemId}...`);
                await plaidService.invalidateAccessToken(decryptedAccessToken);
              } catch (plaidError) {
                console.error(`Failed to invalidate Plaid access token for itemId: ${accessToken.itemId}. Continuing with user deletion. Error: ${plaidError.message}`);
              }
            } else {
              structuredLogger.logErrorBlock(
                new Error("Decrypted access token is null"),
                {
                  operation: "deleteUserScript",
                  user_id: user._id,
                  field: "accessToken",
                  warning: "Skipping invalidateAccessToken call due to null token",
                }
              );
            }
        }
      }
    } catch (dekError) {
      console.warn(`Could not retrieve DEK for user ${uid}. Plaid access token will not be invalidated. Error: ${dekError.message}`);
    }

    console.log("Deleting access tokens...");
    await AccessToken.deleteMany({ userId: userIdOrString });

    console.log("Deleting files...");
    await Files.deleteMany({ userId: userIdOrString });

    console.log("Deleting businesses...");
    await Business.deleteMany({ userId: userIdOrString });

    const plaidAccounts = await PlaidAccount.find({ owner_id: userIdOrString });
    const plaidAccountIds = plaidAccounts.map(account => account.plaid_account_id);

    console.log("Deleting plaid accounts...");
    await PlaidAccount.deleteMany({ owner_id: userIdOrString });

    if (plaidAccountIds.length > 0) {
      console.log("Deleting transactions...");
      await Transaction.deleteMany({ plaidAccountId: { $in: plaidAccountIds } });

      console.log("Deleting liabilities...");
      await Liability.deleteMany({ accountId: { $in: plaidAccountIds } });
    }

    console.log("Deleting assets...");
    await Assets.deleteMany({ userId: userIdOrString });

    console.log("Deleting trips...");
    await Trips.deleteMany({ user: userIdOrString });

    console.log("Deleting verification codes...");
    const userEmails = user.email.map(e => e.email);
    await VerificationCode.deleteMany({ email: { $in: userEmails } });

    // 4. Permanently delete user from the database.
    console.log("Permanently deleting user from database...");
    await User.deleteOne({ _id: user._id });

    // 5. Delete user from Firebase as the very last step.
    console.log("Deleting user from Firebase...");
    await admin.auth().deleteUser(uid);

    console.log("User deleted successfully.");
  } catch (error) {
    console.error(`Error deleting user ${user._id}:`, error);
  }
};

const main = async () => {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [--confirmed-delete-users | --dry-run]')
    .option('confirmed-delete-users', {
        describe: 'Confirm that you want to delete all users from the database',
        type: 'boolean',
    })
    .option('dry-run', {
        describe: 'Perform a dry run without deleting the users',
        type: 'boolean',
    })
    .check((argv) => {
      if (argv.confirmedDeleteUsers && argv.dryRun) {
        throw new Error('You cannot specify both --confirmed-delete-users and --dry-run.');
      }
      if (!argv.confirmedDeleteUsers && !argv.dryRun) {
        throw new Error('You must specify either --confirmed-delete-users or --dry-run.');
      }
      return true;
    })
    .help()
    .argv;

  try {
    await connectDB();
    console.log("Database connected.");

    const users = await User.find({});

    if (argv.dryRun) {
      console.log('*** DRY RUN ***');
      console.log(`Found ${users.length} users that will be deleted:`);
      console.table(users.map(u => ({ id: u._id, authUid: u.authUid, email: u.email })));
      console.log('To execute the deletion, run the script with the --confirmed-delete-users flag.');
    } else if (argv.confirmedDeleteUsers) {
      console.log(`Found ${users.length} users to delete.`);
      for (const user of users) {
        await deleteUser(user);
      }
      console.log('All users have been deleted.');
    }

  } catch (error) {
    console.error("Error during user deletion process:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Database disconnected.");
  }
};
main();
