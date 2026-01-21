import mongoose from "mongoose";
import crypto from 'crypto';
import plaidService from "./plaid.service.js";
import Business from "../database/models/Businesses.js";
import { formatTransactionAmount } from "./transactions.service.js";
import { storage, filesBucketName } from "../lib/storageClient.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import User from "../database/models/User.js";
import Transaction from "../database/models/Transaction.js";
import businessService from "./businesses.service.js";

import Liability from "../database/models/Liability.js";
import AccessToken from "../database/models/AccessToken.js";
import assetsService from "./assets.service.js";

import {
  decryptValue,
  encryptValue,
  getUserDek,
  hashValue,
} from "../database/encryption.js";
import structuredLogger from "../lib/structuredLogger.js";

import {
  createSafeEncrypt,
  createSafeDecrypt,
  safeDecryptNumericValue,
  getDecryptedAccount,
  getDecryptedLiabilitiesCredit,
  getDecryptedLiabilitiesLoan,
  flexibleDecrypt,
} from "../lib/encryptionHelper.js";



async function _updatePlaidAccountDetails(existingAccount, account, institutionId, institutionName, safeEncrypt, hashValue) {
  existingAccount.itemId = account.itemId; // Ensure itemId is passed correctly
  existingAccount.plaid_account_id = account.account_id;
  existingAccount.status = 'good';

  existingAccount.account_name = await safeEncrypt(account.name, { account_id: existingAccount._id.toString(), field: "name" });
  existingAccount.account_official_name = account.official_name ? await safeEncrypt(account.official_name, { account_id: existingAccount._id.toString(), field: "official_name" }) : null;
  existingAccount.account_type = await safeEncrypt(account.type, { account_id: existingAccount._id.toString(), field: "type" });
  existingAccount.account_subtype = await safeEncrypt(account.subtype, { account_id: existingAccount._id.toString(), field: "subtype" });

  if (account.balances) {
    existingAccount.currentBalance = account.balances.current ? await safeEncrypt(account.balances.current.toString(), { account_id: existingAccount._id.toString(), field: "currentBalance" }) : null;
    existingAccount.availableBalance = account.balances.available ? await safeEncrypt(account.balances.available.toString(), { account_id: existingAccount._id.toString(), field: "availableBalance" }) : null;
  }

  existingAccount.institution_name = await safeEncrypt(institutionName, { account_id: existingAccount._id.toString(), field: "institutionName" });
  existingAccount.institution_id = institutionId;

  existingAccount.hashAccountName = hashValue(account.name);
  existingAccount.hashAccountInstitutionId = hashValue(institutionId);
  existingAccount.hashAccountMask = hashValue(account.mask);

  await existingAccount.save();
  return existingAccount;
}

