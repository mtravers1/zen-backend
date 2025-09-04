import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

let plaidClient = null;

function getPlaidClient() {
  if (plaidClient) {
    return plaidClient;
  }

  const environment = process.env.ENVIRONMENT;
  if (!environment) {
    throw new Error('ENVIRONMENT variable is required');
  }

  let plaidEnv;
  console.log("environment", environment);

  // Improved environment configuration with correct Plaid project mappings
  switch (environment.toLowerCase()) {
    case "dev":
      // Zentavos Dev Sandbox
      plaidEnv = PlaidEnvironments.sandbox;
      break;
    case "staging":
      // Zentavos Dev
      plaidEnv = PlaidEnvironments.development;
      break;
    case "prod":
    case "uat": // Temporary fix. Please remove
      // Zentavos (production)
      plaidEnv = PlaidEnvironments.production;
      break;
    default:
      throw new Error(`Unknown environment: ${environment}. Must be one of: dev, staging, prod`);
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

  plaidClient = new PlaidApi(plaidConfig);
  return plaidClient;
}

export default getPlaidClient;
