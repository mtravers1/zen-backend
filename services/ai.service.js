import { getUserDek } from "../database/encryption.js";
import User from "../database/models/User.js";
import accountsService from "./accounts.service.js";
import businessService from "./businesses.service.js";
import ollama from "ollama";
import authService from "./auth.service.js";
import assetsService from "./assets.service.js";
import tripService from "./trips.service.js";

const makeRequest = async (prompt, uid, profile, incomingMessages, screen) => {
  try {
    const dek = await getUserDek(uid);
    const user = await getUserInfo(uid, dek, profile);
    const email = user.email[0].email;
    const baseScreen = screen.split("/")[0];
    const dataScreen = screen.split("/")[1];
    const currentScreen = baseScreen.toLowerCase().trim();
    console.log("currentScreen", currentScreen);
    console.log("dataScreen", dataScreen);

    //TODO: add file cabinet functions

    let screenPrompt = "";
    switch (currentScreen) {
      case "dashboard":
        screenPrompt = `
          You are assisting a user on their financial dashboard screen.

          The dashboard provides a general financial overview of the current profile. It includes:
          - Cash flow (income vs. expenses)
          - Net worth
          - A preview of recent transactions
          - Account summaries for this profile

          Your responses should focus on financial insights, patterns, and high-level summaries using the available data. Help the user understand trends, balances, or how their finances are evolving over time. If the user asks for specific details, refer only to what would be shown in this general overview — not deep dives like full transaction history or specific account breakdowns unless explicitly asked.

          Do not respond based on visual elements (like charts or cards), and do not switch focus to other screens (like trips or assets) unless the user asks clearly.
          `;

        break;
      case "trips":
        if (dataScreen) {
          screenPrompt = `
          You are assisting a user on the detailed view of a specific trip.

          The trip ID is: "${dataScreen}". This screen shows detailed information about this particular trip, including:
          - Date and time
          - Starting and ending addresses
          - Total miles
          - Associated vehicle
          - Encrypted metadata like place name, and coordinates

          Your responses must focus solely on the data for this trip ID. Answer questions about the trip's distance, location, purpose, or vehicle, but do not generalize or switch to other trips or financial areas unless explicitly asked.

          If the user’s question is about something broader, clarify if they’d like to leave this specific trip view.
          `;
        } else {
          screenPrompt = `
          You are assisting a user on the general trips screen.

          This screen lists all the trips recorded for the current profile. Each trip includes metadata such as date, mileage, locations, addresses, and associated vehicle or profile information.

          Focus on answering questions related to this list, such as totals, summaries, trends, filtering by date or mileage, or patterns in travel behavior. Only refer to data from this overview unless the user specifically mentions a trip in detail.

          Do not answer questions unrelated to trips unless explicitly requested.
          `;
        }
        break;
      case "assets":
        if (dataScreen) {
          screenPrompt = `
          You are assisting a user on the detailed view of a specific asset.

          The asset ID is: "${dataScreen}". This screen contains detailed information about this particular asset, such as:
          - Name and type (e.g. real estate, investment)
          - Value or basis
          - Purchase date
          - Location or address (if applicable)
          - Any custom metadata the user may have added

          Focus your answers on analyzing or explaining this single asset. Do not generalize to other assets unless the user asks to compare or shift focus. Only discuss other financial topics if clearly requested.

          If the user's question is too broad, ask whether they want information beyond this specific asset.
          `;
        } else {
          screenPrompt = `
          You are assisting a user on the general assets screen.

          This screen displays all financial assets associated with the current profile. These may include real estate, investments, vehicles, cash, or other asset types. Each asset includes metadata like name, type, value, and other details.

          Focus your answers on summarizing, comparing, or analyzing the user's assets as a whole or by category. Only refer to the data shown on this screen. Do not infer information about a specific asset unless the user refers to it explicitly.

          Avoid switching to unrelated financial areas like transactions or trips unless clearly requested.
          `;
        }
        break;
      case "transactions":
        if (dataScreen === "all") {
          screenPrompt = `
          You are assisting a user on the general transactions screen.

          This screen displays all financial transactions from **all accounts** associated with the current profile. It provides a global view of recent income, expenses, and transfers, helping the user monitor their financial activity.

          Focus your answers on summarizing spending habits, identifying trends, highlighting recent activity, or categorizing expenses and income across accounts.

          Avoid referencing specific accounts or transactions unless the user requests it explicitly. Do not shift focus to other financial sections unless clearly prompted.
          `;
        } else {
          screenPrompt = `
          You are assisting a user on the detailed view of a specific account's transactions.
          You have to respond with information related to the account only, unless the user explicitly asks for something else.
          The Plaid account ID is: "${dataScreen}". This screen shows:
          - All transactions tied to this account
          - Account details such as name, mask, institution, and account type
          - Balances (current and available)

          Focus your responses on activity related to this account only. This may include analyzing spending patterns, listing recent transactions, or checking specific balances.

          Do not reference data from other accounts or financial areas unless explicitly requested by the user.
          `;
        }

        break;
      default:
        screenPrompt =
          "You are assisting a user on the Zentavos application, you are not in a specific screen. The user may ask you about their financial data, including expenses, mileage, receipts, bank transactions, investments, and assets. You should focus on answering questions related to these topics and avoid discussing unrelated matters.";
        break;
    }

    console.log("Userid", uid);

    let systemPrompt = `# System Prompt: Zentavos AI Chief Financial Officer

## Persona and Goal

You are Zentavos, an AI chief financial officer integrated within the Zentavos application. Your sole purpose is to help users understand their financial data (expenses, mileage, receipts, bank transactions, investments, assets) stored within the Zentavos system, specifically for tax preparation, business insights, and financial education related to _their_ data.

## Scope and Boundaries

- **ALLOWED:** Answer questions directly related to the user's financial data managed by Zentavos. This includes summarizing transactions, calculating totals, retrieving specific financial documents, explaining tax implications based _only_ on the provided data, analyzing financial trends within their accounts, and financial projections as it relates to their accounts. You can process text queries, images (like receipts), and documents provided by the user or retrieved via tools.
- **FORBIDDEN:** You MUST refuse to answer any questions outside this scope. This includes general knowledge questions, investment advice, financial advice as it relates to investments, speculation, predictions, or opinions, creative writing, coding, or any topic unrelated to the user's Zentavos financial information. If a question is ambiguous or borders on being out of scope, ask for clarification to ensure it relates directly to the user's data in Zentavos. Do not engage in casual conversation or pleasantries.

## Input Processing

You can receive user queries as text. You can also process images (e.g., receipts uploaded by the user) and documents (e.g., bank statements, tax forms stored in the user's account). When an image or document is relevant to the query, incorporate its information into your analysis.

## Available Tools

You have access to the following tools. Use them _only_ when necessary to answer a user's query accurately. Plan your tool usage as part of your thought process.

1.  **doc_retrieval**: Use this tool to search for and retrieve specific documents (e.g., invoices, tax forms, bank statements) stored in the user's Zentavos cloud storage. Specify the type of document or keywords to search for.
2.  **db_retrieval**: Use this tool to query the Zentavos database (MongoDB) for structured financial data. This includes transactions, account balances, expense categories, mileage logs, asset details, investment holdings, etc. Formulate specific queries to retrieve the necessary data points.

  The current UID or user ID is "${uid}". This is the unique identifier for the user whose data you are accessing. You can use this UID to retrieve user-specific information.
  The current profile is "${profile}", which is the profile the user is currently using. A profile refers to a business or personal account within the Zentavos system. Each user can have multiple profiles, and each profile can have multiple bank accounts. You can look up other profiles if the user asks for them.

  If you need to use the current date, use the following format: YYYY-MM-DD. Today is "${
    new Date().toISOString().split("T")[0]
  }".

  * Auth information:
    * If you need personal data like name, email, or role, use the "getUserInfo" function with this UID.

  * Profiles information:
    * If you need information about the user’s profiles or a different profile, use the "getProfiles" function with the same UID.
    * You can assume the current profile unless the user specifies otherwise.

  * Accounts information:
    An account refers to a bank account linked to the user's profile.

    * To get accounts from a specific profile, use the "getAccountsByProfile" function with the UID and the profile.id, and optional filters.
    * To get all user accounts (across all profiles), use the "getAllUserAccounts" function with the same UID and optional filters.

    Filters supported:
    - "institutionName" (e.g. "Chase")
    - "accountType" (e.g. "depository", "credit", "investment")
    - "accountSubtype" (e.g. "checking", "savings", "401k")
    - "nameIncludes" (matches part of "account_name" or "account_official_name")

  * Transactions information:

    * To get all transactions for a profile, use the "getProfileTransactions" function with the UID and optional filters.
    * To get transactions for a specific account, use the "getAccountTransactions" function with the UID and the plaid account ID (from the accounts list) and optional filters.
    * To get all transactions across all profiles, use the "getAllTransactions" function with the UID and optional filters.

    Filters supported:
    - "startDate" and "endDate" (format: YYYY-MM-DD)
    - "minAmount" and "maxAmount"
    - "merchantIncludes" (matches part of merchant name)
    - "accountId" (plaid account ID)
    - "isInvestment" (true or false)

    These filters should be passed inside a "filters" object, alongside the required UID.

    Example:
    {
      "uid": "user123",
      "filters": {
        "startDate": "2024-04-01",
        "endDate": "2024-04-30",
        "merchantIncludes": "amazon"
      }
    }

  * Financial metrics:

    * To get financial summaries like cash flow, net worth, cash runway, or average income/spending, use the "getCashFlows" function with the UID and profile object.
    * For weekly cash flow data, use the "getCashFlowsWeekly" function with the UID and profile.id.

  * Assets information:

    * To get all assets, use the "getAssets" function with the UID.

  * Trips information:
    You have access to the "getTrips" function, which retrieves trips associated with a given user. It requires a "uid" (the authenticated user ID) and a "query" object. The "query" object may contain optional filters:

      - "profileId": Filter by a specific profile ID.
      - "userId": Filter by a specific user ID.
      - "vehicleId": Filter by a specific vehicle ID.
      - "minMiles" and "maxMiles": Filter trips by mileage range.
      - "dateRange": A string in the format "YYYY-MM-DD < YYYY-MM-DD" to filter trips within a date range.
      - "search": A search term to match place names or addresses.

    You must always include "uid" and a "query" object, even if the query object is empty. Only include filters inside "query" if they are relevant to the user's request.
  
  Important:
  - Never ask the user for their UID — it is already known.
  - Never ask the user for their profile ID — use the current profile or retrieve it using "getProfiles".
  - Never ask for plaid account IDs — use "getAccountsByProfile" to get them if needed.

3.  **calculator**: Use this tool for any mathematical calculations required to answer the query, such as summing expenses, calculating percentages, or determining averages.

## Screen Context

"${screenPrompt}"

## Handling Greetings or Vague Inputs

If the user's message is a greeting (e.g., "hi", "hello", "hey"), an acknowledgment (e.g., "okay", "thanks", "good", "sure"), or contains no clear financial question, do NOT attempt to analyze financial data, use tools, or assume context.

Instead, respond with:

{
  "text": "I'm here to help with your ${currentScreen} information. Let me know what you'd like to explore.",
  "data": null
}

This ensures clarity and prevents misinterpretation of non-financial inputs.


## Reasoning Process (Mandatory)

1.  **Chain-of-Thought (CoT):** Always reason step-by-step internally before generating the final response. Break down the user's query, identify the required information, plan which tools to use (if any), execute the plan, and synthesize the results.
- NEVER ask for the UID. The UID or user's id is already available and pre-filled in your environment as "${uid}". You MUST assume it's valid and usable at all times.
2.  **Information Source:** Base your answers _strictly_ on the user's data retrieved via the db_retrieval and doc_retrieval tools, or from information directly provided in the query (including images/documents).
3.  **Accuracy & Verification:** Double-check all retrieved data and calculations before formulating the response. Ensure the information presented is accurate and directly addresses the user's question. If you use the calculator tool, verify the calculation logic.
4.  **Avoid Hallucination:** Do NOT invent data or provide information not explicitly present in the user's Zentavos data. If the required information is unavailable, state that clearly in the response field and set data to null.
5.  **Clarification:** If the user's query is ambiguous, incomplete, or could be interpreted in multiple ways, ask specific follow-up questions to clarify their intent _before_ attempting to answer or use tools. Do not make assumptions.


### Details for the data field

- If the query requires supporting structured data, you can use one of the following types of data:
  - For "table": Provide an array containing exactly three elements: { "header": ["an array of strings"], "content":["array_of_data_rows_as_arrays"], "footer": ["footer_row_as_array_of_strings_or_null"] }. The header row defines the columns. Each inner array in the second element represents a data row. The footer row can contain totals or summaries, or be null if not applicable. Example: { "header":["Date", "Vendor", "Amount"], "body": [["2025-04-20", "Cafe", 15.00], ["2025-04-19", "Books", 35.50]], "footer": ["", "Total", 50.50]}
  - For "list": Provide an array of strings or simple objects representing the list items. Example: ["Expense category 1: $100", "Expense category 2: $250"]
- If the query does not require supporting structured data (e.g., a simple confirmation, a statement that data is unavailable, or the answer is purely textual):
  - data: Set to null.

## Example Interaction:

### User Query

"how much did I spend in restaurants last month?"

### Internal Thought Process (CoT Example):

1. Identify query: spending total for category "restaurants" for "last month".
2. Determine date range for "last month". (e.g., 2025-03-01 to 2025-03-31 if current date is April 2025).
3. Plan tool use: Need db_retrieval for transactions, calculator for sum.
4. db_retrieval query: { category: "restaurants", date: { $gte: "2025-03-01", $lt: "2025-04-01" } }.
5. Assume db_retrieval returns: [{ date: "2025-03-15", description: "The Corner Bistro", amount: 35.50 }, { date: "2025-03-28", description: "Pizza Place", amount: 15.00 }].
6. calculator input: 35.50 + 15.00. Output: 50.50.
7. Format output: response with the total, data as a table with headers [Date, Restaurant, Amount], the two transaction rows, and a footer ["", "Total", 50.50].

### Output 

You MUST always respond in strict JSON format with two fields:

{
  "text": "<a clear and helpful explanation for the user in natural language>",
  "data": <an array of objects representing tabular data, or null if there's no structured data>
}

- The "text" field should contain the main explanation or answer.
- The "data" field should include an array of objects if tabular data (e.g., summaries by category, transaction lists, totals, etc.) is present.
- If there’s no structured data to show, set the "data" field to null.

Example:

{
  "text": "Here is the summary by category based on your account data.",
  "data": [
    { "category": "Debit Accounts", "total": 5950 },
    { "category": "Credit Accounts", "total": 5950 },
    { "category": "Investment", "total": 47905.48 },
    { "category": "Loans", "total": 243128.12 },
    { "category": "Other", "total": 0 }
  ]
}



## RULES
- Exclude any internal or backend fields like "id", "profileId", "objectId", "internalId", "createdAt", "__v", etc. from the final output.
- Show only user-relevant information.
- Never fabricate or hallucinate data. If a tool call (e.g. getAssets) has not returned real data, do not assume or make up a result. Instead, inform the user that the information is not available or that data is still loading.
- If tool results are missing or empty, return a message like: "I couldn't find any data for that profile." Do not invent categories or values.
- Do not include anything outside the JSON.
- Do not use Markdown.
- Do not add any extra commentary or explanations.
- Only return the raw JSON object.

`;
    const messages = [
      {
        role: "system",
        content: systemPrompt,
      },
    ];
    // const incomingMessagesLength = incomingMessages.length;
    // if (incomingMessagesLength > 0) {
    //   const lastMessage = incomingMessages[incomingMessagesLength - 1];

    //   if (lastMessage.message) {
    //     messages.push({
    //       role: "user",
    //       content: lastMessage.message,
    //     });
    //   }

    //   if (lastMessage.response) {
    //     messages.push({
    //       role: "assistant",
    //       content: lastMessage.response,
    //     });
    //   }
    // }

    messages.push({
      role: "user",
      content: prompt,
    });

    const tools = [
      {
        type: "function",
        function: {
          name: "getUserInfo",
          description: "Get user information",
          parameters: {
            type: "object",
            properties: {
              uid: {
                type: "string",
                description: "User ID",
              },
            },
            required: ["uid"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "getCashFlows",
          description:
            "Get cash flows for a user. This includes: - Cash flow: The amount of money that comes or goes out of a profile. - Average daily income: The average amount of money that comes into a profile daily. - Average daily spending: The average amount of money that goes out of a profile daily. ",
          parameters: {
            type: "object",
            properties: {
              profile: {
                type: "string",
                description: "Profile ID",
              },
              uid: {
                type: "string",
                description: "User ID",
              },
            },
            required: ["profile", "uid"],
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
              uid: {
                type: "string",
                description: "User ID",
              },
            },
            required: ["uid"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "getProfileTransactions",
          description:
            "Get all transactions for a profile, optionally filtered by date, amount, merchant name, or account.",
          parameters: {
            type: "object",
            properties: {
              uid: {
                type: "string",
                description: "User ID",
              },
              filters: {
                type: "object",
                description: "Optional filters to refine the results",
                properties: {
                  startDate: {
                    type: "string",
                    format: "date",
                    description:
                      "Filter transactions from this date (inclusive). Format: YYYY-MM-DD",
                  },
                  endDate: {
                    type: "string",
                    format: "date",
                    description:
                      "Filter transactions up to this date (inclusive). Format: YYYY-MM-DD",
                  },
                  minAmount: {
                    type: "number",
                    description: "Minimum transaction amount",
                  },
                  maxAmount: {
                    type: "number",
                    description: "Maximum transaction amount",
                  },
                  merchantIncludes: {
                    type: "string",
                    description: "Partial or full merchant name to match",
                  },
                  accountId: {
                    type: "string",
                    description: "Filter by specific Plaid account ID",
                  },
                  isInvestment: {
                    type: "boolean",
                    description:
                      "Filter by investment transactions (true/false)",
                  },
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
          description:
            "Get all transactions for a user across all profiles. Optionally filtered by date, amount, merchant name, or account.",
          parameters: {
            type: "object",
            properties: {
              uid: {
                type: "string",
                description: "User ID",
              },
              filters: {
                type: "object",
                description: "Optional filters to refine the results",
                properties: {
                  startDate: {
                    type: "string",
                    format: "date",
                    description:
                      "Filter transactions from this date (inclusive). Format: YYYY-MM-DD",
                  },
                  endDate: {
                    type: "string",
                    format: "date",
                    description:
                      "Filter transactions up to this date (inclusive). Format: YYYY-MM-DD",
                  },
                  minAmount: {
                    type: "number",
                    description: "Minimum transaction amount",
                  },
                  maxAmount: {
                    type: "number",
                    description: "Maximum transaction amount",
                  },
                  merchantIncludes: {
                    type: "string",
                    description: "Partial or full merchant name to match",
                  },
                  accountId: {
                    type: "string",
                    description: "Filter by specific Plaid account ID",
                  },
                  isInvestment: {
                    type: "boolean",
                    description:
                      "Filter by investment transactions (true/false)",
                  },
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
              uid: {
                type: "string",
                description: "User ID",
              },
              filters: {
                type: "object",
                description: "Optional filters to refine the results",
                properties: {
                  institutionName: {
                    type: "string",
                    description: "Institution name to filter accounts",
                  },
                  accountType: {
                    type: "string",
                    description:
                      "Account type to filter accounts (e.g., checking, savings)",
                  },
                  accountSubtype: {
                    type: "string",
                    description:
                      "Account subtype to filter accounts (e.g., investment, loan)",
                  },
                  nameIncludes: {
                    type: "string",
                    description:
                      "Partial or full account name to match (e.g., 'Chase')",
                  },
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
              uid: {
                type: "string",
                description: "User ID",
              },
              filters: {
                type: "object",
                description: "Optional filters to refine the results",
                properties: {
                  institutionName: {
                    type: "string",
                    description: "Institution name to filter accounts",
                  },
                  accountType: {
                    type: "string",
                    description:
                      "Account type to filter accounts (e.g., checking, savings)",
                  },
                  accountSubtype: {
                    type: "string",
                    description:
                      "Account subtype to filter accounts (e.g., investment, loan)",
                  },
                  nameIncludes: {
                    type: "string",
                    description:
                      "Partial or full account name to match (e.g., 'Chase')",
                  },
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
          description:
            "Get weekly cash flows for a user. This includes: - Cash flow: The amount of money that comes or goes out of a profile. - Average daily income: The average amount of money that comes into a profile daily. - Average daily spending: The average amount of money that goes out of a profile daily.",
          parameters: {
            type: "object",
            properties: {
              profile: {
                type: "string",
                description: "Profile ID",
              },
              uid: {
                type: "string",
                description: "User ID",
              },
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
              plaidAccountId: {
                type: "string",
                description: "Plaid account ID",
              },
              uid: {
                type: "string",
                description: "User ID",
              },
              filters: {
                type: "object",
                description: "Optional filters to refine the results",
                properties: {
                  startDate: {
                    type: "string",
                    format: "date",
                    description:
                      "Filter transactions from this date (inclusive). Format: YYYY-MM-DD",
                  },
                  endDate: {
                    type: "string",
                    format: "date",
                    description:
                      "Filter transactions up to this date (inclusive). Format: YYYY-MM-DD",
                  },
                  minAmount: {
                    type: "number",
                    description: "Minimum transaction amount",
                  },
                  maxAmount: {
                    type: "number",
                    description: "Maximum transaction amount",
                  },
                  merchantIncludes: {
                    type: "string",
                    description: "Partial or full merchant name to match",
                  },
                  accountId: {
                    type: "string",
                    description: "Filter by specific Plaid account ID",
                  },
                  isInvestment: {
                    type: "boolean",
                    description:
                      "Filter by investment transactions (true/false)",
                  },
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
              uid: {
                type: "string",
                description: "User ID",
              },
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
              uid: {
                type: "string",
                description: "User ID",
              },
              query: {
                type: "object",
                properties: {
                  profileId: { type: "string" },
                  userId: { type: "string" },
                  vehicleId: { type: "string" },
                  minMiles: { type: "number" },
                  maxMiles: { type: "number" },
                  dateRange: {
                    type: "string",
                    description: "Format: YYYY-MM-DD < YYYY-MM-DD",
                  },
                  search: { type: "string" },
                },
              },
            },
            required: ["uid"],
          },
        },
      },
    ];

    const availableFunctions = {
      //auth
      getUserInfo: async ({ uid }) => {
        const user = await authService.own(uid);
        if (!user) {
          return "No user information available";
        }
        const { profilePhotoUrl, ...cleanedData } = user;
        return cleanedData;
      },
      //accounts
      getAllUserAccounts: async ({ uid, filters = {} }) => {
        const accounts = await accountsService.getAllUserAccounts(email, uid);
        if (!accounts) {
          return "No user accounts available";
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
          }) => rest
        );
        const filteredAccounts = filterAccounts(cleanedData, filters);
        return filteredAccounts;
      },
      getAccountsByProfile: async ({ uid, filters = {} }) => {
        const accounts = await accountsService.getAccounts(profile, uid);
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
        const formatttedAccounts =
          accountsService.formatAccountsBalances(filteredAccounts);
        return formatttedAccounts;
      },
      getCashFlows: async ({ uid }) => {
        const cashFlows = await accountsService.getCashFlows(profile, uid);
        if (!cashFlows) {
          return "No cash flow information available";
        }
        const { weeklyCashFlow, ...cleanedData } = cashFlows;

        return cleanedData;
      },
      getCashFlowsWeekly: async ({ uid }) => {
        const cashFlows = await accountsService.getCashFlowsWeekly(
          profile,
          uid
        );
        if (!cashFlows) {
          return "No cash flow information available";
        }
        for (const week of cashFlows.weeklyCashFlow) {
          delete week.testing;
          delete week.depository;
          delete week.credit;
        }
        return cashFlows.weeklyCashFlow;
      },
      getProfileTransactions: async ({ uid, filters = {} }) => {
        const transactions = await accountsService.getProfileTransactions(
          email,
          profile.id,
          uid
        );
        if (!transactions) {
          return "No transaction information available";
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
          }) => rest
        );
        return cleanedData;
      },
      getAllTransactions: async ({ uid, filters = {} }) => {
        const transactions = await accountsService.getUserTransactions(
          email,
          uid
        );
        if (!transactions) {
          return "No transaction information available";
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
          }) => rest
        );
        return cleanedData;
      },
      getAccountTransactions: async ({ plaidAccountId, uid, filters = {} }) => {
        const transactions = await accountsService.getTransactionsByAccount(
          plaidAccountId,
          uid
        );
        if (!transactions) {
          return "No transaction information available";
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
          }) => rest
        );
        return cleanedData;
      },
      //TODO account details

      //business
      getProfiles: async ({ uid }) => {
        const profiles = await businessService.getUserProfiles(email, uid);
        if (!profiles) {
          return "No profiles available";
        }
        const cleaned = profiles.map(
          ({ photo, plaidAccounts, color, nameParts, ...rest }) => rest
        );
        return cleaned;
      },

      //assets
      getAssets: async ({ uid }) => {
        const assets = await assetsService.getAssets(uid);
        if (!assets) {
          return "No assets available";
        }
        const cleaned = assets.map(({ account, updatedAt, ...rest }) => rest);

        return cleaned;
      },

      //trips
      getTrips: async ({ query, uid }) => {
        const trips = await tripService.fetchFilteredTrips(query, uid);
        if (!trips) {
          return "No trips available";
        }
        return trips;
      },
    };

    const localUrl = "http://localhost:11434/api/chat";
    const remoteUrl = "http://192.168.7.29:11434/api/chat";
    console.log("Calling AI service with prompt:", prompt);
    const response = await fetch(remoteUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "qwen3:1.7b",
        messages,
        stream: false,
        options: {
          temperature: 0,
        },
        tools,
      }),
    });

    const ollamaResponse = await response.json();

    console.log("AI service response:", ollamaResponse);

    const toolCalls = ollamaResponse.message.tool_calls || [];
    console.log("Tool calls:", JSON.stringify(toolCalls, null, 2));

    const finalMessages = [...messages, ollamaResponse.message];

    for (const toolCall of toolCalls) {
      const fnName = toolCall.function.name;
      const args =
        typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;

      const fn = availableFunctions[fnName];
      if (!fn) {
        console.error(`Function "${fnName}" not implemented.`);
        continue;
      }

      const result = await fn(args);
      console.log(`Function "${fnName}" result:`, result);

      finalMessages.push({
        role: "tool",
        name: fnName,
        content: JSON.stringify(result),
      });
    }

    let finalResponseMessage = ollamaResponse.message;

    if (finalResponseMessage.tool_calls) {
      let toolCallsRemaining = true;

      while (toolCallsRemaining) {
        // const finalResponse = await ollama.chat({
        //   model: "qwen3:1.7b",
        //   messages: finalMessages,
        // });

        const finalOllamaResponse = await fetch(remoteUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "qwen3:1.7b",
            messages: finalMessages,
            stream: false,
            options: {
              temperature: 0,
            },
            tools,
          }),
        });
        const finalResponse = await finalOllamaResponse.json();

        console.log("🧠 Final LLM response:", finalResponse);

        finalResponseMessage = finalResponse.message;
        finalMessages.push(finalResponseMessage);

        const nextToolCalls = finalResponse.message.tool_calls || [];

        if (nextToolCalls.length === 0) {
          toolCallsRemaining = false;
          break;
        }

        for (const toolCall of nextToolCalls) {
          const fnName = toolCall.function.name;
          const args =
            typeof toolCall.function.arguments === "string"
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function.arguments;

          const fn = availableFunctions[fnName];
          if (!fn) {
            console.error(`Function "${fnName}" not implemented.`);
            continue;
          }

          const result = await fn(args);
          console.log(`Function "${fnName}" result:`, result);

          finalMessages.push({
            role: "tool",
            name: fnName,
            content: JSON.stringify(result),
          });
        }
      }
    }
    const cleanResponse = finalResponseMessage.content
      .replace(/<think>[\s\S]*?<\/think>/g, "")
      .trim();

    let data = {
      text: null,
      data: null,
    };

    try {
      const jsonResponse = JSON.parse(cleanResponse);

      if (typeof jsonResponse === "object" && jsonResponse !== null) {
        if (jsonResponse.text) {
          data.text = jsonResponse.text;
        }
        if (jsonResponse.data) {
          data.data = jsonResponse.data;
        }
      } else {
        data.text = cleanResponse;
      }
    } catch (err) {
      data.text = cleanResponse;
    }

    return {
      message: prompt,
      response: data.text,
      data: data.data,
      screen: currentScreen,
      error: null,
    };
  } catch (error) {
    console.error("Error in makeRequest:", error);
    return {
      message: prompt,
      response: "Could not process your request right now.",
      data: null,
      screen: "",
      error: error.message,
    };
  }
};

const getUserInfo = async (uid) => {
  const user = await User.findOne({ authUid: uid });
  if (!user) {
    throw new Error("User not found");
  }
  return user;
};

const filterTransactions = (cleanedData, filters) => {
  if (!filters) {
    return cleanedData;
  }
  const filtered = cleanedData.filter((tx) => {
    const {
      startDate,
      endDate,
      minAmount,
      maxAmount,
      merchantIncludes,
      accountId,
      isInvestment,
    } = filters;

    if (
      startDate &&
      tx.transactionDate &&
      new Date(tx.transactionDate) < new Date(startDate)
    ) {
      return false;
    }

    if (
      endDate &&
      tx.transactionDate &&
      new Date(tx.transactionDate) > new Date(endDate)
    ) {
      return false;
    }

    if (minAmount && tx.amount < minAmount) return false;

    if (maxAmount && tx.amount > maxAmount) return false;

    if (
      merchantIncludes &&
      !(
        (tx.merchant?.name &&
          tx.merchant.name
            .toLowerCase()
            .includes(merchantIncludes.toLowerCase())) ||
        (tx.merchant?.merchantName &&
          tx.merchant.merchantName
            .toLowerCase()
            .includes(merchantIncludes.toLowerCase())) ||
        (tx.name &&
          tx.name.toLowerCase().includes(merchantIncludes.toLowerCase()))
      )
    ) {
      return false;
    }

    if (accountId && tx.plaidAccountId !== accountId) return false;

    if (typeof isInvestment === "boolean" && tx.isInvestment !== isInvestment) {
      return false;
    }
    return true;
  });

  return filtered;
};

const filterAccounts = (accounts, filters = {}) => {
  return accounts.filter((account) => {
    const { accountType, accountSubtype, institutionName, nameIncludes } =
      filters;

    if (
      accountType &&
      account.account_type?.toLowerCase() !== accountType.toLowerCase()
    ) {
      return false;
    }

    if (
      accountSubtype &&
      account.account_subtype?.toLowerCase() !== accountSubtype.toLowerCase()
    ) {
      return false;
    }

    if (
      institutionName &&
      account.institution_name?.toLowerCase() !== institutionName.toLowerCase()
    ) {
      return false;
    }

    if (
      nameIncludes &&
      !(
        (account.account_name &&
          account.account_name
            .toLowerCase()
            .includes(nameIncludes.toLowerCase())) ||
        (account.account_official_name &&
          account.account_official_name
            .toLowerCase()
            .includes(nameIncludes.toLowerCase()))
      )
    ) {
      return false;
    }

    return true;
  });
};

const aiService = {
  makeRequest,
};
export default aiService;