const addAccount = async (accessToken, email, uid, profileId) => {
  return await structuredLogger.withContext(
    "add_account",
    { email, uid, profileId },
    async () => {
      const dek = await getUserDek(uid);
      const safeEncrypt = createSafeEncrypt(uid, dek);
      const safeDecrypt = createSafeDecrypt(uid, dek);

      const user = await User.findOne({
        authUid: uid,
      });
      if (!user) {
        throw new Error("User not found");
      }
      const userId = user._id.toString();
      const userType = user.role;
      const accountsResponse =
        await plaidService.getAccountsWithAccessToken(accessToken);

      if (!accountsResponse || !accountsResponse.accounts) {
        throw new Error("Could not get accounts from Plaid");
      }

      const accounts = accountsResponse.accounts;
      const institutionId = accountsResponse.item.institution_id;
      const institutionName = accountsResponse.item.institution_name;

      await plaidService.saveAccessToken(
        email,
        accessToken,
        accountsResponse.item.item_id,
        institutionId,
        uid,
      );

      let targetEntity;
      if (profileId && mongoose.Types.ObjectId.isValid(profileId)) {
        targetEntity = await Business.findById(profileId);
      }
      
      // If no valid business profile is found (or profileId was not provided), default to the user.
      if (!targetEntity) {
        targetEntity = user;
      }

      let savedAccounts = [];
      const accountTypes = {};
      const existingAccounts = [];
      const allAccounts = [];

      for (let account of accounts) {
        const existingAccountsWithHash = await PlaidAccount.find({
          hashAccountName: hashValue(account.name),
          hashAccountInstitutionId: hashValue(institutionId),
          hashAccountMask: hashValue(account.mask),
          owner_id: userId,
        });



        if (existingAccountsWithHash.length > 0) {
          const primaryExistingAccount = existingAccountsWithHash[0];
          const oldItemId = primaryExistingAccount.itemId;

          // Use the new helper function to update the primary existing account
          await _updatePlaidAccountDetails(primaryExistingAccount, { ...account, itemId: accountsResponse.item.item_id }, institutionId, institutionName, safeEncrypt, hashValue);

          // Invalidate the old Plaid item and delete the old access token ONLY if the itemId has changed
          if (oldItemId !== accountsResponse.item.item_id) {
            try {
              const oldAccessToken = await AccessToken.findOne({ itemId: oldItemId });
              if (oldAccessToken) {
                const decryptedToken = await safeDecrypt(oldAccessToken.accessToken, { item_id: oldItemId, field: "accessToken" });
                if (decryptedToken) {
                  await plaidService.invalidateAccessToken(decryptedToken);
                }
                await AccessToken.deleteOne({ _id: oldAccessToken._id });
              }
            } catch (error) {
              structuredLogger.logErrorBlock(error, {
                operation: "addAccount_cleanup_old_token",
                item_id: oldItemId,
                message: "Failed to invalidate or delete old access token.",
              });
            }
          }

          existingAccounts.push(primaryExistingAccount);
          allAccounts.push(primaryExistingAccount);

          // Handle redundant duplicate accounts
          for (let i = 1; i < existingAccountsWithHash.length; i++) {
            const redundantAccount = existingAccountsWithHash[i];
            structuredLogger.logWarning("Redundant duplicate account found and will be deleted.", {
              accountId: redundantAccount._id.toString(),
              plaidAccountId: redundantAccount.plaid_account_id,
              userId: userId,
            });

            // Remove account references from the user
            if (profileId) {
              targetEntity.plaidAccountIds = targetEntity.plaidAccountIds.filter(id => id.toString() !== redundantAccount._id.toString());
            } else {
              targetEntity.plaidAccounts = targetEntity.plaidAccounts.filter(id => id.toString() !== redundantAccount._id.toString());
            }

            // Delete associated transactions, liabilities, and the redundant account itself
            await Transaction.deleteMany({ plaidAccountId: redundantAccount.plaid_account_id });
            await Liability.deleteMany({ accountId: redundantAccount.plaid_account_id });
            await PlaidAccount.deleteOne({ _id: redundantAccount._id });
          }
          await targetEntity.save(); // Save user/business after removing references

          continue;
        }

        const encryptedMask = await safeEncrypt(account.mask, {
          account_id: account.account_id,
          field: "mask",
        });

        const encryptedName = await safeEncrypt(account.name, {
          account_id: account.account_id,
          field: "name",
        });

        let encryptedOfficialName;

        if (account.official_name) {
          encryptedOfficialName = await safeEncrypt(
            account.official_name,
            { account_id: account.account_id, field: "official_name" },
          );
        }

        const encryptedType = await safeEncrypt(account.type, {
          account_id: account.account_id,
          field: "type",
        });

        const encryptedSubtype = await safeEncrypt(account.subtype, {
          account_id: account.account_id,
          field: "subtype",
        });

        const encryptedInstitutionName = await safeEncrypt(
          institutionName,
          { account_id: account.account_id, field: "institutionName" },
        );

        let encryptedCurrentBalance;
        let encryptedAvailableBalance;

        if (account.balances) {
          if (account.balances.current) {
            encryptedCurrentBalance = await safeEncrypt(
              account.balances.current,
              { account_id: account.account_id, field: "currentBalance" },
            );
          }

          if (account.balances.available) {
            encryptedAvailableBalance = await safeEncrypt(
              account.balances.available,
              { account_id: account.account_id, field: "availableBalance" },
            );
          }
        }

        const hashAccountName = hashValue(account.name);
        const hashAccountInstitutionId = hashValue(institutionId);
        const hashAccountMask = hashValue(account.mask);

        const newAccount = new PlaidAccount({
          owner_id: userId,
          itemId: accountsResponse.item.item_id,
          owner_type: userType,
          plaid_account_id: account.account_id,
          account_name: encryptedName,
          account_official_name: encryptedOfficialName,
          account_type: encryptedType,
          account_subtype: encryptedSubtype,
          institution_name: encryptedInstitutionName,
          institution_id: institutionId,
          image_url: account.institution_name,
          currentBalance: encryptedCurrentBalance,
          availableBalance: encryptedAvailableBalance,
          currency: account.balances.iso_currency_code,
          transactions: [],
          nextCursor: null,
          mask: encryptedMask,
          hashAccountName,
          hashAccountInstitutionId,
          hashAccountMask,
        });

        accountTypes[account.account_id] = account.type;

        // Associate account with either User or Business profile
        if (targetEntity.constructor.modelName === 'Business') {
          targetEntity.plaidAccountIds.push(newAccount._id);
        } else {
          targetEntity.plaidAccounts.push(newAccount._id);
        }

        await targetEntity.save();
        await newAccount.save();
        savedAccounts.push(newAccount);
        allAccounts.push(newAccount);
      }

      const responseExistingAccounts = await Promise.all(
        existingAccounts.map(async (ec) => {
          return {
            id: ec.id,
            name: await safeDecrypt(ec.account_name, {
              account_id: ec.id,
              field: "account_name",
            }),
          };
        }),
      );



            // Fire and forget the background sync. Do not await it.



            plaidService.updateTransactions(accountsResponse.item.item_id).catch((error) => {



              structuredLogger.logErrorBlock(error, {



                operation: "addAccount_background_sync_trigger",



                item_id: accountsResponse.item.item_id,



                message: "Background sync triggered by addAccount failed.",



              });



            });



      



            structuredLogger.logSuccess("add_account_completed", {



              user_id: userId,



              institution_id: institutionId,



              institution_name: institutionName,



              saved_accounts_count: savedAccounts.length,



              existing_accounts_count: existingAccounts.length,



              transactions_count: 0, // No longer fetching transactions here



              investment_transactions_count: 0,



            });



      



            return { savedAccounts, existingAccounts: responseExistingAccounts };
    },
  );
};


