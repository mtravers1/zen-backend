import plaidService from "./plaid.service.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import User from "../database/models/User.js";
import Transaction from "../database/models/Transaction.js";
import businessService from "./businesses.service.js";
import { Storage } from "@google-cloud/storage";
import { get } from "mongoose";
import businessService from "./businesses.service.js";
import Liability from "../database/models/Liability.js";

const storage = new Storage({
  credentials: {
    type: "service_account",
    project_id: "zentavos-d6c79",
    private_key_id: "24978c4e7ffff262c73c88f0a625e74dfa1f8dbd",
    private_key:
      "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCWnQNWbrHeEEwX\nLYRgr8iPwqIIrYoQ446/dR/hMPPetXtt5cJfMmPVLV2PQmpZU016r9txVT4bDtLJ\n0aLc6C0BecyyoFlXak66dloz5LSKogkt1DCwQmRKoeDK5ZB3NcYqemFj+csF86Qw\nVHi1agu/dLyp2kYpC7j4VOzhK/fsoOtNDPOkRn5ozFVID37dSmlfC2LJJ71h26S2\n7hOd0bmMtM1f7q8nNOkHAm/Us1SYd7oqgD0uh5F+re6pQJRDB/pz3xtiOOFqFjPi\n1t6gr4HlBkKZIPtLF916x+Pd7MVyk6xP0zNU63GDhvZCDajftZPNYSOG3p1EVBtA\nRhpsYNd7AgMBAAECggEAAc2BOm89k5JYJ4pxbvanT7an4YSO+LPXIPLm9hJkP2yW\n8vkO5H5qzk9ep3QYtZFGnTaNcHVWZRqq+Cw0dJ1zfQ/1NBVbxpW8LfXRVVcp/f5i\njK5Rxfav5jvhlV8LjF8SBniXWOUi7xtoz692yjtIyq7yV5VV0PRKUIscxutwu8Dc\nF0KeePndfKbDnNk6rGD0FLJkyk6inoXuOtYJJiq0xhzetMYyG1nUoGlwKx9dZAMz\nPa/yCCY3uFu4GGzMQVO54kfms0qdo8q35kIAyG6Nhqu/MrmrEGdIvN12g6mbyPXj\nOGsSFaSDMpsTQWjylr+lCJCFjzu63gVax9UO7ucAgQKBgQDH0+HLD45xDZrNX4Dz\nFjGjOMBTJKKGsxM06xx66Gk9gCEPS7LCGzLTT12AZ+ybxvPizpiXMcLSD2eROnUy\n1VxgyjX6qwbDxKyiGb1fJ5LJwUH1g03h02C3xpPxTpJYpZjszZuuvkTVvncdI2BJ\nFgzbaGAFOceUSY3yfQS4K4CMgQKBgQDA84oxcL6+l5wIJqn3hrhrsoChfnxRRJhM\nBgUONjWeT3nY2M55ohbUgJB3wlUxcaXd5yUjTwA8MYGVIH72G7VwxKJ7vQVwQIxJ\nrOhD9eoncfn5QfHnfQLgzkUcN6Tu91fqbCcbDd6cBJnLiqvuQ3LxrKoINEq/hhyI\neE6ta5CV+wKBgFtbSR1W7V5OQ/mksgVwnhzrMzJPy2YdtKg63PhsDMErNPITP5Ry\nbtggrrSnzoqheJq2rRhijZkPpd/FhBNLbEJr8CW7zwntfqdVcThxlTBcBFXEQ/T8\neHlMdhKaQ1n3y2Rn08ceAcZen4JYzApd5F7i5xM8iTwILLcx5Nh2Ov0BAoGBAKsw\nJ75/miv81OmCbC/5LewXPfqJ/wAXTMu+V4PpYp7nQmK60E2oGntE6WfnWbB5dUCw\nUAnIkJvXDHHjl+EAanT3cHU6GfYivpSrPJL3PlzqyW51LItGJWSQfU5wq/t8JVsN\nw5BEOOnRRyYIDUxiOTvkBiMrSdoswWnu21cPZQM7AoGACLcQoJgRAPQ0RKFYoghq\nEWz0rd+opwsfCzGNdti74GQ9LCdGC+8yPld3UjV+eQhRbgWao+D8yKNvLlKoq+5c\nYGURUsKdSShWy2sTM1rvtGQim90lJHfGel29xxjDY69jvyDS/sZQ4Gbz3QosF/Qj\nmLKxxwRvKbzZCjUO/LU2l9U=\n-----END PRIVATE KEY-----\n",
    client_email: "storage-admin@zentavos-d6c79.iam.gserviceaccount.com",
    client_id: "117489984613438292578",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url:
      "https://www.googleapis.com/robot/v1/metadata/x509/storage-admin%40zentavos-d6c79.iam.gserviceaccount.com",
    universe_domain: "googleapis.com",
  },
});
const bucketName = "zentavos-bucket";

