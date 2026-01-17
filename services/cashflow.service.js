import plaidService from "./plaid.service.js";
import transactionsService from './transactions.service.js';
import PlaidAccount from "../database/models/PlaidAccount.js";
import User from "../database/models/User.js";
import Transaction from "../database/models/Transaction.js";
import { getUserDek } from "../database/encryption.js";
import { createSafeDecrypt, safeDecryptNumericValue } from "../lib/encryptionHelper.js";
import structuredLogger from "../lib/structuredLogger.js";
import { formatTransactionAmount } from "./transactions.service.js";
import {
  calculateWeeklyTotals,
  groupByWeek,
} from "./utils/accounts.js";
import assetsService from "./assets.service.js";
import Liability from "../database/models/Liability.js";
import { getDecryptedLiabilitiesCredit } from "../lib/encryptionHelper.js";

const applyCashflowFormatting = (transaction) => {
  // We expect transactions here to be already formatted for the transaction list,
  // meaning depository (including CD/MM) deposits are positive.
  // For cashflow, investment-like deposits (CD/MM/Investment) are outflows, so they should be negative.
  if (
    (transaction.accountType === "depository" && transaction.accountSubtype === "cd") ||
    (transaction.accountType === "depository" && transaction.accountSubtype === "money market") ||
    transaction.accountType === "investment"
  ) {
    // If it's a deposit (positive) in the transaction list, make it negative for cashflow.
    // If it's a withdrawal (negative) in the transaction list, make it positive for cashflow.
    transaction.amount = transaction.amount * -1;
  }
  return transaction;
};



