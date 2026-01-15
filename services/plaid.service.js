import AccessToken from "../database/models/AccessToken.js";
import User from "../database/models/User.js";
import getPlaidClient from "../config/plaid.js";
import Transaction from "../database/models/Transaction.js";
import Liability from "../database/models/Liability.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import accountsService from "./account.service.js";
import { formatTransactionAmount } from "./transactions.service.js";
import withRetry from "../lib/axiosRateLimit.js";
import {
  decryptValue,
  encryptValue,
  getUserDek,
  DekMigrationInProgressError,
} from "../database/encryption.js";
import structuredLogger from "../lib/structuredLogger.js";
import * as Sentry from "@sentry/node";

//TODO: change to production
const plaidClientId = process.env.PLAID_CLIENT_ID;
const plaidSecret = process.env.PLAID_SECRET;
const webhookUrl = process.env.PLAID_WEBHOOK_URL;
const plaidRedirectUri = process.env.PLAID_REDIRECT_URI;
const plaidRedirectNewAccounts = process.env.PLAID_REDIRECT_URI_NEW_ACCOUNTS;

import { hashValue } from "../database/encryption.js";

import {
  createSafeEncrypt,
  createSafeDecrypt,
} from "../lib/encryptionHelper.js";

/**
 * Creates a `link_token` for initializing the Plaid Link flow.
 * This is a transient token used by the frontend to display the Plaid modal to the user.
 * It is not a decryption token.
 * @returns {Promise<string>} The link token.
 */
const getNewestAccessToken = async (find) => {
  const accessTokens = await AccessToken.find({
    ...find,
    isAccessTokenExpired: { $ne: true },
  }).sort({ createdAt: -1 });

  if (accessTokens.length > 1) {
    console.warn("Multiple active access tokens found for query: ", find);
    console.warn(
      "The newest token will be used, and older ones will be invalidated and marked as expired.",
    );

    const newestToken = accessTokens[0];
    const olderTokens = accessTokens.slice(1);

    for (const token of olderTokens) {
        try {
            token.isAccessTokenExpired = true;
            await token.save();
            structuredLogger.logWarning("marked_duplicate_token_as_expired", {
                tokenId: token._id,
                itemId: token.itemId,
                message: "Found multiple valid access tokens for the same item. The older one was marked as expired.",
            });
        } catch (error) {
            Sentry.captureException(error, {
                level: "error",
                extra: {
                    message: "Failed to mark duplicate access token as expired",
                    tokenId: token._id,
                    itemId: token.itemId,
                },
            });
        }
    }

    return newestToken;
  }

  return accessTokens[0];
};

const createLinkToken = async (
  email,
  isAndroid,
  accountId,
  uid,
  screen,
  mode,
  access_token,
  plaidEnvironment,
  institution_id,
) => {
  return await structuredLogger.withContext(
    "create_link_token",
    {
      email,
      isAndroid,
      accountId,
      uid,
      screen,
      mode,
      has_access_token: !!access_token,
      institution_id,
    },
    async () => {
      const user = await User.findOne({
        authUid: uid,
      });
      if (!user) {
        throw new Error("User not found");
      }
      let accessToken;
      let dek;
      try {
        dek = await getUserDek(uid);
      } catch (error) {
        if (error instanceof DekMigrationInProgressError) {
          throw error; // Re-throw to be handled by the controller
        }
        throw error; // Re-throw other errors
      }
      const safeDecrypt = createSafeDecrypt(uid, dek);
      if (accountId) {
        const account = await PlaidAccount.findOne({ _id: accountId });
        if (!account) {
          throw new Error("Account not found");
        }
        accessToken = await safeDecrypt(account.accessToken, {
          account_id: accountId,
          field: "accessToken",
        });
      }

      // UPDATE MODE: Use provided access_token for update mode
      if (mode === "update") {
        accessToken = access_token; // Token already comes decrypted from getInstitutionUpdateToken
      }

      const userId = user._id.toString();
      let redirectUri;
      if (screen === "add-account") {
        redirectUri = plaidRedirectNewAccounts;
      } else {
        redirectUri = plaidRedirectUri;
      }
      const plaidRequest = {
        client_id: plaidClientId,
        secret: plaidSecret,
        client_name: "Zentavos",
        country_codes: ["US"],
        android_package_name: isAndroid ? process.env.BUNDLEID : null,
        redirect_uri: !isAndroid ? redirectUri : null,
        webhook: webhookUrl,
        language: "en",
        user: {
          client_user_id: userId,
        },
      };

      if (accessToken) {
        plaidRequest.access_token = accessToken;
        if (institution_id) {
          plaidRequest.institution_id = institution_id;
        }
      } else {
        plaidRequest.products = ["transactions"];
        plaidRequest.optional_products = ["investments", "liabilities"];
        plaidRequest.transactions = {
          days_requested: 730,
        };
        // If we are NOT in update mode, we can pre-select the institution.
        // In update mode without a token, Plaid seems to reject the institution_id.
        if (mode !== 'update' && institution_id) {
            plaidRequest.institution_id = institution_id;
        }
      }
      const plaidClient = getPlaidClient(plaidEnvironment);
      let response;
      try {
        response = await plaidClient.linkTokenCreate(plaidRequest);
      } catch (error) {
        const plaidErrorCode = error.response?.data?.error_code;

        // If in update mode and the item is not found, it means the access_token is dead.
        // We should seamlessly convert this to a "new item" flow by removing the access token
        // and re-calling the function.
        if (mode === 'update' && plaidErrorCode === 'ITEM_NOT_FOUND') {
          structuredLogger.logWarning(
            'ITEM_NOT_FOUND in update mode. Converting to a new link flow.',
            { plaid_error: error.response.data }
          );
          
          const newLinkRequest = { ...plaidRequest };
          delete newLinkRequest.access_token;
          delete newLinkRequest.institution_id; // Cannot be used with products
          
          // Add products for the new link flow
          newLinkRequest.products = ["transactions"];
          newLinkRequest.optional_products = ["investments", "liabilities"];

          response = await plaidClient.linkTokenCreate(newLinkRequest);
        } else {
          // For all other errors, log and re-throw.
          structuredLogger.logPlaidApi("link_token_create", false, {
            error: error.response?.data || error.message,
            plaid_request: plaidRequest,
          });
          throw error;
        }
      }

      structuredLogger.logPlaidApi("link_token_create", true, {
        user_id: userId,
        has_access_token: !!accessToken,
      });

      return response.data;
    },
  );
};

const getPublicToken = async (linkToken) => {
  const plaidClient = getPlaidClient();
  const response = await plaidClient.linkTokenGet({
    link_token: linkToken,
  });
  return response.data;
};

const getAccessToken = async (publicToken) => {
  return await structuredLogger.withContext(
    "get_access_token",
    { publicToken: publicToken ? "[REDACTED]" : null },
    async () => {
      const plaidClient = getPlaidClient();
      const response = await plaidClient.itemPublicTokenExchange({
        public_token: publicToken,
      });

      structuredLogger.logPlaidApi("item_public_token_exchange", true, {
        has_public_token: !!publicToken,
      });

      return response.data;
    },
  );
};

const saveAccessToken = async (
  email,
  accessToken,
  itemId,
  institutionId,
  uid,
) => {
  return await structuredLogger.withContext(
    "save_access_token",
    { email, itemId, institutionId, uid },
    async () => {
      const user = await User.findOne({
        authUid: uid,
      });
      if (!user) {
        throw new Error("User not found");
      }
      const userId = user._id.toString();
      const dek = await getUserDek(uid);
      const safeEncrypt = createSafeEncrypt(uid, dek);

      const encryptedToken = await safeEncrypt(accessToken, {
        user_id: userId,
        item_id: itemId,
        field: "accessToken",
      });
      // Check if access token already exists for this itemId
      const existingToken = await getNewestAccessToken({ itemId });

      if (existingToken) {
        structuredLogger.logSuccess("access_token_already_exists", {
          user_id: userId,
          item_id: itemId,
          institution_id: institutionId,
        });
        return {
          userId,
          accessToken,
          itemId,
          institutionId,
        };
      }

      const newToken = new AccessToken({
        userId,
        accessToken: encryptedToken,
        itemId,
        institutionId,
      });
      await newToken.save();

      structuredLogger.logEncryptionOperation("save_access_token", true, {
        user_id: userId,
        item_id: itemId,
        institution_id: institutionId,
      });

      return {
        userId,
        accessToken,
        itemId,
        institutionId,
      };
    },
  );
};