const deletePlaidAccountByEmail = async (accountId, email) => {
  const user = await User.findOne({
    "email.email": email.toLowerCase(),
  });
  if (!user) {
    throw new Error("User not found");
  }
  const plaidAccounts = user.plaidAccounts;

  const account = await PlaidAccount.findOne({ plaid_account_id: accountId });
  if (account) {
    await plaidService.invalidateAccessToken(null, account.itemId);
    user.plaidAccounts = plaidAccounts.filter(
      (id) => id.toString() !== account._id.toString(),
    );

    await user.save();

    await PlaidAccount.deleteOne({ plaid_account_id: accountId });
    await Transaction.deleteMany({ plaidAccountId: accountId });
    await Liability.deleteMany({ accountId });
  }
};

const deletePlaidAccount = async (accountId, uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) {
    throw new Error("User not found");
  }

  // 1. Find the target account to get its hashes.
  let targetAccount;
  if (mongoose.Types.ObjectId.isValid(accountId)) {
    targetAccount = await PlaidAccount.findById(accountId);
  } else {
    targetAccount = await PlaidAccount.findOne({ plaid_account_id: accountId, owner_id: user._id });
  }

  if (!targetAccount) {
    return { success: true, message: "Account already deleted." };
  }

  // Verify ownership.
  if (targetAccount.owner_id.toString() !== user._id.toString()) {
    throw new Error("User does not own this account");
  }

  // 2. Find all duplicate accounts based on the hashes.
  const duplicateAccounts = await PlaidAccount.find({
    hashAccountName: targetAccount.hashAccountName,
    hashAccountInstitutionId: targetAccount.hashAccountInstitutionId,
    hashAccountMask: targetAccount.hashAccountMask,
    owner_id: user._id,
  });

  if (duplicateAccounts.length === 0) {
    return { success: true, message: "No accounts to delete." };
  }

  const itemIdsToDelete = [...new Set(duplicateAccounts.map(acc => acc.itemId))];
  const accountIdsToDelete = duplicateAccounts.map(acc => acc._id);
  const plaidAccountIdsToDelete = duplicateAccounts.map(acc => acc.plaid_account_id);

  // 3. Invalidate all Plaid items and delete AccessTokens.
  for (const itemId of itemIdsToDelete) {
    try {
      // Invalidate the Plaid item.
      await plaidService.invalidateAccessToken(null, itemId);
      
      // Delete the access token from the database.
      await AccessToken.deleteOne({ itemId: itemId });
    } catch (error) {
      structuredLogger.logErrorBlock(error, {
        operation: "deletePlaidAccount_invalidate_item",
        item_id: itemId,
        message: "Failed to invalidate or delete access token.",
      });
    }
  }

  // 4. Clean up all related data from the database.
  await User.updateOne(
    { _id: user._id },
    { $pull: { plaidAccounts: { $in: accountIdsToDelete } } }
  );

  await Transaction.deleteMany({ plaidAccountId: { $in: plaidAccountIdsToDelete } });
  await Liability.deleteMany({ accountId: { $in: plaidAccountIdsToDelete } });
  await PlaidAccount.deleteMany({ _id: { $in: accountIdsToDelete } });

  structuredLogger.logSuccess("duplicate_accounts_deleted_successfully", {
    user_id: uid,
    deleted_accounts_count: duplicateAccounts.length,
  });

  return { success: true, deleted_accounts_count: duplicateAccounts.length };
};