const getCashFlows = async (profile, uid) => {
  return await structuredLogger.withContext(
    "get_cash_flows",
    { uid, profile_id: profile.id },
    async () => {
      // Get all pre-formatted transactions from transactionsService
      const allTransactionsFromService = await transactionsService.getProfileTransactions(profile, uid);

      // Apply cashflow-specific formatting
      const allTransactions = allTransactionsFromService.map(applyCashflowFormatting);

      // Re-populate plaidAccounts (needed for balance calculations)
      const plaidIds = profile.plaidAccounts;
      const plaidAccountsResponse = await PlaidAccount.find({
        _id: { $in: plaidIds },
      }).lean();

      const dek = await getUserDek(uid);
      const safeDecrypt = createSafeDecrypt(uid, dek);

      let plaidAccounts = [];
      for (const plaidAccount of plaidAccountsResponse) {
        const decryptedCurrentBalance = await safeDecrypt(
          plaidAccount.currentBalance,
          { account_id: plaidAccount._id, field: "currentBalance" },
        );
        const decryptedAvailableBalance = await safeDecrypt(
          plaidAccount.availableBalance,
          { account_id: plaidAccount._id, field: "availableBalance" },
        );
        const decryptedAccountType = await safeDecrypt(
          plaidAccount.account_type,
          { account_id: plaidAccount._id, field: "account_type" },
        );
        const decryptedAccountSubtype = await safeDecrypt(
          plaidAccount.account_subtype,
          { account_id: plaidAccount._id, field: "account_subtype" },
        );
        plaidAccounts.push({
          ...plaidAccount,
          currentBalance: parseFloat(decryptedCurrentBalance),
          availableBalance: parseFloat(decryptedAvailableBalance),
          account_type: decryptedAccountType,
          account_subtype: decryptedAccountSubtype,
        });
      }

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      let balanceCredit = 0;
      let balanceDebit = 0;
      let balanceCurrentInvestment = 0;
      let balanceAvailableInvestment = 0;
      let allInvestmentsCurrentBalance = 0;
      let balanceLoan = 0;

      for (const plaidAccount of plaidAccounts) {
        const currentBalance = Number(plaidAccount.currentBalance) || 0;
        const availableBalance = Number(plaidAccount.availableBalance) || 0;
        if (
          plaidAccount.account_type === "credit" &&
          plaidAccount.currentBalance
        ) {
          balanceCredit = balanceCredit += currentBalance;
        } else if (plaidAccount.account_type === "depository") {
          if (plaidAccount.availableBalance) {
            balanceDebit = balanceDebit += availableBalance;
          } else if (plaidAccount.currentBalance) {
            balanceDebit = balanceDebit += currentBalance;
          }
        } else if (plaidAccount.account_type === "investment") {
          if (plaidAccount.currentBalance) {
            allInvestmentsCurrentBalance = allInvestmentsCurrentBalance +=
              currentBalance;
          }
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
            if (plaidAccount.currentBalance) {
              balanceCurrentInvestment = balanceCurrentInvestment +=
                currentBalance;
            }
            if (plaidAccount.availableBalance) {
              balanceAvailableInvestment = balanceAvailableInvestment +=
                availableBalance;
            }
          }
        } else if (
          plaidAccount.account_type === "loan" &&
          plaidAccount.currentBalance
        ) {
          balanceLoan = balanceLoan += currentBalance;
        }
      }

      const depositoryTransactions = allTransactions.filter(
        (txn) => txn.accountType === "depository" && txn.accountSubtype !== "cd" && txn.accountSubtype !== "money market",
      );
      const creditTransactions = allTransactions.filter(
        (txn) => txn.accountType === "credit",
      );
      const investmentTransactions = allTransactions.filter(
        (txn) => txn.accountType === "investment" || txn.accountSubtype === "cd" || txn.accountSubtype === "money market",
      );
      const loanTransactions = allTransactions.filter(
        (txn) => txn.accountType === "loan",
      );

      const internalTxns = allTransactions.filter((txn) => txn.isInternal);

      const txnMap = new Map(internalTxns.map((txn) => [String(txn._id), txn]));

      const toRemove = new Set();

      internalTxns.forEach((txn) => {
        const refId = txn.internalReference?.toString();
        if (refId && txnMap.has(refId)) {
          toRemove.add(String(txn._id));
          toRemove.add(refId);
        }
      });

      const filteredTxns = internalTxns.filter(
        (txn) => !toRemove.has(String(txn._id)),
      );

      const filteredOutIds = new Set(
        filteredTxns.map((txn) => String(txn._id)),
      );

      const cleanDepositoryTxns = depositoryTransactions.filter(
        (txn) => !filteredOutIds.has(String(txn._id)),
      );

      const cleanCreditTxns = creditTransactions.filter(
        (txn) => !filteredOutIds.has(String(txn._id)),
      );

      const cleanInvestmentTxns = investmentTransactions.filter(
        (txn) => !filteredOutIds.has(String(txn._id)),
      );

      const cleanLoanTxns = loanTransactions.filter(
        (txn) => !filteredOutIds.has(String(txn._id)),
      );

      const depositoryDepositsAmount = cleanDepositoryTxns
        .filter((transaction) => transaction.amount > 0)
        .reduce((total, transaction) => total + transaction.amount, 0);

      const depositoryWithdrawsAmount = cleanDepositoryTxns
        .filter((transaction) => transaction.amount < 0)
        .reduce((total, transaction) => total + transaction.amount, 0);

      const creditDepositsAmount = cleanCreditTxns
        .filter((transaction) => transaction.amount < 0)
        .reduce((total, transaction) => total + transaction.amount, 0);

      const creditWithdrawsAmount = cleanCreditTxns
        .filter((transaction) => transaction.amount > 0)
        .reduce((total, transaction) => total + transaction.amount, 0);

      const depositoryDepositTransactions = cleanDepositoryTxns.filter(
        (transaction) => transaction.amount > 0,
      );
      const depositoryWithdrawTransactions = cleanDepositoryTxns.filter(
        (transaction) => transaction.amount < 0,
      );
      const creditDepositTransactions = cleanCreditTxns.filter(
        (transaction) => transaction.amount < 0,
      );
      const creditWithdrawTransactions = cleanCreditTxns.filter(
        (transaction) => transaction.amount > 0,
      );

      /// Calculate current cash flow

      const depositDepositsAmountAbs = depositoryDepositsAmount;
      const depositWithdrawAmountAbs = Math.abs(depositoryWithdrawsAmount);
      const creditDepositsAmountAbs = Math.abs(creditDepositsAmount);
      const creditWithdrawAmountAbs = creditWithdrawsAmount;

      const totalDeposits = depositDepositsAmountAbs + creditDepositsAmountAbs;
      const totalWithdrawls =
        depositWithdrawAmountAbs + creditWithdrawAmountAbs;

      let currentCashFlow = 0;
      if (totalDeposits === 0) {
        currentCashFlow = -999;
      } else if (totalDeposits === 0 && totalWithdrawls === 0) {
        currentCashFlow = 0;
      } else {
        currentCashFlow = (
          (totalDeposits - totalWithdrawls) /
          totalDeposits
        ).toFixed(2);
      }
      if (totalDeposits !== 0) {
        currentCashFlow = currentCashFlow * 100;
      }

      /// Calculate average daily spend

      let averageDailySpend = 0;

      const oldestCreditWithdrawDate =
        creditWithdrawTransactions[0]?.transactionDate || null;
      const oldestDepositWithdrawDate =
        depositoryWithdrawTransactions[0]?.transactionDate || null;

      let oldestWithdrawDate = null;

      if (oldestCreditWithdrawDate && oldestDepositWithdrawDate) {
        oldestWithdrawDate =
          oldestDepositWithdrawDate < oldestCreditWithdrawDate
            ? oldestDepositWithdrawDate
            : oldestCreditWithdrawDate;
      } else if (oldestCreditWithdrawDate) {
        oldestWithdrawDate = oldestCreditWithdrawDate;
      } else if (oldestDepositWithdrawDate) {
        oldestWithdrawDate = oldestDepositWithdrawDate;
      }

      if (oldestWithdrawDate) {
        const today = new Date();
        // const days = Math.ceil(
        //   (today - oldestWithdrawDate) / (1000 * 60 * 60 * 24)
        // );

        const totalWithdrawals =
          creditWithdrawsAmount + depositoryWithdrawsAmount;
        averageDailySpend = Math.abs((totalWithdrawals / 90) * -1).toFixed(2);
      }

      /// Calculate average daily income

      let averageDailyIncome = 0;

      const oldestCreditDepositDate =
        creditDepositTransactions[0]?.transactionDate || null;
      const oldestDepositoryDepositDate =
        depositoryDepositTransactions[0]?.transactionDate || null;

      let oldestDepositDate = null;

      if (oldestCreditDepositDate && oldestDepositoryDepositDate) {
        oldestDepositDate =
          oldestDepositoryDepositDate < oldestCreditDepositDate
            ? oldestDepositoryDepositDate
            : oldestCreditDepositDate;
      } else if (oldestCreditDepositDate) {
        oldestDepositDate = oldestCreditDepositDate;
      } else if (oldestDepositoryDepositDate) {
        oldestDepositDate = oldestDepositoryDepositDate;
      }

      if (oldestDepositDate) {
        // const today = new Date();
        // const days = Math.ceil((today - oldestDepositDate) / (1000 * 60 * 60 * 24));
        const totalDeposits = depositoryDepositsAmount + creditDepositsAmount;
        averageDailyIncome = Math.abs(totalDeposits / 90).toFixed(2);
      }

      /// Calculate total cash balance

      const unroundedTotalCashBalance = plaidAccounts
        .filter(acc => (acc.account_type === 'depository' && acc.account_subtype !== 'cd'))
        .reduce((total, acc) => total + (acc.availableBalance || acc.currentBalance || 0), 0);
      const totalCashBalance = parseFloat(unroundedTotalCashBalance.toFixed(2));

      /// Calculate net worth
      // (bank accounts + investments accounts + assets - credit accounts - loan accounts)

      const assets = await assetsService.getAssets(uid);
      const profileAssets = assets.filter(
        (asset) => asset.profileId === profile.id.toString(),
      );
      let totalAssets = 0;
      for (const asset of profileAssets) {
        const cleanBasis = String(asset.basis).replace(/,/g, "");
        totalAssets += Number(cleanBasis) || 0;
      }

      const netWorth =
        balanceDebit +
        allInvestmentsCurrentBalance +
        totalAssets -
        balanceCredit -
        balanceLoan;
      /// Calculate cash runway
      let cashRunway = null;
      let advice = null;

      if (currentCashFlow < 0) {
        cashRunway = Math.floor(
          (totalCashBalance / (averageDailyIncome - averageDailySpend)) * -1,
        );
        advice =
          Math.ceil(((averageDailySpend - averageDailyIncome) * 1.05) / 10) *
          10;
      }

      // average daily net
      const averageDailyNet = averageDailyIncome - averageDailySpend;

      // weekly cash flow

      const formattedAllTransactions = formatTransactionsWithSigns(allTransactions);
      const weeklyCashFlow = calculateWeeklyTotals(groupByWeek(formattedAllTransactions));

      structuredLogger.logSuccess("get_cash_flows_completed", {
        uid,
        profile_id: profile.id,
        current_cash_flow: currentCashFlow,
        total_cash_balance: totalCashBalance,
        net_worth: netWorth,
        cash_runway: cashRunway,
      });

      return {
        currentCashFlow,
        totalCashBalance,
        averageDailySpend,
        averageDailyIncome,
        netWorth,
        cashRunway,
        advice,
        averageDailyNet,
        weeklyCashFlow,
      };
    },
  );
};