const getUserAccessTokens = async (email, uid) => {
  const user = await User.findOne({
    authUid: uid,
  });
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user._id.toString();
  const tokens = await AccessToken.find({ userId }).sort({ createdAt: 1 });
  const decryptedTokens = [];
  const dek = await getUserDek(uid);
  const safeDecrypt = createSafeDecrypt(uid, dek);
  for (const token of tokens) {
    const decryptedAccessToken = await safeDecrypt(token.accessToken, {
      user_id: userId,
      item_id: token.itemId,
      field: "accessToken",
    });

    if (!decryptedAccessToken) {
      throw new Error(`Failed to decrypt access token for item ID: ${token.itemId}`);
    }

    decryptedTokens.push({
      ...token.toObject(),
      accessToken: decryptedAccessToken,
    });
  }

  return decryptedTokens;
};

const getAccountsByItem = async (itemId, uid) => {
  const accessToken = await getAccessTokenFromItemId(itemId, uid);
  if (!accessToken) {
    throw new Error(`Could not retrieve access token for item ${itemId}`);
  }
  return await getAccountsWithAccessToken(accessToken);
};

const getAccountsWithAccessToken = async (accessToken) => {
  try {
    console.log(
      `[PLAID] Getting accounts with access_token: ${accessToken?.substring(0, 20)}...`,
    );

    const plaidClient = getPlaidClient();
    const response = await plaidClient.accountsGet({
      access_token: accessToken,
    });
    console.log(
      `[PLAID] ✅ Plaid API returned ${response.data.accounts?.length || 0} accounts for institution ${response.data.item?.institution_name}`,
    );
    console.log(
      `[PLAID] Account details:`,
      response.data.accounts?.map((acc) => `${acc.name} (${acc.account_id})`),
    );

    return response.data;
  } catch (error) {
    console.error("Error fetching accounts with access token:", error);
    throw error;
  }
};

const getBalance = async (email) => {
  try {
    const tokens = await getUserAccessTokens(email);
    if (!tokens.length) return [];

    const plaidClient = getPlaidClient();
    const balancePromises = tokens.map(async (token) => {
      const response = await plaidClient.accountsGet({
        access_token: token.accessToken,
        // min_last_updated_datetime: new Date().toISOString(),
      });
      return response.data.accounts.map((account) => ({
        ...account,
        institutionId: token.institutionId,
      }));
    });
    const balancesArray = await Promise.all(balancePromises);
    const balances = balancesArray.flat();

    return balances;
  } catch (error) {
    return [];
  }
};

const getInstitutions = async () => {
  const plaidClient = getPlaidClient();
  const response = await plaidClient.institutionsGet({
    count: 500,
    offset: 0,
    country_codes: ["US"],
    options: {
      include_optional_metadata: true,
    },
  });

  const institutions = {};
  for (const institution of response.data.institutions) {
    institutions[institution.institution_id] = institution;
  }
  return institutions;
};

const getTransactions = async (email, uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) {
    throw new Error("User not found");
  }

  const accounts = await PlaidAccount.find({ owner_id: user._id });
  if (!accounts.length) {
    return [];
  }

  const accountIds = accounts.map((acc) => acc._id);

  const transactions = await Transaction.find({
    accountId: { $in: accountIds },
  }).sort({ transactionDate: -1 });

  if (!transactions.length) {
    return [];
  }

  const dek = await getUserDek(uid);
  const safeDecrypt = createSafeDecrypt(uid, dek);

  const decryptedTransactions = await Promise.all(
    transactions.map(async (transaction) => {
      const transObj = transaction.toObject();
      const { plaidTransactionId } = transObj;

      // Fields to decrypt
      const amount = await safeDecrypt(transObj.amount, {
        transaction_id: plaidTransactionId,
        field: "amount",
      });
      const name = await safeDecrypt(transObj.merchant.name, {
        transaction_id: plaidTransactionId,
        field: "name",
      });
      const merchantName = await safeDecrypt(transObj.merchant.merchantName, {
        transaction_id: plaidTransactionId,
        field: "merchant_name",
      });
      const accountType = await safeDecrypt(transObj.accountType, {
        transaction_id: plaidTransactionId,
        field: "account_type",
      });
      const transactionCode = transObj.transactionCode
        ? await safeDecrypt(transObj.transactionCode, {
            transaction_id: plaidTransactionId,
            field: "transaction_code",
          })
        : null;
      const tags = transObj.tags
        ? await safeDecrypt(transObj.tags, {
            transaction_id: plaidTransactionId,
            field: "tags",
          })
        : null;

      return {
        ...transObj,
        amount,
        merchant: {
          ...transObj.merchant,
          name,
          merchantName,
        },
        accountType,
        transactionCode,
        tags,
      };
    }),
  );

  return decryptedTransactions;
};

const getTransactionsWithAccessToken = async (accessToken) => {
  const plaidClient = getPlaidClient();
  try {
    const response = await plaidClient.transactionsSync({
      access_token: accessToken,
    });
    return response.data;
  } catch (error) {
    const plaidError = error.response?.data;
    structuredLogger.logErrorBlock(error, {
      operation: "getTransactionsWithAccessToken",
      message: "Error fetching transactions with access token",
      plaid_error_code: plaidError?.error_code,
      plaid_error_message: plaidError?.error_message,
      plaid_error_type: plaidError?.error_type,
      plaid_display_message: plaidError?.display_message,
      access_token_start: accessToken ? accessToken.substring(0, 20) : "N/A",
    });
    throw error;
  }
};

const getInvestmentTransactionsWithAccessToken = async (accessToken) => {
  const today = new Date();
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(today.getFullYear() - 2);
  const plaidClient = getPlaidClient();
  const response = await plaidClient.investmentsTransactionsGet({
    access_token: accessToken,
    start_date: twoYearsAgo.toISOString().split("T")[0],
    end_date: today.toISOString().split("T")[0],
    options: {
      async_update: true,
    },
  });
  return response.data;
};

const getLoanLiabilitiesWithAccessToken = async (accessToken) => {
  const plaidClient = getPlaidClient();
  const response = await plaidClient.liabilitiesGet({
    access_token: accessToken,
  });
  return response.data;
};

const getInvestmentsHoldingsWithAccessToken = async (accessToken) => {
  const plaidClient = getPlaidClient();
  const response = await plaidClient.investmentsHoldingsGet({
    access_token: accessToken,
  });
  return response.data;
};

const getItemWithAccessToken = async (accessToken) => {
  const plaidClient = getPlaidClient();
  const response = await plaidClient.itemGet({
    access_token: accessToken,
  });
  return response.data;
};

const getAccessTokenFromItemId = async (itemId, uid) => {
  const access = await getNewestAccessToken({ itemId });

  if (!access) {
    return;
  }

  // If uid is not provided, get it from the access token's userId
  let firebaseUid = uid;
  if (!firebaseUid) {
    const user = await User.findById(access.userId);
    if (!user) {
      throw new Error(`User not found for access token with itemId: ${itemId}`);
    }
    firebaseUid = user.authUid;
  }

  const accessToken = access.accessToken;
  const dek = await getUserDek(firebaseUid);
  const safeDecrypt = createSafeDecrypt(firebaseUid, dek);
  const decryptedToken = await safeDecrypt(accessToken, {
    item_id: itemId,
    field: "accessToken",
  });

  if (!decryptedToken) {
    throw new Error(`Failed to decrypt access token for item ID: ${itemId}`);
  }
  return decryptedToken;
};

