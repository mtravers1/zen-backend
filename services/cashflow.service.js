import plaidService from "./plaid.service.js";
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

// ✅ Helper: Handles sign flipping for Charts (Credit/Loan = Negative)
export const formatTransactionsWithSigns = (transactions) => {
  const formatted = [];
  for (const transaction of transactions) {
    const t = { ...transaction }; // Clone
    let amt = t.amount;
    
    // Ensure we work with numbers
    if (typeof amt === 'string') {
        amt = parseFloat(amt.replace(/[^0-9.-]+/g, "")) || 0;
    }

    // Apply Chart Logic (Spend = Negative)
    // EXCLUDE CD/Money Market from logic if passed here
    if ((t.accountType === "depository" && t.accountSubtype !== "cd" && t.accountSubtype !== "money market") || t.accountType === "credit" || t.accountType === "loan") {
      t.amount = amt * -1;
    } else if (t.accountType === "investment") {
      if (t.type === 'buy' || t.type === 'fee' || t.type === 'reinvested_dividend') {
        t.amount = -Math.abs(amt);
      } else if (t.type === 'sell' || t.type === 'dividend') {
        t.amount = Math.abs(amt);
      }
    }
    formatted.push(t);
  }
  return formatted;
};

const getCashFlows = async (profile, uid) => {
  return await structuredLogger.withContext(
    "get_cash_flows",
    { uid, profile_id: profile.id },
    async () => {
      // ... (Account fetching and decryption remains the same) ...
      const plaidIds = profile.plaidAccounts;
      const plaidAccountsResponse = await PlaidAccount.find({ _id: { $in: plaidIds } }).lean();
      const dek = await getUserDek(uid);
      const safeDecrypt = createSafeDecrypt(uid, dek);

      let plaidAccounts = [];
      for (const plaidAccount of plaidAccountsResponse) {
        // ... (Decryption logic same as before) ...
        const decryptedCurrentBalance = await safeDecrypt(plaidAccount.currentBalance, { account_id: plaidAccount._id, field: "currentBalance" });
        const decryptedAvailableBalance = await safeDecrypt(plaidAccount.availableBalance, { account_id: plaidAccount._id, field: "availableBalance" });
        const decryptedAccountType = await safeDecrypt(plaidAccount.account_type, { account_id: plaidAccount._id, field: "account_type" });
        const decryptedAccountSubtype = await safeDecrypt(plaidAccount.account_subtype, { account_id: plaidAccount._id, field: "account_subtype" });
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
      const allTransactions = [];
      
      // ... (Balance variables same as before) ...
      let balanceCredit = 0;
      let balanceDebit = 0;
      let balanceCurrentInvestment = 0;
      let balanceAvailableInvestment = 0;
      let allInvestmentsCurrentBalance = 0;
      let balanceLoan = 0;

      const depositoryTransactions = [];
      const creditTransactions = [];
      const investmentTransactions = [];
      const loanTransactions = [];

      for (const plaidAccount of plaidAccounts) {
        // ... (Balance calculation logic same as before) ...
        const currentBalance = Number(plaidAccount.currentBalance) || 0;
        const availableBalance = Number(plaidAccount.availableBalance) || 0;
        
        if (plaidAccount.account_type === "credit" && plaidAccount.currentBalance) balanceCredit += currentBalance;
        else if (plaidAccount.account_type === "depository") {
          if (plaidAccount.availableBalance) balanceDebit += availableBalance;
          else if (plaidAccount.currentBalance) balanceDebit += currentBalance;
        } else if (plaidAccount.account_type === "investment") {
          if (plaidAccount.currentBalance) allInvestmentsCurrentBalance += currentBalance;
          if (['brokerage', 'isa', 'crypto exchange', 'fixed annuity', 'non-custodial wallet', 'non-taxable brokerage account', 'retirement', 'trust'].includes(plaidAccount.account_subtype)) {
            if (plaidAccount.currentBalance) balanceCurrentInvestment += currentBalance;
            if (plaidAccount.availableBalance) balanceAvailableInvestment += availableBalance;
          }
        } else if (plaidAccount.account_type === "loan" && plaidAccount.currentBalance) balanceLoan += currentBalance;

        const transactionsResponse = await Transaction.find({
          plaidAccountId: plaidAccount.plaid_account_id,
          transactionDate: { $gte: ninetyDaysAgo },
          isInternal: false,
        }).sort({ transactionDate: 1 }).lean();

        const transactions = [];
        for (const transaction of transactionsResponse) {
          // ✅ Safe Decrypt to Number
          let decryptedAmountString = await safeDecrypt(transaction.amount, { transaction_id: transaction._id, field: "amount" });
          let numericAmount = parseFloat(String(decryptedAmountString).replace(/[^0-9.-]+/g, "")) || 0;
          const decryptedType = await safeDecrypt(transaction.type, { transaction_id: transaction._id, field: "type" });
          const decryptedAccountType = await safeDecrypt(transaction.accountType, { transaction_id: transaction._id, field: "accountType" });

          transactions.push({
            ...transaction,
            amount: numericAmount,
            type: decryptedType,
            accountType: decryptedAccountType,
            accountSubtype: plaidAccount.account_subtype,
          });
        }
        allTransactions.push(...transactions);

        // ✅ FIX 1: Strict Categorization
        // Exclude 'money market' and 'cd' from Depository bucket so they don't count as cashflow
        if (plaidAccount.account_type === "depository" && plaidAccount.account_subtype !== "cd" && plaidAccount.account_subtype !== "money market") {
            depositoryTransactions.push(...transactions);
        } 
        else if (plaidAccount.account_type === "credit") {
            creditTransactions.push(...transactions);
        } 
        else if (plaidAccount.account_type === "investment" || plaidAccount.account_subtype === "cd" || plaidAccount.account_subtype === "money market") {
            investmentTransactions.push(...transactions);
        } 
        else if (plaidAccount.account_type === "loan") {
            loanTransactions.push(...transactions);
        }
      }

      // ... (Internal Transfer Filtering same as before) ...
      const internalTxns = allTransactions.filter((txn) => txn.isInternal);
      const txnMap = new Map(internalTxns.map((txn) => [String(txn._id), txn]));
      const toRemove = new Set();
      internalTxns.forEach((txn) => {
        const refId = txn.internalReference?.toString();
        if (refId && txnMap.has(refId)) { toRemove.add(String(txn._id)); toRemove.add(refId); }
      });
      const filteredTxns = internalTxns.filter((txn) => !toRemove.has(String(txn._id)));
      const filteredOutIds = new Set(filteredTxns.map((txn) => String(txn._id)));

      // Apply Filter to buckets
      const cleanDepositoryTxns = depositoryTransactions.filter((txn) => !filteredOutIds.has(String(txn._id)));
      const cleanCreditTxns = creditTransactions.filter((txn) => !filteredOutIds.has(String(txn._id)));
      
      // Calculate Totals (Standard Plaid: Depository Neg=Income, Credit Neg=Refund)
      const depositoryDepositsAmount = cleanDepositoryTxns.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
      const depositoryWithdrawsAmount = cleanDepositoryTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
      const creditDepositsAmount = cleanCreditTxns.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0);
      const creditWithdrawsAmount = cleanCreditTxns.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);

      const depositDepositsAmountAbs = Math.abs(depositoryDepositsAmount);
      const depositWithdrawAmountAbs = Math.abs(depositoryWithdrawsAmount);
      const creditDepositsAmountAbs = Math.abs(creditDepositsAmount);
      const creditWithdrawAmountAbs = Math.abs(creditWithdrawsAmount);

      const totalDeposits = depositDepositsAmountAbs + creditDepositsAmountAbs;
      const totalWithdrawls = depositWithdrawAmountAbs + creditWithdrawAmountAbs;

      let currentCashFlow = 0;
      if (totalDeposits === 0) currentCashFlow = -999;
      else if (totalDeposits === 0 && totalWithdrawls === 0) currentCashFlow = 0;
      else currentCashFlow = ((totalDeposits - totalWithdrawls) / totalDeposits).toFixed(2);
      
      if (totalDeposits !== 0) currentCashFlow = currentCashFlow * 100;

      // Average Daily Spend/Income
      let averageDailySpend = 0;
      const oldestCreditWithdrawDate = cleanCreditTxns.filter(t => t.amount > 0)[0]?.transactionDate || null;
      const oldestDepositWithdrawDate = cleanDepositoryTxns.filter(t => t.amount > 0)[0]?.transactionDate || null;
      let oldestWithdrawDate = null;
      if (oldestCreditWithdrawDate && oldestDepositWithdrawDate) oldestWithdrawDate = oldestDepositWithdrawDate < oldestCreditWithdrawDate ? oldestDepositWithdrawDate : oldestCreditWithdrawDate;
      else if (oldestCreditWithdrawDate) oldestWithdrawDate = oldestCreditWithdrawDate;
      else if (oldestDepositWithdrawDate) oldestWithdrawDate = oldestDepositWithdrawDate;

      if (oldestWithdrawDate) {
        const totalWithdrawals = creditWithdrawsAmount + depositoryWithdrawsAmount;
        averageDailySpend = Math.abs((totalWithdrawals / 90) * -1).toFixed(2);
      }

      let averageDailyIncome = 0;
      const oldestCreditDepositDate = cleanCreditTxns.filter(t => t.amount < 0)[0]?.transactionDate || null;
      const oldestDepositoryDepositDate = cleanDepositoryTxns.filter(t => t.amount < 0)[0]?.transactionDate || null;
      let oldestDepositDate = null;
      if (oldestCreditDepositDate && oldestDepositoryDepositDate) oldestDepositDate = oldestDepositoryDepositDate < oldestCreditDepositDate ? oldestDepositoryDepositDate : oldestCreditDepositDate;
      else if (oldestCreditDepositDate) oldestDepositDate = oldestCreditDepositDate;
      else if (oldestDepositoryDepositDate) oldestDepositDate = oldestDepositoryDepositDate;

      if (oldestDepositDate) {
        const totalDepositsVal = depositoryDepositsAmount + creditDepositsAmount;
        averageDailyIncome = Math.abs(totalDepositsVal / 90).toFixed(2);
      }

      const unroundedTotalCashBalance = plaidAccounts.filter(acc => (acc.account_type === 'depository' && acc.account_subtype !== 'cd' )).reduce((total, acc) => total + (acc.availableBalance || acc.currentBalance || 0), 0);
      const totalCashBalance = parseFloat(unroundedTotalCashBalance.toFixed(2));

      const assets = await assetsService.getAssets(uid);
      const profileAssets = assets.filter((asset) => asset.profileId === profile.id.toString());
      let totalAssets = 0;
      for (const asset of profileAssets) {
        const cleanBasis = String(asset.basis).replace(/,/g, "");
        totalAssets += Number(cleanBasis) || 0;
      }
      const netWorth = balanceDebit + allInvestmentsCurrentBalance + totalAssets - balanceCredit - balanceLoan;

      let cashRunway = null;
      let advice = null;

      if (currentCashFlow < 0) {
        cashRunway = Math.floor((totalCashBalance / (averageDailyIncome - averageDailySpend)) * -1);
        advice = Math.ceil(((averageDailySpend - averageDailyIncome) * 1.05) / 10) * 10;
      }
      const averageDailyNet = averageDailyIncome - averageDailySpend;

      // ✅ FIX 2: Filter Chart Data
      // Use the cleaned/filtered arrays instead of allTransactions to exclude CD/Money Market
      const transactionsForChart = [...cleanDepositoryTxns, ...cleanCreditTxns];
      
      const chartTxns = JSON.parse(JSON.stringify(transactionsForChart));
      const formattedAllTransactions = formatTransactionsWithSigns(chartTxns);
      const weeklyCashFlow = calculateWeeklyTotals(groupByWeek(formattedAllTransactions));

      structuredLogger.logSuccess("get_cash_flows_completed", { uid, profile_id: profile.id, current_cash_flow: currentCashFlow, total_cash_balance: totalCashBalance, net_worth: netWorth, cash_runway: cashRunway });

      return {
        currentCashFlow,
        totalCashBalance,
        averageDailySpend,
        averageDailyIncome,
        netWorth,
        cashRunway,
        advice: advice,
        averageDailyNet,
        weeklyCashFlow,
      };
    },
  );
};

