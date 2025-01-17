import plaidService from "./plaid.service.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import User from "../database/models/User.js";
import Transaction from "../database/models/Transaction.js";

const addAccount = async (accessToken, email) => {
  const user = await User.findOne({
    "email.email": email,
  });
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user._id.toString();
  const userType = user.role;
  const accountsResponse = await plaidService.getAccounts(accessToken);
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
      balance: account.balances.current,
      currency: account.balances.iso_currency_code,
      transactions: [],
      nextCursor: null,
      mask: account.mask,
    });

    userAccounts.push(newAccount._id);
    const numAccounts = {
      banking: bankingAccounts,
      credit: creditAccounts,
      investment: investmentAccounts,
      loan: loanAccounts,
      other: otherAccounts,
    };

    user.numAccounts = numAccounts;

    await user.save();
    await newAccount.save();
  }

  const transactionsResponse = await plaidService.getTransactions(email);
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

  for (const accountId in transactionsByAccount) {
    const account = await PlaidAccount.findOne({ plaid_account_id: accountId });
    if (!account) continue;
    account.transactions = transactionsByAccount[accountId];
    account.nextCursor = nextCursor;
    await account.save();
  }

  return transactions;
};

const getAccounts = async (email) => {
  const user = await User.findOne({
    "email.email": email,
  })
    .populate("plaidAccounts")
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

const getCashFlows = async (email) => {
  const user = await User.findOne({
    "email.email": email,
  })
    .populate("plaidAccounts")
    .exec();
  if (!user) {
    throw new Error("User not found");
  }

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const allTransactions = [];
  let balanceCredit = 0;
  let balanceDebit = 0;

  for (const plaidAccount of user.plaidAccounts) {
    if (plaidAccount.account_type === "credit") {
      balanceCredit = balanceCredit += plaidAccount.balance * -1;
    } else if (plaidAccount.account_type === "depository") {
      balanceDebit = balanceDebit += plaidAccount.balance;
    }

    const transactions = await Transaction.find({
      plaidAccountId: plaidAccount.plaid_account_id,
      transactionDate: { $gte: ninetyDaysAgo },
    });

    allTransactions.push(...transactions);
  }

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

  const totalCashBalance = balanceCredit + balanceDebit;
  return {
    currentCashFlow,
    totalCashBalance,
  };
};

const accountsService = {
  addAccount,
  getAccounts,
  getCashFlows,
};

export default accountsService;
