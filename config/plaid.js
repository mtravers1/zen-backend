import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const environment = process.env.ENVIRONMENT; 
let plaidEnv;
console.log("environment", environment);
// Improved environment configuration
switch (environment.toLowerCase()) {
  case "dev":
  case "development":
  case "sandbox":
    plaidEnv = PlaidEnvironments.sandbox;
    break;
  case "staging":
    plaidEnv = PlaidEnvironments.development;
    break;
  case "prod":
  case "production":
    plaidEnv = PlaidEnvironments.production;
    break;
  default:
    throw Error(`Unknown environment: ${environment}`);
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