const updateAccountBalances = async (dek, accessToken, accounts, uid, newAccountsBalances) => {
  try {
    if (!newAccountsBalances) {
      try {
        const plaidClient = getPlaidClient();
        newAccountsBalances = await withRetry(() => plaidClient.accountsGet({
          access_token: accessToken,
        }));
      } catch (error) {
        console.error("Error fetching account balances:", error);
        throw error;
      }
    }
    if (newAccountsBalances) {
      const bulkOps = [];
      const safeEncrypt = createSafeEncrypt(uid, dek);
      const accountsToProcess = newAccountsBalances.data ? newAccountsBalances.data.accounts : newAccountsBalances.accounts;
      for (const account of accountsToProcess) {
        const accountBalance = account.balances;
        const accountType = account.type;
        const accountSubtype = account.subtype;
        const accountName = account.name;
        const accountPlaidId = account.account_id;

        const existingAccount = accounts.find(
          (a) => a.plaid_account_id === accountPlaidId,
        );

        if (existingAccount) {
          // Encriptar valores antes de actualizar
          const [
            encryptedAccountName,
            encryptedAccountType,
            encryptedAccountSubtype,
            encryptedCurrentBalance,
            encryptedAvailableBalance,
          ] = await Promise.all([
            safeEncrypt(accountName, {
              account_id: accountPlaidId,
              field: "accountName",
            }),
            safeEncrypt(accountType, {
              account_id: accountPlaidId,
              field: "accountType",
            }),
            safeEncrypt(accountSubtype, {
              account_id: accountPlaidId,
              field: "accountSubtype",
            }),
            accountBalance.current
              ? safeEncrypt(accountBalance.current, {
                  account_id: accountPlaidId,
                  field: "currentBalance",
                })
              : null,
            accountBalance.available
              ? safeEncrypt(accountBalance.available, {
                  account_id: accountPlaidId,
                  field: "availableBalance",
                })
              : null,
          ]);

          existingAccount.currentBalance = accountBalance.current;
          existingAccount.availableBalance = accountBalance.available;
          existingAccount.account_type = accountType;
          existingAccount.account_subtype = accountSubtype;
          existingAccount.account_name = accountName;

          bulkOps.push({
            updateOne: {
              filter: { plaid_account_id: accountPlaidId },
              update: {
                currentBalance: encryptedCurrentBalance,
                availableBalance: encryptedAvailableBalance,
                account_type: encryptedAccountType,
                account_subtype: encryptedAccountSubtype,
                account_name: encryptedAccountName,
              },
            },
          });
        }
      }

      if (bulkOps.length) {
        await PlaidAccount.bulkWrite(bulkOps);
      }
    }
  } catch (error) {
    console.error("Error updating account balances:", error);
    throw error;
  }
};

const syncingItems = new Map();

