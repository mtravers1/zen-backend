import AccessToken from "../database/models/accessToken.js";
import User from "../database/models/user.js";
import plaidClient from "../config/plaid.js";

const plaidClientId = process.env.PLAID_CLIENT_ID;
const plaidSecret = process.env.PLAID_SECRET;

const createLinkToken = async (email) => {
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user._id.toString();
  const plaidRequest = {
    client_id: plaidClientId,
    secret: plaidSecret,
    client_name: "Zentavos",
    country_codes: ["US"],
    redirect_uri: "https://mysite.com/universal-link/jump-to-my-app.html",
    webhook: "https://webhook.site/8c9fdd11-2e63-4b46-ab25-d1a45242e08d",
    language: "en",
    user: {
      client_user_id: userId,
    },
    products: ["auth"],
    hosted_link: {
      is_mobile_app: true,
      completion_redirect_uri: "myapp://hosted-link-complete",
    },
    // android_package_name: "com.zentavos.mobile",
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
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user._id.toString();
  const existingToken = await AccessToken.findOne({ userId, institutionId });
  if (existingToken) {
    await AccessToken.findOneAndDelete({ userId, institutionId });
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
  const user = await User.findOne({ email });
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user._id.toString();
  const tokens = await AccessToken.find({ userId });
  return tokens;
};

const getAccounts = async (email) => {
  const tokens = await getUserAccessTokens(email);
  const accounts = [];
  for (const token of tokens) {
    const response = await plaidClient.accountsGet({
      access_token: token.accessToken,
    });

    for (const account of response.data.accounts) {
      account.institutionId = response.data.item.institution_id;
      accounts.push(account);
    }
  }

  return accounts;
};

const getBalance = async (email) => {
  try {
    const tokens = await getUserAccessTokens(email);
    const balances = [];
    for (const token of tokens) {
      const response = await plaidClient.accountsBalanceGet({
        access_token: token.accessToken,
      });
      const accounts = response.data.accounts;
      for (const account of accounts) {
        account.institutionId = token.institutionId;
        balances.push(account);
      }
    }

    return balances;
  } catch (error) {
    console.log(error);
  }
  2;
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

const plaidService = {
  createLinkToken,
  getPublicToken,
  getAccessToken,
  getAccounts,
  saveAccessToken,
  getBalance,
  getInstitutions,
};

export default plaidService;