const getAccounts = async (profile, uid) => {
  return await structuredLogger.withContext(
    "get_accounts",
    { uid, profile_id: profile.id },
    async () => {
                const dek = await getUserDek(uid);
                const dekHash = crypto.createHash('sha256').update(dek[0]).digest('hex');
                // console.error(`[DEK_HASH] getAccounts for user ${uid}: ${dekHash}`);
                const safeDecrypt = createSafeDecrypt(uid, dek);
      
                const plaidIds = profile.plaidAccounts;
      const plaidAccountsResponse = await PlaidAccount.find({
        _id: { $in: plaidIds },
      })
        .lean()
        .exec();

      const itemIds = [...new Set(plaidAccountsResponse.map(acc => acc.itemId))];

      const accessTokens = await AccessToken.find({
        itemId: { $in: itemIds },
      });
      const accessTokenMap = new Map(accessTokens.map(token => [token.itemId, token]));

      let plaidAccounts = [];

      for (const plaidAccount of plaidAccountsResponse) {
        const accessToken = accessTokenMap.get(plaidAccount.itemId);
        const decryptedAccount = await getDecryptedAccount(plaidAccount, dek, uid, accessToken);

        plaidAccounts.push(decryptedAccount);
      }

      const depositoryAccounts = plaidAccounts.filter(
        (account) => account.account_type === "depository",
      );
      const creditAccounts = plaidAccounts.filter(
        (account) => account.account_type === "credit",
      );
      const investmentAccounts = plaidAccounts.filter(
        (account) => account.account_type === "investment",
      );
      const loanAccounts = plaidAccounts.filter(
        (account) => account.account_type === "loan",
      );
      const otherAccounts = plaidAccounts.filter(
        (account) => account.account_type === "other",
      );
      structuredLogger.logSuccess("get_accounts_completed", {
        uid,
        profile_id: profile.id,
        total_accounts: plaidAccounts.length,
        depository_accounts: depositoryAccounts.length,
        credit_accounts: creditAccounts.length,
        investment_accounts: investmentAccounts.length,
        loan_accounts: loanAccounts.length,
        other_accounts: otherAccounts.length,
      });

      return {
        depositoryAccounts,
        creditAccounts,
        investmentAccounts,
        loanAccounts,
        otherAccounts,
      };
    },
  );
};