const updateTransactions = async (item) => {
  if (syncingItems.has(item)) {
    structuredLogger.logInfo("[SYNC_TRACE] Sync already in progress for item, skipping.", { itemId: item });
    return;
  }
  syncingItems.set(item, true);
  try {
    structuredLogger.logInfo("[SYNC_TRACE] Starting updateTransactions.", { itemId: item });
    const accessInfo = await getNewestAccessToken({ itemId: item });
    if (!accessInfo) {
      structuredLogger.logErrorBlock(new Error("[SYNC_TRACE] updateTransactions failed: No access token found for item."), { itemId: item });
      throw new Error(`No access token found for item ID: ${item}`);
    }

    const isNewItem = (Date.now() - new Date(accessInfo.createdAt).getTime()) < 2 * 60 * 1000; // 2 minutes

    let accounts = [];
    const maxRetries = isNewItem ? 10 : 5;
    const delayMs = isNewItem ? 6000 : 3000;

    const userId = accessInfo.userId;
    const user = await User.findById(userId);
    if (!user) {
      structuredLogger.logErrorBlock(new Error("[SYNC_TRACE] updateTransactions failed: User not found for item."), { itemId: item, userId: userId });
      throw new Error(`User not found for userId ${userId}`);
    }
    
    const uid = user?.authUid;
    structuredLogger.logInfo("[SYNC_TRACE] Found user.", { itemId: item, uid: uid });

    const accessToken = await getAccessTokenFromItemId(item, uid);
    if (!accessToken) {
      structuredLogger.logError("updateTransactions failed: Could not decrypt access token.", { itemId: item, operation: "[SYNC_TRACE]" });
      throw new Error(`Access token could not be retrieved for item ID: ${item}`);
    }
    structuredLogger.logInfo("[SYNC_TRACE] Decrypted access token.", { itemId: item });

    for (let i = 0; i < maxRetries; i++) {
      accounts = await PlaidAccount.find({ itemId: item });
      if (accounts.length > 0) {
        break;
      }
      structuredLogger.logWarning(`[SYNC_TRACE] No accounts found for item. Retrying in ${delayMs}ms...`, {
          itemId: item,
          attempt: i + 1,
          maxRetries: maxRetries,
      });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if (!accounts.length) {
      structuredLogger.logErrorBlock(new Error(`[SYNC_TRACE] updateTransactions failed: No accounts found for item after ${maxRetries} retries.`), { itemId: item });
      //TODO: remove item
      throw new Error(`No accounts found for item ID: ${item} after ${maxRetries} retries.`);
    }
    structuredLogger.logInfo(`[SYNC_TRACE] Found ${accounts.length} accounts for item.`, { itemId: item });

    const emails = user?.email;
    const emailObject = emails?.find((email) => email.isPrimary === true);
    const email = emailObject?.email;

    const dek = await getUserDek(uid);
    const safeEncrypt = createSafeEncrypt(uid, dek);

    let cursor = accounts[0].nextCursor || null;
    structuredLogger.logInfo("[SYNC_TRACE] Starting sync loop.", { itemId: item, initialCursor: cursor });
    let hasMore = true;
    let transactionsByAccount = {};
    let oldCursor = cursor;
    let iterationCounter = 0;
    const maxIterations = 10;
    const newTransactions = [];
    let allModifiedTransactions = [];
    let allRemovedTransactions = [];

    while (hasMore) {
      oldCursor = cursor;
      iterationCounter++;
      structuredLogger.logInfo(`[SYNC_TRACE] Starting sync iteration #${iterationCounter}.`, { itemId: item, cursor: cursor, hasMore: hasMore });
      
      if (iterationCounter > maxIterations) {
        structuredLogger.logErrorBlock(new Error("[SYNC_TRACE] Max sync iterations reached, stopping."), { itemId: item });
        hasMore = false;
        break;
      }
      try {
        const plaidClient = getPlaidClient();
        const response = await withRetry(() => plaidClient.transactionsSync({
          access_token: accessToken,
          cursor: cursor,
          count: 500,
        }));
        
        const transactions = response.data.added || [];
        const modifiedTransactions = response.data.modified || [];
        const removedTransactions = response.data.removed || [];
        cursor = response.data.next_cursor;
        hasMore = response.data.has_more;
        newTransactions.push(...transactions);
        allModifiedTransactions.push(...modifiedTransactions);
        allRemovedTransactions.push(...removedTransactions);

        structuredLogger.logInfo(`[SYNC_TRACE] Plaid API returned transactions.`, {
          itemId: item,
          added: transactions.length,
          modified: modifiedTransactions.length,
          removed: removedTransactions.length,
          nextCursor: cursor,
          hasMore: hasMore,
        });

        const accountMap = new Map();
        for (const account of accounts) {
          accountMap.set(account.plaid_account_id, account);
        }

        const bulkOps = [];
        for (let transaction of transactions) {
          if (!accountMap.has(transaction.account_id)) continue;

          const encryptedMerchantName = transaction.merchant_name ? await safeEncrypt(transaction.merchant_name, { transaction_id: transaction.transaction_id, field: "merchant_name" }) : null;
          const encryptedName = transaction.name ? await safeEncrypt(transaction.name, { transaction_id: transaction.transaction_id, field: "name" }) : null;
          const merchantCategory = transaction.category?.[0];
          const merchant = { merchantName: encryptedMerchantName, name: encryptedName, merchantCategory: merchantCategory, website: transaction.website ? transaction.website : null, logo: transaction.logo_url ? transaction.logo_url : null };
          const formattedTransaction = formatTransactionAmount(transaction, accountMap.get(transaction.account_id));
          const encryptedAmount = await safeEncrypt(formattedTransaction.amount, { transaction_id: transaction.transaction_id, field: "amount" });
          const encryptedAccountType = await safeEncrypt(accountMap.get(transaction.account_id).account_type, { transaction_id: transaction.transaction_id, field: "account_type" });
          const transactionCode = transaction.transaction_code ? await safeEncrypt(transaction.transaction_code, { transaction_id: transaction.transaction_id, field: "transaction_code" }) : null;
          const tags = transaction.category ? await safeEncrypt(transaction.category, { transaction_id: transaction.transaction_id, field: "tags" }) : null;

          if (transaction.pending_transaction_id) {
            // This is a posted transaction that was previously pending.
            // Update the existing pending transaction.
            const updatePayload = {
              plaidTransactionId: transaction.transaction_id, // Update the transaction ID
              postDate: new Date(`${transaction.date}T12:00:00Z`),
              amount: encryptedAmount,
              currency: transaction.iso_currency_code,
              merchant,
              transactionCode: transactionCode,
              tags: tags,
              pending: transaction.pending,
              pending_transaction_id: null, // The transaction is no longer pending
            };

            bulkOps.push({
              updateOne: {
                filter: { plaidTransactionId: transaction.pending_transaction_id },
                update: { $set: updatePayload },
              },
            });
          } else {
            // This is a new transaction.
            bulkOps.push({
              updateOne: {
                filter: { plaidTransactionId: transaction.transaction_id },
                update: {
                  $setOnInsert: {
                    accountId: accountMap.get(transaction.account_id)._id,
                    plaidTransactionId: transaction.transaction_id,
                    plaidAccountId: transaction.account_id,
                    transactionDate: new Date(`${transaction.authorized_date || transaction.date}T12:00:00Z`),
                    postDate: !transaction.pending ? new Date(`${transaction.date}T12:00:00Z`) : null,
                    amount: encryptedAmount,
                    currency: transaction.iso_currency_code,
                    notes: null,
                    merchant,
                    description: null,
                    transactionCode: transactionCode,
                    tags: tags,
                    accountType: encryptedAccountType,
                    pending_transaction_id: transaction.pending_transaction_id,
                    pending: transaction.pending,
                  },
                },
                upsert: true,
              },
            });
          }

          if (!transactionsByAccount[transaction.account_id]) {
            transactionsByAccount[transaction.account_id] = [];
          }
          transactionsByAccount[transaction.account_id].push(
            transaction.transaction_id,
          );
        }

        if (bulkOps.length > 0) {
          structuredLogger.logInfo(`[SYNC_TRACE] Performing bulkWrite for ${bulkOps.length} new transactions.`, { itemId: item });
          await Transaction.bulkWrite(bulkOps);
          structuredLogger.logInfo(`[SYNC_TRACE] bulkWrite for new transactions successful.`, { itemId: item });
        }

        if (removedTransactions.length > 0) {
          structuredLogger.logInfo(`[SYNC_TRACE] Deleting ${removedTransactions.length} removed transactions.`, { itemId: item });
          await Transaction.deleteMany({
            plaidTransactionId: {
              $in: removedTransactions.map((t) => t.transaction_id),
            },
          });
          structuredLogger.logInfo(`[SYNC_TRACE] Deletion of removed transactions successful.`, { itemId: item });
        }

        if (modifiedTransactions.length > 0) {
          const modifiedBulkOps = [];
          for (const transaction of modifiedTransactions) {
            const encryptedAmount = await safeEncrypt(transaction.amount, {
              transaction_id: transaction.transaction_id,
              field: "amount",
            });

            const updatePayload = {
              amount: encryptedAmount,
              tags: transaction.category
                ? await safeEncrypt(transaction.category, {
                    transaction_id: transaction.transaction_id,
                    field: "tags",
                  })
                : null,
              pending_transaction_id: transaction.pending_transaction_id,
              pending: transaction.pending,
            };

            // Only update the postDate if the transaction is no longer pending.
            if (transaction.date && transaction.pending === false) {
              updatePayload.postDate = new Date(`${transaction.date}T12:00:00Z`);
            }

            modifiedBulkOps.push({
              updateOne: {
                filter: { plaidTransactionId: transaction.transaction_id },
                update: { $set: updatePayload },
              },
            });
          }
          structuredLogger.logInfo(
            `[SYNC_TRACE] Performing bulkWrite for ${modifiedBulkOps.length} modified transactions.`,
            { itemId: item },
          );
          await Transaction.bulkWrite(modifiedBulkOps);
          structuredLogger.logInfo(
            `[SYNC_TRACE] bulkWrite for modified transactions successful.`,
            { itemId: item },
          );
        }

        const bulkUpdateAccountsOps = [];
        for (const [accountId] of Object.entries(transactionsByAccount)) {
          const accountTransaction = await Transaction.find({
            plaidAccountId: accountId,
          })
            .sort({ transactionDate: -1 })
            .select("_id")
            .lean()
            .then((transactions) => transactions.map((t) => t._id));

          bulkUpdateAccountsOps.push({
            updateOne: {
              filter: { plaid_account_id: accountId },
              update: {
                $addToSet: { transactions: { $each: accountTransaction } },
              },
            },
          });
        }

        if (bulkUpdateAccountsOps.length > 0) {
          structuredLogger.logInfo(`[SYNC_TRACE] Updating ${bulkUpdateAccountsOps.length} PlaidAccount documents with new transaction references.`, { itemId: item });
          await PlaidAccount.bulkWrite(bulkUpdateAccountsOps);
          structuredLogger.logInfo(`[SYNC_TRACE] PlaidAccount update successful.`, { itemId: item });
        }

        structuredLogger.logInfo("[SYNC_TRACE] Preparing to update cursor.", { itemId: item, nextCursor: cursor });
        await PlaidAccount.updateMany(
          { itemId: item },
          { $set: { nextCursor: cursor } },
        );
        structuredLogger.logInfo("[SYNC_TRACE] Cursor update successful.", { itemId: item, updatedCursor: cursor });

      } catch (error) {
        if (error.response?.data?.error_code === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION") {
                  structuredLogger.logWarning("[SYNC_TRACE] Mutation detected during pagination, restarting with null cursor...", { itemId: item, oldCursor: oldCursor });
                  cursor = null;
        } else {
          console.log('PLAID ERROR RESPONSE:', error.response.data);
          structuredLogger.logErrorBlock(error, {
              operation: "[SYNC_TRACE] Error syncing transactions",
              itemId: item,
              plaidError: error.response?.data, // Log the full Plaid error
              plaid_error_code: error.response?.data?.error_code,
              plaid_error_message: error.response?.data?.error_message,
              plaid_error_type: error.response?.data?.error_type,
          });
          throw error;
        }
      }
    }

    // Also, trigger an update for investment transactions, just in case.
    structuredLogger.logInfo("[SYNC_TRACE] Sync loop finished. Proceeding with chained updates.", { itemId: item });
    try {
      await updateInvestmentTransactions(item);
    } catch(error) {
      // Log this as a non-fatal error, as the primary goal of this function
      // was to update regular transactions.
      structuredLogger.logErrorBlock(error, {
        operation: 'updateTransactions_chained_investment_sync',
        item_id: item,
        error_classification: 'non_fatal_error'
      });
    }

    try {
      await updateLiabilities(item);
    } catch (error) {
      structuredLogger.logErrorBlock(error, {
        operation: 'updateTransactions_chained_liability_sync',
        item_id: item,
        error_classification: 'non_fatal_error'
      });
    }

    // Update balances AFTER transaction sync to ensure consistency
    await updateAccountBalances(dek, accessToken, accounts, uid);

    if (email) {
      const internalTransfers = await detectInternalTransfers(newTransactions);

      for (const internalTransaction of internalTransfers) {
        const transactionId = internalTransaction.transactionId;
        const transactionRef = internalTransaction.transactionRef;
        const transaction = await Transaction.findOne({
          plaidTransactionId: transactionId,
        });
        if (!transaction) continue;
        transaction.isInternal = true;
        transaction.internalReference = transactionRef;
        await transaction.save();
      }
    }
    structuredLogger.logSuccess(
      "[SYNC_TRACE] Finished updateTransactions successfully.",
      {
        itemId: item,
        added_transactions: newTransactions.length,
        modified_transactions: allModifiedTransactions.length,
        removed_transactions: allRemovedTransactions.length,
      },
    );

    return transactionsByAccount;
  } finally {
    syncingItems.delete(item);
    structuredLogger.logInfo("[SYNC_TRACE] Finished updateTransactions, releasing lock.", { itemId: item });
  }
};



const updateInvestmentTransactions = async (item) => {
  if (syncingItems.has(item)) {
    structuredLogger.logInfo("[SYNC_TRACE] Investment sync already in progress for item, skipping.", { itemId: item });
    return;
  }
  syncingItems.set(item, true);
  try {
    return await structuredLogger.withContext(
      "update_investment_transactions",
      { item_id: item },
      async () => {
        structuredLogger.logOperationStart("update_investment_transactions", {
          item_id: item,
        });

        const accessInfo = await getNewestAccessToken({ itemId: item });
        if (!accessInfo) return;
        const userId = accessInfo.userId;
        const user = await User.findById(userId);
        if (!user) {
          throw new Error(`User not found for user ID: ${userId}`);
        }
        const uid = user?.authUid;
        const accessToken = await getAccessTokenFromItemId(item, uid);

        if (!accessToken) {
          return;
        }

        // Check if the item supports the investments product before proceeding.
        const itemInfo = await getItemWithAccessToken(accessToken);
        if (!itemInfo.item.billed_products.includes('investments')) {
          structuredLogger.logInfo(
            'Skipping investment sync: item does not have investments product enabled.',
            { item_id: item, billed_products: itemInfo.item.billed_products },
          );
          return 'Skipped: Item does not have investments product.';
        }

        // First, ensure all accounts for the item are present in our DB.
        const plaidAccountsData = await getAccountsWithAccessToken(accessToken);
        const allPlaidAccounts = plaidAccountsData.accounts;
        const institutionId = plaidAccountsData.item.institution_id;
        const institutionName = plaidAccountsData.item.institution_name;

        const existingDbAccounts = await PlaidAccount.find({ itemId: item });
        const existingPlaidAccountIds = new Set(existingDbAccounts.map(a => a.plaid_account_id));

        const newPlaidAccounts = allPlaidAccounts.filter(
          plaidAcc => !existingPlaidAccountIds.has(plaidAcc.account_id)
        );

        if (newPlaidAccounts.length > 0) {
          const dekForNewAccounts = await getUserDek(uid);
          const safeEncryptForNewAccounts = createSafeEncrypt(uid, dekForNewAccounts);
          for (const account of newPlaidAccounts) {
              const hashAccountName = hashValue(account.name);
              const hashAccountInstitutionId = hashValue(institutionId);
              const hashAccountMask = hashValue(account.mask);

              const encryptedMask = await safeEncryptForNewAccounts(account.mask, { account_id: account.account_id, field: "mask" });
              const encryptedToken = await safeEncryptForNewAccounts(accessToken, { account_id: account.account_id, field: "accessToken" });
              const encryptedName = await safeEncryptForNewAccounts(account.name, { account_id: account.account_id, field: "name" });
              const encryptedOfficialName = account.official_name ? await safeEncryptForNewAccounts(account.official_name, { account_id: account.account_id, field: "official_name" }) : null;
              const encryptedType = await safeEncryptForNewAccounts(account.type, { account_id: account.account_id, field: "type" });
              const encryptedSubtype = await safeEncryptForNewAccounts(account.subtype, { account_id: account.account_id, field: "subtype" });
              const encryptedInstitutionName = await safeEncryptForNewAccounts(institutionName, { account_id: account.account_id, field: "institutionName" });
              const encryptedCurrentBalance = account.balances?.current ? await safeEncryptForNewAccounts(account.balances.current, { account_id: account.account_id, field: "currentBalance" }) : null;
              const encryptedAvailableBalance = account.balances?.available ? await safeEncryptForNewAccounts(account.balances.available, { account_id: account.account_id, field: "availableBalance" }) : null;

              const newAccountDoc = new PlaidAccount({
                owner_id: userId,
                itemId: item,
                accessToken: encryptedToken,
                owner_type: user.role,
                plaid_account_id: account.account_id,
                account_name: encryptedName,
                account_official_name: encryptedOfficialName,
                account_type: encryptedType,
                account_subtype: encryptedSubtype,
                institution_name: encryptedInstitutionName,
                institution_id: institutionId,
                currentBalance: encryptedCurrentBalance,
                availableBalance: encryptedAvailableBalance,
                currency: account.balances.iso_currency_code,
                mask: encryptedMask,
                hashAccountName,
                hashAccountInstitutionId,
                hashAccountMask,
              });
              await newAccountDoc.save();
          }
        }

        const accounts = await PlaidAccount.find({ itemId: item });

        const dek = await getUserDek(uid);
        const safeEncrypt = createSafeEncrypt(uid, dek);
        await updateAccountBalances(dek, accessToken, accounts, uid, plaidAccountsData);
        let offset = 0;
        let hasMore = true;
        const plaidAccountIds = accounts.map(
          (account) => account.plaid_account_id,
        );

        const lastTransaction = await Transaction.findOne({
          plaidAccountId: { $in: plaidAccountIds },
          isInvestment: true,
        })
          .sort({ transactionDate: -1 })
          .limit(1);

        const today = new Date();
        const end_date = today.toISOString().split("T")[0];

        let start_date;

        if (lastTransaction) {
          const safeStart = new Date(lastTransaction.transactionDate);
          safeStart.setDate(safeStart.getDate() - 2); // <- restamos 2 días
          if (safeStart > today) {
            start_date = end_date;
          } else {
            start_date = safeStart.toISOString().split("T")[0];
          }
        } else {
          const twoYearsAgo = new Date();
          twoYearsAgo.setFullYear(today.getFullYear() - 2);
          start_date = twoYearsAgo.toISOString().split("T")[0];
        }

        while (hasMore) {
          const plaidClient = getPlaidClient();
          const response = await plaidClient.investmentsTransactionsGet({
            access_token: accessToken,
            start_date,
            end_date,
            options: {
              count: 500,
              offset,
            },
          });
          const transactions = response.data.investment_transactions;
          const totalInvestments = response.data.total_investment_transactions;
          hasMore = offset + transactions.length < totalInvestments;
          offset += transactions.length;
          for (let transaction of transactions) {
            const existingTransaction = await Transaction.findOne({
              plaidTransactionId: transaction.investment_transaction_id,
            });
            if (existingTransaction) {
              continue;
            }
            const accountType = "investment";
            const encryptedAccountType = await safeEncrypt(accountType, {
              transaction_id: transaction.investment_transaction_id,
              field: "accountType",
            });
            const encryptedName = await safeEncrypt(transaction.name, {
              transaction_id: transaction.investment_transaction_id,
              field: "name",
            });
            let transactionAmount = transaction.amount;
            if (transaction.type === "buy") {
              transactionAmount = -transactionAmount;
            }
            const encryptedAmount = await safeEncrypt(transactionAmount, {
              transaction_id: transaction.investment_transaction_id,
              field: "amount",
            });

            const encryptedSecurityId = transaction.security_id
              ? await safeEncrypt(transaction.security_id, {
                  transaction_id: transaction.investment_transaction_id,
                  field: "security_id",
                })
              : null;
            const encryptedPrice = transaction.price
              ? await safeEncrypt(transaction.price, {
                  transaction_id: transaction.investment_transaction_id,
                  field: "price",
                })
              : null;

            const encryptedQuantity = transaction.quantity
              ? await safeEncrypt(transaction.quantity, {
                  transaction_id: transaction.investment_transaction_id,
                  field: "quantity",
                })
              : null;

            const encryptedFees = transaction.fees
              ? await safeEncrypt(transaction.fees, {
                  transaction_id: transaction.investment_transaction_id,
                  field: "fees",
                })
              : null;

            const encryptedType = transaction.type
              ? await safeEncrypt(transaction.type, {
                  transaction_id: transaction.investment_transaction_id,
                  field: "type",
                })
              : null;

            const encryptedSubType = transaction.subtype
              ? await safeEncrypt(transaction.subtype, {
                  transaction_id: transaction.investment_transaction_id,
                  field: "subtype",
                })
              : null;
            const account = accounts.find(
              (account) => account.plaid_account_id === transaction.account_id,
            );
            const newTransaction = new Transaction({
              accountId: account._id,
              plaidTransactionId: transaction.investment_transaction_id,
              plaidAccountId: transaction.account_id,
              transactionDate: new Date(`${transaction.date}T12:00:00Z`),
              amount: encryptedAmount,
              currency: transaction.iso_currency_code,
              isInvestment: true,
              name: encryptedName,
              fees: encryptedFees,
              price: encryptedPrice,
              quantity: encryptedQuantity,
              securityId: encryptedSecurityId,
              type: encryptedType,
              subType: encryptedSubType,
              accountType: encryptedAccountType,
            });

            await newTransaction.save();
          }
        }
        structuredLogger.logSuccess("update_investment_transactions_completed", {
          item_id: item,
          user_id: userId,
        });

        return "Investment transactions updated";
      },
    );
  } finally {
    syncingItems.delete(item);
    structuredLogger.logInfo("[SYNC_TRACE] Finished investment sync, releasing lock.", { itemId: item });
  }
};




const updateLiabilities = async (item) => {
  if (syncingItems.has(item)) {
    structuredLogger.logInfo("[SYNC_TRACE] Liability sync already in progress for item, skipping.", { itemId: item });
    return;
  }
  syncingItems.set(item, true);
  try {
    return await structuredLogger.withContext(
      'update_liabilities',
      { item_id: item },
      async () => {
        const accessInfo = await getNewestAccessToken({ itemId: item });
        if (!accessInfo) {
          throw new Error(`No access token found for item ID: ${item}`);
        }
        const user = await User.findById(accessInfo.userId);
        if (!user) {
          throw new Error(`User not found for item ID: ${item}`);
        }
        const uid = user.authUid;
        const accessToken = await getAccessTokenFromItemId(item, uid);
        if (!accessToken) {
          throw new Error(`Access token could not be retrieved for item ID: ${item}`);
        }

        const dek = await getUserDek(uid);
        const safeEncrypt = createSafeEncrypt(uid, dek);

        const liabilitiesResponse = await getLoanLiabilitiesWithAccessToken(accessToken);

        if (liabilitiesResponse && liabilitiesResponse.liabilities) {
          const accountIds = liabilitiesResponse.accounts.map(acc => acc.account_id);

          // Delete old liabilities for all affected accounts to ensure consistency
          await Liability.deleteMany({ accountId: { $in: accountIds } });

          let newLiabilitiesCount = 0;
          // Now, add the new, updated liabilities
          for (const [key, value] of Object.entries(liabilitiesResponse.liabilities)) {
            if (Array.isArray(value)) {
              for (const liab of value) {
                newLiabilitiesCount++;
                const encryptedAccountNumber = await safeEncrypt(liab.account_number);
                const encryptedLastPaymentAmount = await safeEncrypt(liab.last_payment_amount);
                const encryptedMinimumPaymentAmount = await safeEncrypt(liab.minimum_payment_amount);
                const encryptedLastStatementBalance = await safeEncrypt(liab.last_statement_balance);
                const encryptedLoanTypeDescription = await safeEncrypt(liab.loan_type_description);
                const encryptedLoanTerm = await safeEncrypt(liab.loan_term);
                const encryptedNextMonthlyPayment = await safeEncrypt(liab.next_monthly_payment);
                const encryptedOriginationPrincipalAmount = await safeEncrypt(liab.origination_principal_amount);
                const encryptedPastDueAmount = await safeEncrypt(liab.past_due_amount);
                const encryptedEscrowBalance = await safeEncrypt(liab.escrow_balance);
                const encryptedHasPmi = await safeEncrypt(liab.has_pmi);
                const encryptedHasPrepaymentPenalty = await safeEncrypt(liab.has_prepayment_penalty);
                let encryptedPropertyAddress;
                if (liab.property_address) {
                  encryptedPropertyAddress = {
                    city: await safeEncrypt(liab.property_address?.city),
                    country: await safeEncrypt(liab.property_address?.country),
                    postalCode: await safeEncrypt(liab.property_address?.postal_code),
                    region: await safeEncrypt(liab.property_address?.region),
                    street: await safeEncrypt(liab.property_address?.street),
                  };
                }
                const encryptedGuarantor = await safeEncrypt(liab.guarantor);
                const encryptedLoanName = await safeEncrypt(liab.loan_name);
                const encryptedOutstandingInterestAmount = await safeEncrypt(liab.outstanding_interest_amount);
                const encryptedPaymentReferenceNumber = await safeEncrypt(liab.payment_reference_number);
                const encryptedPslfStatus = await safeEncrypt(liab.pslf_status);
                let encryptedRepaymentPlan;
                if (liab.repayment_plan) {
                  encryptedRepaymentPlan = {
                    type: await safeEncrypt(liab.repayment_plan?.type),
                    description: await safeEncrypt(liab.repayment_plan?.description),
                  };
                }
                const encryptedSequenceNumber = await safeEncrypt(liab.sequence_number);
                let encryptedServicerAddress;
                if (liab.servicer_address) {
                  encryptedServicerAddress = {
                    city: await safeEncrypt(liab.servicer_address?.city),
                    country: await safeEncrypt(liab.servicer_address?.country),
                    postalCode: await safeEncrypt(liab.servicer_address?.postal_code),
                    region: await safeEncrypt(liab.servicer_address?.region),
                    street: await safeEncrypt(liab.servicer_address?.street),
                  };
                }
                const encryptedYtdInterestPaid = await safeEncrypt(liab.ytd_interest_paid);
                const encryptedYtdPrincipalPaid = await safeEncrypt(liab.ytd_principal_paid);

                const newLiability = new Liability({
                  liabilityType: key,
                  accountId: liab.account_id,
                  accountNumber: encryptedAccountNumber,
                  lastPaymentAmount: encryptedLastPaymentAmount,
                  lastPaymentDate: liab.last_payment_date,
                  nextPaymentDueDate: liab.next_payment_due_date,
                  minimumPaymentAmount: encryptedMinimumPaymentAmount,
                  lastStatementBalance: encryptedLastStatementBalance,
                  lastStatementIssueDate: liab.last_statement_issue_date,
                  isOverdue: liab.is_overdue,
                  aprs: liab.aprs,
                  loanTypeDescription: encryptedLoanTypeDescription,
                  loanTerm: encryptedLoanTerm,
                  maturityDate: liab.maturity_date,
                  nextMonthlyPayment: encryptedNextMonthlyPayment,
                  originationDate: liab.origination_date,
                  originationPrincipalAmount: encryptedOriginationPrincipalAmount,
                  pastDueAmount: encryptedPastDueAmount,
                  escrowBalance: encryptedEscrowBalance,
                  hasPmi: encryptedHasPmi,
                  hasPrepaymentPenalty: encryptedHasPrepaymentPenalty,
                  propertyAddress: encryptedPropertyAddress,
                  interestRate: liab.interest_rate,
                  disbursementDates: liab.disbursement_dates,
                  expectedPayoffDate: liab.expected_payoff_date,
                  guarantor: encryptedGuarantor,
                  interestRatePercentage: liab.interest_rate_percentage,
                  loanName: encryptedLoanName,
                  loanStatus: liab.loan_status,
                  outstandingInterestAmount: encryptedOutstandingInterestAmount,
                  paymentReferenceNumber: encryptedPaymentReferenceNumber,
                  pslfStatus: encryptedPslfStatus,
                  repaymentPlan: encryptedRepaymentPlan,
                  sequenceNumber: encryptedSequenceNumber,
                  servicerAddress: encryptedServicerAddress,
                  ytdInterestPaid: encryptedYtdInterestPaid,
                  ytdPrincipalPaid: encryptedYtdPrincipalPaid,
                });
                await newLiability.save();
              }
            }
          }
          structuredLogger.logSuccess('update_liabilities_completed', {
            item_id: item,
            user_id: uid,
            updated_accounts_count: accountIds.length,
            new_liabilities_count: newLiabilitiesCount,
          });
          return { success: true, updated_accounts: accountIds.length };
        }
        return { success: true, updated_accounts: 0, message: "No new liability data to update." };
      },
    );
  } finally {
    syncingItems.delete(item);
    structuredLogger.logInfo("[SYNC_TRACE] Finished liability sync, releasing lock.", { itemId: item });
  }
};

const setItemStatus = async (itemId, status) => {
  const update = { status: status };
  if (status === 'expired' || status === 'bad') {
    update.isAccessTokenExpired = true;
  }
  await AccessToken.updateMany({ itemId: itemId }, { $set: update });
  structuredLogger.logInfo("item_status_updated", { itemId, status });
};

const handlePlaidError = async (error, itemId) => {
  const plaidErrorCode = error.response?.data?.error_code;
  
  if (plaidErrorCode === 'ITEM_LOGIN_REQUIRED') {
    structuredLogger.logWarning(
      `Plaid item requires relink. Marking as login_required.`,
      { item_id: itemId, plaid_error_code: plaidErrorCode }
    );
    await setItemStatus(itemId, 'login_required');
    return `Handled ITEM_LOGIN_REQUIRED by marking item status as login_required.`;

  } else if (['INVALID_ACCESS_TOKEN', 'ITEM_NOT_FOUND'].includes(plaidErrorCode)) {
    structuredLogger.logWarning(
      `Invalid Plaid token. Marking item as expired.`,
      { item_id: itemId, plaid_error_code: plaidErrorCode }
    );
    await setItemStatus(itemId, 'expired');
    return `Handled ${plaidErrorCode} by marking item status as expired.`;

  } else if (error.message.startsWith("No access token found for item ID")) {
      structuredLogger.logErrorBlock(
        new Error(`Data integrity issue: ${error.message}`),
        { item_id: itemId, error_classification: "handled_error" }
      );
      return "Handled data integrity error by logging.";
  } else {
    // This is a true, unexpected error.
    throw error;
  }
};



const repairAccessTokenWebhook = async (item) => {
  const accessToken = await getAccessTokenFromItemId(item);
  const accounts = await PlaidAccount.find({
    accessToken,
  });
  for (const account of accounts) {
    await account.save();
  }
  return accounts;
};

const repairAccessToken = async (accountId, uid) => {
  return await structuredLogger.withContext(
    "repair_access_token",
    { accountId, uid },
    async () => {
      try {
        const account = await PlaidAccount.findById(accountId);
        if (!account) {
          structuredLogger.logErrorBlock(new Error("Account not found"), {
            operation: "repair_access_token",
            accountId,
          });
          return;
        }

        const user = await User.findOne({ authUid: uid });
        if (!user) {
          throw new Error(`User not found for uid: ${uid}`);
        }

        const dek = await getUserDek(uid);
        const safeDecrypt = createSafeDecrypt(uid, dek);
        const accessToken = await safeDecrypt(account.accessToken, {
          account_id: accountId,
          field: "accessToken",
        });

        const plaidClient = getPlaidClient();
        structuredLogger.logInfo("Attempting plaidClient.accountsGet with decrypted token in repairAccessToken.", {
            accountId: accountId,
            uid: uid,
            hasAccessToken: !!accessToken,
            accessToken_start: accessToken ? accessToken.substring(0, 10) : 'N/A'
        });
        const plaidAccountsResponse = await plaidClient.accountsGet({
          access_token: accessToken,
        });
        const plaidAccounts = plaidAccountsResponse.data.accounts;
        const plaidIds = [];
        const accountIds = [];
        for (const plaidAccount of plaidAccounts) {
          plaidIds.push(plaidAccount.account_id);
        }

        const accounts = await PlaidAccount.find({
          accessToken: account.accessToken,
        });
        for (const acc of accounts) {
          accountIds.push(acc.plaid_account_id);
        }

        const plaidSet = new Set(plaidIds);
        const removedAccounts = accountIds.filter((id) => !plaidSet.has(id));
        const unchangedAccounts = accountIds.filter((id) => plaidSet.has(id));

        for (const accId of unchangedAccounts) {
          const plaidAccount = await PlaidAccount.findOne({
            plaid_account_id: accId,
          });
        }

        for (const accId of removedAccounts) {
          const primaryEmail = user.email.find(e => e.isPrimary)?.email;
          if (primaryEmail) {
            await accountsService.deletePlaidAccountByEmail(accId, primaryEmail);
          }
        }

        const primaryEmail = user.email.find(e => e.isPrimary)?.email;
        if (!primaryEmail) {
            throw new Error(`Primary email not found for user: ${uid}`);
        }
        const resAddAcount = await accountsService.addAccount(
          accessToken,
          primaryEmail,
          uid
        );

        structuredLogger.logSuccess("repair_access_token_completed", {
          accountId,
          removed_accounts: removedAccounts.length,
          unchanged_accounts: unchangedAccounts.length,
        });

        return { accounts, existingAccounts: resAddAcount.existingAccounts };
      } catch (error) {
        structuredLogger.logErrorBlock(error, {
          operation: "repair_access_token",
          accountId,
          uid,
        });
        throw error;
      }
    },
  );
};

const getCurrentCashflow = async (email) => {
  const transactionsResponse = await getTransactions(email);
  const transactions = transactionsResponse.added;
  return transactions;
};

const detectInternalTransfers = async (transactions) => {
  const transfers = [];
  const groupedByAmount = new Map();

  transactions
    .filter((txn) =>
      ["transfer", "internal account transfer"].includes(
        txn.category?.[0]?.toLowerCase(),
      ),
    )
    .forEach((txn) => {
      const key = Math.abs(txn.amount);
      if (!groupedByAmount.has(key)) {
        groupedByAmount.set(key, []);
      }
      groupedByAmount.get(key).push(txn);
    });

  groupedByAmount.forEach((txns, amount) => {
    for (let i = 0; i < txns.length; i++) {
      const txn1 = txns[i];
      for (let j = i + 1; j < txns.length; j++) {
        const txn2 = txns[j];

        const isOppositeAmount = txn1.amount === -txn2.amount;
        const isDifferentAccount = txn1.account_id !== txn2.account_id;
        const isDateClose =
          Math.abs(new Date(txn1.date) - new Date(txn2.date)) <=
          2 * 24 * 60 * 60 * 1000;

        if (isOppositeAmount && isDifferentAccount && isDateClose) {
          if (!transfers.includes(txn1.transaction_id)) {
            transfers.push({
              transactionId: txn1.transaction_id,
              transactionRef: txn2.transaction_id,
            });
          }
          if (!transfers.includes(txn2.transaction_id)) {
            transfers.push({
              transactionId: txn2.transaction_id,
              transactionRef: txn1.transaction_id,
            });
          }
        }
      }
    }
  });

  return transfers;
};

const getInstitutionUpdateToken = async (institutionId, uid) => {
  try {
    const user = await User.findOne({ authUid: uid });
    if (!user) {
      throw new Error("User not found");
    }

    // Find account for this institution and user
    const account = await PlaidAccount.findOne({
      institution_id: institutionId,
      owner_id: user._id,
    });

    if (!account) {
      throw new Error("Institution not found or user does not have access");
    }

    const itemId = account.itemId;
    const decryptedAccessToken = await getAccessTokenFromItemId(itemId, uid);

    if (!decryptedAccessToken) {
      // This should ideally not be reached if getAccessTokenFromItemId throws on failure,
      // but as a fallback, mark as expired and indicate re-link needed.
      structuredLogger.logWarning("Decrypted access token is unexpectedly null. Marking item as expired.", {
        itemId: itemId,
        uid: uid,
        institutionId: institutionId,
      });
      await setItemStatus(itemId, 'expired');
      return { access_token: null, itemId: itemId, needs_relink: true };
    }

    // Proactively check if the token is invalid and flag the item if so.
    try {
      const plaidClient = getPlaidClient();
      await plaidClient.itemGet({ access_token: decryptedAccessToken });
    } catch (error) {
      await handlePlaidError(error, account.itemId);
      return { access_token: null, itemId: itemId, needs_relink: true };
    }

    return { access_token: decryptedAccessToken, itemId: account.itemId, needs_relink: false };
  } catch (error) {
    console.error("Error getting institution update token:", error);
    if (error.message.includes("Failed to decrypt access token")) {
        // Log the decryption error but do not re-throw immediately.
        structuredLogger.logErrorBlock(error, {
            operation: "getInstitutionUpdateToken_decryption_error",
            uid: uid,
            institutionId: institutionId,
            message: "Failed to decrypt access token. Marking item as expired.",
        });
        const user = await User.findOne({ authUid: uid });
        const account = await PlaidAccount.findOne({
          institution_id: institutionId,
          owner_id: user._id,
        });
        if (account) {
            await setItemStatus(account.itemId, 'corrupted');
            return { access_token: null, itemId: account.itemId, needs_relink: true };
        }
    }
    throw error;
  }
};

const invalidateAccessToken = async (accessToken) => {
  return await structuredLogger.withContext(
    "invalidate_access_token",
    { has_access_token: !!accessToken },
    async () => {
      try {
        const plaidClient = getPlaidClient();
        await plaidClient.itemRemove({
          access_token: accessToken,
          client_id: plaidClientId,
          secret: plaidSecret,
        });

        structuredLogger.logPlaidApi("item_remove", true, {
          has_access_token: !!accessToken,
        });
      } catch (error) {
        structuredLogger.logPlaidApi("item_remove", false, {
          error: error.message,
          has_access_token: !!accessToken,
        });
        throw error;
      }
    },
  );
};

// Webhook failure tracking
const webhookFailureTracker = new Map();

const resetWebhookFailures = (itemId) => {
  if (webhookFailureTracker.has(itemId)) {
    webhookFailureTracker.delete(itemId);
    structuredLogger.logSuccess("reset_webhook_failures", {
      item_id: itemId,
    });
  }
};

const trackWebhookFailure = (itemId) => {
  const currentFailures = webhookFailureTracker.get(itemId) || 0;
  const newFailureCount = currentFailures + 1;
  webhookFailureTracker.set(itemId, newFailureCount);

  structuredLogger.logErrorBlock(
    new Error(`Webhook failure tracked for item ${itemId}`),
    {
      operation: "track_webhook_failure",
      item_id: itemId,
      failure_count: newFailureCount,
    },
  );

  return newFailureCount;
};

const getWebhookFailureCount = (itemId) => {
  return webhookFailureTracker.get(itemId) || 0;
};

const validateWebhookSignature = (body, signature, webhookSecret) => {
  try {
    const crypto = require("crypto");
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(body, "utf8")
      .digest("base64");

    return crypto.timingSafeEqual(
      Buffer.from(signature, "base64"),
      Buffer.from(expectedSignature, "base64"),
    );
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "validate_webhook_signature",
    });
    return false;
  }
};

