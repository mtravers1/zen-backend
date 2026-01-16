import AccessToken from "../../database/models/AccessToken.js";
import plaidService from "../plaid.service.js";
import { getUserDek } from "../../database/encryption.js";
import { createSafeDecrypt } from "../../lib/encryptionHelper.js";
import User from "../../database/models/User.js";
import * as Sentry from "@sentry/node";

export const calculateWeeklyTotals = (groupedTransactions) => {
  const weeklySummary = [];

  for (const week in groupedTransactions) {
    const weekTransactions = groupedTransactions[week];

    const depositoryTransactions = weekTransactions.filter(
      (t) => t.accountType === "depository",
    );
    const creditTransactions = weekTransactions.filter(
      (t) => t.accountType === "credit",
    );
    const investmentTransactions = weekTransactions.filter(
      (t) => t.accountType === "investment",
    );
    const loanTransactions = weekTransactions.filter(
      (t) => t.accountType === "loan",
    );

    const depositoryDepositsAmount = depositoryTransactions
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const depositoryWithdrawsAmount = depositoryTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const creditDepositsAmount = creditTransactions
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const creditWithdrawsAmount = creditTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const investmentDepositsAmount = investmentTransactions
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const investmentWithdrawsAmount = investmentTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const loanDepositsAmount = loanTransactions
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const loanWithdrawsAmount = loanTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const totalDeposits = depositoryDepositsAmount + creditDepositsAmount + investmentDepositsAmount + loanDepositsAmount;
    const totalWithdrawls = depositoryWithdrawsAmount + creditWithdrawsAmount + investmentWithdrawsAmount + loanWithdrawsAmount;

    let currentCashFlow = totalDeposits + totalWithdrawls;

    weeklySummary.push({
      week,
      depository: {
        deposits: depositoryDepositsAmount,
        withdraws: depositoryWithdrawsAmount,
      },
      credit: {
        deposits: creditDepositsAmount,
        withdraws: creditWithdrawsAmount,
      },
      investment: {
        deposits: investmentDepositsAmount,
        withdraws: investmentWithdrawsAmount,
      },
      loan: {
        deposits: loanDepositsAmount,
        withdraws: loanWithdrawsAmount,
      },
      cashFlow: currentCashFlow,
      totalWeeklyDeposits: totalDeposits,
      totalWeeklyWithdrawls: totalWithdrawls,
    });
  }

  return weeklySummary;
};

/*export const getStartOfWeek = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // Sunday = 0, Monday = 1, ..., Saturday = 6
  const diff = -day; // For weeks Sunday to Saturday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
};*/

export const getStartOfWeek = (date) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // Sunday = 0, Monday = 1, ..., Saturday = 6
  const diff = -day; // For weeks Sunday to Saturday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
};



export const groupByWeek = (transactions) => {
  const groupedTrans = transactions.reduce((acc, transaction) => {
    const week = getStartOfWeek(transaction.transactionDate);
    if (!acc[week]) acc[week] = [];
    acc[week].push(transaction);
    return acc;
  }, {});

  const today = new Date();
  const end = new Date(getStartOfWeek(today));

  const start = new Date(end);
  start.setDate(start.getDate() - 8 * 7);

  // Iterate through all weeks between the start and end
  const orderedGrouped = {};
  const current = new Date(start);
  while (current <= end) {
    const key = current.toISOString().split("T")[0];
    orderedGrouped[key] = groupedTrans[key] || [];
    current.setUTCDate(current.getUTCDate() + 7); // advance to the next week
  }
  return orderedGrouped;
};
