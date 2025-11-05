import AccessToken from "../database/models/AccessToken.js";
import User from "../database/models/User.js";
import getPlaidClient from "../config/plaid.js";
import Transaction from "../database/models/Transaction.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import accountsService from "./accounts.service.js";
import {
  decryptValue,
  encryptValue,
  getUserDek,
} from "../database/encryption.js";
import structuredLogger from "../lib/structuredLogger.js";
import { getOldestAccessToken } from "./utils/accounts.js";

//TODO: change to production
const plaidClientId = process.env.PLAID_CLIENT_ID;
const plaidSecret = process.env.PLAID_SECRET;
const webhookUrl = process.env.PLAID_WEBHOOK_URL;
const plaidRedirectUri = process.env.PLAID_REDIRECT_URI;
const plaidRedirectNewAccounts = process.env.PLAID_REDIRECT_URI_NEW_ACCOUNTS;

import {
  createSafeEncrypt,
  createSafeDecrypt,
} from "../lib/encryptionHelper.js";

const createLinkToken = async (
  email,
  isAndroid,
  accountId,
  uid,
  screen,
  mode,
  access_token,
  plaidEnvironment,
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
    },
    async () => {
      const user = await User.findOne({
        authUid: uid,
      });
      if (!user) {
        throw new Error("User not found");
      }
      let accessToken;
      const dek = await getUserDek(uid);
      const safeDecrypt = createSafeDecrypt(uid);
      if (accountId) {
        const account = await PlaidAccount.findOne({ _id: accountId });
        if (!account) {
          throw new Error("Account not found");
        }
        accessToken = await safeDecrypt(account.accessToken, dek, {
          account_id: accountId,
          field: "accessToken",
        });
      }

      // UPDATE MODE: Use provided access_token for update mode
      if (mode === "update") {
        if (!access_token) {
          throw new Error("access_token required for update mode");
        }
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
        // NOTE: For update mode, Plaid documentation suggests omitting products array
        // Testing with products first - may need to remove for update mode if issues arise
        products: ["transactions"],
        optional_products: ["investments", "liabilities"],
        hosted_link: {
          // is_mobile_app: true,
          completion_redirect_uri: "myapp://hosted-link-complete",
        },
        transactions: {
          days_requested: 730,
        },
      };
      if (accessToken) {
        plaidRequest.access_token = accessToken;
      }
      const plaidClient = getPlaidClient(plaidEnvironment);
      const response = await plaidClient
        .linkTokenCreate(plaidRequest)
        .catch((error) => {
          structuredLogger.logPlaidApi("link_token_create", false, {
            error: error.message,
            plaid_request: plaidRequest,
          });
          throw error;
        });

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
      const safeEncrypt = createSafeEncrypt(uid);

      const encryptedToken = await safeEncrypt(accessToken, dek, {
        user_id: userId,
        item_id: itemId,
        field: "accessToken",
      });
      // Check if access token already exists for this itemId
      const existingToken = await getOldestAccessToken({ itemId });

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
  const tokens = await getOldestAccessToken({ userId });

  const decryptedTokens = [];
  const dek = await getUserDek(uid);
  const safeDecrypt = createSafeDecrypt(uid);
  for (const token of tokens) {
    const decryptedAccessToken = await safeDecrypt(token.accessToken, dek, {
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

const getAccounts = async (email, uid) => {
  try {
    const tokens = await getUserAccessTokens(email, uid);
    if (!tokens.length) return [];
    const plaidClient = getPlaidClient();
    const accountsPromises = tokens.map(async (token) => {
      const response = await plaidClient.accountsGet({
        access_token: token.accessToken,
      });
      return response.data.accounts.map((account) => ({
        ...account,
        institutionId: token.institutionId,
      }));
    });

    const accountsArray = await Promise.all(accountsPromises);

    const accounts = accountsArray.flat();

    return accounts;
  } catch (error) {
    return [];
  }
};

const getAccountsWithAccessToken = async (accessToken) => {
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
  const tokens = await getUserAccessTokens(email, uid);
  if (!tokens.length) return [];

  const plaidClient = getPlaidClient();
  const transactionsPromises = tokens.map(async (token) => {
    const response = await plaidClient.transactionsSync({
      access_token: token.accessToken,
      count: 500,
    });
    return response.data.added;
  });

  const transactionsArray = await Promise.all(transactionsPromises);
  const transactions = transactionsArray.flat();

  return transactions;
};

const getTransactionsWithAccessToken = async (accessToken) => {
  const plaidClient = getPlaidClient();
  const response = await plaidClient.transactionsSync({
    access_token: accessToken,
  });
  return response.data;
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

const getAccessTokenFromItemId = async (itemId, uid) => {
  const access = await getOldestAccessToken({ itemId });

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
  const safeDecrypt = createSafeDecrypt(firebaseUid);
  const decryptedToken = await safeDecrypt(accessToken, dek, {
    item_id: itemId,
    field: "accessToken",
  });

  if (!decryptedToken) {
    throw new Error(`Failed to decrypt access token for item ID: ${itemId}`);
  }
  return decryptedToken;
};

const updateAccountBalances = async (dek, accessToken, accounts, uid) => {
  let newAccountsBalances;

  try {
    const plaidClient = getPlaidClient();
    newAccountsBalances = await plaidClient.accountsGet({
      access_token: accessToken,
      // min_last_updated_datetime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching account balances:", error);
    return;
  }

  if (newAccountsBalances) {
    const bulkOps = [];
    const safeEncrypt = createSafeEncrypt(uid);
    for (const account of newAccountsBalances.data.accounts) {
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
          safeEncrypt(accountName, dek, {
            account_id: accountPlaidId,
            field: "accountName",
          }),
          safeEncrypt(accountType, dek, {
            account_id: accountPlaidId,
            field: "accountType",
          }),
          safeEncrypt(accountSubtype, dek, {
            account_id: accountPlaidId,
            field: "accountSubtype",
          }),
          accountBalance.current
            ? safeEncrypt(accountBalance.current, dek, {
                account_id: accountPlaidId,
                field: "currentBalance",
              })
            : null,
          accountBalance.available
            ? safeEncrypt(accountBalance.available, dek, {
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
              accountType: encryptedAccountType,
              accountSubtype: encryptedAccountSubtype,
              accountName: encryptedAccountName,
            },
          },
        });
      }
    }

    if (bulkOps.length) {
      await PlaidAccount.bulkWrite(bulkOps);
    }
  }
};

const updateTransactions = async (item) => {
  console.log("Updating transactions for item:", item);
  const accessInfo = await getOldestAccessToken({ itemId: item });
  if (!accessInfo) return;
  const userId = accessInfo.userId;
  const user = await User.findById(userId);
  if (!user) return;
  const uid = user?.authUid;
  const accessToken = await getAccessTokenFromItemId(item, uid);
  if (!accessToken) {
    accessToken = await getAccessTokenFromItemId(item, uid);
    if (!accessToken) {
      structuredLogger.logErrorBlock(
        new Error("Access token could not be retrieved"),
        {
          operation: "update_transactions",
          item_id: item,
          user_id: userId,
        },
      );
      //TODO: remove item
      return;
    }
  }

  const accounts = await PlaidAccount.find({ itemId: item });

  if (!accounts.length) {
    //TODO: remove item
    return;
  }

  const emails = user?.email;

  const emailObject = emails?.find((email) => email.isPrimary === true);

  const email = emailObject?.email;

  const dek = await getUserDek(uid);
  await updateAccountBalances(dek, accessToken, accounts, uid);

  let cursor = accounts[0].nextCursor || null;
  let hasMore = true;
  let transactionsByAccount = {};
  let oldCursor = cursor;
  let iterationCoounter = 0;
  const maxIterations = 10;
  const newTransactions = [];

  while (hasMore) {
    transactionsByAccount = {};
    oldCursor = cursor;
    iterationCoounter++;
    if (iterationCoounter > maxIterations) {
      console.log("Max iterations reached, stopping");
      hasMore = false;
      break;
    }
    try {
      const plaidClient = getPlaidClient();
      const response = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor: cursor,
        count: 500,
      });

      const transactions = response.data.added || [];
      const modifiedTransactions = response.data.modified || [];
      const removedTransactions = response.data.removed || [];
      cursor = response.data.next_cursor;
      hasMore = response.data.has_more;
      newTransactions.push(...transactions);

      console.log(
        `Fetched ${transactions.length} new, ${modifiedTransactions.length} modified, ${removedTransactions.length} removed transactions`,
      );

      const accountMap = new Map();
      for (const account of accounts) {
        accountMap.set(account.plaid_account_id, account);
      }

      const bulkOps = [];
      for (let transaction of transactions) {
        if (!accountMap.has(transaction.account_id)) continue;

        const encryptedMerchantName = await safeEncrypt(
          transaction.merchant_name,
          dek,
          {
            transaction_id: transaction.transaction_id,
            field: "merchant_name",
          },
        );
        const encryptedName = await safeEncrypt(transaction.name, dek, {
          transaction_id: transaction.transaction_id,
          field: "name",
        });
        const merchant = {
          merchantName: encryptedMerchantName,
          name: encryptedName,
          merchantCategory: transaction.category?.[0],
          website: transaction.website,
          logo: transaction.logo_url,
        };

        const encryptedAmount = await safeEncrypt(transaction.amount, dek, {
          transaction_id: transaction.transaction_id,
          field: "amount",
        });

        const encryptedAccountType = await safeEncrypt(
          accountMap.get(transaction.account_id).account_type,
          dek,
          { transaction_id: transaction.transaction_id, field: "account_type" },
        );

        const transactionCode = await safeEncrypt(
          transaction.transaction_code,
          dek,
          {
            transaction_id: transaction.transaction_id,
            field: "transaction_code",
          },
        );

        bulkOps.push({
          updateOne: {
            filter: { plaidTransactionId: transaction.transaction_id },
            update: {
              $setOnInsert: {
                accountId: accountMap.get(transaction.account_id)._id,
                plaidTransactionId: transaction.transaction_id,
                plaidAccountId: transaction.account_id,
                transactionDate: transaction.date,
                amount: encryptedAmount,
                currency: transaction.iso_currency_code,
                notes: null,
                merchant,
                description: null,
                transactionCode: transactionCode,
                tags: transaction.category,
                accountType: encryptedAccountType,
                pending_transaction_id: transaction.pending_transaction_id,
                pending: transaction.pending,
              },
            },
            upsert: true,
          },
        });

        if (!transactionsByAccount[transaction.account_id]) {
          transactionsByAccount[transaction.account_id] = [];
        }
        transactionsByAccount[transaction.account_id].push(
          transaction.transaction_id,
        );
      }

      if (bulkOps.length) {
        await Transaction.bulkWrite(bulkOps);
      }

      if (removedTransactions.length) {
        await Transaction.deleteMany({
          plaidTransactionId: {
            $in: removedTransactions.map((t) => t.transaction_id),
          },
        });
      }

      if (modifiedTransactions.length > 0) {
        const modifiedBulkOps = [];
        for (const transaction of modifiedTransactions) {
          const encryptedAmount = await safeEncrypt(transaction.amount, dek, {
            transaction_id: transaction.transaction_id,
            field: "amount",
          });

          modifiedBulkOps.push({
            updateOne: {
              filter: { plaidTransactionId: transaction.transaction_id },
              update: {
                $set: {
                  amount: encryptedAmount,
                  transactionDate: transaction.date,
                  tags: transaction.category,
                  pending_transaction_id: transaction.pending_transaction_id,
                  pending: transaction.pending,
                },
              },
            },
          });
        }

        await Transaction.bulkWrite(modifiedBulkOps);
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
              nextCursor: cursor,
            },
          },
        });
      }

      if (bulkUpdateAccountsOps.length > 0) {
        await PlaidAccount.bulkWrite(bulkUpdateAccountsOps);
      }
    } catch (error) {
      if (
        error.response?.data?.error_code ===
        "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION"
      ) {
        console.log(
          "Mutation detected during pagination, restarting with old cursor...",
        );
        cursor = oldCursor; // Reiniciar con el cursor anterior
      } else {
        console.error(
          "Error syncing transactions:",
          error.response?.data || error,
        );
        break;
      }
    }
  }

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
  console.log("Finished updating transactions");

  return transactionsByAccount;
};

