import AccessToken from "../database/models/AccessToken.js";
import User from "../database/models/User.js";
import plaidClient from "../config/plaid.js";
import Transaction from "../database/models/Transaction.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import accountsService from "./accounts.service.js";
import {
  decryptValue,
  encryptValue,
  getUserDek,
} from "../database/encryption.js";

//TODO: change to production
const plaidClientId = process.env.PLAID_CLIENT_ID;
const plaidSecret = process.env.PLAID_SECRET;
const webhookUrl = process.env.PLAID_WEBHOOK_URL;

const createLinkToken = async (email, isAndroid, accountId, uid) => {
  const user = await User.findOne({
    "email.email": email.toLowerCase(),
  });
  if (!user) {
    throw new Error("User not found");
  }
  let accessToken;
  const dek = await getUserDek(uid);
  if (accountId) {
    const account = await PlaidAccount.findOne({ _id: accountId });
    if (!account) {
      throw new Error("Account not found");
    }
    accessToken = await decryptValue(account.accessToken, dek);
  }
  const userId = user._id.toString();
  const plaidRequest = {
    client_id: plaidClientId,
    secret: plaidSecret,
    client_name: "Zentavos",
    country_codes: ["US"],
    android_package_name: isAndroid ? "com.zentavos.mobile" : null,
    redirect_uri: !isAndroid ? "https://zentavos.com/app" : null,
    //TODO: change this to fit every environment
    webhook: webhookUrl,
    language: "en",
    user: {
      client_user_id: userId,
    },
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
  const response = await plaidClient
    .linkTokenCreate(plaidRequest)
    .catch((error) => {
      console.log(error);
    });
  return response.data;
};

const getPublicToken = async (linkToken) => {
  const response = await plaidClient.linkTokenGet({
    link_token: linkToken,
  });
  return response.data;
};

const getAccessToken = async (publicToken) => {
  const response = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });
  return response.data;
};

const saveAccessToken = async (
  email,
  accessToken,
  itemId,
  institutionId,
  uid
) => {
  const user = await User.findOne({
    "email.email": email.toLowerCase(),
  });
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user._id.toString();
  const dek = await getUserDek(uid);

  const encryptedToken = await encryptValue(accessToken, dek);

  const newToken = new AccessToken({
    userId,
    accessToken: encryptedToken,
    itemId,
    institutionId,
  });
  await newToken.save();
  return {
    userId,
    accessToken,
    itemId,
    institutionId,
  };
};

