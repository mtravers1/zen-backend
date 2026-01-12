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

    const depositoryDepositsAmount = depositoryTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const depositoryWithdrawsAmount = depositoryTransactions
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const creditDepositsAmount = creditTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const creditWithdrawsAmount = creditTransactions
      .filter((transaction) => transaction.amount > 0)
      .reduce((total, transaction) => total + transaction.amount, 0);

    const depositDepositsAmountAbs = Math.abs(depositoryDepositsAmount);
    const depositWithdrawAmountAbs = Math.abs(depositoryWithdrawsAmount);

    const creditDepositsAmountAbs = Math.abs(creditDepositsAmount);
    const creditWithdrawAmountAbs = Math.abs(creditWithdrawsAmount);

    const totalDeposits = depositDepositsAmountAbs + creditDepositsAmountAbs;
    const totalWithdrawls = depositWithdrawAmountAbs + creditWithdrawAmountAbs;

    let currentCashFlow = 0;

    currentCashFlow = (totalDeposits - totalWithdrawls).toFixed(2);

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
      cashFlow: currentCashFlow,
      totalWeeklyDeposits: totalDeposits,
      totalWeeklyWithdrawls: totalWithdrawls,
      totalWithdrawls,
      testing: { depositoryTransactions, creditTransactions },
    });
  }

  //console.log("WEEKLY", weeklySummary);

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
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(today.getDate() - 90);

  const start = new Date(getStartOfWeek(ninetyDaysAgo));
  const end = new Date(getStartOfWeek(today));

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
