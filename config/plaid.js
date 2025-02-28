import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const plaidConfig = new Configuration({
  //TODO: change to production
  basePath: PlaidEnvironments.sandbox,
  baseOptions: {
    headers: {
      //TODO: change to production
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(plaidConfig);

export default plaidClient;