const getCashFlowsWeekly = async (profile, uid) => {
  const plaidIds = profile.plaidAccounts;
  const plaidAccountsResponse = await PlaidAccount.find({ _id: { $in: plaidIds } }).lean();
  let plaidAccounts = [];
  const dek = await getUserDek(uid);
  const safeDecrypt = createSafeDecrypt(uid, dek);
  for (const plaidAccount of plaidAccountsResponse) {
    const decryptedAccountType = await safeDecrypt(plaidAccount.account_type, { context: { accountId: plaidAccount._id, field: 'account_type' } });
    const decryptedAccountSubtype = await safeDecrypt(plaidAccount.account_subtype, { context: { accountId: plaidAccount._id, field: 'account_subtype' } });
    plaidAccounts.push({ ...plaidAccount, account_type: decryptedAccountType, account_subtype: decryptedAccountSubtype });
  }
  const { allTransactions } = await weeklyCashFlowPlaidAccountSetUpTransactions(plaidAccounts, uid);
  // ✅ CRITICAL FIX: Filter out CD and Money Market BEFORE passing to Chart Logic
  const filteredTransactions = allTransactions.filter(t => {
      if (t.accountType === 'depository') {
          return t.accountSubtype !== 'cd' && t.accountSubtype !== 'money market';
      }
      return true; 
  });
  const formattedTransactions = formatTransactionsWithSigns(filteredTransactions);
  const result = calculateWeeklyTotals(groupByWeek(formattedTransactions));
  return { weeklyCashFlow: result };
};

