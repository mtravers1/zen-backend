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

const deleteUser = async (uid) => {
  if (!uid) {
    console.error("UID is required.");
    process.exit(1);
  }

  try {
    await connectDB();
    console.log("Database connected.");

    const user = await User.findOne({ authUid: uid });
    if (!user) {
      throw new Error("User not found");
    }
    console.log(`User found: ${user._id}`);

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
      const accessTokens = await AccessToken.find({ userId: user._id });

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
    await AccessToken.deleteMany({ userId: user._id });

    console.log("Deleting files...");
    await Files.deleteMany({ userId: user._id });

    console.log("Deleting businesses...");
    await Business.deleteMany({ userId: user._id });

    const plaidAccounts = await PlaidAccount.find({ owner_id: user._id });
    const plaidAccountIds = plaidAccounts.map(account => account.plaid_account_id);

    console.log("Deleting plaid accounts...");
    await PlaidAccount.deleteMany({ owner_id: user._id });

    console.log("Deleting transactions...");
    await Transaction.deleteMany({ plaidAccountId: { $in: plaidAccountIds } });

    console.log("Deleting liabilities...");
    await Liability.deleteMany({ accountId: { $in: plaidAccountIds } });

    console.log("Deleting assets...");
    await Assets.deleteMany({ userId: user._id });

    console.log("Deleting trips...");
    await Trips.deleteMany({ userId: user._id });

    console.log("Deleting verification codes...");
    await VerificationCode.deleteMany({ userId: user._id });

    // 4. Permanently delete user from the database.
    console.log("Permanently deleting user from database...");
    await User.deleteOne({ authUid: uid });

    // 5. Delete user from Firebase as the very last step.
    console.log("Deleting user from Firebase...");
    await admin.auth().deleteUser(uid);

    console.log("User deleted successfully.");
  } catch (error) {
    console.error("Error deleting user:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Database disconnected.");
  }
};

const main = async () => {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 --firebase-uid <uid> [options]')
    .option('firebase-uid', {
        alias: 'f',
        describe: 'The user\'s Firebase UID',
        type: 'string',
        demandOption: true,
    })
    .option('dry-run', {
      describe: 'Perform a dry run without deleting the user',
      type: 'boolean',
      default: true,
    })
    .help()
    .argv;

  const uid = argv.firebaseUid;
  const dryRun = argv.dryRun;

  if (dryRun) {
    console.log('*** DRY RUN ***');
    await connectDB();
    const user = await User.findOne({ authUid: uid });
    if (!user) {
      console.log(`User with UID: ${uid} not found.`);
      await mongoose.disconnect();
      return;
    }

    console.log(`User found: ${user._id}`);
    console.log('This script will perform the following actions:');
    console.log('- Soft-delete the user');
    console.log('- Rename DEK files');
    console.log('- Invalidate Plaid access token');

    const accessTokens = await AccessToken.find({ userId: user._id }).limit(5);
    if(accessTokens.length > 0) {
        console.log('- Delete access tokens from the database:');
        console.table(accessTokens.map(t => ({ id: t._id, itemId: t.itemId, userId: t.userId })));
    }

    const files = await Files.find({ userId: user._id }).limit(5);
    if(files.length > 0) {
        console.log('- Delete files from the database:');
        console.table(files.map(f => ({ id: f._id, filename: f.filename, userId: f.userId })));
    }

    const businesses = await Business.find({ userId: user._id }).limit(5);
    if(businesses.length > 0) {
        console.log('- Delete businesses from the database:');
        console.table(businesses.map(b => ({ id: b._id, name: b.name, userId: b.userId })));
    }

    const plaidAccounts = await PlaidAccount.find({ owner_id: user._id });
    if (plaidAccounts.length > 0) {
        console.log('- Delete plaid accounts from the database:');
        console.table(plaidAccounts.map(p => ({ id: p._id, name: p.name, owner_id: p.owner_id })));
    }
    const plaidAccountIds = plaidAccounts.map(account => account.plaid_account_id);

    const transactions = await Transaction.find({ plaidAccountId: { $in: plaidAccountIds } }).limit(5);
    if(transactions.length > 0) {
        console.log('- Delete transactions from the database:');
        console.table(transactions.map(t => ({ id: t._id, plaidAccountId: t.plaidAccountId, transactionDate: t.transactionDate })));
    }

    const liabilities = await Liability.find({ accountId: { $in: plaidAccountIds } }).limit(5);
    if(liabilities.length > 0) {
        console.log('- Delete liabilities from the database:');
        console.table(liabilities.map(l => ({ id: l._id, accountId: l.accountId, liabilityType: l.liabilityType })));
    }

    const assets = await Assets.find({ userId: user._id }).limit(5);
    if(assets.length > 0) {
        console.log('- Delete assets from the database:');
        console.table(assets.map(a => ({ id: a._id, name: a.name, userId: a.userId })));
    }

    const trips = await Trips.find({ userId: user._id }).limit(5);
    if(trips.length > 0) {
        console.log('- Delete trips from the database:');
        console.table(trips.map(t => ({ id: t._id, name: t.name, userId: t.userId })));
    }

    const verificationCodes = await VerificationCode.find({ userId: user._id }).limit(5);
    if(verificationCodes.length > 0) {
        console.log('- Delete verification codes from the database:');
        console.table(verificationCodes.map(v => ({ id: v._id, code: v.code, userId: v.userId })));
    }

    console.log('- Permanently delete the user from the database');
    console.log('- Delete the user from Firebase');
    console.log('To execute the deletion, run the script with the --no-dry-run flag.');
    await mongoose.disconnect();
    return;
  }
  
  await deleteUser(uid);
};

main();