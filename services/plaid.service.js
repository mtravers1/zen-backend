import AccessToken from "../database/models/AccessToken.js";
import User from "../database/models/User.js";
import plaidClient from "../config/plaid.js";
import Transaction from "../database/models/Transaction.js";
import PlaidAccount from "../database/models/PlaidAccount.js";

const plaidClientId = process.env.PLAID_CLIENT_ID_PROD;
const plaidSecret = process.env.PLAID_SECRET_PROD;
const webhookUrl = process.env.PLAID_WEBHOOK_URL;

const createLinkToken = async (email, isAndroid) => {
  const user = await User.findOne({
    "email.email": email,
  });
  if (!user) {
    throw new Error("User not found");
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
    products: ["auth"],
    required_if_supported_products: ["transactions"],
    hosted_link: {
      // is_mobile_app: true,
      completion_redirect_uri: "myapp://hosted-link-complete",
    },
  };
  const response = await plaidClient
    .linkTokenCreate(plaidRequest)
    .then((res) => res.data)
    .catch((err) => {
      console.log(err);
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

const saveAccessToken = async (email, accessToken, itemId, institutionId) => {
  const user = await User.findOne({
    "email.email": email,
  });
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user._id.toString();
  const existingToken = await AccessToken.findOne({ userId, institutionId });
  if (existingToken) {
    return existingToken;
  }
  const newToken = new AccessToken({
    userId,
    accessToken,
    itemId,
    institutionId,
  });
  await newToken.save();
  return newToken;
};

const getUserAccessTokens = async (email) => {
  const user = await User.findOne({
    "email.email": email,
  });
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user._id.toString();
  const tokens = await AccessToken.find({ userId });
  return tokens;
};

const getAccounts = async (email) => {
  try {
    const tokens = await getUserAccessTokens(email);
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
      const response = await plaidClient.accountsBalanceGet({
        access_token: token.accessToken,
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

const getTransactions = async (email) => {
  const tokens = await getUserAccessTokens(email);
  if (!tokens.length) return [];

  const transactionsPromises = tokens.map(async (token) => {
    const response = await plaidClient.transactionsSync({
      access_token: token.accessToken,
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

const updateTransactions = async (item) => {
  const access = await AccessToken.findOne({ itemId: item });
  if (!access) {
    console.log("Access token not found");
    return;
  }
  const accessToken = access.accessToken;
  const response = await plaidClient.transactionsSync({
    access_token: accessToken,
    count: 250,
  });
  const transactions = response.data.added;
  const nextCursor = response.data.next_cursor;

  const transactionsByAccount = {};

  for (let transaction of transactions) {
    const existingTransaction = await Transaction.findOne({
      transaction_id: transaction.transaction_id,
    });
    if (existingTransaction) continue;

    const merchant = {
      merchantName: transaction.merchant_name,
      name: transaction.name,
      merchantCategory: transaction.category?.[0],
      website: transaction.website,
      logo: transaction.logo_url,
    };

    const newTransaction = new Transaction({
      plaidTransactionId: transaction.transaction_id,
      plaidAccountId: transaction.account_id,
      transactionDate: transaction.date,
      amount: transaction.amount,
      currency: transaction.iso_currency_code,
      notes: null,
      merchant: merchant,
      description: null,
      transactionCode: transaction.transaction_code,
      tags: transaction.category,
    });

    await newTransaction.save();

    if (!transactionsByAccount[transaction.account_id]) {
      transactionsByAccount[transaction.account_id] = [];
    }

    transactionsByAccount[transaction.account_id].push(newTransaction._id);
  }

  for (const accountId in transactionsByAccount) {
    const account = await PlaidAccount.findOne({ plaid_account_id: accountId });
    if (!account) continue;
    account.transactions = transactionsByAccount[accountId];
    account.nextCursor = nextCursor;
    await account.save();
  }

  return transactions;
};

const getCurrentCashflow = async (email) => {
  const transactionsResponse = await getTransactions(email);
  const transactions = transactionsResponse.added;
  console.log(transactions);
  return transactions;
};

const detectInternalTransfers = async (email) => {
  const transactions = await getTransactions(email);

  const transfers = [];
  const groupedByAmount = new Map();

  transactions
    .filter((txn) =>
      ["transfer", "internal account transfer", "payroll"].includes(
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
};

export default plaidService;
