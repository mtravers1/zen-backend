// Zentavos AI Tool Definitions
// Exports the function signatures for LLM tool calls (OpenAI/Groq function calling)

export const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "getUserInfo",
      description: "Get user profile information and settings",
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
      description: "Get cash flow summary including income, expenses, and net worth for the current profile",
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
      name: "getNetWorth",
      description: "Calculate and return the current net worth (assets - liabilities) including cash balances, investments, and debts",
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
      description: "Get all user profiles (personal and business) with basic information",
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
      description: "Get transactions for the current profile, optionally filtered by date, amount, merchant, or account",
      parameters: {
        type: "object",
        properties: {
          uid: { type: "string", description: "User ID" },
          filters: {
            type: "object",
            description: "Optional filters to refine transaction results",
            properties: {
              startDate: { type: "string", format: "date", description: "Start date (YYYY-MM-DD)" },
              endDate: { type: "string", format: "date", description: "End date (YYYY-MM-DD)" },
              minAmount: { type: "number", description: "Minimum transaction amount" },
              maxAmount: { type: "number", description: "Maximum transaction amount" },
              merchantIncludes: { type: "string", description: "Merchant name to search for" },
              accountId: { type: "string", description: "Specific account ID to filter by" },
              isInvestment: { type: "boolean", description: "Filter investment transactions only" },
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
      description: "Get all transactions across all profiles, optionally filtered by date, amount, merchant, or account",
      parameters: {
        type: "object",
        properties: {
          uid: { type: "string", description: "User ID" },
          filters: {
            type: "object",
            description: "Optional filters to refine transaction results",
            properties: {
              startDate: { type: "string", format: "date", description: "Start date (YYYY-MM-DD)" },
              endDate: { type: "string", format: "date", description: "End date (YYYY-MM-DD)" },
              minAmount: { type: "number", description: "Minimum transaction amount" },
              maxAmount: { type: "number", description: "Maximum transaction amount" },
              merchantIncludes: { type: "string", description: "Merchant name to search for" },
              accountId: { type: "string", description: "Specific account ID to filter by" },
              isInvestment: { type: "boolean", description: "Filter investment transactions only" },
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
      description: "Get all accounts for the current profile with balances and account details",
      parameters: {
        type: "object",
        properties: {
          uid: { type: "string", description: "User ID" },
          filters: {
            type: "object",
            description: "Optional filters to refine account results",
            properties: {
              institutionName: { type: "string", description: "Bank or institution name" },
              accountType: { type: "string", description: "Account type (checking, savings, investment, loan)" },
              accountSubtype: { type: "string", description: "Account subtype (e.g., investment, loan)" },
              nameIncludes: { type: "string", description: "Partial account name to search for" },
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
      description: "Get all accounts across all profiles with balances and account details",
      parameters: {
        type: "object",
        properties: {
          uid: { type: "string", description: "User ID" },
          filters: {
            type: "object",
            description: "Optional filters to refine account results",
            properties: {
              institutionName: { type: "string", description: "Bank or institution name" },
              accountType: { type: "string", description: "Account type (checking, savings, investment, loan)" },
              accountSubtype: { type: "string", description: "Account subtype (e.g., investment, loan)" },
              nameIncludes: { type: "string", description: "Partial account name to search for" },
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
      description: "Get weekly cash flow data including income, expenses, and trends",
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
      name: "getAccountTransactions",
      description: "Get transactions for a specific account, optionally filtered by date, amount, or merchant",
      parameters: {
        type: "object",
        properties: {
          plaidAccountId: { type: "string", description: "Plaid account ID" },
          uid: { type: "string", description: "User ID" },
          filters: {
            type: "object",
            description: "Optional filters to refine transaction results",
            properties: {
              startDate: { type: "string", format: "date", description: "Start date (YYYY-MM-DD)" },
              endDate: { type: "string", format: "date", description: "End date (YYYY-MM-DD)" },
              minAmount: { type: "number", description: "Minimum transaction amount" },
              maxAmount: { type: "number", description: "Maximum transaction amount" },
              merchantIncludes: { type: "string", description: "Merchant name to search for" },
              accountId: { type: "string", description: "Specific account ID to filter by" },
              isInvestment: { type: "boolean", description: "Filter investment transactions only" },
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
      description: "Get all financial assets including real estate, investments, vehicles, and other valuable items",
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
      description: "Get all business and personal trips with details like date, distance, purpose, and expenses",
      parameters: {
        type: "object",
        properties: {
          uid: { type: "string", description: "User ID" },
          query: {
            type: "object",
            description: "Optional query filters for trips",
            properties: {
              profileId: { type: "string", description: "Filter by specific profile" },
              userId: { type: "string", description: "Filter by specific user" },
              vehicleId: { type: "string", description: "Filter by specific vehicle" },
              minMiles: { type: "number", description: "Minimum trip distance in miles" },
              maxMiles: { type: "number", description: "Maximum trip distance in miles" },
              dateRange: { type: "string", description: "Date range filter (YYYY-MM-DD < YYYY-MM-DD)" },
              search: { type: "string", description: "Search term for trip purpose or notes" },
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
      name: "getAccountsBreakdown",
      description: "Get detailed breakdown of accounts by type (checking, savings, credit, etc.) with descriptions and balances",
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
      name: "getTaxFormsHelp",
      description: "Get comprehensive help and information about US tax forms (W-2, 1099), banking forms, and mortgage applications. This tool provides detailed explanations, required fields, and tips for filling out common US financial forms.",
      parameters: {
        type: "object",
        properties: {
          formType: { 
            type: "string", 
            description: "Type of form to get help with (e.g., 'W-2', '1099', 'bank', 'mortgage', or leave empty for general help)" 
          },
          question: { 
            type: "string", 
            description: "Specific question about the form (e.g., 'How do I fill out a 1099 form for freelance income?')" 
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getFileCabinetFiles",
      description: "Get files and documents from the user's file cabinet, useful for file-related context and queries",
      parameters: {
        type: "object",
        properties: {
          uid: { type: "string", description: "User ID" },
          fileType: { type: "string", description: "Filter by file type (tax, bank_statement, receipt, etc.)" },
          searchTerm: { type: "string", description: "Search term to filter files by name or category" },
        },
        required: ["uid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getFinancialKnowledge",
      description: "Get general financial education and tax guidance on topics like tax deadlines, deductions, investments, credit management, and retirement planning. This tool provides educational content without requiring personal financial data.",
      parameters: {
        type: "object",
        properties: {
          topic: { 
            type: "string", 
            description: "Financial topic area (e.g., 'tax_deadlines', 'deductions', 'investments', 'credit', 'retirement', or leave empty for general help)" 
          },
          question: { 
            type: "string", 
            description: "Specific question about the financial topic (e.g., 'What are the tax filing deadlines for 2024?')" 
          },
        },
        required: [],
      },
    },
  },
]; 