const addAccount = async (accessToken, email) => {
  const user = await User.findOne({
    "email.email": email.toLowerCase(),
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
  let savedAccounts = [];
  const accountTypes = {};

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

    if (!accountTypes[account.type])
      accountTypes[account.account_id] = account.type;

    userAccounts.push(newAccount._id);

    await user.save();
    await newAccount.save();
    savedAccounts.push(newAccount);
  }
  let transactionsResponse;
  let investmentTransactionsResponse;
  let liabilitiesResponse;
  if (accountsResponse.item.products.includes("transactions")) {
    transactionsResponse = await plaidService.getTransactionsWithAccessToken(
      accessToken
    );
  }

  if (accountsResponse.item.products.includes("investments")) {
    investmentTransactionsResponse =
      await plaidService.getInvestmentTransactionsWithAccessToken(accessToken);
  }

  if (accountsResponse.item.products.includes("liabilities")) {
    liabilitiesResponse = await plaidService.getLoanLiabilitiesWithAccessToken(
      accessToken
    );
  }

  const nextCursor = transactionsResponse
    ? transactionsResponse.next_cursor
    : null;
  const transactions = transactionsResponse ? transactionsResponse.added : [];
  const investmentTransactions = investmentTransactionsResponse
    ? investmentTransactionsResponse.investment_transactions
    : [];

  const transactionsByAccount = {};

  for (const transaction of transactions) {
    const existingTransaction = await Transaction.findOne({
      plaidTransactionId: transaction.transaction_id,
    });

    if (existingTransaction) continue;

    const accountType = accountTypes[transaction.account_id];

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
      accountType,
    });

    await newTransaction.save();

    if (!transactionsByAccount[transaction.account_id]) {
      transactionsByAccount[transaction.account_id] = [];
    }

    transactionsByAccount[transaction.account_id].push(newTransaction._id);
  }

  for (const transaction of investmentTransactions) {
    const existingTransaction = await Transaction.findOne({
      plaidTransactionId: transaction.investment_transaction_id,
    });

    if (existingTransaction) continue;

    const accountType = accountTypes[transaction.account_id];

    const newTransaction = new Transaction({
      plaidTransactionId: transaction.investment_transaction_id,
      plaidAccountId: transaction.account_id,
      transactionDate: transaction.date,
      amount: transaction.amount,
      currency: transaction.iso_currency_code,
      isInvestment: true,
      name: transaction.name,
      fees: transaction.fees,
      price: transaction.price,
      quantity: transaction.quantity,
      securityId: transaction.security_id,
      type: transaction.type,
      subtype: transaction.subtype,
      accountType,
    });

    await newTransaction.save();

    if (!transactionsByAccount[transaction.account_id]) {
      transactionsByAccount[transaction.account_id] = [];
    }

    transactionsByAccount[transaction.account_id].push(newTransaction._id);
  }

  Object.entries(liabilitiesResponse.liabilities).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(async (item) => {
        const liability = new Liability({
          liabilityType: key,
          accountId: item.account_id,
          accountNumber: item.account_number,
          lastPaymentAmount: item.last_payment_amount,
          lastPaymentDate: item.last_payment_date,
          nextPaymentDueDate: item.next_payment_due_date,
          minimumPaymentAmount: item.minimum_payment_amount,
          lastStatementBalance: item.last_statement_balance,
          lastStatementIssueDate: item.last_statement_issue_date,
          isOverdue: item.is_overdue,

          // Credit-specific fields
          aprs: item.aprs,

          // Mortgage-specific fields
          loanTypeDescription: item.loan_type_description,
          loanTerm: item.loan_term,
          maturityDate: item.maturity_date,
          nextMonthlyPayment: item.next_monthly_payment,
          originationDate: item.origination_date,
          originationPrincipalAmount: item.origination_principal_amount,
          pastDueAmount: item.past_due_amount,
          escrowBalance: item.escrow_balance,
          hasPmi: item.has_pmi,
          hasPrepaymentPenalty: item.has_prepayment_penalty,
          propertyAddress: item.property_address,
          interestRate: item.interest_rate,

          // Student-specific fields
          disbursementDates: item.disbursement_dates,
          expectedPayoffDate: item.expected_payoff_date,
          guarantor: item.guarantor,
          interestRatePercentage: item.interest_rate_percentage,
          loanName: item.loan_name,

          // Loan status
          loanStatus: item.loan_status,
          outstandingInterestAmount: item.outstanding_interest_amount,
          paymentReferenceNumber: item.payment_reference_number,
          pslfStatus: item.pslf_status,
          repaymentPlan: item.repayment_plan,
          sequenceNumber: item.sequence_number,
          servicerAddress: item.servicer_address,
          ytdInterestPaid: item.ytd_interest_paid,
          ytdPrincipalPaid: item.ytd_principal_paid,
        });

        await liability.save();
      });
    }
  });

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
    "email.email": email.toLowerCase(),
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
    balanceDebit + balanceAvailableInvestment - balanceCredit - balanceLoan;

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

const getTransactions = async (accounts) => {
  const allTransactions = [];

  for (const plaidAccount of accounts) {
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

  const sortedTransactions = allTransactions.sort(
    (a, b) => new Date(b.transactionDate) - new Date(a.transactionDate)
  );

  return sortedTransactions;
};

const getUserTransactions = async (email) => {
  const user = await User.findOne({ "email.email": email.toLowerCase() })
    .populate("plaidAccounts")
    .exec();

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.plaidAccounts.length) {
    return [];
  }

  const accounts = user.plaidAccounts;

  return getTransactions(accounts);
};

const getProfileTransactions = async (email, profileId) => {
  const profiles = await businessService.getUserProfiles(email);
  const profile = profiles.find((p) => String(p.id) === profileId);
  if (!profile) {
    throw new Error("Profile not found");
  }
  const plaidIds = profile.plaidAccounts;
  const plaidAccounts = await PlaidAccount.find({
    _id: { $in: plaidIds },
  }).exec();

  return await getTransactions(plaidAccounts);
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
  getProfileTransactions,
};

export default accountsService;
