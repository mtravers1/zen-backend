
import mongoose from "mongoose";
import connectDB from "../database/database.js";
import AccessToken from "../database/models/AccessToken.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import Transaction from "../database/models/Transaction.js";
import User from "../database/models/User.js";
import getPlaidClient from "../config/plaid.js";
import { getUserDek } from "../database/encryption.js";
import { createSafeDecrypt } from "../lib/encryptionHelper.js";

const deleteInvalidPlaidTokens = async (isDryRun) => {
  try {
    await connectDB();
    console.log("Database connected.");

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
            console.log(`Soft-deleting Plaid token and associated data for itemId: ${token.itemId}`);

            const now = new Date();

            // 1. Soft delete AccessToken
            await AccessToken.updateOne({ _id: token._id }, { $set: { deletedAt: now } });
            
            // 2. Soft delete PlaidAccounts
            const accounts = await PlaidAccount.find({ itemId: token.itemId });
            const accountIds = accounts.map(account => account._id);
            await PlaidAccount.updateMany({ _id: { $in: accountIds } }, { $set: { deletedAt: now } });

            // 3. Soft delete Transactions
            if (accountIds.length > 0) {
              await Transaction.updateMany({ accountId: { $in: accountIds } }, { $set: { deletedAt: now } });
            }

            // 4. Remove item from Plaid (this is a hard delete on Plaid's side and should be last)
            try {
              await plaidClient.itemRemove({ access_token: decryptedToken });
            } catch (removeError) {
              // It might already be removed, so we can ignore ITEM_NOT_FOUND errors here
              if (removeError.response?.data?.error_code !== 'ITEM_NOT_FOUND') {
                console.error(`Error removing item from Plaid for itemId: ${token.itemId}`, removeError.response?.data || removeError);
              }
            }
            
            console.log(`Successfully soft-deleted data for itemId: ${token.itemId}`);
          }
        } else {
          console.error(`Error checking token for itemId: ${token.itemId}`, error.response?.data || error);
        }
      }
    }

    if (isDryRun && tokensToDelete.length > 0) {
      console.log("--DRY RUN-- The following items would be soft-deleted:");
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
  let isDryRun = true; // Default to dry run

  for (const arg of process.argv.slice(2)) {
    if (arg === "--no-dry-run") {
      isDryRun = false;
    }
  }

  return { isDryRun };
};

const { isDryRun } = parseArgs();
deleteInvalidPlaidTokens(isDryRun);
