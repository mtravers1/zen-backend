import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const environment = process.env.ENVIRONMENT || "prod";
let plaidEnv = PlaidEnvironments.production;

// Improved environment configuration
switch (environment.toLowerCase()) {
  case "dev":
  case "development":
    plaidEnv = PlaidEnvironments.development;
    break;
  case "sandbox":
    plaidEnv = PlaidEnvironments.sandbox;
    break;
  case "prod":
  case "production":
    plaidEnv = PlaidEnvironments.production;
    break;
  default:
    console.warn(`Unknown environment: ${environment}, defaulting to production`);
    plaidEnv = PlaidEnvironments.production;
}

const plaidConfig = new Configuration({
  basePath: plaidEnv,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
    // Add timeout configuration
    timeout: 30000, // 30 seconds
  },
});

const plaidClient = new PlaidApi(plaidConfig);

export default plaidClient;
