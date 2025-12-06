import mongoose from "mongoose";
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
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

const cleanup = async (isDryRun) => {
  console.log("Starting cleanup of orphaned data...");

  const users = await User.find({}).lean();
  const userIds = users.map(u => u._id);
  const userEmails = users.flatMap(u => u.email.map(e => e.email));

  const userIdsAsStrings = userIds.map(id => id.toString());
  const userIdsAndStrings = [...userIds, ...userIdsAsStrings];

  const collections = [
    { model: PlaidAccount, field: 'owner_id' },
    { model: Business, field: 'userId' },
    { model: Assets, field: 'userId' },
    { model: Files, field: 'userId' },
    { model: AccessToken, field: 'userId' },
    { model: Trips, field: 'user' },
  ];

  for (const { model, field } of collections) {
    const query = { [field]: { $nin: userIdsAndStrings } };
    const orphanedCount = await model.countDocuments(query);

    if (orphanedCount > 0) {
      console.log(`Found ${orphanedCount} orphaned documents in ${model.modelName}.`);
      if (!isDryRun) {
        console.log(`Deleting orphaned documents from ${model.modelName}...`);
        const deleteResult = await model.deleteMany(query);
        console.log(`Deleted ${deleteResult.deletedCount} documents.`);
      }
    } else {
      console.log(`No orphaned documents found in ${model.modelName}.`);
    }
  }

  // Cleanup for VerificationCode by email
  const emailQuery = { email: { $nin: userEmails } };
  const orphanedEmailCount = await VerificationCode.countDocuments(emailQuery);
  if (orphanedEmailCount > 0) {
    console.log(`Found ${orphanedEmailCount} orphaned documents in VerificationCode.`);
    if (!isDryRun) {
      console.log(`Deleting orphaned documents from VerificationCode...`);
      const deleteResult = await VerificationCode.deleteMany(emailQuery);
      console.log(`Deleted ${deleteResult.deletedCount} documents.`);
    }
  } else {
      console.log(`No orphaned documents found in VerificationCode.`);
  }

  // Cleanup for Transactions and Liabilities
  const validPlaidAccounts = await PlaidAccount.find({ owner_id: { $in: userIdsAndStrings } }).lean();
  const validPlaidAccountIds = validPlaidAccounts.map(p => p.plaid_account_id);

  const orphanedTransactionsQuery = { plaidAccountId: { $nin: validPlaidAccountIds } };
  const orphanedTransactionsCount = await Transaction.countDocuments(orphanedTransactionsQuery);
  if (orphanedTransactionsCount > 0) {
    console.log(`Found ${orphanedTransactionsCount} orphaned documents in Transaction.`);
    if (!isDryRun) {
      console.log(`Deleting orphaned documents from Transaction...`);
      const deleteResult = await Transaction.deleteMany(orphanedTransactionsQuery);
      console.log(`Deleted ${deleteResult.deletedCount} documents.`);
    }
  } else {
    console.log(`No orphaned documents found in Transaction.`);
  }

  const orphanedLiabilitiesQuery = { accountId: { $nin: validPlaidAccountIds } };
  const orphanedLiabilitiesCount = await Liability.countDocuments(orphanedLiabilitiesQuery);
  if (orphanedLiabilitiesCount > 0) {
    console.log(`Found ${orphanedLiabilitiesCount} orphaned documents in Liability.`);
    if (!isDryRun) {
      console.log(`Deleting orphaned documents from Liability...`);
      const deleteResult = await Liability.deleteMany(orphanedLiabilitiesQuery);
      console.log(`Deleted ${deleteResult.deletedCount} documents.`);
    }
  } else {
    console.log(`No orphaned documents found in Liability.`);
  }

  console.log("Cleanup finished.");
};

const main = async () => {
  const argv = yargs(hideBin(process.argv))
    .usage('Usage: $0 [--no-dry-run]')
    .option('dry-run', {
      describe: 'Perform a dry run (default) or use --no-dry-run to execute deletion.',
      type: 'boolean',
      default: true,
    })
    .help()
    .argv;

  try {
    await connectDB();
    console.log("Database connected.");
    
    if (argv.dryRun) {
        console.log('*** DRY RUN ***');
        console.log('This is a dry run. No data will be deleted.');
        console.log('Run with --no-dry-run to execute the deletion.');
        await cleanup(true);
    } else {
        console.log('*** EXECUTION RUN ***');
        console.log('This is an execution run. Orphaned data will be deleted.');
        await cleanup(false);
    }

  } catch (error) {
    console.error("Error during cleanup process:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Database disconnected.");
  }
};

main();
