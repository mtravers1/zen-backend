import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const plaidClients = {};

function getPlaidClient(
  plaidEnvironment = process.env.PLAID_ENV || "development",
) {
  // default to development
  if (plaidClients[plaidEnvironment]) {
    return plaidClients[plaidEnvironment];
  }

  let plaidEnv;
  const lowerCaseEnv = plaidEnvironment.toLowerCase();

  switch (lowerCaseEnv) {
    case "local":
    case "sandbox":
      plaidEnv = PlaidEnvironments.sandbox;
      break;
    case "development":
      plaidEnv = PlaidEnvironments.sandbox;
      break;
    case "staging":
      plaidEnv = PlaidEnvironments.production;
      break;
    case "production":
      plaidEnv = PlaidEnvironments.production;
      break;
    default:
      throw new Error(
        `Unknown Plaid environment: ${plaidEnvironment}. Must be one of: local, sandbox, development, staging, production`,
      );
  }

  const plaidConfig = new Configuration({
    basePath: plaidEnv,
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET,
      },
      timeout: 60000, // 60 seconds
    },
  });

  const client = new PlaidApi(plaidConfig);
  plaidClients[plaidEnvironment] = client;
  return client;
}

export default getPlaidClient;