const getAllUserAccounts = async (email, uid) => {
  return await structuredLogger.withContext(
    "get_all_user_accounts",
    { email, uid },
    async () => {
      const user = await User.findOne({
        authUid: uid,
      })
        .populate("plaidAccounts", "-transactions")
        .exec();
      if (!user) {
        throw new Error("User not found");
      }




      if (!user.plaidAccounts.length) {
        structuredLogger.logSuccess("get_all_user_accounts_completed", {
          uid,
          accounts_count: 0,
        });
        return [];
      }

      const accountsResponse = user.plaidAccounts;

      let accounts = [];

      const itemIds = [...new Set(accountsResponse.map(acc => acc.itemId))];

      const accessTokens = await AccessToken.find({
        itemId: { $in: itemIds },
      });
      const accessTokenMap = new Map(accessTokens.map(token => [token.itemId, token]));

      const dek = await getUserDek(uid);

      for (const plaidAccount of accountsResponse) {
        const accessToken = accessTokenMap.get(plaidAccount.itemId);
        const decryptedAccount = await getDecryptedAccount(plaidAccount, dek, uid, accessToken);
        accounts.push(decryptedAccount);
      }
        structuredLogger.logSuccess("get_all_user_accounts_completed", {
          uid,
          accounts_count: accounts.length,
        });

        return accounts;
      },
    );
  };

const findLiabilityByAccountId = (accountId, liabilities) => {
  for (const category in liabilities) {
    if (!liabilities[category]) {
      continue;
    }
    const found = liabilities[category].find(
      (item) => item.account_id === accountId,
    );
    if (found) {
      return { category, ...found };
    }
  }
  return null;
};

function summarizeHoldingsByAccountId(
  holdings,
  securities,
  accounts,
  targetAccountId,
) {
  const securityMap = Object.fromEntries(
    securities.map((sec) => [sec.security_id, sec]),
  );

  const accountMap = Object.fromEntries(
    accounts.map((acc) => [acc.account_id, acc]),
  );

  const filteredHoldings = holdings.filter(
    (h) => h.account_id === targetAccountId,
  );
  const account = accountMap[targetAccountId];

  if (!account) {
    return null;
  }

  const summary = {
    account_id: targetAccountId,
    account_name: account.name,
    account_type: account.type,
    holdings: filteredHoldings.map((holding) => {
      const security = securityMap[holding.security_id];
      return {
        security_name: security.name,
        ticker: security.ticker_symbol,
        quantity: holding.quantity,
        price: holding.institution_value / holding.quantity,
        value: holding.institution_value,
      };
    }),
  };

  return summary;
}

