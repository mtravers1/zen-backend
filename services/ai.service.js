import { getUserDek } from "../database/encryption.js";
import User from "../database/models/User.js";
import accountsService from "./accounts.service.js";
import businessService from "./businesses.service.js";
import authService from "./auth.service.js";
import assetsService from "./assets.service.js";
import tripService from "./trips.service.js";
import dotenv from "dotenv";
import Groq from "groq-sdk";
import aiController from "../controllers/ai.controller.js";
dotenv.config();

const makeRequest = async (
	prompt,
	uid,
	profileId,
	incomingMessages,
	screen,
	res
) => {
	const AI_URL = process.env.AI_URL;
	const AI_MODEL = process.env.AI_MODEL;
	const GROQ_AI_MODEL = process.env.GROQ_AI_MODEL;
	const GROQ_API_KEY = process.env.GROQ_API_KEY;
	const groqClient = new Groq({
		apiKey: GROQ_API_KEY,
	});
	console.log("AI_URL", AI_URL);
	console.log("AI_MODEL", AI_MODEL);
	console.log("GROQ_AI_MODEL", GROQ_AI_MODEL);
	try {
		// Validate required parameters
		if (!uid) throw new Error("User ID (uid) is required");
		if (!profileId) throw new Error("Profile ID is required");

		const dek = await getUserDek(uid);
		const user = await getUserInfo(uid);
		if (!user?.email?.[0]?.email) throw new Error("User email not found");

		const email = user.email[0].email;
		const profiles = await businessService.getUserProfiles(email, uid);
		if (!profiles?.length) throw new Error("No profiles found for user");

		// Find the profile by ID
		let profile = profiles.find(async (p) => {
			// For personal profiles, we need to match the user's _id with the profileId
			if (p.isPersonal) {
				const user = await User.findOne({ authUid: uid }).lean();
				if (!user) {
					throw new Error("User not found");
				}
				return user._id.toString() === profileId;
			}
			// For business profiles, match the profile ID directly
			return p.id.toString() === profileId;
		});

		// If no profile found, try to find by user ID (for backward compatibility)
		if (!profile) {
			const user = await User.findOne({ authUid: uid }).lean();
			if (user && user._id.toString() === profileId) {
				profile = profiles.find((p) => p.isPersonal);
			}
		}

		if (!profile) {
			console.error(
				"Profile not found. Available profile IDs:",
				profiles.map((p) => ({
					id: p.id?.toString(),
					isPersonal: p.isPersonal,
					name: p.name,
				}))
			);
			throw new Error(
				`Profile with ID ${profileId} not found. Make sure the profile ID is correct.`
			);
		}

		// Make profile available to all nested functions
		const baseScreen = (screen || "").split("/")[0] || "";
		const dataScreen = (screen || "").split("/")[1];
		const currentScreen = baseScreen.toLowerCase().trim();
		console.log("currentScreen", currentScreen);
		console.log("dataScreen", dataScreen);

		// Get additional context based on current screen
		let screenContext = {};
		try {
			switch (currentScreen) {
				case "dashboard":
					// Get dashboard-specific data
					const cashFlows = await accountsService.getCashFlows(uid, profile);
					const weeklyCashFlow = await accountsService.getCashFlowsWeekly(uid, profile.id);
					const accounts = await accountsService.getAccountsByProfile(uid, profile.id);
					
					screenContext = {
						hasCashFlowData: !!cashFlows,
						hasWeeklyData: !!weeklyCashFlow,
						accountCount: accounts?.length || 0,
						accountTypes: accounts?.map(acc => acc.account_type) || [],
						recentTransactions: await accountsService.getProfileTransactions(uid, { limit: 5 })
					};
					break;
					
				case "transactions":
					if (dataScreen && dataScreen !== "all") {
						// Get account-specific data
						const account = await accountsService.getAccountById(uid, dataScreen);
						const accountTransactions = await accountsService.getAccountTransactions(uid, dataScreen, { limit: 10 });
						
						screenContext = {
							accountId: dataScreen,
							accountName: account?.account_name || "Unknown Account",
							accountType: account?.account_type || "Unknown",
							institution: account?.institution_name || "Unknown",
							currentBalance: account?.current_balance || 0,
							availableBalance: account?.available_balance || 0,
							recentTransactionCount: accountTransactions?.length || 0
						};
					} else {
						// Get general transactions data
						const allTransactions = await accountsService.getProfileTransactions(uid, { limit: 20 });
						const transactionSummary = allTransactions?.reduce((acc, trans) => {
							acc.totalCount++;
							acc.totalAmount += Math.abs(trans.amount || 0);
							if (trans.amount > 0) acc.incomeCount++;
							else acc.expenseCount++;
							return acc;
						}, { totalCount: 0, totalAmount: 0, incomeCount: 0, expenseCount: 0 });
						
						screenContext = {
							transactionCount: transactionSummary?.totalCount || 0,
							totalAmount: transactionSummary?.totalAmount || 0,
							incomeCount: transactionSummary?.incomeCount || 0,
							expenseCount: transactionSummary?.expenseCount || 0
						};
					}
					break;
					
				case "trips":
					if (dataScreen) {
						// Get trip-specific data
						const trip = await tripService.getTripById(uid, dataScreen);
						
						screenContext = {
							tripId: dataScreen,
							tripDate: trip?.date || "Unknown",
							tripMiles: trip?.miles || 0,
							hasLocationData: !!(trip?.metadata?.placeName || trip?.metadata?.pickupAddress)
						};
					} else {
						// Get general trips data
						const trips = await tripService.getTrips(uid, { profileId: profile.id });
						
						screenContext = {
							tripCount: trips?.length || 0,
							totalMiles: trips?.reduce((sum, trip) => sum + (trip.miles || 0), 0) || 0,
							hasTrips: trips && trips.length > 0
						};
					}
					break;
					
				case "assets":
					if (dataScreen) {
						// Get asset-specific data
						const asset = await assetsService.getAssetById(uid, dataScreen);
						
						screenContext = {
							assetId: dataScreen,
							assetName: asset?.name || "Unknown Asset",
							assetType: asset?.type || "Unknown",
							assetValue: asset?.value || 0
						};
					} else {
						// Get general assets data
						const assets = await assetsService.getAssets(uid);
						
						screenContext = {
							assetCount: assets?.length || 0,
							totalValue: assets?.reduce((sum, asset) => sum + (asset.value || 0), 0) || 0,
							assetTypes: assets?.map(asset => asset.type) || [],
							hasAssets: assets && assets.length > 0
						};
					}
					break;
					
				default:
					screenContext = {
						generalContext: true,
						availableScreens: ["dashboard", "transactions", "trips", "assets", "filecabinet"]
					};
			}
		} catch (error) {
			console.error("Error getting screen context:", error);
			screenContext = { error: "Failed to load screen context" };
		}

		console.log("Screen context:", screenContext);

		// Get profile context and available data
		let profileContext = {};
		try {
			// Get profile information
			const profileAccounts = await accountsService.getAccountsByProfile(uid, profile.id);
			const profileTransactions = await accountsService.getProfileTransactions(uid, { limit: 10 });
			const profileAssets = await assetsService.getAssets(uid);
			const profileTrips = await tripService.getTrips(uid, { profileId: profile.id });
			
			profileContext = {
				profileId: profile.id,
				profileName: profile.name,
				isPersonal: profile.isPersonal,
				accountCount: profileAccounts?.length || 0,
				transactionCount: profileTransactions?.length || 0,
				assetCount: profileAssets?.length || 0,
				tripCount: profileTrips?.length || 0,
				hasData: {
					accounts: profileAccounts && profileAccounts.length > 0,
					transactions: profileTransactions && profileTransactions.length > 0,
					assets: profileAssets && profileAssets.length > 0,
					trips: profileTrips && profileTrips.length > 0
				},
				accountTypes: profileAccounts?.map(acc => acc.account_type) || [],
				assetTypes: profileAssets?.map(asset => asset.type) || []
			};
		} catch (error) {
			console.error("Error getting profile context:", error);
			profileContext = { error: "Failed to load profile context" };
		}

		console.log("Profile context:", profileContext);

		// Get current page display context (what the user is actually seeing)
		let pageDisplayContext = {};
		try {
			switch (currentScreen) {
				case "dashboard":
					// Dashboard shows overview data
					const dashboardData = await accountsService.getCashFlows(uid, profile);
					pageDisplayContext = {
						pageType: "overview",
						displayedData: {
							cashFlow: dashboardData ? "Available" : "Not available",
							accounts: screenContext.accountCount > 0 ? `${screenContext.accountCount} accounts shown` : "No accounts",
							recentActivity: screenContext.recentTransactions?.length > 0 ? `${screenContext.recentTransactions.length} recent transactions` : "No recent activity"
						},
						userCanSee: [
							"Overall financial health",
							"Account balances summary",
							"Recent financial activity",
							"Cash flow trends"
						]
					};
					break;
					
				case "transactions":
					if (dataScreen && dataScreen !== "all") {
						// Specific account transactions view
						pageDisplayContext = {
							pageType: "account_detail",
							displayedData: {
								account: screenContext.accountName,
								balance: `$${screenContext.currentBalance}`,
								transactions: `${screenContext.recentTransactionCount} transactions shown`
							},
							userCanSee: [
								"Account-specific transactions",
								"Account balance and details",
								"Transaction history for this account"
							]
						};
					} else {
						// All transactions view
						pageDisplayContext = {
							pageType: "transactions_list",
							displayedData: {
								totalTransactions: screenContext.transactionCount,
								totalAmount: `$${screenContext.totalAmount}`,
								incomeVsExpense: `${screenContext.incomeCount} income, ${screenContext.expenseCount} expenses`
							},
							userCanSee: [
								"All profile transactions",
								"Spending patterns",
								"Income vs expense summary"
							]
						};
					}
					break;
					
				case "trips":
					if (dataScreen) {
						// Specific trip detail view
						pageDisplayContext = {
							pageType: "trip_detail",
							displayedData: {
								trip: `Trip ${screenContext.tripId}`,
								date: screenContext.tripDate,
								miles: screenContext.tripMiles
							},
							userCanSee: [
								"Trip details and metadata",
								"Location information",
								"Vehicle association"
							]
						};
					} else {
						// All trips list view
						pageDisplayContext = {
							pageType: "trips_list",
							displayedData: {
								totalTrips: screenContext.tripCount,
								totalMiles: screenContext.totalMiles
							},
							userCanSee: [
								"All recorded trips",
								"Mileage summaries",
								"Travel patterns"
							]
						};
					}
					break;
					
				case "assets":
					if (dataScreen) {
						// Specific asset detail view
						pageDisplayContext = {
							pageType: "asset_detail",
							displayedData: {
								asset: screenContext.assetName,
								type: screenContext.assetType,
								value: `$${screenContext.assetValue}`
							},
							userCanSee: [
								"Asset details and value",
								"Asset type and metadata",
								"Purchase information"
							]
						};
					} else {
						// All assets list view
						pageDisplayContext = {
							pageType: "assets_list",
							displayedData: {
								totalAssets: screenContext.assetCount,
								totalValue: `$${screenContext.totalValue}`,
								types: screenContext.assetTypes.join(', ')
							},
							userCanSee: [
								"All financial assets",
								"Asset portfolio summary",
								"Value distribution by type"
							]
						};
					}
					break;
					
				default:
					pageDisplayContext = {
						pageType: "general",
						displayedData: {
							availableScreens: ["dashboard", "transactions", "trips", "assets", "filecabinet"]
						},
						userCanSee: [
							"General financial information",
							"Cross-profile data",
							"Application-wide features"
						]
					};
			}
		} catch (error) {
			console.error("Error getting page display context:", error);
			pageDisplayContext = { error: "Failed to load page display context" };
		}

		console.log("Page display context:", pageDisplayContext);

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

          Current dashboard context:
          - Cash flow data available: ${screenContext.hasCashFlowData ? 'Yes' : 'No'}
          - Weekly cash flow data available: ${screenContext.hasWeeklyData ? 'Yes' : 'No'}
          - Number of accounts: ${screenContext.accountCount}
          - Account types: ${screenContext.accountTypes.join(', ') || 'None'}
          - Recent transactions: ${screenContext.recentTransactions?.length || 0} available

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

          Current trip context:
          - Trip date: ${screenContext.tripDate}
          - Trip miles: ${screenContext.tripMiles}
          - Location data available: ${screenContext.hasLocationData ? 'Yes' : 'No'}

          Your responses must focus solely on the data for this trip ID. Answer questions about the trip's distance, location, purpose, or vehicle, but do not generalize or switch to other trips or financial areas unless explicitly asked.

          If the user's question is about something broader, clarify if they'd like to leave this specific trip view.
          `;
				} else {
					screenPrompt = `
          You are assisting a user on the general trips screen.

          This screen lists all the trips recorded for the current profile. Each trip includes metadata such as date, mileage, locations, addresses, and associated vehicle or profile information.

          Current trips context:
          - Total trips: ${screenContext.tripCount}
          - Total miles: ${screenContext.totalMiles}
          - Has trips data: ${screenContext.hasTrips ? 'Yes' : 'No'}

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

          Current asset context:
          - Asset name: ${screenContext.assetName}
          - Asset type: ${screenContext.assetType}
          - Asset value: $${screenContext.assetValue}

          Focus your answers on analyzing or explaining this single asset. Do not generalize to other assets unless the user asks to compare or shift focus. Only discuss other financial topics if clearly requested.

          If the user's question is too broad, ask whether they want information beyond this specific asset.
          `;
				} else {
					screenPrompt = `
          You are assisting a user on the general assets screen.

          This screen displays all financial assets associated with the current profile. These may include real estate, investments, vehicles, cash, or other asset types. Each asset includes metadata like name, type, value, and other details.

          Current assets context:
          - Total assets: ${screenContext.assetCount}
          - Total value: $${screenContext.totalValue}
          - Asset types: ${screenContext.assetTypes.join(', ') || 'None'}
          - Has assets data: ${screenContext.hasAssets ? 'Yes' : 'No'}

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

          Current transactions context:
          - Total transactions: ${screenContext.transactionCount}
          - Total amount: $${screenContext.totalAmount}
          - Income transactions: ${screenContext.incomeCount}
          - Expense transactions: ${screenContext.expenseCount}

          Focus your answers on summarizing spending habits, identifying trends, highlighting recent activity, or categorizing expenses and income across accounts.

          Avoid referencing specific accounts or transactions unless the user requests it explicitly. Do not shift focus to other financial sections unless clearly prompted.
          `;
				} else if (dataScreen) {
					screenPrompt = `
          You are assisting a user on the detailed view of a specific account's transactions.
          You have to respond with information related to the account only, unless the user explicitly asks for something else.
          The Plaid account ID is: "${dataScreen}". This screen shows:
          - All transactions tied to this account
          - Account details such as name, mask, institution, and account type
          - Balances (current and available)

          Current account context:
          - Account name: ${screenContext.accountName}
          - Account type: ${screenContext.accountType}
          - Institution: ${screenContext.institution}
          - Current balance: $${screenContext.currentBalance}
          - Available balance: $${screenContext.availableBalance}
          - Recent transactions: ${screenContext.recentTransactionCount} available

          Focus your responses on activity related to this account only. This may include analyzing spending patterns, listing recent transactions, or checking specific balances.

          Do not reference data from other accounts or financial areas unless explicitly requested by the user.
          `;
				} else {
					screenPrompt = `
          You are assisting a user on the general transactions screen.

          This screen displays all financial transactions from **all accounts** associated with the current profile. It provides a global view of recent income, expenses, and transfers, helping the user monitor their financial activity.

          Current transactions context:
          - Total transactions: ${screenContext.transactionCount}
          - Total amount: $${screenContext.totalAmount}
          - Income transactions: ${screenContext.incomeCount}
          - Expense transactions: ${screenContext.expenseCount}

          Focus your answers on summarizing spending habits, identifying trends, highlighting recent activity, or categorizing expenses and income across accounts.

          Avoid referencing specific accounts or transactions unless the user requests it explicitly. Do not shift focus to other financial sections unless clearly prompted.
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

You are Zentavos, an AI chief financial officer integrated within the Zentavos application. Your sole purpose is to help users understand their financial data (expenses, mileage, receipts, bank transactions, investments, assets) stored within the Zentavos system, specifically for tax preparation, business insights, and financial education related to their data.

## Scope and Boundaries

- **ALLOWED:** Answer questions related to the user's financial data managed by Zentavos. This includes summarizing transactions, calculating totals, retrieving specific financial documents, explaining tax implications, providing insights, analyzing financial trends within their accounts, financial projections as it relates to their accounts, business advice, tax preparation, and financial education.
- **FORBIDDEN:** You MUST refuse to answer any questions outside this scope. This includes investment advice, financial advice as it relates to investments, speculation, predictions, opinions, creative writing, coding, or any topic unrelated to the user's Zentavos financial information or business. If a question is ambiguous or borders on being out of scope, ask for clarification to ensure it relates directly to the user's data in Zentavos. Do not engage in casual conversation or pleasantries.
- **IMPORTANT** When answering questions that offer any advice, financial education, or anything that could have a negative effect on their finances, please include the disclaimer, "Individual results may vary. Any advice provided is for general information purposes only and should not be construed as personalized financial, legal, or tax advice. You are responsible to do your own research and make your own decisions."

## Input Processing

You can receive user queries as text. You can also process images (e.g., receipts uploaded by the user) and documents (e.g., bank statements, tax forms stored in the user's account). When an image or document is relevant to the query, incorporate its information into your analysis.

## Available Tools

You have access to the following tools. Use them _only_ when necessary to answer a user's query accurately. Plan your tool usage as part of your thought process.

1.  **doc_retrieval**: Use this tool to search for and retrieve specific documents (e.g., invoices, tax forms, bank statements) stored in the user's Zentavos cloud storage. Specify the type of document or keywords to search for.
2.  **db_retrieval**: Use this tool to query the Zentavos database (MongoDB) for structured financial data. This includes transactions, account balances, expense categories, mileage logs, asset details, investment holdings, etc. Formulate specific queries to retrieve the necessary data points.

  The current UID or user ID is "${uid}". This is the unique identifier for the user whose data you are accessing. You can use this UID to retrieve user-specific information.
  The current profile is "${profile}", which is the profile the user is currently using. A profile refers to a business or personal account within the Zentavos system. Each user can have multiple profiles, and each profile can have multiple bank accounts. You can look up other profiles if the user asks for them.

  Current Profile Context:
  - Profile ID: ${profileContext.profileId}
  - Profile Name: ${profileContext.profileName}
  - Profile Type: ${profileContext.isPersonal ? 'Personal' : 'Business'}
  - Available Data:
    - Accounts: ${profileContext.accountCount} (${profileContext.hasData.accounts ? 'Available' : 'None'})
    - Transactions: ${profileContext.transactionCount} (${profileContext.hasData.transactions ? 'Available' : 'None'})
    - Assets: ${profileContext.assetCount} (${profileContext.hasData.assets ? 'Available' : 'None'})
    - Trips: ${profileContext.tripCount} (${profileContext.hasData.trips ? 'Available' : 'None'})
  - Account Types: ${profileContext.accountTypes.join(', ') || 'None'}
  - Asset Types: ${profileContext.assetTypes.join(', ') || 'None'}

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

## Current Page Context

You are currently assisting a user on the **${currentScreen}** screen${dataScreen ? ` (${dataScreen})` : ''}.

**Page Type:** ${pageDisplayContext.pageType}
**What the user can see on this page:**
${pageDisplayContext.userCanSee?.map(item => `- ${item}`).join('\n') || 'General information'}

**Data currently displayed:**
${Object.entries(pageDisplayContext.displayedData || {}).map(([key, value]) => `- ${key}: ${value}`).join('\n') || 'No specific data'}

**Available data for this profile:**
- Accounts: ${profileContext.accountCount} (${profileContext.hasData.accounts ? 'Available' : 'None'})
- Transactions: ${profileContext.transactionCount} (${profileContext.hasData.transactions ? 'Available' : 'None'})
- Assets: ${profileContext.assetCount} (${profileContext.hasData.assets ? 'Available' : 'None'})
- Trips: ${profileContext.tripCount} (${profileContext.hasData.trips ? 'Available' : 'None'})

**Important:** Your responses should be contextual to what the user is currently viewing and the data available on this screen. Focus on the information that would be most relevant given their current location in the app.

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
And when a text starts you MUST write "¡" before the text.
When the text ends you MUST write "¡" after the text.

{
  "text": "¡<a clear and helpful explanation for the user in natural language>¡",
  "data": <an array of objects representing tabular data, or null if there's no structured data>
}

- The "text" field should contain the main explanation or answer.
- The "data" field should include an array of objects if tabular data (e.g., summaries by category, transaction lists, totals, etc.) is present.
- If there’s no structured data to show, set the "data" field to null.

Example:

{
  "text": "¡Here is the summary by category based on your account data.¡",
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
				// Profile is already validated in makeRequest
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

		console.log("Calling AI service with prompt:", prompt);
		let response = await groqClient.chat.completions.create({
			model: GROQ_AI_MODEL,
			messages,
			temperature: 0.0,
			stream: true,
			tools,
		});
		console.log("AI service response received");

		let buffer = "";
		let finalMessages = [...messages];
		let toolCallsRemaining = true;
		let completeResponse = "";

		while (toolCallsRemaining) {
			toolCallsRemaining = false;
			let started = false;
			let ended = false;

			for await (const chunk of response) {
				const delta = chunk.choices?.[0]?.delta;
				// console.log("Delta received:", delta);
				const finishReason = chunk.choices?.[0]?.finish_reason;

				if (delta?.content) {
					completeResponse += delta.content;
					if (!started && delta.content.startsWith("¡")) {
						started = true;
						delta.content = delta.content.slice(1);
					}
					if (!ended && delta.content.endsWith("¡")) {
						ended = true;
						delta.content = delta.content.slice(0, -1);
					}
					if (started && !ended) {
						// Send the chunk to the client using the controller's sendToUser
						aiController.sendToUser(uid, { text: delta.content });
						// Also update the buffer for any tool calls
						buffer += delta.content;
					}
				}

				if (delta?.tool_calls) {
					console.log(
						"Tool calls detected:",
						JSON.stringify(delta.tool_calls, null, 2)
					);

					toolCallsRemaining = true;

					for (const toolCall of delta.tool_calls) {
						let fnName = null; // Declare fnName at the beginning of the loop
						try {
							if (!toolCall.function) {
								console.error("Tool call missing function property:", toolCall);
								continue;
							}

							fnName = toolCall.function?.name;
							if (!fnName) {
								console.error("Tool call missing function name:", toolCall);
								continue;
							}

							let args = {};
							try {
								args = toolCall.function.arguments
									? JSON.parse(toolCall.function.arguments)
									: {};
							} catch (e) {
								console.error(
									`Failed to parse arguments for ${fnName}:`,
									toolCall.function.arguments
								);
								console.error("Error:", e);
								continue;
							}

							const fn = availableFunctions[fnName];
							if (!fn) {
								console.error(`Function "${fnName}" not implemented.`);
								continue;
							}

							console.time(`tool_call_${fnName}`);
							const result = await fn(args);
							console.timeEnd(`tool_call_${fnName}`);
							console.log(`✅ Result for ${fnName}:`, result);

							finalMessages.push({
								role: "tool",
								tool_call_id: toolCall.id,
								name: fnName,
								content: JSON.stringify(result),
							});
						} catch (error) {
							const errorFnName = fnName || 'unknown';
							console.error(`Error executing tool ${errorFnName}:`, error);
							// Push an error response back to the model
							finalMessages.push({
								role: "tool",
								tool_call_id: toolCall.id,
								name: errorFnName,
								content: JSON.stringify({ error: error.message }),
							});
						}
					}
				}

				// Cuando el modelo finaliza su respuesta
				if (finishReason === "stop") break;
			}

			// If there were tool calls, make another call with updated messages
			if (toolCallsRemaining) {
				response = await groqClient.chat.completions.create({
					model: GROQ_AI_MODEL,
					messages: finalMessages,
					temperature: 0.0,
					stream: true,
					tools,
					tool_choice: "auto",
				});
			}
		}

		// Function to validate if string is valid JSON
		const isValidJSON = (str) => {
			try {
				JSON.parse(str);
				return true;
			} catch (e) {
				return false;
			}
		};

		// Function to get corrected JSON from LLM
		const getCorrectedJsonResponse = async (invalidJson) => {
			try {
				const correctionPrompt = `The following response contains invalid JSON. Please correct any syntax errors and return ONLY the valid JSON object, with no additional text or explanation:

        ${invalidJson}

        Respond with ONLY the corrected JSON object.`;

				const correctionResponse = await groqClient.chat.completions.create({
					model: GROQ_AI_MODEL,
					messages: [
						{
							role: "system",
							content:
								"You are a JSON correction assistant. Fix any JSON syntax errors and return ONLY the valid JSON object.",
						},
						{ role: "user", content: correctionPrompt },
					],
					temperature: 0.0,
					max_tokens: 2000,
				});

				const correctedJson =
					correctionResponse.choices[0]?.message?.content?.trim();
				if (correctedJson && isValidJSON(correctedJson)) {
					return JSON.parse(correctedJson);
				}
			} catch (error) {
				console.error("Error getting corrected JSON:", error);
			}
			return null;
		};

		try {
			// Only process if there's content
			if (!completeResponse || !completeResponse.trim()) {
				console.log("No complete response to parse");
				aiController.sendToUser(uid, { data: null });
				return;
			}

			let parsedResponse;

			// First try to parse directly
			if (isValidJSON(completeResponse)) {
				parsedResponse = JSON.parse(completeResponse);
			} else {
				console.log("Invalid JSON received, attempting to correct...");
				// If direct parse fails, try to get a corrected version
				parsedResponse = await getCorrectedJsonResponse(completeResponse);

				if (!parsedResponse) {
					// If we still don't have valid JSON, try a more basic cleanup as last resort
					try {
						// Try to extract JSON-like content
						const jsonMatch = completeResponse.match(/\{[\s\S]*\}/);
						if (jsonMatch && isValidJSON(jsonMatch[0])) {
							parsedResponse = JSON.parse(jsonMatch[0]);
						}
					} catch (e) {
						console.error("Failed to extract valid JSON:", e);
					}
				}
			}

			// Send the response or error
			if (parsedResponse) {
				aiController.sendToUser(uid, {
					data: parsedResponse.data || parsedResponse || null,
					wasCorrected: !isValidJSON(completeResponse), // Flag if the response was corrected
				});
			} else {
				console.error("Failed to parse or correct response:", completeResponse);
				aiController.sendToUser(uid, {
					error: "Invalid response format",
					originalResponse: completeResponse,
					details: "Could not parse or correct the JSON response.",
				});
			}
		} catch (e) {
			console.error("Error processing response:", e);
			console.error("Response content:", completeResponse);
			aiController.sendToUser(uid, {
				error: "Error processing response",
				details: e.message,
				originalResponse: completeResponse,
			});
		}

		aiController.sendToUser(uid, "[DONE]");

		// return {
		//   message: prompt,
		//   response: data.text,
		//   data: data.data,
		//   screen: currentScreen,
		//   error: null,
		// };
	} catch (error) {
		console.error("Error in makeRequest:", error);
		const resp = {
			message: prompt,
			response: "Could not process your request right now.",
			data: null,
			screen: "",
			error: error.message,
		};
		aiController.sendToUser(uid, resp);

		return resp;
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