const getCashFlowsWeekly = async (profile, uid) => {
  const plaidIds = profile.plaidAccounts;
  const plaidAccountsResponse = await PlaidAccount.find({
    _id: { $in: plaidIds },
  }).lean();

  let plaidAccounts = [];

  const dek = await getUserDek(uid);
  const safeDecrypt = createSafeDecrypt(uid, dek);
  for (const plaidAccount of plaidAccountsResponse) {
    const decryptedAccountType = await safeDecrypt(
      plaidAccount.account_type,
      { context: { accountId: plaidAccount._id, field: 'account_type' } },
    );
    const decryptedAccountSubtype = await safeDecrypt(
      plaidAccount.account_subtype,
      { context: { accountId: plaidAccount._id, field: 'account_subtype' } },
    );
    plaidAccounts.push({
      ...plaidAccount,
      account_type: decryptedAccountType,
      account_subtype: decryptedAccountSubtype,
    });
  }

  const { allTransactions } = await weeklyCashFlowPlaidAccountSetUpTransactions(plaidAccounts, uid);
  console.log('allTransactions', allTransactions);

  const formattedTransactions = formatTransactionsWithSigns(allTransactions);
  console.log('formattedTransactions', formattedTransactions);

  const groupedTransactions = groupByWeek(formattedTransactions);
  console.log('groupedTransactions', groupedTransactions);

  const result = calculateWeeklyTotals(groupedTransactions);
  console.log('result', result);

  return { weeklyCashFlow: result };
};


