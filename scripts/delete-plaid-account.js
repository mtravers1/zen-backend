import mongoose from "mongoose";
import connectDB from "../database/database.js";
import accountsService from "../services/accounts.service.js";
import User from "../database/models/User.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import Transaction from "../database/models/Transaction.js";
import { getUserDek } from "../database/encryption.js";
import { createSafeDecrypt } from "../lib/encryptionHelper.js";

const deletePlaidAccount = async (accountId, userIdentifier, isDryRun) => {
  if (!accountId || !userIdentifier) {
    console.error("Account ID and User Identifier (--user-id or --firebase-uid) are required.");
    process.exit(1);
  }

  try {
    await connectDB();
    console.log("Database connected.");

    let user;
    let uid;
    // Determine if userIdentifier is a mongoose ObjectId or a Firebase UID
    if (mongoose.Types.ObjectId.isValid(userIdentifier)) {
      user = await User.findById(userIdentifier);
      if (user) uid = user.authUid;
    } else { // Assume it's a Firebase UID
      user = await User.findOne({ authUid: userIdentifier });
      uid = userIdentifier;
    }

    if (!user) {
      throw new Error(`User not found with identifier: ${userIdentifier}`);
    }

    if (isDryRun) {
      console.log(`--DRY RUN-- Preparing to show records for Plaid account ${accountId} for user with uid ${uid}`);

      const account = await PlaidAccount.findOne({ plaid_account_id: accountId, owner_id: user._id });
      if (!account) {
        console.log("No Plaid account found to delete.");
      } else {
        const dek = await getUserDek(uid);
        const safeDecrypt = createSafeDecrypt(uid, dek);
        
        const decryptedAccountName = await safeDecrypt(account.account_name, { field: 'account_name' });
        const decryptedInstitutionName = await safeDecrypt(account.institution_name, { field: 'institution_name' });

        console.log("\nAccount to be deleted:");
        console.table([{
          _id: account._id.toString(),
          plaid_account_id: account.plaid_account_id,
          account_name: decryptedAccountName,
          institution_name: decryptedInstitutionName,
        }]);

        const transactions = await Transaction.find({ accountId: account._id });
        if (transactions.length > 0) {
          const decryptedTransactions = await Promise.all(transactions.map(async (t) => {
            const amount = await safeDecrypt(t.amount, { field: 'amount' });
            return {
              _id: t._id.toString(),
              plaidTransactionId: t.plaidTransactionId,
              transactionDate: t.transactionDate,
              amount: amount,
            };
          }));
          console.log("\nAssociated transactions to be deleted:");
          console.table(decryptedTransactions);
        } else {
          console.log("No associated transactions found to delete.");
        }
      }
    } else {
      await accountsService.deletePlaidAccount(accountId, uid);
      console.log(`Plaid account ${accountId} for user with uid ${uid} deleted successfully.`);
    }

  } catch (error) {
    console.error("Error deleting Plaid account:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("Database disconnected.");
  }
};

const parseArgs = () => {
  let accountId = null;
  let userId = null;
  let firebaseUid = null;
  let isDryRun = true; // Default to dry run

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--account-id=")) {
      accountId = arg.split("=")[1];
    } else if (arg.startsWith("--user-id=")) {
      userId = arg.split("=")[1];
    } else if (arg.startsWith("--firebase-uid=")) {
      firebaseUid = arg.split("=")[1];
    } else if (arg === "--no-dry-run") {
      isDryRun = false;
    }
  }

  // Prioritize firebaseUid if both are provided
  const userIdentifier = firebaseUid || userId;

  return { accountId, userIdentifier, isDryRun };
};

const { accountId, userIdentifier, isDryRun } = parseArgs();
deletePlaidAccount(accountId, userIdentifier, isDryRun);
