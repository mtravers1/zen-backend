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
    try {
      const user = await authService.own(uid);
      if (!user) {
        return { message: "No user information available", data: null };
      }
      const { profilePhotoUrl, ...cleanedData } = user;
      return { message: "User information retrieved successfully", data: cleanedData };
    } catch (error) {
      console.error("[AI][getUserInfo] Error:", error);
      return { message: "Failed to retrieve user information", error: error.message };
    }
  },

  /**
   * Retrieves all user accounts, filtered if filters are provided.
   * @param {object} args - { uid, filters, intent }
   */
  getAllUserAccounts: async ({ uid, filters = {}, intent = null }) => {
    try {
      const { profile } = context;
      const accounts = await accountsService.getAllUserAccounts(profile, uid);
      
      if (!accounts || accounts.length === 0) {
        return intent === 'balance' ? [{ name: "No Accounts", balance: 0 }] : [];
      }
      
      const cleanedData = accounts.map(({ accessToken, isAccessTokenExpired, itemId, hashAccountInstitutionId, hashAccountName, hashAccountMask, nextCursor, created_at, _id, owner_id, owner_type, ...rest }) => rest);
      const filteredAccounts = filterAccounts(cleanedData, filters);
      
      if (!filteredAccounts || filteredAccounts.length === 0) {
        return intent === 'balance' ? [{ name: "No Accounts", balance: 0 }] : [];
      }
      
      return filteredAccounts;
    } catch (error) {
      console.error("[AI][getAllUserAccounts] Error:", error);
      return { message: "Failed to retrieve accounts", error: error.message };
    }
  },

  /**
   * Retrieves accounts for the current profile, filtered if filters are provided.
   */
  getAccountsByProfile: async ({ uid, filters = {} }) => {
    try {
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
        return [];
      }
      
      const allAccounts = Object.values(cleaned).flat();
      const filteredAccounts = filterAccounts(allAccounts, filters);
      const formattedAccounts = accountsService.formatAccountsBalances(filteredAccounts);
      
      return formattedAccounts;
    } catch (error) {
      console.error("[AI][getAccountsByProfile] Error:", error);
      return { message: "Failed to retrieve profile accounts", error: error.message };
    }
  },

  /**
   * Retrieves cash flow summary for the current profile.
   */
  getCashFlows: async ({ uid }) => {
    try {
      const { profile } = context;
      const cashFlows = await accountsService.getCashFlows(profile, uid);
      
      if (!cashFlows) {
        return { message: "No cash flow information available", data: null };
      }
      
      const { weeklyCashFlow, ...cleanedData } = cashFlows;
      return cleanedData;
    } catch (error) {
      console.error("[AI][getCashFlows] Error:", error);
      return { message: "Failed to retrieve cash flow data", error: error.message };
    }
  },

  /**
   * Retrieves weekly cash flow data for the current profile.
   */
  getCashFlowsWeekly: async ({ uid }) => {
    try {
      const { profile } = context;
      const cashFlowsWeekly = await accountsService.getCashFlowsWeekly(profile, uid);
      
      if (!cashFlowsWeekly) {
        return { message: "No weekly cash flow information available", data: null };
      }
      
      return cashFlowsWeekly;
    } catch (error) {
      console.error("[AI][getCashFlowsWeekly] Error:", error);
      return { message: "Failed to retrieve weekly cash flow data", error: error.message };
    }
  },

  /**
   * Calculates and returns the current net worth for the user.
   * Net worth = Total Assets - Total Liabilities
   */
  getNetWorth: async ({ uid }) => {
    try {
      const { profile } = context;
      const cashFlows = await accountsService.getCashFlows(profile, uid);
      
      if (!cashFlows) {
        return { 
          netWorth: 0, 
          totalCashBalance: 0,
          totalAssets: 0,
          totalLiabilities: 0,
          message: "No financial data available" 
        };
      }
      
      return {
        netWorth: cashFlows.netWorth || 0,
        totalCashBalance: cashFlows.totalCashBalance || 0,
        totalAssets: cashFlows.totalAssets || 0,
        totalLiabilities: cashFlows.totalLiabilities || 0,
        message: "Net worth calculated from current financial data"
      };
    } catch (error) {
      console.error("[AI][getNetWorth] Error:", error);
      return { 
        netWorth: 0, 
        totalCashBalance: 0,
        totalAssets: 0,
        totalLiabilities: 0,
        message: "Error calculating net worth",
        error: error.message 
      };
    }
  },

  /**
   * Retrieves all transactions for the current profile, filtered if filters are provided.
   */
  getProfileTransactions: async ({ uid, filters = {} }) => {
    try {
      const { profile } = context;
      const transactions = await accountsService.getProfileTransactions(profile.email, profile.id, uid);
      
      if (!transactions || transactions.length === 0) {
        return [];
      }
      
      const filteredTransactions = filterTransactions(transactions, filters);
      const fixedTransactions = accountsService.formatTransactionsWithSigns(filteredTransactions);
      const cleanedData = fixedTransactions.map(({ _id, accountId, accountType, plaidTransactionId, pending, pending_transaction_id, internalReference, created_at, __v, institutionName, institutionId, ...rest }) => rest);
      
      return cleanedData;
    } catch (error) {
      console.error("[AI][getProfileTransactions] Error:", error);
      return { message: "Failed to retrieve profile transactions", error: error.message };
    }
  },

  /**
   * Retrieves all transactions for the user, filtered if filters are provided.
   */
  getAllTransactions: async ({ uid, filters = {} }) => {
    try {
      const { profile } = context;
      const transactions = await accountsService.getUserTransactions(profile.email, uid);
      
      if (!transactions || transactions.length === 0) {
        return [];
      }
      
      const filteredTransactions = filterTransactions(transactions, filters);
      const fixedTransactions = accountsService.formatTransactionsWithSigns(filteredTransactions);
      const cleanedData = fixedTransactions.map(({ _id, accountId, accountType, plaidTransactionId, pending, pending_transaction_id, internalReference, created_at, __v, institutionName, institutionId, ...rest }) => rest);
      
      return cleanedData;
    } catch (error) {
      console.error("[AI][getAllTransactions] Error:", error);
      return { message: "Failed to retrieve all transactions", error: error.message };
    }
  },

  /**
   * Retrieves all transactions for a specific account, filtered if filters are provided.
   */
  getAccountTransactions: async ({ plaidAccountId, uid, filters = {} }) => {
    try {
      const transactions = await accountsService.getTransactionsByAccount(plaidAccountId, uid);
      
      if (!transactions || transactions.length === 0) {
        return [];
      }
      
      const filteredTransactions = filterTransactions(transactions, filters);
      const fixedTransactions = accountsService.formatTransactionsWithSigns(filteredTransactions);
      const cleanedData = fixedTransactions.map(({ _id, accountId, accountType, plaidTransactionId, pending, pending_transaction_id, internalReference, created_at, __v, institutionName, institutionId, ...rest }) => rest);
      
      return cleanedData;
    } catch (error) {
      console.error("[AI][getAccountTransactions] Error:", error);
      return { message: "Failed to retrieve account transactions", error: error.message };
    }
  },

  /**
   * Retrieves all user profiles.
   */
  getProfiles: async ({ uid }) => {
    try {
      const { profile } = context;
      const profiles = await businessService.getUserProfiles(profile.email, uid);
      
      if (!profiles || profiles.length === 0) {
        return [];
      }
      
      const cleaned = profiles.map(({ photo, plaidAccounts, color, nameParts, ...rest }) => rest);
      return cleaned;
    } catch (error) {
      console.error("[AI][getProfiles] Error:", error);
      return { message: "Failed to retrieve profiles", error: error.message };
    }
  },

  /**
   * Retrieves all assets for the user.
   */
  getAssets: async ({ uid }) => {
    try {
      const assets = await assetsService.getAssets(uid);
      
      if (!assets || assets.length === 0) {
        return [];
      }
      
      const cleaned = assets.map(({ account, updatedAt, ...rest }) => rest);
      return cleaned;
    } catch (error) {
      console.error("[AI][getAssets] Error:", error);
      return { message: "Failed to retrieve assets", error: error.message };
    }
  },

  /**
   * Retrieves all trips for the user, filtered by query if provided.
   */
  getTrips: async ({ query = {}, uid }) => {
    try {
      const trips = await tripService.fetchFilteredTrips(query, uid);
      
      if (!trips || trips.length === 0) {
        return [];
      }
      
      return trips;
    } catch (error) {
      console.error("[AI][getTrips] Error:", error);
      return { message: "Failed to retrieve trips", error: error.message };
    }
  },
}); 