const checkIfChaseBank = async (itemId, accessToken) => {
  try {
    const plaidClient = getPlaidClient();
    const response = await plaidClient.institutionsGetById({
      institution_id: "ins_3",
      country_codes: ["US"],
    });

    return response.data.institution.name.toLowerCase().includes("chase");
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "check_if_chase_bank",
      item_id: itemId,
    });
    return false;
  }
};

const handleItemError = async (event) => {
  try {
    structuredLogger.logOperationStart("handle_item_error", {
      item_id: event.item_id,
      error_code: event.error?.error_code,
      error_message: event.error?.error_message,
    });

    // Track webhook failure
    if (event.item_id) {
      trackWebhookFailure(event.item_id);
    }

    // Handle specific error codes
    if (event.error?.error_code === "ITEM_LOGIN_REQUIRED") {
      // Mark accounts as requiring re-authentication
      const accounts = await PlaidAccount.find({ itemId: event.item_id });
    }

    return `Item error handled: ${event.error?.error_code}`;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "handle_item_error",
      item_id: event.item_id,
    });
    throw error;
  }
};

const handleAccountsUpdate = async (event) => {
  try {
    structuredLogger.logOperationStart("handle_accounts_update", {
      item_id: event.item_id,
      account_ids: event.account_ids,
    });

    if (!event.item_id) {
      throw new Error("Missing item_id for ACCOUNTS webhook");
    }

    // Trigger a full transaction and balance update for the item.
    // updateTransactions also calls updateAccountBalances internally.
    await updateTransactions(event.item_id);

    // Reset webhook failures on successful account update.
    // This is also handled in updateTransactions, but it's good practice
    // to have it here as well to signal successful handling of the webhook.
    resetWebhookFailures(event.item_id);

    return `Accounts update handled for ${
      event.account_ids?.length || 0
    } accounts`;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "handle_accounts_update",
      item_id: event.item_id,
    });
    // Re-throw the error to be caught by the main webhook handler
    throw error;
  }
};

