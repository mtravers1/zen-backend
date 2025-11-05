import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const plaidClients = {};

function getPlaidClient(plaidEnvironment = process.env.PLAID_ENV) {
  if (!plaidEnvironment) {
    throw new Error('PLAID_ENV is not set. Please set it to one of: local, development, staging, production');
  }

  if (plaidClients[plaidEnvironment]) {
    return plaidClients[plaidEnvironment];
  }

  const lowerCaseEnv = plaidEnvironment.toLowerCase().trim();

  // This object maps the application's environment names to the corresponding Plaid API environments.
  const plaidEnvMap = {
    // 'local' environment uses Plaid's 'sandbox' for development and testing purposes.
    local: PlaidEnvironments.sandbox,
    // 'development' environment maps to Plaid's 'development' environment.
    development: PlaidEnvironments.development,
    // 'staging' environment uses Plaid's 'production' environment but should be connected to a "Limited Production" environment.
    staging: PlaidEnvironments.production,
    // 'production' environment maps to Plaid's 'production' environment for live user data.
    production: PlaidEnvironments.production,
  };

  const plaidEnv = plaidEnvMap[lowerCaseEnv];

  if (!plaidEnv) {
    throw new Error(`Unknown Plaid environment: ${plaidEnvironment}. Must be one of: ${Object.keys(plaidEnvMap).join(', ')}`);
  }

  const plaidConfig = new Configuration({
    basePath: plaidEnv,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET,
      },
      timeout: 30000, // 30 seconds
    },
  });

  const client = new PlaidApi(plaidConfig);
  plaidClients[plaidEnvironment] = client;
  return client;
}

export default getPlaidClient;
