
import mongoose from "mongoose";
import connectDB from "../database/database.js";
import AccessToken from "../database/models/AccessToken.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import Transaction from "../database/models/Transaction.js";
import User from "../database/models/User.js";
import getPlaidClient from "../config/plaid.js";
import { getUserDek } from "../database/encryption.js";
import { createSafeDecrypt } from "../lib/encryptionHelper.js";

const deleteInvalidPlaidTokens = async (isDryRun, isForceHardDelete) => {
  try {
    await connectDB();
    console.log("Database connected.");

    if (isForceHardDelete && !isDryRun) {
      console.log("--force-hard-delete and --no-dry-run flags found. Hard-deleting soft-deleted documents.");
      const deletedAccessTokens = await AccessToken.deleteMany({ deletedAt: { $ne: null } });
      const deletedPlaidAccounts = await PlaidAccount.deleteMany({ deletedAt: { $ne: null } });
      const deletedTransactions = await Transaction.deleteMany({ deletedAt: { $ne: null } });
      console.log(`Hard-deleted ${deletedAccessTokens.deletedCount} access tokens, ${deletedPlaidAccounts.deletedCount} plaid accounts, and ${deletedTransactions.deletedCount} transactions.`);
      return;
    }

    const accessTokens = await AccessToken.find({ deletedAt: null });
    const plaidClient = getPlaidClient();
    const tokensToDelete = [];

    for (const token of accessTokens) {
      let decryptedToken;
      try {
        const user = await User.findById(token.userId);
        if (!user) {
          console.error(`User not found for token with itemId: ${token.itemId}`);
          continue;
        }
        const dek = await getUserDek(user.authUid);
        const safeDecrypt = createSafeDecrypt(user.authUid, dek);
        decryptedToken = await safeDecrypt(token.accessToken, {
          item_id: token.itemId,
          field: "accessToken",
        });

        if (!decryptedToken) {
          console.error(`Failed to decrypt access token for itemId: ${token.itemId}`);
          continue;
        }

        await plaidClient.itemGet({ access_token: decryptedToken });
      } catch (error) {
        if (error.response && error.response.data.error_code === 'ITEM_NOT_FOUND') {
          if (isDryRun) {
            const accounts = await PlaidAccount.find({ itemId: token.itemId, deletedAt: null });
            const accountPlaidIds = accounts.map(a => a.plaid_account_id);
            const transactionCount = await Transaction.countDocuments({ accountId: { $in: accounts.map(a => a._id) }, deletedAt: null });

            tokensToDelete.push({
              "Item ID": token.itemId,
              "User ID": token.userId,
              "Reason": "ITEM_NOT_FOUND in Plaid",
              "Associated Plaid Accounts": accountPlaidIds.join(', '),
              "Associated Transactions": transactionCount,
            });
          } else {
            console.log(`Hard-deleting Plaid token and associated data for itemId: ${token.itemId}`);

            // 1. Soft delete AccessToken to prevent race conditions
            await AccessToken.updateOne({ _id: token._id }, { $set: { deletedAt: new Date() } });
            
            // 2. Hard delete associated PlaidAccounts
            const accounts = await PlaidAccount.find({ itemId: token.itemId });
            const accountIds = accounts.map(account => account._id);
            if (accountIds.length > 0) {
              await PlaidAccount.deleteMany({ _id: { $in: accountIds } });

              // 3. Hard delete associated Transactions
              await Transaction.deleteMany({ accountId: { $in: accountIds } });
            }

            // 4. Hard delete the AccessToken itself
            await AccessToken.deleteOne({ _id: token._id });
            
            console.log(`Successfully hard-deleted data for itemId: ${token.itemId}`);
          }
        } else {
          console.error(`Error checking token for itemId: ${token.itemId}`, error.response?.data || error);
        }
      }
    }

    if (isDryRun && tokensToDelete.length > 0) {
      console.log("--DRY RUN-- The following items would be hard-deleted:");
      console.table(tokensToDelete);
    } else if (isDryRun) {
      console.log("--DRY RUN-- No invalid tokens found.");
    }

  } catch (error) {
    console.error("An unexpected error occurred:", error);
  } finally {
    await mongoose.disconnect();
    console.log("Database disconnected.");
  }
};

const parseArgs = () => {
  let isDryRun = true;
  let isForceHardDelete = false;

  for (const arg of process.argv.slice(2)) {
    if (arg === "--no-dry-run") {
      isDryRun = false;
    }
    if (arg === "--force-hard-delete") {
      isForceHardDelete = true;
    }
  }

  return { isDryRun, isForceHardDelete };
};

const { isDryRun, isForceHardDelete } = parseArgs();
deleteInvalidPlaidTokens(isDryRun, isForceHardDelete);
