import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const environment = process.env.ENVIRONMENT;
if (!environment) {
  throw new Error('ENVIRONMENT variable is required');
}

let plaidEnv;
console.log("environment", environment);

// Improved environment configuration with correct Plaid project mappings
switch (environment.toLowerCase()) {
  case "dev":
  case "development":
  case "local":
    // Zentavos Dev Sandbox
    plaidEnv = PlaidEnvironments.sandbox;
    break;
  case "staging":
    // Zentavos Dev
    plaidEnv = PlaidEnvironments.development;
    break;
  case "prod":
  case "production":
    // Zentavos (production)
    plaidEnv = PlaidEnvironments.production;
    break;
  default:
    throw new Error(`Unknown environment: ${environment}. Must be one of: dev, development, local, staging, prod, production`);
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
