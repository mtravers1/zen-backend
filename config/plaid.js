import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const plaidConfig = new Configuration({
  basePath: PlaidEnvironments.production,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID_PROD,
      "PLAID-SECRET": process.env.PLAID_SECRET_PROD,
    },
  },
});

const plaidClient = new PlaidApi(plaidConfig);

export default plaidClient;
