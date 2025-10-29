import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

let plaidClient = null;

function getPlaidClient() {
  if (plaidClient) {
    return plaidClient;
  }
  
/***
 * # **IMPORTANT**
 * # The bucket name where we store user encryption keys. 
 *  using the wrong bucket will lose all data for all users!
 * */
  const USER_ENCRYPTION_KEY_BUCKET_NAME = process.env.USER_ENCRYPTION_KEY_BUCKET_NAME;
  if (!USER_ENCRYPTION_KEY_BUCKET_NAME) {
    throw new Error('USER_ENCRYPTION_KEY_BUCKET_NAME environment variable is required');
  }

  let plaidEnv;
  console.log("USER_ENCRYPTION_KEY_BUCKET_NAME", USER_ENCRYPTION_KEY_BUCKET_NAME);

  // Improved USER_ENCRYPTION_KEY_BUCKET_NAME configuration with correct Plaid project mappings
  switch (USER_ENCRYPTION_KEY_BUCKET_NAME.toLowerCase()) {
    case "dev":
    case "development":
      // Zentavos Dev Sandbox
      plaidEnv = PlaidEnvironments.sandbox;
      break;
    case "staging":
    case "uat": // UAT should point to a non-production environment
      // Zentavos Dev
      plaidEnv = PlaidEnvironments.development;
      break;
    case "prod":
      // Zentavos (production)
      plaidEnv = PlaidEnvironments.production;
      break;
    default:
      throw new Error(`Unknown environment: ${USER_ENCRYPTION_KEY_BUCKET_NAME}. Must be one of: dev, development, staging, uat, prod`);
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
