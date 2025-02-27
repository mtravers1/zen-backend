import plaidService from "./plaid.service.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import User from "../database/models/User.js";
import Transaction from "../database/models/Transaction.js";
import businessService from "./businesses.service.js";
import { Storage } from "@google-cloud/storage";

const storage = new Storage({
  keyFilename: "./config/zentavos-d6c79-24978c4e7fff.json",
});
const bucketName = "zentavos-bucket";

const addAccount = async (accessToken, email) => {
  const user = await User.findOne({
    "email.email": email,
  });
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user._id.toString();
  const userType = user.role;
  const accountsResponse = await plaidService.getAccountsWithAccessToken(
    accessToken
  );
  const accounts = accountsResponse.accounts;
  const institutionId = accountsResponse.item.institution_id;
  const institutionName = accountsResponse.item.institution_name;

  const userAccounts = user.plaidAccounts;
  let bankingAccounts = 0;
  let creditAccounts = 0;
  let investmentAccounts = 0;
  let loanAccounts = 0;
  let otherAccounts = 0;

  for (let account of accounts) {
    const existingAccount = await PlaidAccount.findOne({
      plaid_account_id: account.account_id,
    });

    if (existingAccount) continue;

    if (account.type === "depository") {
      bankingAccounts++;
    } else if (account.type === "credit") {
      creditAccounts++;
    } else if (account.type === "loan") {
      loanAccounts++;
    } else if (account.type === "investment") {
      investmentAccounts++;
    } else {
      otherAccounts++;
    }
    const newAccount = new PlaidAccount({
      owner_id: userId,
      owner_type: userType,
      plaid_account_id: account.account_id,
      account_name: account.name,
      account_type: account.type,
      account_subtype: account.subtype,
      institution_name: institutionName,
      institution_id: institutionId,
      image_url: account.institution_name,
      currentBalance: account.balances.current,
      availableBalance: account.balances.available,
      currency: account.balances.iso_currency_code,
      transactions: [],
      nextCursor: null,
      mask: account.mask,
    });

    userAccounts.push(newAccount._id);

    await user.save();
    await newAccount.save();
  }

  const transactionsResponse =
    await plaidService.getTransactionsWithAccessToken(accessToken);
  const nextCursor = transactionsResponse.next_cursor;
  const transactions = transactionsResponse.added;

  const transactionsByAccount = {};

  for (const transaction of transactions) {
    const existingTransaction = await Transaction.findOne({
      plaidTransactionId: transaction.transaction_id,
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

  const internalTransfers = await plaidService.detectInternalTransfers(email);

  for (const transactionId of internalTransfers) {
    const transaction = await Transaction.findOne({
      plaidTransactionId: transactionId,
    });
    if (!transaction) continue;
    transaction.isInternal = true;
    await transaction.save();
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

const getAccounts = async (profile) => {
  const plaidIds = profile.plaidAccounts;
  const plaidAccounts = await PlaidAccount.find({
    _id: { $in: plaidIds },
  }).lean();

  const depositoryAccounts = plaidAccounts.filter(
    (account) => account.account_type === "depository"
  );
  const creditAccounts = plaidAccounts.filter(
    (account) => account.account_type === "credit"
  );
  const investmentAccounts = plaidAccounts.filter(
    (account) => account.account_type === "investment"
  );
  const loanAccounts = plaidAccounts.filter(
    (account) => account.account_type === "loan"
  );
  const otherAccounts = plaidAccounts.filter(
    (account) => account.account_type === "other"
  );

  return {
    depositoryAccounts,
    creditAccounts,
    investmentAccounts,
    loanAccounts,
    otherAccounts,
  };
};

const getAllUserAccounts = async (email) => {
  const user = await User.findOne({
    "email.email": email,
  })
    .populate("plaidAccounts", "-transactions")
    .exec();
  if (!user) {
    throw new Error("User not found");
  }

  if (!user.plaidAccounts.length) {
    return [];
  }

  const accounts = user.plaidAccounts;

  return accounts;
};

const getCashFlows = async (profile) => {
  const plaidIds = profile.plaidAccounts;
  const plaidAccounts = await PlaidAccount.find({
    _id: { $in: plaidIds },
  }).exec();

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const allTransactions = [];
  let balanceCredit = 0;
  let balanceDebit = 0;
  let balanceInvestment = 0;
  let balanceLoan = 0;
  const depositoryTransactions = [];
  const creditTransactions = [];
  const investmentTransactions = [];
  const loanTransactions = [];

  for (const plaidAccount of plaidAccounts) {
    if (plaidAccount.account_type === "credit") {
      balanceCredit = balanceCredit += plaidAccount.currentBalance * -1;
    } else if (plaidAccount.account_type === "depository") {
      balanceDebit = balanceDebit += plaidAccount.currentBalance;
    } else if (plaidAccount.account_type === "investment") {
      if (
        plaidAccount.account_subtype === "brokerage" ||
        plaidAccount.account_subtype === "isa" ||
        plaidAccount.account_subtype === "crypto exchange" ||
        plaidAccount.account_subtype === "fixed annuity" ||
        plaidAccount.account_subtype === "non-custodial wallet" ||
        plaidAccount.account_subtype === "non-taxable brokerage account" ||
        plaidAccount.account_subtype === "retirement" ||
        plaidAccount.account_subtype === "trust"
      ) {
        balanceInvestment = balanceInvestment += plaidAccount.currentBalance;
      }
    } else if (plaidAccount.account_type === "loan") {
      balanceLoan = balanceLoan += plaidAccount.currentBalance * -1;
    }

    const transactions = await Transaction.find({
      plaidAccountId: plaidAccount.plaid_account_id,
      transactionDate: { $gte: ninetyDaysAgo },
      isInternal: false,
    })
      .sort({ transactionDate: 1 })
      .lean();

    allTransactions.push(...transactions);
    depositoryTransactions.push(
      ...transactions.filter(
        (transaction) => plaidAccount.account_type === "depository"
      )
    );
    creditTransactions.push(
      ...transactions.filter(
        (transaction) => plaidAccount.account_type === "credit"
      )
    );
    investmentTransactions.push(
      ...transactions.filter(
        (transaction) => plaidAccount.account_type === "investment"
      )
    );
    loanTransactions.push(
      ...transactions.filter(
        (transaction) => plaidAccount.account_type === "loan"
      )
    );
  }

  /// Calculate current cash flow

  const deposits = allTransactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((total, transaction) => total + transaction.amount, 0);

  const withdrawals = allTransactions
    .filter((transaction) => transaction.amount < 0)
    .reduce((total, transaction) => total + transaction.amount, 0);

  let currentCashFlow = 0;
  if (deposits !== 0 || withdrawals !== 0) {
    currentCashFlow = ((deposits + withdrawals) / deposits).toFixed(2);
  } else {
    currentCashFlow = 0;
  }

  /// Calculate average daily spend

  let averageDailySpend = 0;

  const creditWithdrawals = creditTransactions
    .filter((transaction) => transaction.amount < 0)
    .reduce((total, transaction) => total + transaction.amount, 0);
  const depositWithdrawals = depositoryTransactions
    .filter((transaction) => transaction.amount < 0)
    .reduce((total, transaction) => total + transaction.amount, 0);

  const oldestCreditTransactionDate =
    creditTransactions[0]?.transactionDate || null;
  const oldestDepositTransactionDate =
    depositoryTransactions[0]?.transactionDate || null;

  let oldestTransactionDate = null;

  if (oldestCreditTransactionDate && oldestDepositTransactionDate) {
    oldestTransactionDate =
      oldestDepositTransactionDate < oldestCreditTransactionDate
        ? oldestDepositTransactionDate
        : oldestCreditTransactionDate;
  } else if (oldestCreditTransactionDate) {
    oldestTransactionDate = oldestCreditTransactionDate;
  } else if (oldestDepositTransactionDate) {
    oldestTransactionDate = oldestDepositTransactionDate;
  }

  if (oldestTransactionDate) {
    const today = new Date();
    const days = Math.ceil(
      (today - oldestTransactionDate) / (1000 * 60 * 60 * 24)
    );

    const totalWithdrawals = creditWithdrawals + depositWithdrawals;
    averageDailySpend = ((totalWithdrawals / days) * -1).toFixed(2);
  }

  /// Calculate average daily income

  let averageDailyIncome = 0;

  const depositDeposits = depositoryTransactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((total, transaction) => total + transaction.amount, 0);

  const oldestDepositDepositDate =
    depositoryTransactions[0]?.transactionDate || null;

  let oldestDepositDate = null;

  if (oldestDepositDepositDate) {
    oldestDepositDate = oldestDepositDepositDate;
  }

  if (oldestDepositDate) {
    const today = new Date();
    const days = Math.ceil((today - oldestDepositDate) / (1000 * 60 * 60 * 24));

    const totalDeposits = depositDeposits;
    averageDailyIncome = (totalDeposits / days).toFixed(2);
  }

  /// Calculate total cash balance

  const totalCashBalance = balanceCredit + balanceDebit;

  /// Calculate net worth
  // (bank accounts + investments accounts + assets - credit accounts - loan accounts)
  //TODO: Add assets

  const netWorth =
    balanceDebit + balanceInvestment - balanceCredit - balanceLoan;

  /// Calculate cash runway
  let cashRunway = null;
  let advice = null;

  if (currentCashFlow < 0) {
    cashRunway = Math.floor(
      (totalCashBalance / (averageDailyIncome - averageDailySpend)) * -1
    );
    advice =
      Math.ceil(((averageDailySpend - averageDailyIncome) * 1.05) / 10) * 10;
  }

  return {
    currentCashFlow,
    totalCashBalance,
    averageDailySpend,
    averageDailyIncome,
    netWorth,
    cashRunway,
    advice,
  };
};

const getUserTransactions = async (email, page = 1, limit = 10) => {
  const user = await User.findOne({ "email.email": email })
    .populate("plaidAccounts")
    .exec();

  if (!user) {
    throw new Error("User not found");
  }

  let totalTransactions = 0;
  const allTransactions = [];

  for (const plaidAccount of user.plaidAccounts) {
    totalTransactions += await Transaction.countDocuments({
      plaidAccountId: plaidAccount.plaid_account_id,
    });

    const transactions = await Transaction.find({
      plaidAccountId: plaidAccount.plaid_account_id,
    })
      .sort({ transactionDate: -1 })
      .lean();

    transactions.forEach((transaction) => {
      transaction.institutionName = plaidAccount.institution_name;
      transaction.institutionId = plaidAccount.institution_id;
    });

    allTransactions.push(...transactions);
  }

  return allTransactions;
};

const getTransactionsByAccount = async (accountId) => {
  const account = await PlaidAccount.findOne({ plaid_account_id: accountId })
    .populate("transactions")
    .lean()
    .exec();

  if (!account) {
    throw new Error("Account not found");
  }

  account.transactions.forEach((transaction) => {
    transaction.institutionName = account.institution_name;
    transaction.institutionId = account.institution_id;
  });

  return account.transactions;
};

const generateUploadUrl = async (fileName) => {
  try {
    const [url] = await storage
      .bucket(bucketName)
      .file(fileName)
      .getSignedUrl({
        action: "write",
        expires: Date.now() + 15 * 60 * 1000,
        contentType: "image/jpeg",
      });
    return url;
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return null;
  }
};

const generateSignedUrl = async (fileName) => {
  try {
    const options = {
      version: "v4",
      action: "read",
      expires: Date.now() + 60 * 60 * 1000,
    };

    const [url] = await storage
      .bucket(bucketName)
      .file(fileName)
      .getSignedUrl(options);

    return url;
  } catch (error) {
    console.error("Error generating signed URL:", error);
    return null;
  }
};

const accountsService = {
  addAccount,
  getAccounts,
  getCashFlows,
  getUserTransactions,
  getTransactionsByAccount,
  getAllUserAccounts,
  generateUploadUrl,
  generateSignedUrl,
};

export default accountsService;
