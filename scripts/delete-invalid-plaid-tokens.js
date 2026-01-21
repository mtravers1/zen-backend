
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
            console.log(`Processing deletion for itemId: ${token.itemId}`);

            try {
              console.log(`Invalidating Plaid item for itemId: ${token.itemId}...`);
              await plaidService.invalidateAccessToken(null, token.itemId);
              console.log(`Successfully invalidated Plaid item for itemId: ${token.itemId}`);

              // Now that the Plaid item is successfully invalidated, we can safely delete our local records.
              // 1. Soft delete AccessToken to prevent race conditions during the script run
              await AccessToken.updateOne({ _id: token._id }, { $set: { deletedAt: new Date() } });

              const otherValidTokens = await AccessToken.find({
                userId: token.userId,
                institutionId: token.institutionId,
                _id: { $ne: token._id },
                deletedAt: null
              });

              if (otherValidTokens.length === 0) {
                console.log(`No other valid tokens found for institution ${token.institutionId}. Proceeding with full data deletion.`);
                const accounts = await PlaidAccount.find({ itemId: token.itemId });
                const accountIds = accounts.map(account => account._id);

                if (accountIds.length > 0) {
                  await Transaction.deleteMany({ accountId: { $in: accountIds } });
                  console.log(`Hard-deleted transactions for itemId: ${token.itemId}`);
                  await PlaidAccount.deleteMany({ _id: { $in: accountIds } });
                  console.log(`Hard-deleted accounts for itemId: ${token.itemId}`);
                }
              } else {
                console.log(`Other valid tokens exist for institution ${token.institutionId}. Only deleting the invalid AccessToken.`);
              }

              // Hard-delete the AccessToken itself
              await AccessToken.deleteOne({ _id: token._id });
              console.log(`Successfully hard-deleted AccessToken for itemId: ${token.itemId}`);

            } catch (plaidError) {
              console.error(`Failed to invalidate Plaid item for itemId: ${token.itemId}. Aborting deletion for this token. Error: ${plaidError.message}`);
              // We will not delete the token or related data if invalidation fails.
              // You might want to add more sophisticated retry logic or notifications here.
            }
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

  for (const arg of process.argv.slice(2)) {
    if (arg === "--no-dry-run") {
      isDryRun = false;
    }
  }

  return { isDryRun };
};

const { isDryRun } = parseArgs();
deleteInvalidPlaidTokens(isDryRun);
