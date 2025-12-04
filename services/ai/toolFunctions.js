// Zentavos AI Tool Functions Module
// Provides helper functions (tool calls) for LLM to access user, account, transaction, asset, and trip data.

import accountsService from "../accounts.service.js";
import businessService from "../businesses.service.js";
import authService from "../auth.service.js";
import assetsService from "../assets.service.js";
import tripService from "../trips.service.js";
import filesService from "../files.service.js";
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
      const user = await authService.getOwnUserProfile(uid);
      if (!user) {
        return { message: "No user information available", data: null };
      }
      const { profilePhotoUrl, ...cleanedData } = user;
      return {
        message: "User information retrieved successfully",
        data: cleanedData,
      };
    } catch (error) {
      console.error("[AI][getUserInfo] Error:", error);
      return {
        message: "Failed to retrieve user information",
        error: error.message,
      };
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
        return intent === "balance"
          ? [{ name: "No Accounts", balance: 0 }]
          : [];
      }

      const cleanedData = accounts.map(
        ({
          accessToken,
          isAccessTokenExpired,
          itemId,
          hashAccountInstitutionId,
          hashAccountName,
          hashAccountMask,
          nextCursor,
          created_at,
          _id,
          owner_id,
          owner_type,
          ...rest
        }) => rest,
      );
      const filteredAccounts = filterAccounts(cleanedData, filters);

      if (!filteredAccounts || filteredAccounts.length === 0) {
        return intent === "balance"
          ? [{ name: "No Accounts", balance: 0 }]
          : [];
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
                    ].includes(k),
                ),
              ),
            );
            return [key, cleanedArray];
          }
          return [key, value];
        }),
      );

      // Apply filters if provided
      let filteredAccounts = [];
      if (filters.accountType) {
        // Filter by account type (e.g., 'savings', 'checking')
        Object.entries(cleaned).forEach(([type, accounts]) => {
          if (type.toLowerCase().includes(filters.accountType.toLowerCase())) {
            filteredAccounts.push(...accounts);
          }
        });
      } else if (filters.accountSubtype) {
        // Filter by account subtype (e.g., 'savings', 'checking')
        Object.entries(cleaned).forEach(([type, accounts]) => {
          const matchingAccounts = accounts.filter(
            (account) =>
              account.account_subtype
                ?.toLowerCase()
                .includes(filters.accountSubtype.toLowerCase()) ||
              account.account_name
                ?.toLowerCase()
                .includes(filters.accountSubtype.toLowerCase()),
          );
          filteredAccounts.push(...matchingAccounts);
        });
      } else {
        // Return all accounts if no specific filter
        Object.values(cleaned).forEach((accounts) => {
          filteredAccounts.push(...accounts);
        });
      }

      // Add account type information for better categorization
      filteredAccounts = filteredAccounts.map((account) => ({
        ...account,
        account_category: getAccountCategory(account),
        display_name: getDisplayName(account),
      }));

      return filteredAccounts;
    } catch (error) {
      console.error("[AI][getAccountsByProfile] Error:", error);
      return { message: "Failed to retrieve accounts", error: error.message };
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
      return {
        message: "Failed to retrieve cash flow data",
        error: error.message,
      };
    }
  },

  /**
   * Retrieves weekly cash flow data for the current profile.
   */
  getCashFlowsWeekly: async ({ uid }) => {
    try {
      const { profile } = context;
      const cashFlowsWeekly = await accountsService.getCashFlowsWeekly(
        profile,
        uid,
      );

      if (!cashFlowsWeekly) {
        return {
          message: "No weekly cash flow information available",
          data: null,
        };
      }

      return cashFlowsWeekly;
    } catch (error) {
      console.error("[AI][getCashFlowsWeekly] Error:", error);
      return {
        message: "Failed to retrieve weekly cash flow data",
        error: error.message,
      };
    }
  },

  /**
   * Calculates and returns the current net worth for the user.
   * Net worth = Total Assets - Total Liabilities
   */
  getNetWorth: async ({ uid }) => {
    try {
      console.log("\n🔍 [AI][getNetWorth] ====== DEBUG START ======");
      console.log("[AI][getNetWorth] Context received:", {
        hasProfile: !!context?.profile,
        profileId: context?.profile?.id,
        profileEmail: context?.profile?.email,
        profileName: context?.profile?.name,
        profileIsPersonal: context?.profile?.isPersonal,
        profileHasPlaidAccounts: !!context?.profile?.plaidAccounts,
        plaidAccountsCount: context?.profile?.plaidAccounts?.length || 0,
        uid: uid,
        contextKeys: Object.keys(context || {}),
      });

      const { profile } = context;

      if (!profile) {
        console.error("[AI][getNetWorth] ❌ No profile found in context");
        return {
          netWorth: 0,
          totalCashBalance: 0,
          totalAssets: 0,
          totalLiabilities: 0,
          message: "No profile context available",
          error: "Profile not found in context",
        };
      }

      if (!profile.plaidAccounts || profile.plaidAccounts.length === 0) {
        console.warn("[AI][getNetWorth] ⚠️ Profile has no Plaid accounts");
        return {
          netWorth: 0,
          totalCashBalance: 0,
          totalAssets: 0,
          totalLiabilities: 0,
          message: "No connected accounts found for this profile",
        };
      }

      console.log(
        "[AI][getNetWorth] ✅ Profile validated, calling getCashFlows with:",
        {
          profileId: profile.id,
          profileEmail: profile.email,
          plaidAccountIds: profile.plaidAccounts,
          uid: uid,
        },
      );

      const cashFlows = await accountsService.getCashFlows(profile, uid);

      console.log("[AI][getNetWorth] getCashFlows result:", {
        hasCashFlows: !!cashFlows,
        cashFlowsType: typeof cashFlows,
        keys: cashFlows ? Object.keys(cashFlows) : "null",
        netWorth: cashFlows?.netWorth,
        totalCashBalance: cashFlows?.totalCashBalance,
        totalAssets: cashFlows?.totalAssets,
        totalLiabilities: cashFlows?.totalLiabilities,
      });

      if (!cashFlows) {
        console.error(
          "[AI][getNetWorth] ❌ getCashFlows returned null/undefined",
        );
        return {
          netWorth: 0,
          totalCashBalance: 0,
          totalAssets: 0,
          totalLiabilities: 0,
          message: "No financial data available from accounts service",
        };
      }

      const result = {
        netWorth: cashFlows.netWorth || 0,
        totalCashBalance: cashFlows.totalCashBalance || 0,
        totalAssets: cashFlows.totalAssets || 0,
        totalLiabilities: cashFlows.totalLiabilities || 0,
        message: "Net worth calculated from current financial data",
      };

      console.log("[AI][getNetWorth] ✅ Final result:", result);
      console.log("[AI][getNetWorth] ====== DEBUG END ======\n");

      return result;
    } catch (error) {
      console.error("[AI][getNetWorth] ❌ Error:", error);
      console.error("[AI][getNetWorth] Error stack:", error.stack);
      return {
        netWorth: 0,
        totalCashBalance: 0,
        totalAssets: 0,
        totalLiabilities: 0,
        message: "Error calculating net worth",
        error: error.message,
      };
    }
  },

  /**
   * Retrieves all transactions for the current profile, filtered if filters are provided.
   */
  getProfileTransactions: async ({ uid, filters = {} }) => {
    try {
      const { profile } = context;

      console.log("\n🔍 [AI][getProfileTransactions] ====== DEBUG ======");
      console.log("[AI][getProfileTransactions] Context received:", {
        hasProfile: !!profile,
        profileId: profile?.id,
        profileEmail: profile?.email,
        profileName: profile?.name,
        profileIsPersonal: profile?.isPersonal,
        contextKeys: Object.keys(context),
      });

      if (!profile || !profile.id) {
        console.error(
          "[AI][getProfileTransactions] No profile or profile ID in context",
        );
        return {
          message: "Profile context not available",
          error: "Profile not found in context",
        };
      }

      console.log(
        `[AI][getProfileTransactions] ✅ Profile found, calling getProfileTransactions with:`,
        {
          email: profile.email,
          profileId: profile.id,
          uid: uid,
        },
      );

      const transactions = await accountsService.getProfileTransactions(
        profile,
        uid,
      );

      if (!transactions || transactions.length === 0) {
        console.log(
          `[AI][getProfileTransactions] No transactions found for profile ${profile.id}`,
        );
        return [];
      }

      if (filters.intent === 'count') {
        return { count: cleanedData.length };
      }
      return cleanedData;
    } catch (error) {
      console.error("[AI][getProfileTransactions] Error:", error);

      // Provide more specific error messages
      if (error.message.includes("Profile not found")) {
        return {
          message: "Profile not found in database",
          error: "Profile ID not found in user profiles",
        };
      } else if (error.message.includes("User not found")) {
        return {
          message: "User not found",
          error: "User authentication failed",
        };
      } else {
        return {
          message: "Failed to retrieve profile transactions",
          error: error.message,
        };
      }
    }
  },

  /**
   * Retrieves all transactions for the user, filtered if filters are provided.
   */
  getAllTransactions: async ({ uid, filters = {} }) => {
    try {
      const { profile } = context;
      const transactions = await accountsService.getUserTransactions(
        profile.email,
        uid,
      );

      if (!transactions || transactions.length === 0) {
        return [];
      }

      const filteredTransactions = filterTransactions(transactions, filters);
      const fixedTransactions =
        accountsService.formatTransactionsWithSigns(filteredTransactions);
      const cleanedData = fixedTransactions.map(
        ({
          _id,
          accountId,
          accountType,
          plaidTransactionId,
          pending,
          pending_transaction_id,
          internalReference,
          created_at,
          __v,
          institutionName,
          institutionId,
          ...rest
        }) => rest,
      );

      return cleanedData;
    } catch (error) {
      console.error("[AI][getAllTransactions] Error:", error);
      return {
        message: "Failed to retrieve all transactions",
        error: error.message,
      };
    }
  },

  /**
   * Retrieves all transactions for a specific account, filtered if filters are provided.
   */
  getAccountTransactions: async ({ plaidAccountId, uid, filters = {} }) => {
    try {
      const transactions = await accountsService.getTransactionsByAccount(
        plaidAccountId,
        uid,
      );

      if (!transactions || transactions.length === 0) {
        return [];
      }

      const filteredTransactions = filterTransactions(transactions, filters);
      const fixedTransactions =
        accountsService.formatTransactionsWithSigns(filteredTransactions);
      const cleanedData = fixedTransactions.map(
        ({
          _id,
          accountId,
          accountType,
          plaidTransactionId,
          pending,
          pending_transaction_id,
          internalReference,
          created_at,
          __v,
          institutionName,
          institutionId,
          ...rest
        }) => rest,
      );

      return cleanedData;
    } catch (error) {
      console.error("[AI][getAccountTransactions] Error:", error);
      return {
        message: "Failed to retrieve account transactions",
        error: error.message,
      };
    }
  },

  /**
   * Retrieves all user profiles.
   */
  getProfiles: async ({ uid }) => {
    try {
      const { profile } = context;
      const profiles = await businessService.getUserProfiles(
        profile.email,
        uid,
      );

      if (!profiles || profiles.length === 0) {
        return [];
      }

      const cleaned = profiles.map(
        ({ photo, plaidAccounts, color, nameParts, ...rest }) => rest,
      );
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

  /**
   * Gets a detailed breakdown of accounts by type with descriptions
   */
  getAccountsBreakdown: async ({ uid }) => {
    try {
      const { profile } = context;

      if (!profile || !profile.id) {
        return {
          message: "Profile context not available",
          error: "Profile not found in context",
        };
      }

      const accounts = await accountsService.getAccounts(profile, uid);

      if (!accounts) {
        return { message: "No accounts found", data: null };
      }

      // Extract account information by type
      const accountBreakdown = {};
      let totalBalance = 0;

      for (const [accountType, accountList] of Object.entries(accounts)) {
        if (Array.isArray(accountList) && accountList.length > 0) {
          accountBreakdown[accountType] = {
            count: accountList.length,
            totalBalance: accountList.reduce(
              (sum, acc) => sum + (parseFloat(acc.currentBalance) || 0),
              0,
            ),
            accounts: accountList.map((acc) => ({
              name:
                acc.account_name ||
                acc.account_official_name ||
                "Unnamed Account",
              balance: parseFloat(acc.currentBalance) || 0,
              mask: acc.mask || "****",
              institution: acc.institution_name || "Unknown Bank",
            })),
          };

          totalBalance += accountBreakdown[accountType].totalBalance;
        }
      }

      return {
        totalBalance,
        breakdown: accountBreakdown,
        summary: Object.entries(accountBreakdown).map(([type, data]) => ({
          type:
            type === "depository"
              ? "Banking"
              : type === "credit"
                ? "Credit Card"
                : type === "investment"
                  ? "Investment"
                  : type === "loan"
                    ? "Loan"
                    : type,
          count: data.count,
          totalBalance: data.totalBalance,
          description: `${data.count} ${data.count === 1 ? "account" : "accounts"} with total balance of $${data.totalBalance.toFixed(2)}`,
        })),
      };
    } catch (error) {
      console.error("[AI][getAccountsBreakdown] Error:", error);
      return {
        message: "Failed to retrieve account breakdown",
        error: error.message,
      };
    }
  },

  /**
   * Provides helpful information about US tax and banking forms.
   * This tool helps users understand how to fill out common US forms.
   */
  getTaxFormsHelp: async ({ formType, question }) => {
    try {
      const formTypeLower = (formType || "").toLowerCase();
      const questionLower = (question || "").toLowerCase();

      // Define comprehensive form information
      const formsInfo = {
        "w-2": {
          name: "W-2 Form (Wage and Tax Statement)",
          description: "Annual wage and tax statement from your employer",
          fields: [
            "Box 1: Wages, tips, other compensation",
            "Box 2: Federal income tax withheld",
            "Box 3: Social Security wages",
            "Box 4: Social Security tax withheld",
            "Box 5: Medicare wages and tips",
            "Box 6: Medicare tax withheld",
            "Box 7: Social Security tips",
            "Box 8: Allocated tips",
            "Box 9: Advance EIC payment",
            "Box 10: Dependent care benefits",
            "Box 11: Nonqualified plans",
            "Box 12: Various codes and amounts",
            "Box 13: Checkboxes for statutory employee, retirement plan, third-party sick pay",
            "Box 14: Other information",
            "Box 15: State employer identification number",
            "Box 16: State wages, tips, etc.",
            "Box 17: State income tax",
            "Box 18: Local wages, tips, etc.",
            "Box 19: Local income tax",
            "Box 20: Locality name",
          ],
          tips: [
            "Verify all personal information is correct",
            "Ensure Social Security number matches your card",
            "Check that wages and taxes withheld are accurate",
            "Keep copies for at least 3 years",
            "Use for federal and state tax filing",
          ],
        },
        1099: {
          name: "1099 Forms (Various Types)",
          description: "Information returns for various types of income",
          types: {
            "1099-NEC": "Non-employee compensation (freelance, contract work)",
            "1099-INT": "Interest income from banks, investments",
            "1099-DIV": "Dividend income from stocks, mutual funds",
            "1099-MISC": "Miscellaneous income (rents, prizes, legal fees)",
            "1099-R": "Distributions from pensions, IRAs, annuities",
            "1099-G": "Government payments (unemployment, tax refunds)",
            "1099-K": "Payment card and third-party network transactions",
          },
          commonFields: [
            "Payer information (name, address, TIN)",
            "Recipient information (your name, address, SSN)",
            "Account number",
            "Gross amount paid",
            "Federal income tax withheld",
            "State information (if applicable)",
          ],
          tips: [
            "Report all 1099 income on your tax return",
            "Keep records of expenses to offset income",
            "Consider estimated tax payments for large amounts",
            "Verify all amounts are correct",
          ],
        },
        bank: {
          name: "Bank Account Forms",
          description: "Common banking forms and applications",
          forms: {
            "Account Application":
              "Personal information, ID verification, initial deposit",
            "Loan Application":
              "Income verification, credit check, collateral information",
            "Credit Card Application":
              "Income, employment, existing debt information",
            "Mortgage Application":
              "Income, assets, liabilities, property information",
          },
          requiredDocuments: [
            "Government-issued photo ID",
            "Social Security card",
            "Proof of address (utility bill, lease)",
            "Proof of income (pay stubs, W-2, tax returns)",
            "Bank statements (for existing accounts)",
            "Employment verification",
          ],
        },
        mortgage: {
          name: "Mortgage Application Forms",
          description: "Home loan application and documentation",
          forms: [
            "Uniform Residential Loan Application (Form 1003)",
            "Borrower Authorization Form",
            "Credit Authorization Form",
            "Verification of Employment",
            "Verification of Deposit",
          ],
          requiredDocuments: [
            "Government-issued photo ID",
            "Social Security card",
            "Recent pay stubs (2-4 weeks)",
            "W-2 forms (last 2 years)",
            "Federal tax returns (last 2 years)",
            "Bank statements (last 2-3 months)",
            "Investment account statements",
            "Credit report authorization",
            "Property information (purchase agreement, listing)",
            "Down payment verification",
          ],
          tips: [
            "Gather all documents before starting application",
            "Ensure all information is accurate and current",
            "Be prepared to explain any credit issues",
            "Keep copies of everything submitted",
            "Respond promptly to any requests for additional information",
          ],
        },
      };

      // Determine which form information to return
      let responseData = {
        formType: formType || "general",
        question: question || "general help",
        timestamp: new Date().toISOString(),
      };

      if (formTypeLower.includes("w-2") || questionLower.includes("w-2")) {
        responseData.form = formsInfo["w-2"];
        responseData.message =
          "Here is comprehensive information about W-2 forms for tax filing.";
      } else if (
        formTypeLower.includes("1099") ||
        questionLower.includes("1099")
      ) {
        responseData.form = formsInfo["1099"];
        responseData.message =
          "Here is information about various 1099 forms for different types of income.";
      } else if (
        formTypeLower.includes("bank") ||
        questionLower.includes("bank")
      ) {
        responseData.form = formsInfo["bank"];
        responseData.message =
          "Here is information about common banking forms and required documents.";
      } else if (
        formTypeLower.includes("mortgage") ||
        questionLower.includes("mortgage")
      ) {
        responseData.form = formsInfo["mortgage"];
        responseData.message =
          "Here is comprehensive information about mortgage applications and required documentation.";
      } else {
        // General forms help
        responseData.availableForms = Object.keys(formsInfo);
        responseData.message =
          "I can help you with various US tax and banking forms. Ask about specific forms like W-2, 1099, bank applications, or mortgage forms.";
      }

      return responseData;
    } catch (error) {
      console.error("[AI][getTaxFormsHelp] Error:", error);
      return {
        message: "Failed to retrieve forms information",
        error: error.message,
        fallback:
          "I can help you with US tax forms (W-2, 1099), bank applications, and mortgage forms. What specific form do you need help with?",
      };
    }
  },

  /**
   * Provides general financial knowledge and tax information.
   * This tool helps users with general financial education and tax guidance.
   */
  getFinancialKnowledge: async ({ topic, question }) => {
    try {
      const topicLower = (topic || "").toLowerCase();
      const questionLower = (question || "").toLowerCase();

      // Define comprehensive financial knowledge
      const knowledgeBase = {
        tax_deadlines: {
          title: "Tax Filing Deadlines",
          content: `**2024 Tax Year Deadlines:**\n\n**Individual Tax Returns:**\n• April 15, 2025 - Regular filing deadline for 2024 tax year\n• October 15, 2025 - Extended filing deadline (if you filed Form 4868)\n\n**Estimated Tax Payments:**\n• Q1: April 15, 2024\n• Q2: June 17, 2024\n• Q3: September 16, 2024\n• Q4: January 15, 2025\n\n**Important Notes:**\n• If April 15 falls on a weekend or holiday, the deadline moves to the next business day\n• You can file for an automatic 6-month extension using Form 4868\n• Even with an extension, you must pay any taxes owed by April 15 to avoid penalties\n• State tax deadlines may vary - check your state's requirements\n\n**Pro Tip:** Consider filing early to get your refund sooner and avoid last-minute stress!`,
        },
        tax_deductions: {
          title: "Common Tax Deductions",
          content: `**Popular Tax Deductions for 2024:**\n\n**Retirement Contributions:**\n• Traditional IRA: Up to $6,500 ($7,500 if 50+)\n• 401(k): Up to $22,500 ($30,000 if 50+)\n• HSA: Up to $3,650 individual, $7,300 family\n\n**Business Expenses:**\n• Home office (if you work from home)\n• Business mileage and travel\n• Professional development\n• Business equipment and supplies\n\n**Other Deductions:**\n• Student loan interest (up to $2,500)\n• Medical expenses (if they exceed 7.5% of AGI)\n• Charitable contributions\n• State and local taxes (up to $10,000)\n\n**Important:** Keep detailed records and consult a tax professional for complex situations.`,
        },
        investment_basics: {
          title: "Investment Basics",
          content: `**Getting Started with Investing:**\n\n**Types of Investments:**\n• Stocks: Ownership in companies\n• Bonds: Loans to companies/governments\n• Mutual Funds: Pooled investments\n• ETFs: Exchange-traded funds\n• Real Estate: Property investments\n\n**Risk vs. Return:**\n• Higher potential returns usually mean higher risk\n• Diversification reduces risk\n• Time horizon affects investment strategy\n\n**Investment Accounts:**\n• 401(k): Employer-sponsored retirement\n• IRA: Individual retirement account\n• Brokerage: General investment account\n• Roth vs. Traditional: Tax timing differences\n\n**Key Principles:**\n• Start early and invest regularly\n• Diversify your portfolio\n• Consider your risk tolerance\n• Think long-term`,
        },
        credit_management: {
          title: "Credit and Debt Management",
          content: `**Building and Maintaining Good Credit:**\n\n**Credit Score Factors:**\n• Payment history (35%)\n• Credit utilization (30%)\n• Length of credit history (15%)\n• Credit mix (10%)\n• New credit (10%)\n\n**Improving Your Credit:**\n• Pay bills on time\n• Keep credit utilization below 30%\n• Don't close old accounts\n• Limit new credit applications\n• Monitor your credit report\n\n**Managing Debt:**\n• Pay high-interest debt first\n• Consider debt consolidation\n• Negotiate with creditors\n• Create a repayment plan\n• Avoid minimum payments only\n\n**Good Credit Score:** 700+ (Excellent: 800+)`,
        },
        retirement_planning: {
          title: "Retirement Planning Basics",
          content: `**Planning for Your Future:**\n\n**Retirement Accounts:**\n• 401(k): Employer match is free money\n• IRA: Tax advantages for retirement\n• Roth IRA: Tax-free withdrawals in retirement\n• HSA: Triple tax advantage for healthcare\n\n**How Much to Save:**\n• General rule: 10-15% of income\n• More if you start late\n• Consider employer matches\n• Factor in Social Security\n\n**Investment Strategy:**\n• Younger: More aggressive (stocks)\n• Older: More conservative (bonds)\n• Regular rebalancing\n• Consider target-date funds\n\n**Key Considerations:**\n• Healthcare costs in retirement\n• Inflation impact\n• Multiple income sources\n• Estate planning`,
        },
      };

      // Determine which knowledge to return
      let responseData = {
        topic: topic || "general",
        question: question || "general help",
        timestamp: new Date().toISOString(),
      };

      if (
        topicLower.includes("deadline") ||
        questionLower.includes("deadline") ||
        questionLower.includes("when")
      ) {
        responseData.knowledge = knowledgeBase["tax_deadlines"];
        responseData.message =
          "Here are the key tax filing deadlines for 2024.";
      } else if (
        topicLower.includes("deduction") ||
        questionLower.includes("deduction") ||
        questionLower.includes("reduce")
      ) {
        responseData.knowledge = knowledgeBase["tax_deductions"];
        responseData.message =
          "Here are common ways to reduce your taxable income.";
      } else if (
        topicLower.includes("investment") ||
        questionLower.includes("investment") ||
        questionLower.includes("invest")
      ) {
        responseData.knowledge = knowledgeBase["investment_basics"];
        responseData.message =
          "Here are the basics of getting started with investing.";
      } else if (
        topicLower.includes("credit") ||
        questionLower.includes("credit") ||
        questionLower.includes("debt")
      ) {
        responseData.knowledge = knowledgeBase["credit_management"];
        responseData.message =
          "Here are strategies for building and managing your credit.";
      } else if (
        topicLower.includes("retirement") ||
        questionLower.includes("retirement") ||
        questionLower.includes("401k")
      ) {
        responseData.knowledge = knowledgeBase["retirement_planning"];
        responseData.message = "Here are the basics of retirement planning.";
      } else {
        // General financial knowledge
        responseData.availableTopics = Object.keys(knowledgeBase);
        responseData.message =
          "I can help you with various financial topics including tax deadlines, deductions, investments, credit management, and retirement planning. What specific area would you like to learn about?";
      }

      return responseData;
    } catch (error) {
      console.error("[AI][getFinancialKnowledge] Error:", error);
      return {
        message: "Failed to retrieve financial knowledge",
        error: error.message,
        fallback:
          "I can help you with general financial education, tax guidance, and investment basics. What specific topic would you like to learn about?",
      };
    }
  },

  /**
   * Retrieves all files for the user profile
   */
  getFiles: async ({ uid, profileId }) => {
    try {
      const files = await filesService.getFiles(profileId, uid);

      if (!files || files.length === 0) {
        return { message: "No files found", data: [], count: 0 };
      }

      // Format files for better display
      const formattedFiles = files.map((file) => ({
        id: file.id,
        name: file.info?.nameOfDocument || file.info?.name || "Unnamed",
        type: file.type || "Unknown",
        folder: file.folder || "Root",
        updatedAt: file.updatedAt
          ? new Date(file.updatedAt).toLocaleDateString()
          : "Unknown",
        url: file.fileurl || "No URL",
      }));

      return {
        message: "Files retrieved successfully",
        data: formattedFiles,
        count: files.length,
        fileTypes: [...new Set(files.map((f) => f.type))],
        folders: [...new Set(files.map((f) => f.folder).filter(Boolean))],
      };
    } catch (error) {
      console.error("[AI][getFiles] Error:", error);
      return { message: "Failed to retrieve files", error: error.message };
    }
  },

  /**
   * Gets file count and summary information
   */
  getFileSummary: async ({ uid, profileId }) => {
    try {
      const files = await filesService.getFiles(profileId, uid);

      if (!files || files.length === 0) {
        return { message: "No files found", count: 0, summary: {} };
      }

      // Group files by type and folder
      const summary = {
        totalFiles: files.length,
        byType: {},
        byFolder: {},
        recentFiles: files
          .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
          .slice(0, 5),
      };

      files.forEach((file) => {
        // Count by type
        const type = file.type || "unknown";
        summary.byType[type] = (summary.byType[type] || 0) + 1;

        // Count by folder
        const folder = file.folder || "root";
        summary.byFolder[folder] = (summary.byFolder[folder] || 0) + 1;
      });

      return {
        message: "File summary generated",
        data: summary,
      };
    } catch (error) {
      console.error("[AI][getFileSummary] Error:", error);
      return {
        message: "Failed to generate file summary",
        error: error.message,
      };
    }
  },
});

// Helper functions for account categorization
function getAccountCategory(account) {
  const type = account.account_type?.toLowerCase() || "";
  const subtype = account.account_subtype?.toLowerCase() || "";
  const name = account.account_name?.toLowerCase() || "";

  if (type.includes("depository")) {
    if (
      subtype.includes("savings") ||
      name.includes("savings") ||
      name.includes("poupança")
    ) {
      return "savings";
    } else if (
      subtype.includes("checking") ||
      name.includes("checking") ||
      name.includes("corrente")
    ) {
      return "checking";
    }
    return "depository";
  } else if (type.includes("credit")) {
    return "credit";
  } else if (type.includes("investment")) {
    return "investment";
  } else if (type.includes("loan")) {
    return "loan";
  }

  return "other";
}

function getDisplayName(account) {
  // Try to get the most meaningful name
  if (account.account_official_name && account.account_official_name.trim()) {
    return account.account_official_name.trim();
  }

  if (account.account_name && account.account_name.trim()) {
    return account.account_name.trim();
  }

  if (account.institution_name && account.institution_name.trim()) {
    return `${account.institution_name.trim()} Account`;
  }

  return "Unnamed Account";
}