const getAccountDetails = async (accountId, profileId, uid) => {
  const dek = await getUserDek(uid);
  const safeDecrypt = createSafeDecrypt(uid, dek);
  const user = await User.findOne({ authUid: uid });
  if (!user) {
    throw new Error("User not found");
  }
  const account = await PlaidAccount.findOne({ plaid_account_id: accountId, owner_id: user._id })
    .lean()
    .exec();

  const liab = await Liability.find({ accountId: accountId }).lean().exec();

  if (!account) {
    throw new Error("Account not found");
  }

  const access_token = await plaidService.getNewestAccessToken({
    userId: user._id,
    institutionId: account.institution_id,
  });

  // Decrypt account details for display, and determine sync status based on token
  const deac = await getDecryptedAccount(account, dek, uid, access_token);

  let liabilityPlaid;
  let accountPlaid;
  let decryptAccessToken;

  // Only attempt to call Plaid if we have a valid, non-expired token
  if (access_token && !access_token.isAccessTokenExpired) {
    try {
      decryptAccessToken = await safeDecrypt(access_token.accessToken, {
        account_id: account._id,
        field: "accessToken",
      });

      if (decryptAccessToken) {
        const plaidData = await plaidService.getAccountsWithAccessToken(decryptAccessToken);
        accountPlaid = plaidData.accounts.find(a => a.account_id === account.plaid_account_id);
      } else {
        throw new Error('Failed to decrypt access token for Plaid call.');
      }
    } catch (error) {
      console.error("Error fetching account data from Plaid:", error.response?.data || error.message);
      // If the item requires re-authentication, flag it in our database
      if (error.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED' || error.response?.data?.error_code === 'INVALID_ACCESS_TOKEN') {
        structuredLogger.logInfo('item_login_required_or_invalid_token_detected_in_api_call', {
          item_id: deac.itemId,
          account_id: accountId,
          user_id: uid,
        });
        // Use the original 'account' object from our DB lookup
        await AccessToken.updateOne({ _id: access_token._id }, { $set: { isAccessTokenExpired: true } });
        deac.isAccessTokenExpired = true; // Update in-memory object as well
      }
    }
  }

  if (deac.account_type === "credit" && liab && liab.length > 0) {
    liabilityPlaid = await getDecryptedLiabilitiesCredit(liab, dek, uid);
  }

  if (deac.account_type === "loan" && liab && liab.length > 0) {
    liabilityPlaid = await getDecryptedLiabilitiesLoan(liab, dek, uid);
  }

  let investmentData = null;

  if (deac.account_type === "investment" && decryptAccessToken) {
    try {
      const data =
        await plaidService.getInvestmentsHoldingsWithAccessToken(
          decryptAccessToken,
        );
      investmentData = summarizeHoldingsByAccountId(
        data.holdings,
        data.securities,
        data.accounts,
        deac.plaid_account_id,
      );
    } catch (error) {
      console.error(
        "Error fetching investment data:",
        error.response?.data || error.message,
      );
    }
  }

  const result = {
    account: deac,
    accountPlaid: accountPlaid,
    liabilityPlaid: liabilityPlaid,
    investmentData: investmentData || { holdings: [] },
  };

  return { ...result };
};

/**
 * Decrypts a credit liability record (expected as the first element in a liabilities array) and its nested APR entries.
 *
 * @param {Array} liabilities - Array whose first element is the credit liability object containing encrypted binary fields and an optional `aprs` array.
 * @param {*} dek - Data encryption key used to decrypt encrypted fields.
 * @returns {Object} Decrypted liability object including core identifiers, decrypted binary fields (when present), and a decrypted `aprs` array with `aprPercentage`, `aprType`, `balanceSubjectToApr`, and `interestChargeAmount` entries.
 */







const formatAccountsBalances = (accounts) => {
  for (const account of accounts) {
    if (
      account.account_type === "depository" ||
      account.account_type === "other"
    ) {
      account.balance = account.availableBalance
        ? account.availableBalance
        : (account.currentBalance ?? 0);
    } else {
      account.balance = account.currentBalance ?? 0;
    }

    delete account.availableBalance;
    delete account.currentBalance;
  }
  return accounts;
};

const getAccountsByProfile = async (profileId, uid) => {
  const profile = await businessService.getBusiness(profileId, uid);
  if (!profile) {
    throw new Error("Business profile not found");
  }
  return await getAccounts(profile, uid);
};

const accountsService = {
  addAccount,
  getAccounts,
  getAccountDetails,
  getAllUserAccounts,
  deletePlaidAccountByEmail,
  deletePlaidAccount,
  formatAccountsBalances,
  findLiabilityByAccountId,
  summarizeHoldingsByAccountId,
  getAccountsByProfile,
};

export default accountsService;