const getUserAccessTokens = async (email, uid) => {
  const user = await User.findOne({
    "email.email": email.toLowerCase(),
  });
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user._id.toString();
  const tokens = await AccessToken.find({ userId });

  const decryptedTokens = [];
  const dek = await getUserDek(uid);
  for (const token of tokens) {
    const decryptedAccessToken = await decryptValue(token.accessToken, dek);

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
    const accountsPromises = tokens.map(async (token) => {
      const response = await plaidClient.accountsGet({
        access_token: token.accessToken,
      });
      console.log(response.data);
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
  const response = await plaidClient.accountsGet({
    access_token: accessToken,
  });
  return response.data;
};

const getBalance = async (email) => {
  try {
    const tokens = await getUserAccessTokens(email);
    if (!tokens.length) return [];

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
  const response = await plaidClient.transactionsSync({
    access_token: accessToken,
  });
  return response.data;
};

const getInvestmentTransactionsWithAccessToken = async (accessToken) => {
  const response = await plaidClient.investmentsTransactionsGet({
    access_token: accessToken,
    start_date: "2021-01-01",
    end_date: new Date().toISOString().split("T")[0],
  });
  return response.data;
};

const getLoanLiabilitiesWithAccessToken = async (accessToken) => {
  const response = await plaidClient.liabilitiesGet({
    access_token: accessToken,
  });
  return response.data;
};

const getAccessTokenFromItemId = async (itemId, uid) => {
  const access = await AccessToken.findOne({ itemId });
  if (!access) {
    return;
  }
  const accessToken = access.accessToken;
  const dek = await getUserDek(uid);
  const decryptedToken = await decryptValue(accessToken, dek);
  return decryptedToken;
};

const updateTransactions = async (item) => {
  console.log("Updating transactions for item:", item);
  const accessInfo = await AccessToken.findOne({ itemId: item });
  if (!accessInfo) return;
  const userId = accessInfo.userId;
  const user = await User.findById(userId);
  if (!user) return;
  const uid = user?.authUid;
  const accessToken = await getAccessTokenFromItemId(item, uid);
  if (!accessToken) {
    //TODO: remove item
    return;
  }

  const accounts = await PlaidAccount.find({ itemId: item });

  if (!accounts.length) {
    //TODO: remove item
    return;
  }

  let newAccountsBalances;

  try {
    newAccountsBalances = await plaidClient.accountsGet({
      access_token: accessToken,
      // min_last_updated_datetime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching account balances:", error);
  }

  const emails = user?.email;

  const emailObject = emails?.find((email) => email.isPrimary === true);

  const email = emailObject?.email;
  const dek = await getUserDek(uid);

  if (newAccountsBalances) {
    const bulkOps = [];
    for (const account of newAccountsBalances.data.accounts) {
      const accountBalance = account.balances;
      const accountType = account.type;
      const accountSubtype = account.subtype;
      const accountName = account.name;
      const accountPlaidId = account.account_id;

      const existingAccount = accounts.find(
        (a) => a.plaid_account_id === accountPlaidId
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
          encryptValue(accountName, dek),
          encryptValue(accountType, dek),
          encryptValue(accountSubtype, dek),
          accountBalance.current
            ? encryptValue(accountBalance.current, dek)
            : null,
          accountBalance.available
            ? encryptValue(accountBalance.available, dek)
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

  let cursor = accounts[0].nextCursor || null;
  let hasMore = true;
  let transactionsByAccount = {};
  let oldCursor = cursor;
  let iterationCoounter = 0;
  const maxIterations = 10;

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

      console.log(
        `Fetched ${transactions.length} new, ${modifiedTransactions.length} modified, ${removedTransactions.length} removed transactions`
      );

      const accountMap = new Map();
      for (const account of accounts) {
        accountMap.set(account.plaid_account_id, account);
      }

      const bulkOps = [];
      for (let transaction of transactions) {
        if (!accountMap.has(transaction.account_id)) continue;

        const encryptedMerchantName = await encryptValue(
          transaction.merchant_name,
          dek
        );
        const encryptedName = await encryptValue(transaction.name, dek);
        const merchant = {
          merchantName: encryptedMerchantName,
          name: encryptedName,
          merchantCategory: transaction.category?.[0],
          website: transaction.website,
          logo: transaction.logo_url,
        };

        const encryptedAmount = await encryptValue(transaction.amount, dek);

        const encryptedAccountType = await encryptValue(
          accountMap.get(transaction.account_id).account_type,
          dek
        );

        const transactionCode = await encryptValue(
          transaction.transaction_code,
          dek
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
              },
            },
            upsert: true,
          },
        });

        if (!transactionsByAccount[transaction.account_id]) {
          transactionsByAccount[transaction.account_id] = [];
        }
        transactionsByAccount[transaction.account_id].push(
          transaction.transaction_id
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
          const encryptedAmount = await encryptValue(transaction.amount, dek);

          modifiedBulkOps.push({
            updateOne: {
              filter: { plaidTransactionId: transaction.transaction_id },
              update: {
                $set: {
                  amount: encryptedAmount,
                  transactionDate: transaction.date,
                  tags: transaction.category,
                  pending_transaction_id: transaction.pending_transaction_id,
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
          "Mutation detected during pagination, restarting with old cursor..."
        );
        cursor = oldCursor; // Reiniciar con el cursor anterior
      } else {
        console.error(
          "Error syncing transactions:",
          error.response?.data || error
        );
        break;
      }
    }
  }

  if (email) {
    const internalTransfers = await detectInternalTransfers(email, uid);

    for (const transactionId of internalTransfers) {
      const transaction = await Transaction.findOne({
        plaidTransactionId: transactionId,
      });
      if (!transaction) continue;
      transaction.isInternal = true;
      await transaction.save();
    }
  }
  console.log("Finished updating transactions");

  return transactionsByAccount;
};

const updateInvestmentTransactions = async (item) => {
  const accessInfo = await AccessToken.findOne({ itemId: item });
  if (!accessInfo) return;
  const userId = accessInfo.userId;
  const user = await User.findById(userId);
  if (!user) return;
  const uid = user?.authUid;
  const accessToken = await getAccessTokenFromItemId(item, uid);

  if (!accessToken) {
    return;
  }

  const savedToken = await AccessToken.findOne({
    itemId: item,
  });

  const emails = user?.email;

  const emailObject = emails?.find((email) => email.isPrimary === true);

  const email = emailObject?.email;
  const dek = await getUserDek(uid);

  const response = await plaidClient.investmentsTransactionsGet({
    access_token: accessToken,

    //TODO: enhance this
    start_date: "2021-01-01",
    end_date: new Date().toISOString().split("T")[0],
  });
  const transactions = response.data.investment_transactions;

  for (let transaction of transactions) {
    const existingTransaction = await Transaction.findOne({
      transaction_id: transaction.transaction_id,
    });
    if (existingTransaction) {
      continue;
    }
    const accountType = "investment";
    const encryptedAccountType = await encryptValue(accountType, dek);
    const encryptedName = await encryptValue(transaction.name, dek);
    const encryptedAmount = await encryptValue(transaction.amount, dek);

    const encryptedSecurityId = await encryptValue(
      transaction.security_id,
      dek
    );
    const encryptedPrice = await encryptValue(transaction.price, dek);

    const encryptedQuantity = await encryptValue(transaction.quantity, dek);

    const encryptedFees = await encryptValue(transaction.fees, dek);

    const encryptedType = await encryptValue(transaction.type, dek);

    const encryptedSubType = await encryptValue(transaction.subtype, dek);
    const newTransaction = new Transaction({
      plaidTransactionId: transaction.transaction_id,
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

  return transactions;
};

const updateLiabilities = async (item) => {
  const accessToken = await getAccessTokenFromItemId(item);
};

const getCurrentCashflow = async (email) => {
  const transactionsResponse = await getTransactions(email);
  const transactions = transactionsResponse.added;
  return transactions;
};

const detectInternalTransfers = async (email, uid) => {
  const transactions = await getTransactions(email, uid);

  const transfers = [];
  const groupedByAmount = new Map();

  transactions
    .filter((txn) =>
      ["transfer", "internal account transfer"].includes(
        txn.category?.[0]?.toLowerCase()
      )
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
            transfers.push(txn1.transaction_id);
          }
          if (!transfers.includes(txn2.transaction_id)) {
            transfers.push(txn2.transaction_id);
          }
        }
      }
    }
  });

  return transfers;
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
};

export default plaidService;
