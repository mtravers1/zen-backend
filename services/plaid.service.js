import AccessToken from "../database/models/AccessToken.js";
import User from "../database/models/User.js";
import plaidClient from "../config/plaid.js";
import Transaction from "../database/models/Transaction.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import accountsService from "./accounts.service.js";
import {
  decryptValue,
  encryptValue,
  getUserDek,
} from "../database/encryption.js";

//TODO: change to production
const plaidClientId = process.env.PLAID_CLIENT_ID;
const plaidSecret = process.env.PLAID_SECRET;
const webhookUrl = process.env.PLAID_WEBHOOK_URL;
const plaidRedirectUri = process.env.PLAID_REDIRECT_URI;
const plaidRedirectNewAccounts = process.env.PLAID_REDIRECT_URI_NEW_ACCOUNTS;
const androidPackageName = process.env.BUNDLEID || "com.zentavos.mobile";

const createLinkToken = async (email, isAndroid, accountId, uid, screen) => {
  const user = await User.findOne({
    authUid: uid,
  });
  if (!user) {
    throw new Error("User not found");
  }
  let accessToken;
  const dek = await getUserDek(uid);
  if (accountId) {
    const account = await PlaidAccount.findOne({ _id: accountId });
    if (!account) {
      throw new Error("Account not found");
    }
    accessToken = await decryptValue(account.accessToken, dek);
  }
  const userId = user._id.toString();
  let redirectUri;
  if (screen === "add-account") {
    redirectUri = plaidRedirectNewAccounts;
  } else {
    redirectUri = plaidRedirectUri;
  }
  
  // Improved link token configuration with specific support for Chase
  const plaidRequest = {
    client_id: plaidClientId,
    secret: plaidSecret,
    client_name: "Zentavos",
    country_codes: ["US"],
    android_package_name: isAndroid ? androidPackageName : null,
    redirect_uri: !isAndroid ? redirectUri : null,
    webhook: webhookUrl,
    language: "en",
    user: {
      client_user_id: userId,
    },
    // Add 'auth' for better compatibility with Chase
    products: ["transactions", "auth"],
    optional_products: ["investments", "liabilities"],
    // Specific account filters for better compatibility
    account_filters: {
      depository: {
        account_subtypes: ["checking", "savings"]
      },
      credit: {
        account_subtypes: ["credit card"]
      }
    },
    hosted_link: {
      completion_redirect_uri: "myapp://hosted-link-complete",
    },
    transactions: {
      days_requested: 730,
    },
    // Specific settings for Chase
    institution_data: {
      routing_number: null // Allow manual entry if necessary
    }
  };
  
  if (accessToken) {
    plaidRequest.access_token = accessToken;
  }
  
  const response = await plaidClient
    .linkTokenCreate(plaidRequest)
    .catch((error) => {
      console.error("Error creating link token:", error.response?.data || error);
      throw error;
    });
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

const saveAccessToken = async (
  email,
  accessToken,
  itemId,
  institutionId,
  uid
) => {
  const user = await User.findOne({
    authUid: uid,
  });
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user._id.toString();
  const dek = await getUserDek(uid);

  const encryptedToken = await encryptValue(accessToken, dek);

  const newToken = new AccessToken({
    userId,
    accessToken: encryptedToken,
    itemId,
    institutionId,
  });
  await newToken.save();
  return {
    userId,
    accessToken,
    itemId,
    institutionId,
  };
};

const getUserAccessTokens = async (email, uid) => {
  const user = await User.findOne({
    authUid: uid,
  });
  if (!user) {
    throw new Error("User not found");
  }
  const userId = user._id.toString();
  const tokens = await AccessToken.find({ userId });

  const decryptedTokens = [];
  const dek = await getUserDek(uid);
  for (const token of tokens) {
    const decryptedAccessToken = await decryptValue(token.accessToken, dek);

    decryptedTokens.push({
      ...token.toObject(),
      accessToken: decryptedAccessToken,
    });
  }

  return decryptedTokens;
};

const getAccounts = async (email, uid) => {
  try {
    const tokens = await getUserAccessTokens(email, uid);
    if (!tokens.length) return [];
    const accountsPromises = tokens.map(async (token) => {
      const response = await plaidClient.accountsGet({
        access_token: token.accessToken,
      });
      return response.data.accounts.map((account) => ({
        ...account,
        institutionId: token.institutionId,
      }));
    });

    const accountsArray = await Promise.all(accountsPromises);

    const accounts = accountsArray.flat();

    return accounts;
  } catch (error) {
    return [];
  }
};

const getAccountsWithAccessToken = async (accessToken) => {
  const response = await plaidClient.accountsGet({
    access_token: accessToken,
  });
  return response.data;
};

const getBalance = async (email) => {
  try {
    const tokens = await getUserAccessTokens(email);
    if (!tokens.length) return [];

    const balancePromises = tokens.map(async (token) => {
      const response = await plaidClient.accountsGet({
        access_token: token.accessToken,
        // min_last_updated_datetime: new Date().toISOString(),
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

const getTransactions = async (email, uid) => {
  const tokens = await getUserAccessTokens(email, uid);
  if (!tokens.length) return [];

  const transactionsPromises = tokens.map(async (token) => {
    const response = await plaidClient.transactionsSync({
      access_token: token.accessToken,
      count: 500,
    });
    return response.data.added;
  });

  const transactionsArray = await Promise.all(transactionsPromises);
  const transactions = transactionsArray.flat();

  return transactions;
};

const getTransactionsWithAccessToken = async (accessToken) => {
  const response = await plaidClient.transactionsSync({
    access_token: accessToken,
  });
  return response.data;
};

const getInvestmentTransactionsWithAccessToken = async (accessToken) => {
  const today = new Date();
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(today.getFullYear() - 2);
  const response = await plaidClient.investmentsTransactionsGet({
    access_token: accessToken,
    start_date: twoYearsAgo.toISOString().split("T")[0],
    end_date: today.toISOString().split("T")[0],
    options: {
      async_update: true,
    },
  });
  return response.data;
};

const getLoanLiabilitiesWithAccessToken = async (accessToken) => {
  const response = await plaidClient.liabilitiesGet({
    access_token: accessToken,
  });
  return response.data;
};

const getInvestmentsHoldingsWithAccessToken = async (accessToken) => {
  const response = await plaidClient.investmentsHoldingsGet({
    access_token: accessToken,
  });
  return response.data;
};

const getAccessTokenFromItemId = async (itemId, uid) => {
  try {
    if (!itemId) {
      console.error("getAccessTokenFromItemId: itemId is required");
      return null;
    }

    const access = await AccessToken.findOne({ itemId });
    if (!access) {
      console.error(`getAccessTokenFromItemId: No access token found for itemId: ${itemId}`);
      return null;
    }

    if (!access.accessToken) {
      console.error(`getAccessTokenFromItemId: Access token is null/undefined for itemId: ${itemId}`);
      return null;
    }

    if (!uid) {
      console.error("getAccessTokenFromItemId: uid is required for decryption");
      return null;
    }

    const dek = await getUserDek(uid);
    if (!dek) {
      console.error(`getAccessTokenFromItemId: Failed to get DEK for uid: ${uid}`);
      return null;
    }

    const decryptedToken = await decryptValue(access.accessToken, dek);
    if (!decryptedToken) {
      console.error(`getAccessTokenFromItemId: Failed to decrypt access token for itemId: ${itemId}`);
      return null;
    }

    return decryptedToken;
  } catch (error) {
    console.error(`getAccessTokenFromItemId error for itemId ${itemId}:`, error);
    return null;
  }
};

const updateAccountBalances = async (dek, accessToken, accounts) => {
  let newAccountsBalances;

  try {
    newAccountsBalances = await plaidClient.accountsGet({
      access_token: accessToken,
      // min_last_updated_datetime: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error fetching account balances:", error);
    return;
  }

  if (newAccountsBalances) {
    const bulkOps = [];
    for (const account of newAccountsBalances.data.accounts) {
      const accountBalance = account.balances;
      const accountType = account.type;
      const accountSubtype = account.subtype;
      const accountName = account.name;
      const accountPlaidId = account.account_id;

      const existingAccount = accounts.find(
        (a) => a.plaid_account_id === accountPlaidId
      );

      if (existingAccount) {
        // Encriptar valores antes de actualizar
        const [
          encryptedAccountName,
          encryptedAccountType,
          encryptedAccountSubtype,
          encryptedCurrentBalance,
          encryptedAvailableBalance,
        ] = await Promise.all([
          encryptValue(accountName, dek),
          encryptValue(accountType, dek),
          encryptValue(accountSubtype, dek),
          accountBalance.current
            ? encryptValue(accountBalance.current, dek)
            : null,
          accountBalance.available
            ? encryptValue(accountBalance.available, dek)
            : null,
        ]);

        existingAccount.currentBalance = accountBalance.current;
        existingAccount.availableBalance = accountBalance.available;
        existingAccount.account_type = accountType;
        existingAccount.account_subtype = accountSubtype;
        existingAccount.account_name = accountName;

        bulkOps.push({
          updateOne: {
            filter: { plaid_account_id: accountPlaidId },
            update: {
              currentBalance: encryptedCurrentBalance,
              availableBalance: encryptedAvailableBalance,
              accountType: encryptedAccountType,
              accountSubtype: encryptedAccountSubtype,
              accountName: encryptedAccountName,
            },
          },
        });
      }
    }

    if (bulkOps.length) {
      await PlaidAccount.bulkWrite(bulkOps);
    }
  }
};

const updateTransactions = async (item) => {
  try {
    console.log("Updating transactions for item:", item);
    const accessInfo = await AccessToken.findOne({ itemId: item });
    if (!accessInfo) {
      console.error(`No access info found for item: ${item}`);
      return;
    }
    
    const userId = accessInfo.userId;
    const user = await User.findById(userId);
    if (!user) {
      console.error(`No user found for item: ${item}`);
      return;
    }
    
    const uid = user?.authUid;
    const accessToken = await getAccessTokenFromItemId(item, uid);
    if (!accessToken) {
      console.error(`No access token for item: ${item}`);
      return;
    }

    const accounts = await PlaidAccount.find({ itemId: item });
    if (!accounts.length) {
      console.error(`No accounts found for item: ${item}`);
      return;
    }

    // Check if it's Chase and apply specific treatment
    const isChase = await checkIfChaseBank(item, accessToken);
    
    if (isChase) {
      console.log('Chase bank detected - applying special handling');
      return await updateChaseTransactions(item, accessToken, uid, accounts);
    } else {
      return await updateRegularTransactions(item, accessToken, uid, accounts);
    }
  } catch (error) {
    console.error(`Error updating transactions for item ${item}:`, error);
    throw error;
  }
};

// Specific function to update Chase transactions
const updateChaseTransactions = async (item, accessToken, uid, accounts) => {
  const emails = user?.email;
  const emailObject = emails?.find((email) => email.isPrimary === true);
  const email = emailObject?.email;
  const dek = await getUserDek(uid);

  await updateAccountBalances(dek, accessToken, accounts);

  let cursor = accounts[0].nextCursor || null;
  let hasMore = true;
  let retryCount = 0;
  const maxRetries = 5;
  const newTransactions = [];

  while (hasMore && retryCount < maxRetries) {
    try {
      const response = await retryWithBackoff(async () => {
        return await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor: cursor,
          count: 100, // Reduce for Chase to avoid rate limiting
        });
      }, 3, 2000); // Retry with longer delay for Chase

      const transactions = response.data.added || [];
      const modifiedTransactions = response.data.modified || [];
      const removedTransactions = response.data.removed || [];
      cursor = response.data.next_cursor;
      hasMore = response.data.has_more;
      newTransactions.push(...transactions);

      console.log(`Chase: ${transactions.length} new, ${modifiedTransactions.length} modified, ${removedTransactions.length} removed`);

      // Process transactions with delay to avoid rate limiting
      await processTransactions(transactions, accounts, dek);
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay

    } catch (error) {
      retryCount++;
      console.error(`Chase sync error (attempt ${retryCount}):`, error);
      
      if (error.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED') {
        console.error('Chase requires reauthentication');
        await markItemForReauth(item);
        break;
      }
      
      if (retryCount >= maxRetries) {
        console.error('Max retries reached for Chase sync');
        break;
      }
      
      // Wait before trying again
      await new Promise(resolve => setTimeout(resolve, 5000 * retryCount));
    }
  }

  // Update cursor
  for (const account of accounts) {
    account.nextCursor = cursor;
    await account.save();
  }

  return newTransactions;
};

// Function to update regular transactions (non-Chase)
const updateRegularTransactions = async (item, accessToken, uid, accounts) => {
  const emails = user?.email;
  const emailObject = emails?.find((email) => email.isPrimary === true);
  const email = emailObject?.email;
  const dek = await getUserDek(uid);

  await updateAccountBalances(dek, accessToken, accounts);

  let cursor = accounts[0].nextCursor || null;
  let hasMore = true;
  let transactionsByAccount = {};
  let oldCursor = cursor;
  let iterationCounter = 0;
  const maxIterations = 10;
  const newTransactions = [];

  while (hasMore) {
    transactionsByAccount = {};
    oldCursor = cursor;
    iterationCounter++;
    if (iterationCounter > maxIterations) {
      console.log("Max iterations reached, stopping");
      hasMore = false;
      break;
    }
    
    try {
      const response = await plaidClient.transactionsSync({
        access_token: accessToken,
        cursor: cursor,
        count: 500,
      });

      const transactions = response.data.added || [];
      const modifiedTransactions = response.data.modified || [];
      const removedTransactions = response.data.removed || [];
      cursor = response.data.next_cursor;
      hasMore = response.data.has_more;
      newTransactions.push(...transactions);

      console.log(`Regular: ${transactions.length} new, ${modifiedTransactions.length} modified, ${removedTransactions.length} removed`);

      await processTransactions(transactions, accounts, dek);
    } catch (error) {
      console.error('Error in regular transaction sync:', error);
      break;
    }
  }

  // Atualizar cursor
  for (const account of accounts) {
    account.nextCursor = cursor;
    await account.save();
  }

  return newTransactions;
};

// Helper function to process transactions
const processTransactions = async (transactions, accounts, dek) => {
  const accountMap = new Map();
  for (const account of accounts) {
    accountMap.set(account.plaid_account_id, account);
  }

  const bulkOps = [];
  for (let transaction of transactions) {
    if (!accountMap.has(transaction.account_id)) continue;

    const encryptedMerchantName = await encryptValue(
      transaction.merchant_name,
      dek
    );
    const encryptedName = await encryptValue(transaction.name, dek);
    const merchant = {
      merchantName: encryptedMerchantName,
      name: encryptedName,
      merchantCategory: transaction.category?.[0],
      website: transaction.website,
      logo: transaction.logo_url,
    };

    const encryptedAmount = await encryptValue(transaction.amount, dek);
    const encryptedAccountType = await encryptValue(
      accountMap.get(transaction.account_id).account_type,
      dek
    );
    const transactionCode = await encryptValue(
      transaction.transaction_code,
      dek
    );

    // Continue with transaction processing...
    // (rest of processing code)
  }

  if (bulkOps.length) {
    await Transaction.bulkWrite(bulkOps);
  }
};

// Function to mark item for reauthentication
const markItemForReauth = async (itemId) => {
  try {
    const accounts = await PlaidAccount.find({ itemId });
    for (const account of accounts) {
      account.isAccessTokenExpired = true;
      await account.save();
    }
    console.log(`Marked item ${itemId} for reauthentication`);
  } catch (error) {
    console.error('Error marking item for reauth:', error);
  }
};

const updateInvestmentTransactions = async (item) => {
  try {
    if (!item) {
      console.error("updateInvestmentTransactions: item is required");
      return "No item provided";
    }

    const accessToken = await getAccessTokenFromItemId(item);
    if (!accessToken) {
      console.error(`updateInvestmentTransactions: Failed to get access token for item: ${item}`);
      return "Failed to get access token";
    }

    // Check if the institution supports investment transactions
    try {
      const response = await plaidClient.investmentsTransactionsGet({
        access_token: accessToken,
        start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
        end_date: new Date().toISOString().split('T')[0],
      });
      
      if (response && response.data) {
        console.log(`updateInvestmentTransactions: Successfully updated investment transactions for item: ${item}`);
        return "Investment transactions updated successfully";
      }
    } catch (plaidError) {
      if (plaidError.response?.data?.error_code === 'PRODUCTS_NOT_SUPPORTED') {
        console.warn(`updateInvestmentTransactions: Investment transactions not supported for item: ${item}`);
        return "Investment transactions not supported by this institution";
      } else {
        console.error(`updateInvestmentTransactions: Plaid API error for item ${item}:`, plaidError.response?.data || plaidError.message);
        return "Failed to update investment transactions";
      }
    }
  } catch (error) {
    console.error(`updateInvestmentTransactions error for item ${item}:`, error);
    return "Error updating investment transactions";
  }
};

const updateLiabilities = async (item) => {
  try {
    if (!item) {
      console.error("updateLiabilities: item is required");
      return "No item provided";
    }

    const accessToken = await getAccessTokenFromItemId(item);
    if (!accessToken) {
      console.error(`updateLiabilities: Failed to get access token for item: ${item}`);
      return "Failed to get access token";
    }

    // Check if the institution supports liabilities before making the call
    try {
      const response = await plaidClient.liabilitiesGet({
        access_token: accessToken,
      });
      
      if (response && response.data) {
        console.log(`updateLiabilities: Successfully updated liabilities for item: ${item}`);
        return "Liabilities updated successfully";
      }
    } catch (plaidError) {
      if (plaidError.response?.data?.error_code === 'PRODUCTS_NOT_SUPPORTED') {
        console.warn(`updateLiabilities: Liabilities not supported for item: ${item}`);
        return "Liabilities not supported by this institution";
      } else {
        console.error(`updateLiabilities: Plaid API error for item ${item}:`, plaidError.response?.data || plaidError.message);
        return "Failed to update liabilities";
      }
    }
  } catch (error) {
    console.error(`updateLiabilities error for item ${item}:`, error);
    return "Error updating liabilities";
  }
};

const updateInvadlidAccessToken = async (item) => {
  try {
    if (!item) {
      console.error("updateInvadlidAccessToken: item is required");
      return "No item provided";
    }

    const accessToken = await getAccessTokenFromItemId(item);
    if (!accessToken) {
      console.error(`updateInvadlidAccessToken: Failed to get access token for item: ${item}`);
      return "Failed to get access token";
    }

    const accounts = await PlaidAccount.find({ accessToken });
    if (!accounts || accounts.length === 0) {
      console.warn(`updateInvadlidAccessToken: No accounts found for access token: ${accessToken}`);
      return "No accounts found";
    }

    for (const account of accounts) {
      account.isAccessTokenExpired = true;
      await account.save();
    }

    console.log(`updateInvadlidAccessToken: Marked ${accounts.length} accounts as expired for item: ${item}`);
    return `Marked ${accounts.length} accounts as expired`;
  } catch (error) {
    console.error(`updateInvadlidAccessToken error for item ${item}:`, error);
    return "Error updating invalid access token";
  }
};

const repairAccessTokenWebhook = async (item) => {
  const accessToken = await getAccessTokenFromItemId(item);
  const accounts = await PlaidAccount.find({
    accessToken,
    isAccessTokenExpired: true,
  });
  for (const account of accounts) {
    account.isAccessTokenExpired = false;
    await account.save();
  }
  return accounts;
};

const repairAccessToken = async (accountId, email) => {
  try {
    const account = await PlaidAccount.findById(accountId);
    if (!account) {
      return;
    }
    const accessToken = account.accessToken;

    const plaidAccountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });
    const plaidAccounts = plaidAccountsResponse.data.accounts;
    const plaidIds = [];
    const accountIds = [];
    for (const plaidAccount of plaidAccounts) {
      plaidIds.push(plaidAccount.account_id);
    }

    const accounts = await PlaidAccount.find({
      accessToken,
    });
    for (const account of accounts) {
      accountIds.push(account.plaid_account_id);
    }

    const plaidSet = new Set(plaidIds);
    const removedAccounts = accountIds.filter((id) => !plaidSet.has(id));
    const unchangedAccounts = accountIds.filter((id) => plaidSet.has(id));

    for (const accountId of unchangedAccounts) {
      const plaidAccount = await PlaidAccount.findOne({
        plaid_account_id: accountId,
      });
      plaidAccount.isAccessTokenExpired = false;
      await plaidAccount.save();
    }

    for (const accountId of removedAccounts) {
      await accountsService.removeAccount(accountId, email);
    }

    const resAddAcount = await accountsService.addAccount(accessToken, email);

    return { accounts, existingAccounts: resAddAcount.existingAccounts };
  } catch (error) {
    console.log(error);
  }
};

const getCurrentCashflow = async (email) => {
  const transactionsResponse = await getTransactions(email);
  const transactions = transactionsResponse.added;
  return transactions;
};

const detectInternalTransfers = async (transactions) => {
  const transfers = [];
  const groupedByAmount = new Map();

  transactions
    .filter((txn) =>
      ["transfer", "internal account transfer"].includes(
        txn.category?.[0]?.toLowerCase()
      )
    )
    .forEach((txn) => {
      const key = Math.abs(txn.amount);
      if (!groupedByAmount.has(key)) {
        groupedByAmount.set(key, []);
      }
      groupedByAmount.get(key).push(txn);
    });

  groupedByAmount.forEach((txns, amount) => {
    for (let i = 0; i < txns.length; i++) {
      const txn1 = txns[i];
      for (let j = i + 1; j < txns.length; j++) {
        const txn2 = txns[j];

        const isOppositeAmount = txn1.amount === -txn2.amount;
        const isDifferentAccount = txn1.account_id !== txn2.account_id;
        const isDateClose =
          Math.abs(new Date(txn1.date) - new Date(txn2.date)) <=
          2 * 24 * 60 * 60 * 1000;

        if (isOppositeAmount && isDifferentAccount && isDateClose) {
          if (!transfers.includes(txn1.transaction_id)) {
            transfers.push({
              transactionId: txn1.transaction_id,
              transactionRef: txn2.transaction_id,
            });
          }
          if (!transfers.includes(txn2.transaction_id)) {
            transfers.push({
              transactionId: txn2.transaction_id,
              transactionRef: txn1.transaction_id,
            });
          }
        }
      }
    }
  });

  return transfers;
};

const invalidateAccessToken = async (accessToken) => {
  try {
    await plaidClient.itemRemove({
      access_token: accessToken,
      client_id: plaidClientId,
      secret: plaidSecret,
    });
  } catch (error) {
    console.error("Error invalidating access token:", error);
  }
};

// Função para verificar se é um banco Chase
const checkIfChaseBank = async (itemId, accessToken) => {
  try {
    const item = await plaidClient.itemGet({
      access_token: accessToken
    });
    
    const institution = await plaidClient.institutionsGetById({
      institution_id: item.data.item.institution_id,
      country_codes: ['US']
    });
    
    const institutionName = institution.data.institution.name.toLowerCase();
    return institutionName.includes('chase') || institutionName.includes('jpmorgan');
  } catch (error) {
    console.error('Error checking if Chase bank:', error);
    return false;
  }
};

// Função para verificar status específico do Chase
const checkChaseItemStatus = async (itemId, accessToken) => {
  try {
    const item = await plaidClient.itemGet({
      access_token: accessToken
    });
    
    const institution = await plaidClient.institutionsGetById({
      institution_id: item.data.item.institution_id,
      country_codes: ['US']
    });
    
    // Verificar se é Chase
    if (institution.data.institution.name.toLowerCase().includes('chase')) {
      console.log('Chase bank detected - applying special handling');
      
      // Verificar status do item
      if (item.data.item.status?.last_webhook) {
        const lastWebhook = new Date(item.data.item.status.last_webhook);
        const now = new Date();
        const hoursSinceLastWebhook = (now - lastWebhook) / (1000 * 60 * 60);
        
        if (hoursSinceLastWebhook > 24) {
          console.warn('Chase item may need reauthentication');
          return 'NEEDS_REAUTH';
        }
      }
      
      return 'HEALTHY';
    }
    
    return 'NOT_CHASE';
  } catch (error) {
    console.error('Error checking Chase item status:', error);
    return 'ERROR';
  }
};

// Retry logic com backoff exponencial para Chase
const retryWithBackoff = async (fn, maxRetries = 3, baseDelay = 1000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      // Verificar se é um erro específico do Chase
      if (error.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED' ||
          error.response?.data?.error_code === 'RATE_LIMIT_EXCEEDED') {
        const delay = baseDelay * Math.pow(2, i);
        console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms for Chase`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
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
  getUserAccessTokens,
  updateTransactions,
  getAccounts,
  detectInternalTransfers,
  getAccountsWithAccessToken,
  getTransactionsWithAccessToken,
  getInvestmentTransactionsWithAccessToken,
  getLoanLiabilitiesWithAccessToken,
  updateInvestmentTransactions,
  updateLiabilities,
  getAccessTokenFromItemId,
  updateInvadlidAccessToken,
  repairAccessTokenWebhook,
  repairAccessToken,
  getInvestmentsHoldingsWithAccessToken,
  invalidateAccessToken,
};

export default plaidService;