const updateInvestmentTransactions = async (item) => {
  return await structuredLogger.withContext(
    "update_investment_transactions",
    { item_id: item },
    async () => {
      structuredLogger.logOperationStart("update_investment_transactions", {
        item_id: item,
      });
      const accessInfo = await getOldestAccessToken({ itemId: item });
      if (!accessInfo) return;
      const userId = accessInfo.userId;
      const user = await User.findById(userId);
      if (!user) return;
      const uid = user?.authUid;
      const accessToken = await getAccessTokenFromItemId(item, uid);

      if (!accessToken) {
        return;
      }
      const accounts = await PlaidAccount.find({ itemId: item });

      const dek = await getUserDek(uid);
      const safeEncrypt = createSafeEncrypt(uid);
      await updateAccountBalances(dek, accessToken, accounts, uid);
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
          const encryptedAccountType = await safeEncrypt(accountType, dek, {
            transaction_id: transaction.investment_transaction_id,
            field: "accountType",
          });
          const encryptedName = await safeEncrypt(transaction.name, dek, {
            transaction_id: transaction.investment_transaction_id,
            field: "name",
          });
          const encryptedAmount = await safeEncrypt(transaction.amount, dek, {
            transaction_id: transaction.investment_transaction_id,
            field: "amount",
          });

          const encryptedSecurityId = await safeEncrypt(
            transaction.security_id,
            dek,
            {
              transaction_id: transaction.investment_transaction_id,
              field: "security_id",
            },
          );
          const encryptedPrice = await safeEncrypt(transaction.price, dek, {
            transaction_id: transaction.investment_transaction_id,
            field: "price",
          });

          const encryptedQuantity = await safeEncrypt(
            transaction.quantity,
            dek,
            {
              transaction_id: transaction.investment_transaction_id,
              field: "quantity",
            },
          );

          const encryptedFees = await safeEncrypt(transaction.fees, dek, {
            transaction_id: transaction.investment_transaction_id,
            field: "fees",
          });

          const encryptedType = await safeEncrypt(transaction.type, dek, {
            transaction_id: transaction.investment_transaction_id,
            field: "type",
          });

          const encryptedSubType = await safeEncrypt(transaction.subtype, dek, {
            transaction_id: transaction.investment_transaction_id,
            field: "subtype",
          });
          const account = accounts.find(
            (account) => account.plaid_account_id === transaction.account_id,
          );
          const newTransaction = new Transaction({
            accountId: account._id,
            plaidTransactionId: transaction.investment_transaction_id,
            plaidAccountId: transaction.account_id,
            transactionDate: transaction.date,
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
};

const updateLiabilities = async (item) => {
  const accessToken = await getAccessTokenFromItemId(item);
};

const updateInvadlidAccessToken = async (item) => {
  const accessToken = await getAccessTokenFromItemId(item);
  const accounts = await PlaidAccount.find({ accessToken });
  for (const account of accounts) {
    account.isAccessTokenExpired = true;
    await account.save();
  }

  return accounts;
};

const repairAccessTokenWebhook = async (item) => {
  const accessToken = await getAccessTokenFromItemId(item);
  const accounts = await PlaidAccount.find({
    accessToken,
    isAccessTokenExpired: true,
  });
  for (const account of accounts) {
    account.isAccessTokenExpired = false;
    await account.save();
  }
  return accounts;
};

const repairAccessToken = async (accountId, email) => {
  return await structuredLogger.withContext(
    "repair_access_token",
    { accountId, email },
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
        const accessToken = account.accessToken;

        const plaidClient = getPlaidClient();
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
          accessToken,
        });
        for (const account of accounts) {
          accountIds.push(account.plaid_account_id);
        }

        const plaidSet = new Set(plaidIds);
        const removedAccounts = accountIds.filter((id) => !plaidSet.has(id));
        const unchangedAccounts = accountIds.filter((id) => plaidSet.has(id));

        for (const accountId of unchangedAccounts) {
          const plaidAccount = await PlaidAccount.findOne({
            plaid_account_id: accountId,
          });
          plaidAccount.isAccessTokenExpired = false;
          await plaidAccount.save();
        }

        for (const accountId of removedAccounts) {
          await accountsService.removeAccount(accountId, email);
        }

        const resAddAcount = await accountsService.addAccount(
          accessToken,
          email,
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
          email,
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

    // Decrypt access token
    const dek = await getUserDek(uid);
    const safeDecrypt = createSafeDecrypt(uid);
    const decryptedAccessToken = await safeDecrypt(account.accessToken, dek, {
      user_id: user._id,
      institution_id: institutionId,
      field: "accessToken",
    });

    if (!decryptedAccessToken) {
      throw new Error(`Failed to decrypt access token for institution ID: ${institutionId}`);
    }

    return { access_token: decryptedAccessToken };
  } catch (error) {
    console.error("Error getting institution update token:", error);
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
      for (const account of accounts) {
        account.isAccessTokenExpired = true;
        await account.save();
      }
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

    // Reset webhook failures on successful account update
    if (event.item_id) {
      resetWebhookFailures(event.item_id);
    }

    return `Accounts update handled for ${
      event.account_ids?.length || 0
    } accounts`;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "handle_accounts_update",
      item_id: event.item_id,
    });
    throw error;
  }
};

const plaidService = {
  createLinkToken,
  getPublicToken,
  getAccessToken,
  getAccounts,
  saveAccessToken,
  getBalance,
  getInstitutions,
  getTransactions,
  getCurrentCashflow,
  getUserAccessTokens,
  updateTransactions,
  getAccounts,
  detectInternalTransfers,
  getAccountsWithAccessToken,
  getTransactionsWithAccessToken,
  getInvestmentTransactionsWithAccessToken,
  getLoanLiabilitiesWithAccessToken,
  updateInvestmentTransactions,
  updateLiabilities,
  getAccessTokenFromItemId,
  updateInvadlidAccessToken,
  repairAccessTokenWebhook,
  repairAccessToken,
  getInvestmentsHoldingsWithAccessToken,
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
};

export default plaidService;
