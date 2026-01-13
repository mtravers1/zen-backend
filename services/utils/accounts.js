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

    const weeklyCashFlow = weekTransactions.reduce((total, transaction) => {
      if (transaction.accountType === 'depository' || transaction.accountType === 'credit' || transaction.accountType === 'investment' || transaction.accountType === 'loan') {
        return total + transaction.amount;
      }
      return total;
    }, 0);

    const deposits = weekTransactions
      .filter(t => (t.accountType === 'depository' || t.accountType === 'credit' || t.accountType === 'investment' || t.accountType === 'loan') && t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    const withdrawals = weekTransactions
      .filter(t => (t.accountType === 'depository' || t.accountType === 'credit' || t.accountType === 'investment' || t.accountType === 'loan') && t.amount < 0)
      .reduce((sum, t) => sum + t.amount, 0);


    weeklySummary.push({
      week,
      cashFlow: weeklyCashFlow.toFixed(2),
      totalWeeklyDeposits: deposits,
      totalWeeklyWithdrawls: Math.abs(withdrawals),
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
