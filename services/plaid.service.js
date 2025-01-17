import AccessToken from "../database/models/AccessToken.js";
import User from "../database/models/User.js";
import plaidClient from "../config/plaid.js";

const plaidClientId = process.env.PLAID_CLIENT_ID;
const plaidSecret = process.env.PLAID_SECRET;

const createLinkToken = async (email, isAndroid) => {
  const user = await User.findOne({
    "email.email": email,
  });
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user._id.toString();
  const plaidRequest = {
    client_id: plaidClientId,
    secret: plaidSecret,
    client_name: "Zentavos",
    country_codes: ["US"],
    android_package_name: isAndroid ? "com.zentavos.mobile" : null,
    redirect_uri: !isAndroid
      ? "https://mysite.com/universal-link/jump-to-my-app.html"
      : null,
    webhook:
      "https://webhook.site/#!/view/5cb2c921-fba0-4eb6-bc20-7ceff7736504",
    language: "en",
    user: {
      client_user_id: userId,
    },
    products: ["auth"],
    required_if_supported_products: ["transactions"],
    hosted_link: {
      // is_mobile_app: true,
      completion_redirect_uri: "myapp://hosted-link-complete",
    },
  };
  const response = await plaidClient.linkTokenCreate(plaidRequest);
  return response.data;
};

const getPublicToken = async (linkToken) => {
  const response = await plaidClient.linkTokenGet({
    link_token: linkToken,
  });
  return response.data;
};

const getAccessToken = async (publicToken) => {
  const response = await plaidClient.itemPublicTokenExchange({
    public_token: publicToken,
  });
  return response.data;
};

const saveAccessToken = async (email, accessToken, itemId, institutionId) => {
  const user = await User.findOne({
    "email.email": email,
  });
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user._id.toString();
  const existingToken = await AccessToken.findOne({ userId, institutionId });
  if (existingToken) {
    return existingToken;
  }
  const newToken = new AccessToken({
    userId,
    accessToken,
    itemId,
    institutionId,
  });
  await newToken.save();
  return newToken;
};

const getUserAccessTokens = async (email) => {
  const user = await User.findOne({
    "email.email": email,
  });
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user._id.toString();
  const tokens = await AccessToken.find({ userId });
  return tokens;
};

const getAccounts = async (token) => {
  try {
    const response = await plaidClient.accountsGet({
      access_token: token,
    });
    console.log(response.data);
    return response.data;
  } catch (error) {
    return [];
  }
};

const getBalance = async (email) => {
  try {
    const tokens = await getUserAccessTokens(email);
    if (!tokens.length) return [];

    const balancePromises = tokens.map(async (token) => {
      const response = await plaidClient.accountsBalanceGet({
        access_token: token.accessToken,
      });
      return response.data.accounts.map((account) => ({
        ...account,
        institutionId: token.institutionId,
      }));
    });
    const balancesArray = await Promise.all(balancePromises);
    const balances = balancesArray.flat();

    return balances;
  } catch (error) {
    return [];
  }
};

const getInstitutions = async () => {
  const response = await plaidClient.institutionsGet({
    count: 500,
    offset: 0,
    country_codes: ["US"],
    options: {
      include_optional_metadata: true,
    },
  });

  const institutions = {};
  for (const institution of response.data.institutions) {
    institutions[institution.institution_id] = institution;
  }
  return institutions;
};

const getTransactions = async (email) => {
  const tokens = await getUserAccessTokens(email);

  const response = await plaidClient.transactionsSync({
    access_token: tokens[0].accessToken,
    count: 250,
  });
  return response.data;
};

const getCurrentCashflow = async (email) => {
  const transactionsResponse = await getTransactions(email);
  const transactions = transactionsResponse.added;
  console.log(transactions);
  return transactions;
};

const plaidService = {
  createLinkToken,
  getPublicToken,
  getAccessToken,
  getAccounts,
  saveAccessToken,
  getBalance,
  getInstitutions,
  getTransactions,
  getCurrentCashflow,
};

export default plaidService;