const weeklyCashFlowPlaidAccountSetUpTransactions = async (plaidAccounts, uid) => {
  const dek = await getUserDek(uid);
  const safeDecrypt = createSafeDecrypt(uid, dek);
  const nineWeeksAgo = new Date();
  nineWeeksAgo.setDate(nineWeeksAgo.getDate() - 9 * 7);
  const allTransactions = [];
  for (const plaidAccount of plaidAccounts) {
    const transactionsResponse = await Transaction.find({
      plaidAccountId: plaidAccount.plaid_account_id,
      transactionDate: { $gte: nineWeeksAgo },
      isInternal: false,
    }).sort({ transactionDate: 1 }).lean();
    for (const transaction of transactionsResponse) {
      let decryptedAmount = await safeDecryptNumericValue(transaction.amount, safeDecrypt, { transaction_id: transaction._id, field: "amount" });
      const decryptedType = await safeDecrypt(transaction.type, { transaction_id: transaction._id, field: "type" });
      const accountType = plaidAccount.account_type;
      allTransactions.push({
        ...transaction,
        amount: decryptedAmount,
        type: decryptedType,
        accountType: accountType,
        accountSubtype: plaidAccount.account_subtype,
      });
    }
  }
  return { allTransactions };
};

const getCashFlowsByPlaidAccount = async (plaidAccount, uid) => {
  const dek = await getUserDek(uid);
  const safeDecrypt = createSafeDecrypt(uid, dek);

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const allTransactions = [];
  let balanceCredit = 0;
  let balanceDebit = 0;
  let balanceCurrentInvestment = 0;
  let balanceAvailableInvestment = 0;
  let balanceLoan = 0;

  if (plaidAccount.account_type === "credit" && plaidAccount.currentBalance) balanceCredit += plaidAccount.currentBalance;
  else if (plaidAccount.account_type === "depository") {
    if (plaidAccount.availableBalance) balanceDebit += plaidAccount.availableBalance;
    else if (plaidAccount.currentBalance) balanceDebit += plaidAccount.currentBalance;
  } else if (plaidAccount.account_type === "investment") {
    if (['brokerage', 'isa', 'crypto exchange', 'fixed annuity', 'non-custodial wallet', 'non-taxable brokerage account', 'retirement', 'trust'].includes(plaidAccount.account_subtype)) {
        if (plaidAccount.currentBalance) balanceCurrentInvestment += plaidAccount.currentBalance;
        if (plaidAccount.availableBalance) balanceAvailableInvestment += plaidAccount.availableBalance;
    }
  } else if (plaidAccount.account_type === "loan" && plaidAccount.currentBalance) balanceLoan += plaidAccount.currentBalance;

  // 1. FETCH RAW DATA
  const transactionsResponse = await Transaction.find({
    plaidAccountId: plaidAccount.plaid_account_id,
    transactionDate: { $gte: ninetyDaysAgo },
    isInternal: false,
  }).sort({ transactionDate: 1 }).lean();

  const transactions = [];
  for (const transaction of transactionsResponse) {
    let decryptedAmount = await safeDecryptNumericValue(transaction.amount, safeDecrypt, { transaction_id: transaction._id, field: "amount" });
    const decryptedType = await safeDecrypt(transaction.type, { transaction_id: transaction._id, field: "type" });
    
    transactions.push({
        ...transaction,
        amount: decryptedAmount, // Guaranteed Number
        accountType: plaidAccount.account_type,
        accountSubtype: plaidAccount.account_subtype,
    });
  }
  allTransactions.push(...transactions);

  // 2. STREAM A: CHART DATA (Uses Signed Logic)
  const chartTransactions = JSON.parse(JSON.stringify(allTransactions));
  
  // ✅ FIX: EXCLUDE Money Market and CD from Chart Data
  const filteredForCharts = chartTransactions.filter(t => t.accountSubtype !== 'cd' && t.accountSubtype !== 'money market');
  const formattedForCharts = formatTransactionsWithSigns(filteredForCharts);
  
  const weeklyCashFlowChartData = calculateWeeklyTotals(groupByWeek(formattedForCharts));

  let liabilityPlaid = null;
  if (plaidAccount.account_type === "credit") {
    const liab = await Liability.find({ accountId: plaidAccount.plaid_account_id }).lean().exec();
    if (liab && liab.length > 0) liabilityPlaid = await getDecryptedLiabilitiesCredit(liab, dek, uid);
  }

  // 3. STREAM B: MANUAL LOOP (Uses Raw Logic)
  // ✅ FIX: Exclude CD/Money Market from calculation totals
  const depositoryTransactions = allTransactions.filter(txn => txn.accountType === "depository" && txn.accountSubtype !== "cd" && txn.accountSubtype !== "money market");
  const creditTransactions = allTransactions.filter(txn => txn.accountType === "credit");
  
  // Totals using Raw Plaid Logic (Depository: Neg=Income, Pos=Spend)
  const depositoryDepositsAmount = depositoryTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0);
  const depositoryWithdrawsAmount = depositoryTransactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
  const creditDepositsAmount = creditTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0);
  const creditWithdrawsAmount = creditTransactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);

  const totalDeposits = Math.abs(depositoryDepositsAmount) + Math.abs(creditDepositsAmount);
  const totalWithdrawls = Math.abs(depositoryWithdrawsAmount) + Math.abs(creditWithdrawsAmount);

  let currentCashFlow = 0;
  if (totalDeposits === 0) currentCashFlow = -999;
  else if (totalDeposits === 0 && totalWithdrawls === 0) currentCashFlow = 0;
  else currentCashFlow = ((totalDeposits - totalWithdrawls) / totalDeposits).toFixed(2);
  
  if (totalDeposits !== 0) currentCashFlow = currentCashFlow * 100;

  // Average Daily
  let averageDailySpend = 0;
  const oldestCreditWithdrawDate = creditTransactions.filter(t => t.amount > 0)[0]?.transactionDate || null;
  const oldestDepositWithdrawDate = depositoryTransactions.filter(t => t.amount > 0)[0]?.transactionDate || null;
  let oldestWithdrawDate = null;
  if (oldestCreditWithdrawDate && oldestDepositWithdrawDate) oldestWithdrawDate = oldestDepositWithdrawDate < oldestCreditWithdrawDate ? oldestDepositWithdrawDate : oldestCreditWithdrawDate;
  else if (oldestCreditWithdrawDate) oldestWithdrawDate = oldestCreditWithdrawDate;
  else if (oldestDepositWithdrawDate) oldestWithdrawDate = oldestDepositWithdrawDate;

  if (oldestWithdrawDate) {
    const totalWithdrawals = Math.abs(creditWithdrawsAmount) + Math.abs(depositoryWithdrawsAmount);
    averageDailySpend = Math.abs((totalWithdrawals / 90) * -1).toFixed(2);
  }

  let averageDailyIncome = 0;
  const oldestCreditDepositDate = creditTransactions.filter(t => t.amount < 0)[0]?.transactionDate || null;
  const oldestDepositoryDepositDate = depositoryTransactions.filter(t => t.amount < 0)[0]?.transactionDate || null;
  let oldestDepositDate = null;
  if (oldestCreditDepositDate && oldestDepositoryDepositDate) oldestDepositDate = oldestDepositoryDepositDate < oldestCreditDepositDate ? oldestDepositoryDepositDate : oldestCreditDepositDate;
  else if (oldestCreditDepositDate) oldestDepositDate = oldestCreditDepositDate;
  else if (oldestDepositoryDepositDate) oldestDepositDate = oldestDepositoryDepositDate;

  if (oldestDepositDate) {
    const totalDepositsVal = Math.abs(depositoryDepositsAmount) + Math.abs(creditDepositsAmount);
    averageDailyIncome = Math.abs(totalDepositsVal / 90).toFixed(2);
  }

  const totalCashBalance = balanceDebit + balanceAvailableInvestment;
  const netWorth = balanceDebit + balanceAvailableInvestment - balanceCredit - balanceLoan;

  let cashRunway = null;
  let advice = null;
  if (currentCashFlow < 0) {
    cashRunway = Math.floor((totalCashBalance / (averageDailyIncome - averageDailySpend)) * -1);
    advice = Math.ceil(((averageDailySpend - averageDailyIncome) * 1.05) / 10) * 10;
  }
  const averageDailyNet = averageDailyIncome - averageDailySpend;

  // Manual Loop
  const ninetyDaysAgoDate = new Date();
  ninetyDaysAgoDate.setDate(ninetyDaysAgoDate.getDate() - 86);
  const weeklyCashFlow = {};
  const today = new Date();
  let currentStart = new Date(ninetyDaysAgoDate);
  const ranges = [];
  while (currentStart <= today) {
    let currentEnd = new Date(currentStart);
    if (ranges.length === 0 && currentStart.getDay() === 6) currentEnd.setDate(currentEnd.getDate() + 1);
    else {
      const daysToSunday = 7 - currentStart.getDay();
      currentEnd.setDate(currentEnd.getDate() + daysToSunday);
    }
    weeklyCashFlow[currentStart.toISOString().split("T")[0]] = 0;
    ranges.push({ start: currentStart.toISOString().split("T")[0], end: currentEnd.toISOString().split("T")[0] });
    currentStart = new Date(currentEnd);
    currentStart.setDate(currentStart.getDate() + 1);
  }

  const categorizedTransactionByWeek = ranges.map((range) => {
    const rangeStart = new Date(range.start);
    const rangeEnd = new Date(range.end);
    return allTransactions.filter((transaction) => {
      const transactionDate = new Date(transaction.transactionDate);
      return transactionDate >= rangeStart && transactionDate <= rangeEnd;
    });
  });

  let index = 0;
  for (const weekTransactions of categorizedTransactionByWeek) {
     // ✅ FIX: Apply strict Depository Filter inside the loop (No CD/MoneyMarket)
     const weekDepositoryTxns = weekTransactions.filter(t => t.accountType === "depository" && t.accountSubtype !== "cd" && t.accountSubtype !== "money market");
     const weekCreditTxns = weekTransactions.filter(t => t.accountType === "credit");
     
     // 1. Depository (Neg=Income, Pos=Spend)
     const depDepAmnt = weekDepositoryTxns.filter(t => t.amount < 0).reduce((s,t) => s + t.amount, 0);
     const depWithAmnt = weekDepositoryTxns.filter(t => t.amount > 0).reduce((s,t) => s + t.amount, 0);
     
     // 2. Credit (Neg=Refund, Pos=Spend)
     const credDepAmnt = weekCreditTxns.filter(t => t.amount < 0).reduce((s,t) => s + t.amount, 0);
     const credWithAmnt = weekCreditTxns.filter(t => t.amount > 0).reduce((s,t) => s + t.amount, 0);

     const totalDep = Math.abs(depDepAmnt) + Math.abs(credDepAmnt);
     const totalWith = Math.abs(depWithAmnt) + Math.abs(credWithAmnt);

     let wkCashFlow = 0;
     if (totalDep === 0) wkCashFlow = -999;
     else if (totalDep === 0 && totalWith === 0) wkCashFlow = 0;
     else wkCashFlow = ((totalDep - totalWith) / totalDep).toFixed(2);
     
     if (totalDep !== 0) wkCashFlow = wkCashFlow * 100;
     
     weeklyCashFlow[ranges[index].start] = wkCashFlow;
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
    weeklyCashFlowChartData,
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