const updateHoldings = async (item) => {
  return await structuredLogger.withContext(
    "update_holdings",
    { item_id: item },
    async () => {
      structuredLogger.logInfo("updateHoldings function called", { item_id: item });
      return "Holdings update placeholder";
    },
  );
};

const isItemExpired = async (itemId) => {
  // The AccessToken collection is the single source of truth for expiration.
  // An item is considered expired if it has NO valid (non-expired) access tokens.
  const validToken = await getNewestAccessToken({ itemId: itemId });
  return !validToken;
};

const doesItemExist = async (itemId) => {
  const token = await AccessToken.findOne({ itemId: itemId });
  return !!token;
};

const plaidService = {
  createLinkToken,
  getPublicToken,
  getAccessToken,
  saveAccessToken,
  getBalance,
  getInstitutions,
  getTransactions,
  getCurrentCashflow,
  getUserAccessTokens,
  updateTransactions,
  getAccountsByItem,
  detectInternalTransfers,
  getAccountsWithAccessToken,
  getTransactionsWithAccessToken,
  getInvestmentTransactionsWithAccessToken,
  getLoanLiabilitiesWithAccessToken,
  updateInvestmentTransactions,
  updateLiabilities,
  getAccessTokenFromItemId,
  repairAccessTokenWebhook,
  repairAccessToken,
  getInvestmentsHoldingsWithAccessToken,
  getItemWithAccessToken,
  getInstitutionUpdateToken,
  invalidateAccessToken,
  resetWebhookFailures,
  trackWebhookFailure,
  getWebhookFailureCount,
  webhookFailureTracker,
  validateWebhookSignature,
  checkIfChaseBank,
  handleItemError,
  handleAccountsUpdate,
  handlePlaidError,
  updateHoldings,
  isItemExpired,
  getNewestAccessToken,
  doesItemExist,
};

export default plaidService;
