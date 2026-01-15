import mongoose from "mongoose";
import PlaidAccount from "../database/models/PlaidAccount.js";
import AccessToken from "../database/models/AccessToken.js";
import Transaction from "../database/models/Transaction.js";
import Liability from "../database/models/Liability.js";
import User from "../database/models/User.js";
import plaidService from "../services/plaid.service.js";
import structuredLogger from "../lib/structuredLogger.js";
import { createSafeDecrypt } from "../lib/encryptionHelper.js";
import { getUserDek } from "../database/encryption.js";
import { connect, disconnect } from "../database/database.js";

const cleanupDuplicateAccounts = async () => {
  await connect();

  const allAccounts = await PlaidAccount.find({});
  const accountsByHash = {};

  // Group accounts by their hash
  for (const account of allAccounts) {
    const hash = `${account.hashAccountName}-${account.hashAccountInstitutionId}-${account.hashAccountMask}`;
    if (!accountsByHash[hash]) {
      accountsByHash[hash] = [];
    }
    accountsByHash[hash].push(account);
  }

  for (const hash in accountsByHash) {
    const duplicateAccounts = accountsByHash[hash];
    if (duplicateAccounts.length > 1) {
      structuredLogger.logInfo(`Found ${duplicateAccounts.length} duplicate accounts for hash ${hash}`);

      // Sort by updated_at to find the most recent account
      duplicateAccounts.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

      const primaryAccount = duplicateAccounts[0];
      structuredLogger.logInfo(`Primary account is ${primaryAccount._id}`);

      for (let i = 1; i < duplicateAccounts.length; i++) {
        const redundantAccount = duplicateAccounts[i];
        structuredLogger.logWarning(`Deleting redundant account ${redundantAccount._id}`);

        try {
          const user = await User.findOne({ plaidAccounts: redundantAccount._id });
          if (user) {
            user.plaidAccounts = user.plaidAccounts.filter(id => id.toString() !== redundantAccount._id.toString());
            await user.save();
          }

          await Transaction.deleteMany({ plaidAccountId: redundantAccount.plaid_account_id });
          await Liability.deleteMany({ accountId: redundantAccount.plaid_account_id });

          const accessToken = await AccessToken.findOne({ itemId: redundantAccount.itemId });
          if (accessToken) {
            const dek = await getUserDek(user.authUid);
            const safeDecrypt = createSafeDecrypt(user.authUid, dek);
            const decryptedToken = await safeDecrypt(accessToken.accessToken, { item_id: accessToken.itemId, field: "accessToken" });
            if (decryptedToken) {
              await plaidService.invalidateAccessToken(decryptedToken);
            }
            await AccessToken.deleteOne({ _id: accessToken._id });
          }

          await PlaidAccount.deleteOne({ _id: redundantAccount._id });

          structuredLogger.logSuccess(`Successfully deleted redundant account ${redundantAccount._id}`);
        } catch (error) {
          structuredLogger.logErrorBlock(error, {
            operation: "cleanupDuplicateAccounts",
            accountId: redundantAccount._id.toString(),
            message: "Failed to delete redundant account.",
          });
        }
      }
    }
  }

  await disconnect();
};

cleanupDuplicateAccounts().catch(error => {
  structuredLogger.logErrorBlock(error, {
    operation: "cleanupDuplicateAccounts",
    message: "An unexpected error occurred during the cleanup process.",
  });
  process.exit(1);
});
