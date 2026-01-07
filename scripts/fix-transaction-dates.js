import mongoose from "mongoose";
import Transaction from "../database/models/Transaction.js";
import connectDB from "../database/database.js";
import {
  decryptValue,
  encryptValue,
  getUserDek,
} from "../database/encryption.js";
import User from "../database/models/User.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import { createSafeDecrypt } from "../lib/encryptionHelper.js";

const BATCH_SIZE = 500;

const fixTransactionDates = async (dryRun = true) => {
  try {
    console.log("Connecting to database...");
    await connectDB();
    console.log("Database connected.");

    console.log("Starting transaction date migration...");
    const totalTransactions = await Transaction.countDocuments();
    console.log(`Found ${totalTransactions} total transactions to check.`);

    if (totalTransactions === 0) {
      console.log("No transactions found to migrate.");
      return;
    }

    let fixedCount = 0;
    let processedCount = 0;
    const bulkOps = [];

    for (let i = 0; i < totalTransactions; i += BATCH_SIZE) {
      const transactions = await Transaction.find().skip(i).limit(BATCH_SIZE);

      for (const trans of transactions) {
        if (!trans.transactionDate) {
            continue;
        }

        const currentHours = trans.transactionDate.getUTCHours();
        const currentMinutes = trans.transactionDate.getUTCMinutes();
        const currentSeconds = trans.transactionDate.getUTCSeconds();
        const currentMs = trans.transactionDate.getUTCMilliseconds();

        // Check if the time is anything other than exactly noon
        if (currentHours !== 12 || currentMinutes !== 0 || currentSeconds !== 0 || currentMs !== 0) {
          const year = trans.transactionDate.getUTCFullYear();
          const month = trans.transactionDate.getUTCMonth();
          const day = trans.transactionDate.getUTCDate();
          
          const newDate = new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
          
          if (!dryRun) {
            bulkOps.push({
              updateOne: {
                filter: { _id: trans._id },
                update: { $set: { transactionDate: newDate } },
              },
            });
          }
          fixedCount++;
        }
      }
      processedCount += transactions.length;
      console.log(`Processed ${processedCount} / ${totalTransactions} transactions...`);
    }

    if (!dryRun && bulkOps.length > 0) {
      console.log(`Applying changes to ${bulkOps.length} transactions...`);
      await Transaction.bulkWrite(bulkOps);
      console.log("Bulk write complete.");
    }

    if (dryRun) {
        console.log(`DRY RUN: Would have fixed a total of ${fixedCount} transactions.`);
    } else {
        console.log(`Migration complete. Fixed a total of ${fixedCount} transactions.`);
    }

  } catch (error) {
    console.error("An error occurred during migration:", error);
  } finally {
    try {
      await mongoose.connection.close();
      console.log("Database connection closed.");
    } catch (error) {
      console.error("Failed to close database connection:", error);
    }
  }
};

const dryRun = process.argv.includes("--no-dry-run") ? false : true;
fixTransactionDates(dryRun);