// Zentavos AI Tool Functions Module
// Provides helper functions (tool calls) for LLM to access user, account, transaction, asset, and trip data.

import accountsService from "../accounts.service.js";
import businessService from "../businesses.service.js";
import authService from "../auth.service.js";
import assetsService from "../assets.service.js";
import tripService from "../trips.service.js";
import { filterAccounts, filterTransactions } from "./filters.js";

/**
 * Returns an object with all tool functions, each receiving the required context.
 * @param {object} context - Context with user, profile, and filter helpers.
 * @returns {object} Tool functions for LLM tool calls.
 */
export const toolFunctions = (context) => ({
  /**
   * Retrieves user information for the given UID.
   */
  getUserInfo: async ({ uid }) => {
    const user = await authService.own(uid);
    if (!user) {
      return "No user information available";
    }
    const { profilePhotoUrl, ...cleanedData } = user;
    return cleanedData;
  },
  /**
   * Retrieves all user accounts, filtered if filters are provided.
   * If no accounts are found:
   *   - For balance queries (intent === 'balance'), returns [{ name: "Checking", balance: 0 }].
   *   - For other queries, returns [].
   * @param {object} args - { uid, filters, intent }
   */
  getAllUserAccounts: async ({ uid, filters = {}, intent = null }) => {
    const { profile } = context;
    const accounts = await accountsService.getAllUserAccounts(profile, uid);
    if (!accounts) {
      return intent === 'balance' ? [{ name: "Checking", balance: 0 }] : [];
    }
    const cleanedData = accounts.map(({ accessToken, isAccessTokenExpired, itemId, hashAccountInstitutionId, hashAccountName, hashAccountMask, nextCursor, created_at, _id, owner_id, owner_type, ...rest }) => rest);
    const filteredAccounts = filterAccounts(cleanedData, filters);
    // If no accounts, return based on intent
    if (!filteredAccounts || filteredAccounts.length === 0) {
      return intent === 'balance' ? [{ name: "Checking", balance: 0 }] : [];
    }
    return filteredAccounts;
  },
  /**
   * Retrieves accounts for the current profile, filtered if filters are provided.
   */
  getAccountsByProfile: async ({ uid, filters = {} }) => {
    const { profile } = context;
    const accounts = await accountsService.getAccounts(profile, uid);
    if (!accounts) {
      return [];
    }
    const cleaned = Object.fromEntries(
      Object.entries(accounts).map(([key, value]) => {
        if (Array.isArray(value)) {
          const cleanedArray = value.map((account) =>
            Object.fromEntries(
              Object.entries(account).filter(
                ([k]) =>
                  ![
                    "accessToken",
                    "isAccessTokenExpired",
                    "itemId",
                    "hashAccountInstitutionId",
                    "hashAccountName",
                    "hashAccountMask",
                    "nextCursor",
                    "created_at",
                    "_id",
                    "owner_id",
                    "owner_type",
                    "transactions",
                    "__v",
                  ].includes(k)
              )
            )
          );
          return [key, cleanedArray];
        }
        return [key, value];
      })
    );
    if (!cleaned) {
      return "No user accounts available";
    }
    const allAccounts = Object.values(cleaned).flat();
    const filteredAccounts = filterAccounts(allAccounts, filters);
    const formatttedAccounts = accountsService.formatAccountsBalances(filteredAccounts);
    return formatttedAccounts;
  },
  /**
   * Retrieves cash flow summary for the current profile.
   */
  getCashFlows: async ({ uid }) => {
    const { profile } = context;
    const cashFlows = await accountsService.getCashFlows(profile, uid);
    if (!cashFlows) {
      return "No cash flow information available";
    }
    const { weeklyCashFlow, ...cleanedData } = cashFlows;
    return cleanedData;
  },
  /**
   * Retrieves weekly cash flow data for the current profile.
   */
  getCashFlowsWeekly: async ({ uid }) => {
    const { profile } = context;
    const cashFlowsWeekly = await accountsService.getCashFlowsWeekly(profile, uid);
    if (!cashFlowsWeekly) {
      return "No weekly cash flow information available";
    }
    return cashFlowsWeekly;
  },

  /**
   * Calculates and returns the current net worth for the user.
   * Net worth = Total Assets - Total Liabilities
   * Assets include: cash balances, investments, and other assets
   * Liabilities include: credit card balances and loans
   */
  getNetWorth: async ({ uid }) => {
    const { profile } = context;
    
    try {
      // Get cash flows which includes net worth calculation
      const cashFlows = await accountsService.getCashFlows(profile, uid);
      if (!cashFlows) {
        return { netWorth: 0, message: "No financial data available" };
      }
      
      return {
        netWorth: cashFlows.netWorth || 0,
        totalCashBalance: cashFlows.totalCashBalance || 0,
        totalAssets: cashFlows.totalAssets || 0,
        totalLiabilities: cashFlows.totalLiabilities || 0,
        message: "Net worth calculated from current financial data"
      };
    } catch (error) {
      console.error("[AI][getNetWorth] Error calculating net worth:", error);
      return { 
        netWorth: 0, 
        message: "Error calculating net worth",
        error: error.message 
      };
    }
  },

  /**
   * Retrieves all transactions for the current profile, filtered if filters are provided.
   */
  getProfileTransactions: async ({ uid, filters = {} }) => {
    const { profile } = context;
    const transactions = await accountsService.getProfileTransactions(profile.email, profile.id, uid);
    if (!transactions) {
      return "No transaction information available";
    }
    const filteredTransactions = filterTransactions(transactions, filters);
    const fixedTransactions = accountsService.formatTransactionsWithSigns(filteredTransactions);
    const cleanedData = fixedTransactions.map(({ _id, accountId, accountType, plaidTransactionId, pending, pending_transaction_id, internalReference, created_at, __v, institutionName, institutionId, ...rest }) => rest);
    return cleanedData;
  },
  /**
   * Retrieves all transactions for the user, filtered if filters are provided.
   */
  getAllTransactions: async ({ uid, filters = {} }) => {
    const { profile } = context;
    const transactions = await accountsService.getUserTransactions(profile.email, uid);
    if (!transactions) {
      return "No transaction information available";
    }
    const filteredTransactions = filterTransactions(transactions, filters);
    const fixedTransactions = accountsService.formatTransactionsWithSigns(filteredTransactions);
    const cleanedData = fixedTransactions.map(({ _id, accountId, accountType, plaidTransactionId, pending, pending_transaction_id, internalReference, created_at, __v, institutionName, institutionId, ...rest }) => rest);
    return cleanedData;
  },
  /**
   * Retrieves all transactions for a specific account, filtered if filters are provided.
   */
  getAccountTransactions: async ({ plaidAccountId, uid, filters = {} }) => {
    const transactions = await accountsService.getTransactionsByAccount(plaidAccountId, uid);
    if (!transactions) {
      return "No transaction information available";
    }
    const filteredTransactions = filterTransactions(transactions, filters);
    const fixedTransactions = accountsService.formatTransactionsWithSigns(filteredTransactions);
    const cleanedData = fixedTransactions.map(({ _id, accountId, accountType, plaidTransactionId, pending, pending_transaction_id, internalReference, created_at, __v, institutionName, institutionId, ...rest }) => rest);
    return cleanedData;
  },
  /**
   * Retrieves all user profiles.
   */
  getProfiles: async ({ uid }) => {
    const { profile } = context;
    const profiles = await businessService.getUserProfiles(profile.email, uid);
    if (!profiles) {
      return "No profiles available";
    }
    const cleaned = profiles.map(({ photo, plaidAccounts, color, nameParts, ...rest }) => rest);
    return cleaned;
  },
  /**
   * Retrieves all assets for the user.
   */
  getAssets: async ({ uid }) => {
    const assets = await assetsService.getAssets(uid);
    if (!assets) {
      return "No assets available";
    }
    const cleaned = assets.map(({ account, updatedAt, ...rest }) => rest);
    return cleaned;
  },
  /**
   * Retrieves all trips for the user, filtered by query if provided.
   */
  getTrips: async ({ query, uid }) => {
    const trips = await tripService.fetchFilteredTrips(query, uid);
    if (!trips) {
      return "No trips available";
    }
    return trips;
  },
}); 