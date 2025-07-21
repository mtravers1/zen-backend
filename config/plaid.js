import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const environment = process.env.ENVIRONMENT || "prod";
let plaidEnv = PlaidEnvironments.production;
if (environment === "dev") {
  plaidEnv = PlaidEnvironments.sandbox;
}
const plaidConfig = new Configuration({
  basePath: plaidEnv,
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
});

const plaidClient = new PlaidApi(plaidConfig);

export default plaidClient;
