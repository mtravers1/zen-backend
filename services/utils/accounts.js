import AccessToken from "../../database/models/AccessToken.js";
import plaidService from "../plaid.service.js";
import { getUserDek } from "../../database/encryption.js";
import { createSafeDecrypt } from "../../lib/encryptionHelper.js";
import User from "../../database/models/User.js";
import * as Sentry from "@sentry/node";

export const calculateWeeklyTotals = (groupedTransactions, allTransactions) => {
  const weeklySummary = [];
  let totalGeneralDeposits = 0;

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

    const creditDepositsAmount = creditTransactions
      .filter((transaction) => transaction.amount < 0)
      .reduce((total, transaction) => total + transaction.amount, 0);
    const depositDepositsAmountAbs = Math.abs(depositoryDepositsAmount);
    const creditDepositsAmountAbs = Math.abs(creditDepositsAmount);

    totalGeneralDeposits += depositDepositsAmountAbs + creditDepositsAmountAbs;
  }

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

export const getNewestAccessToken = async (find) => {
  const accessTokens = await AccessToken.find({
    ...find,
    isAccessTokenExpired: { $ne: true },
  }).sort({ createdAt: -1 });

  if (accessTokens.length > 1) {
    console.warn("Multiple active access tokens found for query: ", find);
    console.warn("The newest token will be used, and older ones will be invalidated and marked as expired.");

    const newestToken = accessTokens[0];
    const olderTokens = accessTokens.slice(1);

    for (const token of olderTokens) {
      let shouldMarkAsExpired = false;
      try {
        const user = await User.findById(token.userId);
        if (user) {
          const dek = await getUserDek(user.authUid);
          const safeDecrypt = createSafeDecrypt(user.authUid, dek);
          const decryptedToken = await safeDecrypt(token.accessToken, {
            item_id: token.itemId,
            field: "accessToken",
          });

          if (decryptedToken) {
            try {
              await plaidService.invalidateAccessToken(decryptedToken);
              // If invalidate succeeds, we should mark as expired
              shouldMarkAsExpired = true;
            } catch (plaidError) {
              if (plaidError.response?.data?.error_code === 'ITEM_NOT_FOUND' || plaidError.response?.data?.error_code === 'INVALID_ACCESS_TOKEN') {
                // Already invalid, so we can safely mark as expired
                shouldMarkAsExpired = true;
              } else {
                // Unexpected error from Plaid, log it for investigation
                Sentry.captureException(plaidError, {
                  level: "error",
                  extra: {
                    message: "Unexpected error during Plaid token invalidation",
                    tokenId: token._id,
                    itemId: token.itemId,
                  },
                });
              }
            }
          }
        }
      } catch (error) {
        console.error(`Failed to process old access token ${token._id}:`, error);
        Sentry.captureException(error, {
          level: "error",
          extra: {
            message: "General failure during old token processing",
            tokenId: token._id,
          },
        });
      }

      if (shouldMarkAsExpired) {
        token.isAccessTokenExpired = true;
        await token.save();
      }
    }

    return newestToken;
  }

  return accessTokens[0];
};

export const groupByWeek = (transactions) => {
  if (transactions.length === 0) return {};

  const groupedTrans = transactions.reduce((acc, transaction) => {
    const week = getStartOfWeek(transaction.transactionDate);
    if (!acc[week]) acc[week] = [];
    acc[week].push(transaction);
    return acc;
  }, {});

  // Get the minimum and maximum weeks of the group
  const allWeeksSorted = Object.keys(groupedTrans).sort(
    (a, b) => new Date(a) - new Date(b),
  );

  const start = new Date(allWeeksSorted[0]);
  const end = new Date(allWeeksSorted[allWeeksSorted.length - 1]);

  // Iterate through all weeks between the start and end
  const orderedGrouped = {};
  const current = new Date(start);
  while (current <= end) {
    const key = current.toISOString().split("T")[0];
    orderedGrouped[key] = groupedTrans[key] || [];
    current.setUTCDate(current.getUTCDate() + 7); // advance to the next week
  }

  /*const keys = Object.keys(orderedGrouped).map((or) => {
    console.log("WEEK", or);
    const weekSet = orderedGrouped[or];
    console.log("WEEK", or, weekSet.length);
    return or;
  });

  keys.map((dt, index) => {
    const og = orderedGrouped[dt];
    og.map((data) => {
      console.log(
        index,
        "Weekk Data: ",
        dt,
        data.transactionDate,
        data.accountType,
        data.amount
      );
    });
  });*/

  return orderedGrouped;
};
