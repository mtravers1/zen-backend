import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const plaidClients = {};

function getPlaidClient(plaidEnvironment = 'development') { // default to development
  if (plaidClients[plaidEnvironment]) {
    return plaidClients[plaidEnvironment];
  }

  let plaidEnv;
  switch (plaidEnvironment.toLowerCase()) {
    case "sandbox":
      plaidEnv = PlaidEnvironments.sandbox;
      break;
    case "development":
      plaidEnv = PlaidEnvironments.development;
      break;
    case "production":
      plaidEnv = PlaidEnvironments.production;
      break;
    default:
      throw new Error(`Unknown Plaid environment: ${plaidEnvironment}`);
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