const getCashFlowsByPlaidAccount = async (plaidAccount, uid) => {
  const dek = await getUserDek(uid);
  const safeDecrypt = createSafeDecrypt(uid, dek);

    // Get all pre-formatted transactions for this specific account
    const allRawTransactions = await transactionsService.getTransactionsByAccount(plaidAccount.plaid_account_id, uid);
  
    // Apply cashflow-specific formatting
    const allTransactions = allRawTransactions.map(applyCashflowFormatting);
  
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    let balanceCredit = 0;
    let balanceDebit = 0;
    let balanceCurrentInvestment = 0;
    let balanceAvailableInvestment = 0;
    let balanceLoan = 0;
  
    // Recalculate balances based on the current plaidAccount, which should already be decrypted from the controller
    if (plaidAccount.account_type === "credit" && plaidAccount.currentBalance) {
      balanceCredit = balanceCredit += plaidAccount.currentBalance;
    } else if (plaidAccount.account_type === "depository") {
      if (plaidAccount.availableBalance) {
        balanceDebit = balanceDebit += plaidAccount.availableBalance;
      } else if (plaidAccount.currentBalance) {
        balanceDebit = balanceDebit += plaidAccount.currentBalance;
      }
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
        if (plaidAccount.currentBalance) {
          balanceCurrentInvestment = balanceCurrentInvestment +=
            plaidAccount.currentBalance;
        }
        if (plaidAccount.availableBalance) {
          balanceAvailableInvestment = balanceAvailableInvestment +=
            plaidAccount.availableBalance;
        }
      }
    } else if (
      plaidAccount.account_type === "loan" &&
      plaidAccount.currentBalance
    ) {
      balanceLoan = balanceLoan += plaidAccount.currentBalance;
    }
    
    //----------WEEKLY-cashflow-chart calculations
    const resultWeeklyCashFlowwCharts = calculateWeeklyTotals(groupByWeek(allTransactions));
  
    let liabilityPlaid = null;
    if (plaidAccount.account_type === "credit") {
      const liab = await Liability.find({ accountId: plaidAccount.plaid_account_id }).lean().exec();
      if (liab && liab.length > 0) {
          liabilityPlaid = await getDecryptedLiabilitiesCredit(liab, dek, uid);
      }
    }
    //----------WEEKLY-cashflow-chart calculations
  
    // Filter transactions into categories
    const depositoryTransactions = allTransactions.filter(
      (txn) => txn.accountType === "depository" && txn.accountSubtype !== "cd" && txn.accountSubtype !== "money market",
    );
    const creditTransactions = allTransactions.filter(
      (txn) => txn.accountType === "credit",
    );
    const investmentTransactions = allTransactions.filter(
      (txn) => txn.accountType === "investment" || txn.accountSubtype === "cd" || txn.accountSubtype === "money market",
    );
    const loanTransactions = allTransactions.filter(
      (txn) => txn.accountType === "loan",
    );
    const depositoryDepositsAmount = depositoryTransactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((total, transaction) => total + transaction.amount, 0);

  const depositoryWithdrawsAmount = depositoryTransactions
    .filter((transaction) => transaction.amount < 0)
    .reduce((total, transaction) => total + transaction.amount, 0);

  const creditDepositsAmount = creditTransactions
    .filter((transaction) => transaction.amount < 0)
    .reduce((total, transaction) => total + transaction.amount, 0);

  const creditWithdrawsAmount = creditTransactions
    .filter((transaction) => transaction.amount > 0)
    .reduce((total, transaction) => total + transaction.amount, 0);

  const depositoryDepositTransactions = depositoryTransactions.filter(
    (transaction) => transaction.amount < 0,
  );
  const depositoryWithdrawTransactions = depositoryTransactions.filter(
    (transaction) => transaction.amount > 0,
  );
  const creditDepositTransactions = creditTransactions.filter(
    (transaction) => transaction.amount < 0,
  );
  const creditWithdrawTransactions = creditTransactions.filter(
    (transaction) => transaction.amount > 0,
  );

  /// Calculate current cash flow

  const depositDepositsAmountAbs = Math.abs(depositoryDepositsAmount);
  const depositWithdrawAmountAbs = Math.abs(depositoryWithdrawsAmount);
  const creditDepositsAmountAbs = Math.abs(creditDepositsAmount);
  const creditWithdrawAmountAbs = Math.abs(creditWithdrawsAmount);

  const totalDeposits = depositDepositsAmountAbs + creditDepositsAmountAbs;
  const totalWithdrawls = depositWithdrawAmountAbs + creditWithdrawAmountAbs;

  let currentCashFlow = 0;
  if (totalDeposits === 0) {
    currentCashFlow = -999;
  } else if (totalDeposits === 0 && totalWithdrawls === 0) {
    currentCashFlow = 0;
  } else {
    currentCashFlow = (
      (totalDeposits - totalWithdrawls) /
      totalDeposits
    ).toFixed(2);
  }
  if (totalDeposits !== 0) {
    currentCashFlow = currentCashFlow * 100;
  }

  /// Calculate average daily spend

  let averageDailySpend = 0;

  const oldestCreditWithdrawDate =
    creditWithdrawTransactions[0]?.transactionDate || null;
  const oldestDepositWithdrawDate =
    depositoryWithdrawTransactions[0]?.transactionDate || null;

  let oldestWithdrawDate = null;

  if (oldestCreditWithdrawDate && oldestDepositWithdrawDate) {
    oldestWithdrawDate =
      oldestDepositWithdrawDate < oldestCreditWithdrawDate
        ? oldestDepositWithdrawDate
        : oldestCreditWithdrawDate;
  } else if (oldestCreditWithdrawDate) {
    oldestWithdrawDate = oldestCreditWithdrawDate;
  } else if (oldestDepositWithdrawDate) {
    oldestWithdrawDate = oldestDepositWithdrawDate;
  }

  if (oldestWithdrawDate) {
    const today = new Date();
    // const days = Math.ceil(
    //   (today - oldestWithdrawDate) / (1000 * 60 * 60 * 24)
    // );

    const totalWithdrawals = creditWithdrawsAmount + depositoryWithdrawsAmount;
    averageDailySpend = Math.abs((totalWithdrawals / 90) * -1).toFixed(2);
  }

  /// Calculate average daily income

  let averageDailyIncome = 0;

  const oldestCreditDepositDate =
    creditDepositTransactions[0]?.transactionDate || null;
  const oldestDepositoryDepositDate =
    depositoryDepositTransactions[0]?.transactionDate || null;

  let oldestDepositDate = null;

  if (oldestCreditDepositDate && oldestDepositoryDepositDate) {
    oldestDepositDate =
      oldestDepositoryDepositDate < oldestCreditDepositDate
        ? oldestDepositoryDepositDate
        : oldestCreditDepositDate;
  } else if (oldestCreditDepositDate) {
    oldestDepositDate = oldestCreditDepositDate;
  } else if (oldestDepositoryDepositDate) {
    oldestDepositDate = oldestDepositoryDepositDate;
  }

  if (oldestDepositDate) {
    // const today = new Date();
    // const days = Math.ceil((today - oldestDepositDate) / (1000 * 60 * 60 * 24));
    const totalDeposits = depositoryDepositsAmount + creditDepositsAmount;
    averageDailyIncome = Math.abs(totalDeposits / 90).toFixed(2);
  }

  /// Calculate total cash balance

  const totalCashBalance = balanceDebit + balanceAvailableInvestment;

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
      (totalCashBalance / (averageDailyIncome - averageDailySpend)) * -1,
    );
    advice =
      Math.ceil(((averageDailySpend - averageDailyIncome) * 1.05) / 10) * 10;
  }

  // average daily net
  const averageDailyNet = averageDailyIncome - averageDailySpend;

  // weekly cash flow

  const ninetyDaysAgoDate = new Date();
  ninetyDaysAgoDate.setDate(ninetyDaysAgoDate.getDate() - 86);
  const weeklyCashFlow = {};

  const today = new Date();

  let currentStart = new Date(ninetyDaysAgoDate);
  const ranges = [];

  while (currentStart <= today) {
    let currentEnd = new Date(currentStart);

    if (ranges.length === 0 && currentStart.getDay() === 6) {
      currentEnd.setDate(currentEnd.getDate() + 1);
    } else {
      const daysToSunday = 7 - currentStart.getDay();
      currentEnd.setDate(currentEnd.getDate() + daysToSunday);
    }

    weeklyCashFlow[currentStart.toISOString().split("T")[0]] = 0;

    ranges.push({
      start: currentStart.toISOString().split("T")[0],
      end: currentEnd.toISOString().split("T")[0],
    });

    currentStart = new Date(currentEnd);
    currentStart.setDate(currentStart.getDate() + 1);
  }

  const categorizedTransactionByWeek = ranges.map((range) => {
    const rangeStart = new Date(range.start);
    const rangeEnd = new Date(range.end);

    const filteredTransactions = allTransactions.filter((transaction) => {
      const transactionDate = new Date(transaction.transactionDate);
      return transactionDate >= rangeStart && transactionDate <= rangeEnd;
    });

    return filteredTransactions;
  });

  let index = 0;
  for (const weekTransactions of categorizedTransactionByWeek) {
    const weekDepositoryTransactions = weekTransactions.filter(
      (transaction) => transaction.accountType === "depository",
    );
    const weekCreditTransactions = weekTransactions.filter(
      (transaction) => transaction.accountType === "credit",
    );
    const depositoryDepositsAmount = weekDepositoryTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const depositoryWithdrawsAmount = weekDepositoryTransactions
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const creditDepositsAmount = weekCreditTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const creditWithdrawsAmount = weekCreditTransactions
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const depositDepositsAmountAbs = Math.abs(depositoryDepositsAmount);
    const depositWithdrawAmountAbs = Math.abs(depositoryWithdrawsAmount);
    const creditDepositsAmountAbs = Math.abs(creditDepositsAmount);
    const creditWithdrawAmountAbs = Math.abs(creditWithdrawsAmount);

    const totalDeposits = depositDepositsAmountAbs + creditDepositsAmountAbs;
    const totalWithdrawls = depositWithdrawAmountAbs + creditWithdrawAmountAbs;

    let currentCashFlow = 0;
    if (totalDeposits === 0) {
      currentCashFlow = -999;
    } else if (totalDeposits === 0 && totalWithdrawls === 0) {
      currentCashFlow = 0;
    } else {
      currentCashFlow = (
        (totalDeposits - totalWithdrawls) /
        totalDeposits
      ).toFixed(2);
    }
    if (totalDeposits !== 0) {
      currentCashFlow = currentCashFlow * 100;
    }

    weeklyCashFlow[ranges[index].start] = currentCashFlow;
    index++;
  }

  return {
    currentCashFlow,
    totalCashBalance,
    averageDailySpend,
    averageDailyIncome,
    netWorth,
    cashRunway,
    advice,
    averageDailyNet,
    weeklyCashFlow,
    
    weeklyCashFlowChartData: resultWeeklyCashFlowwCharts,
    liabilityPlaid,
  };
};

const cashflowService = {
  getCashFlows,
  getCashFlowsWeekly,
  weeklyCashFlowPlaidAccountSetUpTransactions,
  getCashFlowsByPlaidAccount,
};

export default cashflowService;

