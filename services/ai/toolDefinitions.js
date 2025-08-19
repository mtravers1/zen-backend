// Zentavos AI Tool Definitions
// Exports the function signatures for LLM tool calls (OpenAI/Groq function calling)

export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "getUserInfo",
      description: "Get user information",
      parameters: {
        type: "object",
        properties: {
          uid: { type: "string", description: "User ID" },
        },
        required: ["uid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getCashFlows",
      description: "Get cash flows for a user. This includes: - Cash flow: The amount of money that comes or goes out of a profile. - Average daily income: The average amount of money that comes into a profile daily. - Average daily spending: The average amount of money that goes out of a profile daily.",
      parameters: {
        type: "object",
        properties: {
          profile: { type: "string", description: "Profile ID" },
          uid: { type: "string", description: "User ID" },
        },
        required: ["profile", "uid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getNetWorth",
      description: "Calculate and return the current net worth for the user. Net worth = Total Assets - Total Liabilities. This includes cash balances, investments, assets, credit card balances, and loans.",
      parameters: {
        type: "object",
        properties: {
          uid: { type: "string", description: "User ID" },
        },
        required: ["uid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getProfiles",
      description: "Get all profiles for a user.",
      parameters: {
        type: "object",
        properties: {
          uid: { type: "string", description: "User ID" },
        },
        required: ["uid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getProfileTransactions",
      description: "Get all transactions for a profile, optionally filtered by date, amount, merchant name, or account.",
      parameters: {
        type: "object",
        properties: {
          uid: { type: "string", description: "User ID" },
          filters: {
            type: "object",
            description: "Optional filters to refine the results",
            properties: {
              startDate: { type: "string", format: "date", description: "Filter transactions from this date (inclusive). Format: YYYY-MM-DD" },
              endDate: { type: "string", format: "date", description: "Filter transactions up to this date (inclusive). Format: YYYY-MM-DD" },
              minAmount: { type: "number", description: "Minimum transaction amount" },
              maxAmount: { type: "number", description: "Maximum transaction amount" },
              merchantIncludes: { type: "string", description: "Partial or full merchant name to match" },
              accountId: { type: "string", description: "Filter by specific Plaid account ID" },
              isInvestment: { type: "boolean", description: "Filter by investment transactions (true/false)" },
            },
          },
        },
        required: ["uid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getAllTransactions",
      description: "Get all transactions for a user across all profiles. Optionally filtered by date, amount, merchant name, or account.",
      parameters: {
        type: "object",
        properties: {
          uid: { type: "string", description: "User ID" },
          filters: {
            type: "object",
            description: "Optional filters to refine the results",
            properties: {
              startDate: { type: "string", format: "date", description: "Filter transactions from this date (inclusive). Format: YYYY-MM-DD" },
              endDate: { type: "string", format: "date", description: "Filter transactions up to this date (inclusive). Format: YYYY-MM-DD" },
              minAmount: { type: "number", description: "Minimum transaction amount" },
              maxAmount: { type: "number", description: "Maximum transaction amount" },
              merchantIncludes: { type: "string", description: "Partial or full merchant name to match" },
              accountId: { type: "string", description: "Filter by specific Plaid account ID" },
              isInvestment: { type: "boolean", description: "Filter by investment transactions (true/false)" },
            },
          },
        },
        required: ["uid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getAccountsByProfile",
      description: "Get all accounts for a profile.",
      parameters: {
        type: "object",
        properties: {
          uid: { type: "string", description: "User ID" },
          filters: {
            type: "object",
            description: "Optional filters to refine the results",
            properties: {
              institutionName: { type: "string", description: "Institution name to filter accounts" },
              accountType: { type: "string", description: "Account type to filter accounts (e.g., checking, savings)" },
              accountSubtype: { type: "string", description: "Account subtype to filter accounts (e.g., investment, loan)" },
              nameIncludes: { type: "string", description: "Partial or full account name to match (e.g., 'Chase')" },
            },
          },
        },
        required: ["uid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getAllUserAccounts",
      description: "Get all accounts for a user.",
      parameters: {
        type: "object",
        properties: {
          uid: { type: "string", description: "User ID" },
          filters: {
            type: "object",
            description: "Optional filters to refine the results",
            properties: {
              institutionName: { type: "string", description: "Institution name to filter accounts" },
              accountType: { type: "string", description: "Account type to filter accounts (e.g., checking, savings)" },
              accountSubtype: { type: "string", description: "Account subtype to filter accounts (e.g., investment, loan)" },
              nameIncludes: { type: "string", description: "Partial or full account name to match (e.g., 'Chase')" },
            },
          },
        },
        required: ["uid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getCashFlowsWeekly",
      description: "Get weekly cash flows for a user. This includes: - Cash flow: The amount of money that comes or goes out of a profile. - Average daily income: The average amount of money that comes into a profile daily. - Average daily spending: The average amount of money that goes out of a profile daily.",
      parameters: {
        type: "object",
        properties: {
          profile: { type: "string", description: "Profile ID" },
          uid: { type: "string", description: "User ID" },
        },
        required: ["profile", "uid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getAccountTransactions",
      description: "Get all transactions for a specific account.",
      parameters: {
        type: "object",
        properties: {
          plaidAccountId: { type: "string", description: "Plaid account ID" },
          uid: { type: "string", description: "User ID" },
          filters: {
            type: "object",
            description: "Optional filters to refine the results",
            properties: {
              startDate: { type: "string", format: "date", description: "Filter transactions from this date (inclusive). Format: YYYY-MM-DD" },
              endDate: { type: "string", format: "date", description: "Filter transactions up to this date (inclusive). Format: YYYY-MM-DD" },
              minAmount: { type: "number", description: "Minimum transaction amount" },
              maxAmount: { type: "number", description: "Maximum transaction amount" },
              merchantIncludes: { type: "string", description: "Partial or full merchant name to match" },
              accountId: { type: "string", description: "Filter by specific Plaid account ID" },
              isInvestment: { type: "boolean", description: "Filter by investment transactions (true/false)" },
            },
          },
        },
        required: ["plaidAccountId", "uid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getAssets",
      description: "Get all assets for a user.",
      parameters: {
        type: "object",
        properties: {
          uid: { type: "string", description: "User ID" },
        },
        required: ["uid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTrips",
      description: "Get all trips for a user.",
      parameters: {
        type: "object",
        properties: {
          uid: { type: "string", description: "User ID" },
          query: {
            type: "object",
            properties: {
              profileId: { type: "string" },
              userId: { type: "string" },
              vehicleId: { type: "string" },
              minMiles: { type: "number" },
              maxMiles: { type: "number" },
              dateRange: { type: "string", description: "Format: YYYY-MM-DD < YYYY-MM-DD" },
              search: { type: "string" },
            },
          },
        },
        required: ["uid"],
      },
    },
  },
]; 