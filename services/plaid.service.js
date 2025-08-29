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
  getPreviousDek,
  logEncryptionOperation
} from "../database/encryption.js";
import crypto from 'crypto';

const plaidClientId = process.env.PLAID_CLIENT_ID;
const plaidSecret = process.env.PLAID_SECRET;
const webhookUrl = process.env.PLAID_WEBHOOK_URL;
const plaidRedirectUri = process.env.PLAID_REDIRECT_URI;
const plaidRedirectNewAccounts = process.env.PLAID_REDIRECT_URI_NEW_ACCOUNTS;
const androidPackageName = process.env.BUNDLEID || "com.zentavos.mobile";

// Structured logging for Plaid operations
const logPlaidOperation = (operation, success, details = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    operation,
    success,
    ...details
  };
  
  if (success) {
    console.log(`[PLAID] ${operation}:`, logEntry);
  } else {
    console.error(`[PLAID] ${operation} FAILED:`, logEntry);
  }
};

// Cache for institution product support
const institutionProductCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Check if institution supports specific products
const checkInstitutionProductSupport = async (institutionId, product) => {
  try {
    const cacheKey = `${institutionId}_${product}`;
    const cached = institutionProductCache.get(cacheKey);
    
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      console.log(`[checkInstitutionProductSupport] Using cached result for ${institutionId}_${product}: ${cached.supported}`);
      return cached.supported;
    }

    console.log(`[checkInstitutionProductSupport] Checking support for ${institutionId}_${product}`);
    
    const response = await plaidClient.institutionsGetById({
      institution_id: institutionId,
      country_codes: ["US"],
      options: {
        include_optional_metadata: true
      }
    });

    const institution = response.data.institution;
    const supported = institution.products && institution.products.includes(product);
    
    console.log(`[checkInstitutionProductSupport] Institution ${institution.name} (${institutionId}) supports ${product}: ${supported}`);
    console.log(`[checkInstitutionProductSupport] Available products:`, institution.products);
    
    institutionProductCache.set(cacheKey, {
      supported,
      timestamp: Date.now()
    });

    logPlaidOperation('checkInstitutionProductSupport', true, {
      institutionId,
      product,
      supported,
      institutionName: institution.name,
      availableProducts: institution.products
    });

    return supported;
  } catch (error) {
    console.error(`[checkInstitutionProductSupport] Error checking ${institutionId}_${product}:`, error);
    
    logPlaidOperation('checkInstitutionProductSupport', false, {
      institutionId,
      product,
      error: error.message,
      errorCode: error.response?.data?.error_code,
      errorResponse: error.response?.data
    });
    
    // Return null to indicate unknown support status
    // Let the caller decide whether to proceed
    return null;
  }
};

// Validate item status before making API calls
const validateItemStatus = async (itemId, accessToken) => {
  try {
    const response = await plaidClient.itemGet({
      access_token: accessToken
    });

    const item = response.data.item;
    const status = item.status;

    logPlaidOperation('validateItemStatus', true, {
      itemId,
      status,
      requestId: response.data.request_id
    });

    return {
      valid: status === 'good',
      status,
      requestId: response.data.request_id,
      item
    };
  } catch (error) {
    logPlaidOperation('validateItemStatus', false, {
      itemId,
      error: error.message,
      errorCode: error.response?.data?.error_code
    });
    
    return {
      valid: false,
      status: 'unknown',
      error: error.message,
      errorCode: error.response?.data?.error_code
    };
  }
};

const createLinkToken = async (email, isAndroid, accountId, uid, screen) => {
  const user = await User.findOne({
    authUid: uid,
  });
  if (!user) {
    throw new Error("User not found");
  }
  let accessToken;
  const keyData = await getUserDek(uid);
  const dek = keyData.dek;
  if (accountId) {
    const account = await PlaidAccount.findOne({ _id: accountId });
    if (!account) {
      throw new Error("Account not found");
    }
    accessToken = await decryptValue(account.accessToken, dek, uid);
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
    // Remove institution_data if not needed for specific institution
    // institution_data: {
    //   routing_number: null // Allow manual entry if necessary
    // }
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
  try {
    // Get the user from database to get the MongoDB ObjectId
    const user = await User.findOne({ authUid: uid });
    if (!user) {
      throw new Error(`User not found for uid: ${uid}`);
    }

    const keyData = await getUserDek(uid);
  const dek = keyData.dek;
    const encryptedAccessToken = await encryptValue(accessToken, dek, uid);

    const accessTokenDoc = new AccessToken({
      accessToken: encryptedAccessToken,
      itemId,
      userId: user._id, // Use MongoDB ObjectId instead of Firebase UID
      institutionId,
    });

    await accessTokenDoc.save();

    logPlaidOperation('saveAccessToken', true, {
      itemId,
      institutionId,
      uid
    });

    return accessTokenDoc;
  } catch (error) {
    logPlaidOperation('saveAccessToken', false, {
      itemId,
      institutionId,
      uid,
      error: error.message
    });
    throw error;
  }
};

const getUserAccessTokens = async (email, uid) => {
  try {
    // Get the user from database to get the MongoDB ObjectId
    const user = await User.findOne({ authUid: uid });
    if (!user) {
      throw new Error(`User not found for uid: ${uid}`);
    }
    
    const accessTokens = await AccessToken.find({ userId: user._id });
    const keyData = await getUserDek(uid);
  const dek = keyData.dek;
    const fallbackDek = await getPreviousDek(uid);

    const decryptedTokens = [];
    for (const token of accessTokens) {
      try {
        const decryptedToken = await decryptValue(
          token.accessToken, 
          dek, 
          uid, 
          fallbackDek
        );
        decryptedTokens.push({
          ...token.toObject(),
          accessToken: decryptedToken,
        });
      } catch (error) {
        logPlaidOperation('getUserAccessTokens', false, {
          itemId: token.itemId,
          uid,
          error: error.message,
          note: 'Failed to decrypt individual token'
        });
        // Continue with other tokens
      }
    }

    logPlaidOperation('getUserAccessTokens', true, {
      uid,
      tokenCount: decryptedTokens.length
    });

    return decryptedTokens;
  } catch (error) {
    logPlaidOperation('getUserAccessTokens', false, {
      uid,
      error: error.message
    });
    throw error;
  }
};

const getAccounts = async (email, uid) => {
  try {
    const accessTokens = await getUserAccessTokens(email, uid);
    const allAccounts = [];

    for (const token of accessTokens) {
      try {
        const accountsResponse = await getAccountsWithAccessToken(token.accessToken);
        allAccounts.push(...accountsResponse.accounts);
      } catch (error) {
        logPlaidOperation('getAccounts', false, {
          itemId: token.itemId,
          uid,
          error: error.message,
          note: 'Failed to get accounts for individual token'
        });
        // Continue with other tokens
      }
    }

    logPlaidOperation('getAccounts', true, {
      uid,
      accountCount: allAccounts.length
    });

    return allAccounts;
  } catch (error) {
    logPlaidOperation('getAccounts', false, {
      uid,
      error: error.message
    });
    throw error;
  }
};

const getAccountsWithAccessToken = async (accessToken) => {
  const response = await plaidClient.accountsGet({
    access_token: accessToken,
  });
  return response.data;
};

const getBalance = async (email, uid) => {
  try {
    const accessTokens = await getUserAccessTokens(email, uid);
    const allBalances = [];

    for (const token of accessTokens) {
      try {
        const accountsResponse = await getAccountsWithAccessToken(token.accessToken);
        allBalances.push(...accountsResponse.accounts);
      } catch (error) {
        logPlaidOperation('getBalance', false, {
          itemId: token.itemId,
          uid,
          error: error.message,
          note: 'Failed to get balance for individual token'
        });
        // Continue with other tokens
      }
    }

    logPlaidOperation('getBalance', true, {
      uid,
      balanceCount: allBalances.length
    });

    return allBalances;
  } catch (error) {
    logPlaidOperation('getBalance', false, {
      uid,
      error: error.message
    });
    throw error;
  }
};

const getInstitutions = async () => {
  const response = await plaidClient.institutionsGet({
    count: 500,
    offset: 0,
    country_codes: ["US"],
  });
  return response.data.institutions;
};

const getTransactions = async (email, uid) => {
  try {
    const accessTokens = await getUserAccessTokens(email, uid);
    const allTransactions = [];

    for (const token of accessTokens) {
      try {
        const transactionsResponse = await getTransactionsWithAccessToken(token.accessToken);
        allTransactions.push(...transactionsResponse.transactions);
      } catch (error) {
        logPlaidOperation('getTransactions', false, {
          itemId: token.itemId,
          uid,
          error: error.message,
          note: 'Failed to get transactions for individual token'
        });
        // Continue with other tokens
      }
    }

    logPlaidOperation('getTransactions', true, {
      uid,
      transactionCount: allTransactions.length
    });

    return allTransactions;
  } catch (error) {
    logPlaidOperation('getTransactions', false, {
      uid,
      error: error.message
    });
    throw error;
  }
};

const getTransactionsWithAccessToken = async (accessToken) => {
  const response = await plaidClient.transactionsGet({
    access_token: accessToken,
    start_date: "2020-01-01",
    end_date: new Date().toISOString().split("T")[0],
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

const getLoanLiabilitiesWithAccessToken = async (accessToken, institutionId = null) => {
  try {
    // Check if institution supports liabilities before making the call
    if (institutionId) {
      const supportsLiabilities = await checkInstitutionProductSupport(institutionId, 'liabilities');
      if (!supportsLiabilities) {
        logPlaidOperation('getLoanLiabilitiesWithAccessToken', true, {
          institutionId,
          note: 'Liabilities not supported by institution, skipping call'
        });
        return { accounts: [], liabilities: [] };
      }
    }

    const response = await plaidClient.liabilitiesGet({
      access_token: accessToken,
    });
    
    logPlaidOperation('getLoanLiabilitiesWithAccessToken', true, {
      institutionId,
      requestId: response.data.request_id
    });
    
    return response.data;
  } catch (error) {
    if (error.response?.data?.error_code === 'PRODUCTS_NOT_SUPPORTED') {
      logPlaidOperation('getLoanLiabilitiesWithAccessToken', true, {
        institutionId,
        errorCode: 'PRODUCTS_NOT_SUPPORTED',
        note: 'Liabilities not supported by institution'
      });
      return { accounts: [], liabilities: [] };
    }
    
    logPlaidOperation('getLoanLiabilitiesWithAccessToken', false, {
      institutionId,
      error: error.message,
      errorCode: error.response?.data?.error_code
    });
    throw error;
  }
};

const getInvestmentsHoldingsWithAccessToken = async (accessToken) => {
  const response = await plaidClient.investmentsHoldingsGet({
    access_token: accessToken,
  });
  return response.data;
};

// Handle corrupted access tokens by marking them for re-authentication
const handleCorruptedAccessToken = async (itemId, uid, error) => {
  try {
    logPlaidOperation('handleCorruptedAccessToken', true, {
      itemId,
      uid,
      error: error.message,
      note: 'Marking item for re-authentication due to corrupted access token'
    });

    // Mark the item for re-authentication
    await markItemForReauth(itemId);

    // Update the access token document to indicate corruption
    await AccessToken.findOneAndUpdate(
      { itemId },
      { 
        $set: { 
          status: 'corrupted',
          lastError: error.message,
          lastErrorAt: new Date(),
          requiresReauth: true
        }
      }
    );

    // Log the corruption for monitoring
    logPlaidOperation('handleCorruptedAccessToken', true, {
      itemId,
      uid,
      note: 'Access token marked as corrupted and requiring re-authentication'
    });

    return true;
  } catch (recoveryError) {
    logPlaidOperation('handleCorruptedAccessToken', false, {
      itemId,
      uid,
      error: recoveryError.message,
      originalError: error.message
    });
    return false;
  }
};

// Enhanced getAccessTokenFromItemId with corruption handling
const getAccessTokenFromItemId = async (itemId, uid = null) => {
  try {
    if (!itemId) {
      logPlaidOperation('getAccessTokenFromItemId', false, {
        error: 'itemId is required'
      });
      return null;
    }

    console.log(`[PLAID] Looking for access token with itemId: ${itemId}`);
    
    const accessTokenDoc = await AccessToken.findOne({ itemId });
    if (!accessTokenDoc) {
      logPlaidOperation('getAccessTokenFromItemId', false, {
        itemId,
        error: 'Access token document not found'
      });
      
      // Log additional debugging information
      console.log(`[PLAID] Debug: No AccessToken found for itemId: ${itemId}`);
      console.log(`[PLAID] Debug: Checking if AccessToken collection exists...`);
      
      try {
        const totalTokens = await AccessToken.countDocuments();
        console.log(`[PLAID] Debug: Total AccessToken documents in collection: ${totalTokens}`);
        
        // Check if there are any tokens with similar itemIds
        const similarTokens = await AccessToken.find({
          itemId: { $regex: itemId.substring(0, 8), $options: 'i' }
        }).limit(5);
        
        if (similarTokens.length > 0) {
          console.log(`[PLAID] Debug: Found similar itemIds:`, similarTokens.map(t => ({ itemId: t.itemId, userId: t.userId })));
        }
      } catch (debugError) {
        console.error(`[PLAID] Debug: Error checking collection:`, debugError.message);
      }
      
      return null;
    }

    console.log(`[PLAID] Found AccessToken document:`, {
      itemId: accessTokenDoc.itemId,
      hasUserId: !!accessTokenDoc.userId,
      userId: accessTokenDoc.userId,
      hasAccessToken: !!accessTokenDoc.accessToken,
      accessTokenLength: accessTokenDoc.accessToken ? accessTokenDoc.accessToken.length : 0,
      createdAt: accessTokenDoc.createdAt,
      updatedAt: accessTokenDoc.updatedAt
    });

    // Check if token is marked as corrupted
    if (accessTokenDoc.status === 'corrupted') {
      logPlaidOperation('getAccessTokenFromItemId', false, {
        itemId,
        uid: uid || 'not_provided',
        error: 'Access token is marked as corrupted',
        lastError: accessTokenDoc.lastError,
        lastErrorAt: accessTokenDoc.lastErrorAt
      });
      
      // Clean up corrupted token
      await cleanUpCorruptedToken(itemId);
      return null;
    }

    // If UID not provided, try to get it from the AccessToken document
    let targetUid = uid;
    if (!targetUid) {
      if (accessTokenDoc.userId) {
        targetUid = accessTokenDoc.userId.toString();
        logPlaidOperation('getAccessTokenFromItemId', true, {
          itemId,
          note: `UID retrieved from AccessToken document: ${targetUid}`,
          source: 'document'
        });
      } else {
        logPlaidOperation('getAccessTokenFromItemId', false, {
          itemId,
          error: 'No UID provided and no userId found in AccessToken document',
          accessTokenDoc: {
            hasUserId: !!accessTokenDoc.userId,
            userIdType: typeof accessTokenDoc.userId,
            userIdValue: accessTokenDoc.userId
          }
        });
        
        // Mark token as corrupted and clean it up
        await markTokenAsCorrupted(itemId, 'Missing userId in AccessToken document');
        return null;
      }
    }

    // Validate that the UID matches the token's userId
    if (accessTokenDoc.userId && accessTokenDoc.userId.toString() !== targetUid) {
      logPlaidOperation('getAccessTokenFromItemId', false, {
        itemId,
        providedUid: targetUid,
        tokenUserId: accessTokenDoc.userId.toString(),
        error: 'UID mismatch between request and token document'
      });
      
      // Mark token as corrupted and clean it up
      await markTokenAsCorrupted(itemId, `UID mismatch: provided ${targetUid}, token has ${accessTokenDoc.userId}`);
      return null;
    }

    const keyData = await getUserDek(targetUid);
    const dek = keyData.dek;
    if (!dek) {
      logPlaidOperation('getAccessTokenFromItemId', false, {
        itemId,
        uid: targetUid,
        error: 'Failed to get user DEK'
      });
      return null;
    }

    // Try to decrypt with current DEK
    let accessToken = await decryptValue(accessTokenDoc.accessToken, dek, targetUid);
    
    // If decryption fails, try with fallback DEK
    if (!accessToken) {
      logPlaidOperation('getAccessTokenFromItemId', false, {
        itemId,
        uid: targetUid,
        error: 'Failed to decrypt access token with current DEK, trying fallback'
      });
      
      // Get fallback DEK (previous version)
      const fallbackDek = await getPreviousDek(targetUid);
      if (fallbackDek) {
        accessToken = await decryptValue(accessTokenDoc.accessToken, fallbackDek, targetUid);
        if (accessToken) {
          logPlaidOperation('getAccessTokenFromItemId', true, {
            itemId,
            uid: targetUid,
            note: 'Successfully decrypted with fallback DEK'
          });
        }
      }
    }

    if (!accessToken) {
      logPlaidOperation('getAccessTokenFromItemId', false, {
        itemId,
        uid: targetUid,
        error: 'All decryption attempts failed for access token'
      });
      
      // Handle corrupted access token
      await handleCorruptedAccessToken(itemId, targetUid, new Error('Access token decryption failed'));
      
      return null;
    }

    logPlaidOperation('getAccessTokenFromItemId', true, {
      itemId,
      uid: targetUid
    });

    return accessToken;
  } catch (error) {
    logPlaidOperation('getAccessTokenFromItemId', false, {
      itemId,
      uid: uid || 'not_provided',
      error: error.message,
      stack: error.stack
    });
    
    // Handle corrupted access token for unexpected errors
    if (uid) {
      await handleCorruptedAccessToken(itemId, uid, error);
    }
    
    return null;
  }
};

// Function to clean up corrupted tokens
const cleanUpCorruptedToken = async (itemId) => {
  try {
    console.log(`[PLAID] Cleaning up corrupted token for itemId: ${itemId}`);
    
    // Remove the corrupted token
    const result = await AccessToken.deleteOne({ itemId });
    
    if (result.deletedCount > 0) {
      console.log(`[PLAID] Successfully removed corrupted token for itemId: ${itemId}`);
      
      // Also clean up related PlaidAccount documents
      const PlaidAccount = (await import("../database/models/PlaidAccount.js")).default;
      const accountResult = await PlaidAccount.deleteMany({ itemId });
      
      if (accountResult.deletedCount > 0) {
        console.log(`[PLAID] Also removed ${accountResult.deletedCount} related PlaidAccount documents for itemId: ${itemId}`);
      }
      
      // Clean up related Transaction documents
      const Transaction = (await import("../database/models/Transaction.js")).default;
      const transactionResult = await Transaction.deleteMany({ itemId });
      
      if (transactionResult.deletedCount > 0) {
        console.log(`[PLAID] Also removed ${transactionResult.deletedCount} related Transaction documents for itemId: ${itemId}`);
      }
      
    } else {
      console.log(`[PLAID] No token found to remove for itemId: ${itemId}`);
    }
    
  } catch (error) {
    console.error(`[PLAID] Error cleaning up corrupted token for itemId ${itemId}:`, error);
  }
};

// Function to mark token as corrupted
const markTokenAsCorrupted = async (itemId, reason) => {
  try {
    console.log(`[PLAID] Marking token as corrupted for itemId: ${itemId}, reason: ${reason}`);
    
    await AccessToken.updateOne(
      { itemId },
      { 
        status: 'corrupted',
        lastError: reason,
        lastErrorAt: new Date()
      }
    );
    
    console.log(`[PLAID] Successfully marked token as corrupted for itemId: ${itemId}`);
    
  } catch (error) {
    console.error(`[PLAID] Error marking token as corrupted for itemId ${itemId}:`, error);
  }
};

// Function to clean up all corrupted tokens
const cleanUpAllCorruptedTokens = async () => {
  try {
    console.log(`[PLAID] Starting cleanup of all corrupted tokens...`);
    
    // Find all corrupted tokens
    const corruptedTokens = await AccessToken.find({ status: 'corrupted' });
    console.log(`[PLAID] Found ${corruptedTokens.length} corrupted tokens`);
    
    let cleanedCount = 0;
    for (const token of corruptedTokens) {
      try {
        await cleanUpCorruptedToken(token.itemId);
        cleanedCount++;
      } catch (error) {
        console.error(`[PLAID] Error cleaning up token ${token.itemId}:`, error);
      }
    }
    
    console.log(`[PLAID] Successfully cleaned up ${cleanedCount} corrupted tokens`);
    return { success: true, cleanedCount, totalFound: corruptedTokens.length };
    
  } catch (error) {
    console.error(`[PLAID] Error in cleanUpAllCorruptedTokens:`, error);
    return { success: false, error: error.message };
  }
};

// Function to get diagnostic information about access tokens
const getAccessTokenDiagnostics = async () => {
  try {
    console.log(`[PLAID] Getting access token diagnostics...`);
    
    const totalTokens = await AccessToken.countDocuments();
    const activeTokens = await AccessToken.countDocuments({ status: 'active' });
    const corruptedTokens = await AccessToken.countDocuments({ status: 'corrupted' });
    const expiredTokens = await AccessToken.countDocuments({ status: 'expired' });
    
    // Get sample of corrupted tokens for analysis
    const sampleCorrupted = await AccessToken.find({ status: 'corrupted' })
      .limit(10)
      .select('itemId userId lastError lastErrorAt createdAt');
    
    // Get sample of active tokens
    const sampleActive = await AccessToken.find({ status: 'active' })
      .limit(10)
      .select('itemId userId createdAt');
    
    const diagnostics = {
      totalTokens,
      activeTokens,
      corruptedTokens,
      expiredTokens,
      sampleCorrupted: sampleCorrupted.map(t => ({
        itemId: t.itemId,
        userId: t.userId,
        lastError: t.lastError,
        lastErrorAt: t.lastErrorAt,
        createdAt: t.createdAt
      })),
      sampleActive: sampleActive.map(t => ({
        itemId: t.itemId,
        userId: t.userId,
        createdAt: t.createdAt
      })),
      timestamp: new Date().toISOString()
    };
    
    console.log(`[PLAID] Diagnostics completed:`, diagnostics);
    return diagnostics;
    
  } catch (error) {
    console.error(`[PLAID] Error getting diagnostics:`, error);
    return { error: error.message };
  }
};

// Function to validate and repair access tokens
const validateAndRepairAccessTokens = async () => {
  try {
    console.log(`[PLAID] Starting validation and repair of access tokens...`);
    
    const diagnostics = await getAccessTokenDiagnostics();
    console.log(`[PLAID] Initial diagnostics:`, diagnostics);
    
    // Clean up corrupted tokens
    const cleanupResult = await cleanUpAllCorruptedTokens();
    console.log(`[PLAID] Cleanup result:`, cleanupResult);
    
    // Get final diagnostics
    const finalDiagnostics = await getAccessTokenDiagnostics();
    console.log(`[PLAID] Final diagnostics:`, finalDiagnostics);
    
    return {
      success: true,
      initialDiagnostics: diagnostics,
      cleanupResult,
      finalDiagnostics
    };
    
  } catch (error) {
    console.error(`[PLAID] Error in validateAndRepairAccessTokens:`, error);
    return { success: false, error: error.message };
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

      return await updateUniversalTransactions(item, accessToken, uid, accounts);
  } catch (error) {
    console.error(`Error updating transactions for item ${item}:`, error);
    throw error;
  }
};

// Specific function to update Chase transactions
const updateChaseTransactions = async (item, accessToken, uid, accounts) => {
  const keyData = await getUserDek(uid);
  const dek = keyData.dek;

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
      }, 'chase'); // Use 'chase' specific config

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
const updateUniversalTransactions = async (item, accessToken, uid, accounts) => {
  const user = await User.findById(accounts[0].owner_id);
  const emails = user?.email;
  const emailObject = emails?.find((email) => email.isPrimary === true);
  const email = emailObject?.email;
  const keyData = await getUserDek(uid);
  const dek = keyData.dek;

  await updateAccountBalances(dek, accessToken, accounts);

  let cursor = accounts[0].nextCursor || null;
  let hasMore = true;
  let newTransactions = [];
  let retryCount = 0;
  let mutationErrorCount = 0;
  const maxRetries = 3;
  const maxMutationErrors = 5;
  const maxIterations = 15;
  let iterationCounter = 0;

  // Specific configuration for Capital One
  const isCapitalOne = accounts[0]?.institution_id === 'ins_56' || 
                      accounts[0]?.institution_id?.includes('capital_one') ||
                      accounts[0]?.institution_id?.includes('capitalone');
  
  const mutationConfig = isCapitalOne ? {
    maxMutationErrors: 10,
    mutationDelay: 10000,
    retryInterval: 30000
  } : {
    maxMutationErrors: 5,
    mutationDelay: 5000,
    retryInterval: 5000
  };

  while (hasMore && iterationCounter < maxIterations) {
    iterationCounter++;
    const currentCursor = cursor;
    
    try {
      console.log(`Transaction sync iteration ${iterationCounter}, cursor: ${currentCursor}`);
      
      const response = await retryWithBackoff(async () => {
        return await plaidClient.transactionsSync({
          access_token: accessToken,
          cursor: currentCursor,
          count: 100,
        });
      }, 'universal');

      const transactions = response.data.added || [];
      const modifiedTransactions = response.data.modified || [];
      const removedTransactions = response.data.removed || [];
      const nextCursor = response.data.next_cursor;
      hasMore = response.data.has_more;

      console.log(`Universal sync: ${transactions.length} new, ${modifiedTransactions.length} modified, ${removedTransactions.length} removed`);

      if (transactions.length > 0) {
        await processTransactions(transactions, accounts, dek);
        newTransactions.push(...transactions);
      }

      if (modifiedTransactions.length > 0) {
        await handleModifiedTransactions(modifiedTransactions, accounts, dek);
      }

      if (removedTransactions.length > 0) {
        await handleRemovedTransactions(removedTransactions);
      }

      cursor = nextCursor;
      retryCount = 0;

      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }

    } catch (error) {
      retryCount++;
      console.error(`Transaction sync error (attempt ${retryCount}):`, error);
      
      if (error.response?.data?.error_code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') {
        mutationErrorCount++;
        console.log(`Data mutation detected (attempt ${mutationErrorCount}/${mutationConfig.maxMutationErrors}), restarting pagination from current cursor`);
        
        // Log institution-specific information for debugging
        try {
          const institutionInfo = await plaidClient.institutionsGetById({
            institution_id: accounts[0]?.institution_id,
            country_codes: ['US']
          });
          console.log(`Mutation error for institution: ${institutionInfo.data.institution.name}${isCapitalOne ? ' (Capital One - using extended config)' : ''}`);
        } catch (instError) {
          console.log('Could not retrieve institution info for mutation error');
        }
        
        if (mutationErrorCount >= mutationConfig.maxMutationErrors) {
          console.error(`Max mutation errors reached (${mutationConfig.maxMutationErrors}), stopping sync`);
          break;
        }
        
        // Reset cursor to null to restart pagination from the beginning
        // This follows Plaid's recommendation for this error
        cursor = null;
        
        // Wait longer for data to stabilize (longer for Capital One)
        await new Promise(resolve => setTimeout(resolve, mutationConfig.mutationDelay));
        
        // Don't increment retryCount for mutation errors as we're restarting pagination
        // This gives us more attempts to handle the mutation
        continue;
      }
      
      if (error.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED') {
        console.error('Item requires reauthentication');
        await markItemForReauth(item);
        break;
      }
      
      if (error.response?.data?.error_code === 'RATE_LIMIT_EXCEEDED') {
        console.log('Rate limit exceeded, waiting before retry');
        await new Promise(resolve => setTimeout(resolve, 5000));
        if (retryCount >= maxRetries) {
          console.error('Max retries reached for rate limit');
          break;
        }
        continue;
      }
      
      if (retryCount >= maxRetries) {
        console.error('Max retries reached for transaction sync');
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
    }
  }

  for (const account of accounts) {
    account.nextCursor = cursor;
    await account.save();
  }

  console.log(`Universal transaction sync completed. Processed ${newTransactions.length} new transactions`);
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

const handleModifiedTransactions = async (modifiedTransactions, accounts, dek) => {
  try {
    console.log(`Processing ${modifiedTransactions.length} modified transactions`);
    
    for (const transaction of modifiedTransactions) {
      const existingTransaction = await Transaction.findOne({
        plaidTransactionId: transaction.transaction_id
      });
      
      if (existingTransaction) {
        // Update the transaction with new data
        const encryptedAmount = await encryptValue(transaction.amount, dek);
        const encryptedName = await encryptValue(transaction.name, dek);
        const encryptedMerchantName = await encryptValue(transaction.merchant_name, dek);
        
        existingTransaction.amount = encryptedAmount;
        existingTransaction.name = encryptedName;
        existingTransaction.merchant = {
          ...existingTransaction.merchant,
          name: encryptedMerchantName,
          merchantName: encryptedMerchantName,
        };
        existingTransaction.category = transaction.category;
        existingTransaction.date = transaction.date;
        existingTransaction.pending = transaction.pending;
        
        await existingTransaction.save();
      }
    }
  } catch (error) {
    console.error('Error handling modified transactions:', error);
  }
};

const handleRemovedTransactions = async (removedTransactions) => {
  try {
    console.log(`Processing ${removedTransactions.length} removed transactions`);
    
    for (const transaction of removedTransactions) {
      await Transaction.findOneAndDelete({
        plaidTransactionId: transaction.transaction_id
      });
    }
  } catch (error) {
    console.error('Error handling removed transactions:', error);
  }
};

const updateInvestmentTransactions = async (item) => {
  try {
    if (!item) {
      logPlaidOperation('updateInvestmentTransactions', false, {
        error: 'item is required'
      });
      return "No item provided";
    }

    // Get access token with proper error handling
    const accessToken = await getAccessTokenFromItemId(item);
    if (!accessToken) {
      logPlaidOperation('updateInvestmentTransactions', false, {
        itemId: item,
        error: 'Failed to get access token'
      });
      return "Failed to get access token";
    }

    // Validate item status before making API calls
    const itemStatus = await validateItemStatus(item, accessToken);
    if (!itemStatus.valid) {
      logPlaidOperation('updateInvestmentTransactions', false, {
        itemId: item,
        status: itemStatus.status,
        error: itemStatus.error || 'Item status invalid'
      });
      return `Item status invalid: ${itemStatus.status}`;
    }

    // Get institution ID for product support checking
    const accessTokenDoc = await AccessToken.findOne({ itemId: item });
    const institutionId = accessTokenDoc?.institutionId;

    // Check if the institution supports investment transactions before making the call
    if (institutionId) {
      const supportsInvestments = await checkInstitutionProductSupport(institutionId, 'investments');
      if (!supportsInvestments) {
        logPlaidOperation('updateInvestmentTransactions', true, {
          itemId: item,
          institutionId,
          note: 'Investment transactions not supported by institution, skipping call'
        });
        return "Investment transactions not supported by this institution";
      }
    }

    try {
      const response = await plaidClient.investmentsTransactionsGet({
        access_token: accessToken,
        start_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days ago
        end_date: new Date().toISOString().split('T')[0],
      });
      
      if (response && response.data) {
        logPlaidOperation('updateInvestmentTransactions', true, {
          itemId: item,
          institutionId,
          requestId: response.data.request_id,
          transactionCount: response.data.investment_transactions?.length || 0
        });
        return "Investment transactions updated successfully";
      }
    } catch (plaidError) {
      if (plaidError.response?.data?.error_code === 'PRODUCTS_NOT_SUPPORTED') {
        logPlaidOperation('updateInvestmentTransactions', true, {
          itemId: item,
          institutionId,
          note: 'Investment transactions not supported by this institution'
        });
        return "Investment transactions not supported by this institution";
      } else {
        logPlaidOperation('updateInvestmentTransactions', false, {
          itemId: item,
          institutionId,
          error: plaidError.response?.data?.error_message || plaidError.message,
          errorCode: plaidError.response?.data?.error_code
        });
        return "Failed to update investment transactions";
      }
    }
  } catch (error) {
    logPlaidOperation('updateInvestmentTransactions', false, {
      itemId: item,
      error: error.message,
      stack: error.stack
    });
    return "Error updating investment transactions";
  }
};

const updateLiabilities = async (item) => {
  try {
    if (!item) {
      logPlaidOperation('updateLiabilities', false, {
        error: 'item is required'
      });
      return "No item provided";
    }

    // Get access token with fallback support
    const accessToken = await getAccessTokenFromItemId(item);
    if (!accessToken) {
      logPlaidOperation('updateLiabilities', false, {
        itemId: item,
        error: 'Failed to get access token'
      });
      return "Failed to get access token";
    }

    // Validate item status before making API calls
    const itemStatus = await validateItemStatus(item, accessToken);
    if (!itemStatus.valid) {
      logPlaidOperation('updateLiabilities', false, {
        itemId: item,
        status: itemStatus.status,
        error: itemStatus.error || 'Item status invalid'
      });
      return `Item status invalid: ${itemStatus.status}`;
    }

    // Get institution ID for product support checking
    const accessTokenDoc = await AccessToken.findOne({ itemId: item });
    const institutionId = accessTokenDoc?.institutionId;

    // Check if the institution supports liabilities before making the call
    if (institutionId) {
      const supportsLiabilities = await checkInstitutionProductSupport(institutionId, 'liabilities');
      if (!supportsLiabilities) {
        logPlaidOperation('updateLiabilities', true, {
          itemId: item,
          institutionId,
          note: 'Liabilities not supported by institution, skipping call'
        });
        return "Liabilities not supported by this institution";
      }
    }

    try {
      const response = await plaidClient.liabilitiesGet({
        access_token: accessToken,
      });
      
      if (response && response.data) {
        logPlaidOperation('updateLiabilities', true, {
          itemId: item,
          institutionId,
          requestId: response.data.request_id
        });
        return "Liabilities updated successfully";
      }
    } catch (plaidError) {
      if (plaidError.response?.data?.error_code === 'PRODUCTS_NOT_SUPPORTED') {
        logPlaidOperation('updateLiabilities', true, {
          itemId: item,
          institutionId,
          errorCode: 'PRODUCTS_NOT_SUPPORTED',
          requestId: plaidError.response?.data?.request_id,
          note: 'Liabilities not supported by institution'
        });
        return "Liabilities not supported by this institution";
      } else {
        logPlaidOperation('updateLiabilities', false, {
          itemId: item,
          institutionId,
          error: plaidError.response?.data || plaidError.message,
          requestId: plaidError.response?.data?.request_id
        });
        return "Failed to update liabilities";
      }
    }
  } catch (error) {
    logPlaidOperation('updateLiabilities', false, {
      itemId: item,
      error: error.message
    });
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

const getCurrentCashflow = async (email, uid) => {
  const transactionsResponse = await getTransactions(email, uid);
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

const checkChaseItemStatus = async (itemId, accessToken) => {
  try {
    const item = await plaidClient.itemGet({
      access_token: accessToken
    });
    
    const institution = await plaidClient.institutionsGetById({
      institution_id: item.data.item.institution_id,
      country_codes: ['US']
    });
    
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

const RATE_LIMIT_CONFIG = {
  default: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
  chase: { maxRetries: 5, baseDelay: 2000, maxDelay: 30000 },
  high_volume: { maxRetries: 4, baseDelay: 1500, maxDelay: 15000 },
  universal: { maxRetries: 4, baseDelay: 1500, maxDelay: 20000 }
};

const retryWithBackoff = async (fn, institutionType = 'default', customConfig = {}) => {
  const config = { ...RATE_LIMIT_CONFIG[institutionType] || RATE_LIMIT_CONFIG.default, ...customConfig };
  
  for (let i = 0; i < config.maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === config.maxRetries - 1) throw error;
      
      const shouldRetry = error.response?.data?.error_code === 'ITEM_LOGIN_REQUIRED' ||
                         error.response?.data?.error_code === 'RATE_LIMIT_EXCEEDED' ||
                         error.response?.data?.error_code === 'INSTITUTION_DOWN' ||
                         error.response?.data?.error_code === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' ||
                         error.response?.status >= 500;
      
      if (shouldRetry) {
        const delay = Math.min(config.baseDelay * Math.pow(2, i), config.maxDelay);
        console.log(`Retry ${i + 1}/${config.maxRetries} after ${delay}ms for ${institutionType}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
};

const plaidMetrics = {
  requests: 0,
  errors: 0,
  rateLimitHits: 0,
  paginationErrors: 0,
  webhookErrors: 0,
  institutionErrors: {},
  responseTimes: [],
  lastSync: {},
  syncStatus: {}
};

const trackPlaidRequest = (startTime, success, errorCode = null, institution = null) => {
  const responseTime = Date.now() - startTime;
  plaidMetrics.requests++;
  plaidMetrics.responseTimes.push(responseTime);
  
  if (!success) {
    plaidMetrics.errors++;
    if (errorCode === 'RATE_LIMIT_EXCEEDED') {
      plaidMetrics.rateLimitHits++;
    } else if (errorCode === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION') {
      plaidMetrics.paginationErrors++;
    } else if (errorCode === 'WEBHOOK_ERROR') {
      plaidMetrics.webhookErrors++;
    }
    if (institution) {
      plaidMetrics.institutionErrors[institution] = (plaidMetrics.institutionErrors[institution] || 0) + 1;
    }
  }
  
  if (plaidMetrics.responseTimes.length > 1000) {
    plaidMetrics.responseTimes = plaidMetrics.responseTimes.slice(-1000);
  }
};

const getPlaidMetrics = () => {
  const avgResponseTime = plaidMetrics.responseTimes.length > 0 
    ? plaidMetrics.responseTimes.reduce((a, b) => a + b, 0) / plaidMetrics.responseTimes.length 
    : 0;
  
  return {
    ...plaidMetrics,
    avgResponseTime: Math.round(avgResponseTime),
    errorRate: plaidMetrics.requests > 0 ? (plaidMetrics.errors / plaidMetrics.requests * 100).toFixed(2) : 0
  };
};

// Health monitoring and recovery functions

// Check if an item's last successful sync is stale
const isItemStale = async (itemId, staleThresholdDays = 30) => {
  try {
    const accounts = await PlaidAccount.find({ itemId });
    if (!accounts || accounts.length === 0) {
      return { stale: true, reason: 'No accounts found' };
    }

    const staleThreshold = new Date();
    staleThreshold.setDate(staleThreshold.getDate() - staleThresholdDays);

    // Check if any account has recent activity
    for (const account of accounts) {
      if (account.updated_at && account.updated_at > staleThreshold) {
        return { stale: false, lastUpdate: account.updated_at };
      }
    }

    return { stale: true, reason: 'No recent updates', lastUpdate: accounts[0]?.updated_at };
  } catch (error) {
    logPlaidOperation('isItemStale', false, {
      itemId,
      error: error.message
    });
    return { stale: true, reason: 'Error checking staleness' };
  }
};

// Recover stale transactions for an item
const recoverStaleTransactions = async (itemId, uid, daysBack = 90) => {
  try {
    logPlaidOperation('recoverStaleTransactions', true, {
      itemId,
      uid,
      daysBack,
      note: 'Starting stale transaction recovery'
    });

    const accessToken = await getAccessTokenFromItemId(itemId, uid);
    if (!accessToken) {
      logPlaidOperation('recoverStaleTransactions', false, {
        itemId,
        uid,
        error: 'Failed to get access token'
      });
      return { success: false, error: 'Failed to get access token' };
    }

    // Validate item status
    const itemStatus = await validateItemStatus(itemId, accessToken);
    if (!itemStatus.valid) {
      logPlaidOperation('recoverStaleTransactions', false, {
        itemId,
        uid,
        status: itemStatus.status,
        error: 'Item status invalid'
      });
      return { success: false, error: `Item status invalid: ${itemStatus.status}` };
    }

    // Get accounts for this item
    const accounts = await PlaidAccount.find({ itemId });
    if (!accounts || accounts.length === 0) {
      logPlaidOperation('recoverStaleTransactions', false, {
        itemId,
        uid,
        error: 'No accounts found'
      });
      return { success: false, error: 'No accounts found' };
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const keyData = await getUserDek(uid);
  const dek = keyData.dek;
    let totalRecovered = 0;

    // Recover transactions for each account
    for (const account of accounts) {
      try {
        const response = await plaidClient.transactionsGet({
          access_token: accessToken,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          options: {
            account_ids: [account.plaid_account_id]
          }
        });

        const transactions = response.data.transactions;
        if (transactions && transactions.length > 0) {
          // Process recovered transactions
          await processTransactions(transactions, [account], dek);
          totalRecovered += transactions.length;

          logPlaidOperation('recoverStaleTransactions', true, {
            itemId,
            uid,
            accountId: account.plaid_account_id,
            recoveredCount: transactions.length
          });
        }

        // Update account timestamp
        account.updated_at = new Date();
        await account.save();

      } catch (error) {
        logPlaidOperation('recoverStaleTransactions', false, {
          itemId,
          uid,
          accountId: account.plaid_account_id,
          error: error.message
        });
        // Continue with other accounts
      }
    }

    logPlaidOperation('recoverStaleTransactions', true, {
      itemId,
      uid,
      totalRecovered,
      note: 'Stale transaction recovery completed'
    });

    return { success: true, recoveredCount: totalRecovered };
  } catch (error) {
    logPlaidOperation('recoverStaleTransactions', false, {
      itemId,
      uid,
      error: error.message
    });
    return { success: false, error: error.message };
  }
};

// Background health check job
const runHealthCheck = async () => {
  try {
    logPlaidOperation('runHealthCheck', true, {
      note: 'Starting background health check'
    });

    const allItems = await AccessToken.find({});
    const healthReport = {
      totalItems: allItems.length,
      healthyItems: 0,
      staleItems: 0,
      failedItems: 0,
      recoveryAttempts: 0,
      recoverySuccesses: 0,
      details: []
    };

    for (const item of allItems) {
      try {
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const itemId = item.itemId;
        const uid = item.userId;

        // Check if item is stale
        const staleness = await isItemStale(itemId);
        
        if (staleness.stale) {
          healthReport.staleItems++;
          
          // Attempt recovery for stale items
          healthReport.recoveryAttempts++;
          const recovery = await recoverStaleTransactions(itemId, uid);
          
          if (recovery.success) {
            healthReport.recoverySuccesses++;
            healthReport.details.push({
              itemId,
              status: 'recovered',
              recoveredCount: recovery.recoveredCount,
              reason: staleness.reason
            });
          } else {
            healthReport.failedItems++;
            healthReport.details.push({
              itemId,
              status: 'failed',
              error: recovery.error,
              reason: staleness.reason
            });
          }
        } else {
          healthReport.healthyItems++;
          healthReport.details.push({
            itemId,
            status: 'healthy',
            lastUpdate: staleness.lastUpdate
          });
        }

      } catch (error) {
        healthReport.failedItems++;
        healthReport.details.push({
          itemId: item.itemId,
          status: 'error',
          error: error.message
        });
      }
    }

    logPlaidOperation('runHealthCheck', true, {
      report: healthReport,
      note: 'Background health check completed'
    });

    return healthReport;
  } catch (error) {
    logPlaidOperation('runHealthCheck', false, {
      error: error.message
    });
    throw error;
  }
};

// Webhook validation and fallback
const validateWebhookSignature = (body, signature, webhookSecret) => {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body, 'utf8')
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    logPlaidOperation('validateWebhookSignature', false, {
      error: error.message
    });
    return false;
  }
};

// Track webhook delivery failures
const webhookFailureTracker = new Map();
const WEBHOOK_FAILURE_THRESHOLD = 3;

const trackWebhookFailure = (itemId) => {
  const failures = webhookFailureTracker.get(itemId) || 0;
  webhookFailureTracker.set(itemId, failures + 1);
  
  logPlaidOperation('trackWebhookFailure', true, {
    itemId,
    failureCount: failures + 1
  });
  
  return failures + 1 >= WEBHOOK_FAILURE_THRESHOLD;
};

const resetWebhookFailures = (itemId) => {
  webhookFailureTracker.delete(itemId);
  logPlaidOperation('resetWebhookFailures', true, {
    itemId
  });
};

// Fallback polling for items with missed webhooks
const triggerFallbackPolling = async (itemId, uid) => {
  try {
    logPlaidOperation('triggerFallbackPolling', true, {
      itemId,
      uid,
      note: 'Triggering fallback polling due to missed webhooks'
    });

    // Trigger transaction sync
    const transactionResult = await updateTransactions(itemId);
    
    // Trigger liabilities update
    const liabilitiesResult = await updateLiabilities(itemId);
    
    // Reset webhook failure count
    resetWebhookFailures(itemId);
    
    return {
      success: true,
      transactions: transactionResult,
      liabilities: liabilitiesResult
    };
  } catch (error) {
    logPlaidOperation('triggerFallbackPolling', false, {
      itemId,
      uid,
      error: error.message
    });
    return { success: false, error: error.message };
  }
};

// Generate health report for all items
const generateHealthReport = async () => {
  try {
    const allItems = await AccessToken.find({});
    const report = {
      timestamp: new Date().toISOString(),
      totalItems: allItems.length,
      summary: {
        healthy: 0,
        needsReauth: 0,
        stale: 0,
        failed: 0
      },
      items: []
    };

    for (const item of allItems) {
      try {
        const itemId = item.itemId;
        const uid = item.userId;
        
        // Get access token
        const accessToken = await getAccessTokenFromItemId(itemId, uid);
        if (!accessToken) {
          report.summary.failed++;
          report.items.push({
            itemId,
            status: 'failed',
            reason: 'Cannot decrypt access token'
          });
          continue;
        }

        // Validate item status
        const itemStatus = await validateItemStatus(itemId, accessToken);
        if (!itemStatus.valid) {
          if (itemStatus.status === 'ITEM_LOGIN_REQUIRED') {
            report.summary.needsReauth++;
            report.items.push({
              itemId,
              status: 'needs_reauth',
              reason: itemStatus.status
            });
          } else {
            report.summary.failed++;
            report.items.push({
              itemId,
              status: 'failed',
              reason: itemStatus.status
            });
          }
          continue;
        }

        // Check staleness
        const staleness = await isItemStale(itemId);
        if (staleness.stale) {
          report.summary.stale++;
          report.items.push({
            itemId,
            status: 'stale',
            reason: staleness.reason,
            lastUpdate: staleness.lastUpdate
          });
        } else {
          report.summary.healthy++;
          report.items.push({
            itemId,
            status: 'healthy',
            lastUpdate: staleness.lastUpdate
          });
        }

      } catch (error) {
        report.summary.failed++;
        report.items.push({
          itemId: item.itemId,
          status: 'error',
          reason: error.message
        });
      }
    }

    logPlaidOperation('generateHealthReport', true, {
      report: report.summary
    });

    return report;
  } catch (error) {
    logPlaidOperation('generateHealthReport', false, {
      error: error.message
    });
    throw error;
  }
};

// Safe sync/recovery for a specific item
const safeSyncItem = async (itemId, uid) => {
  try {
    logPlaidOperation('safeSyncItem', true, {
      itemId,
      uid,
      note: 'Starting safe sync'
    });

    // Validate item status first
    const accessToken = await getAccessTokenFromItemId(itemId, uid);
    if (!accessToken) {
      return { success: false, error: 'Cannot decrypt access token' };
    }

    const itemStatus = await validateItemStatus(itemId, accessToken);
    if (!itemStatus.valid) {
      return { success: false, error: `Item status invalid: ${itemStatus.status}` };
    }

    // Perform safe sync operations
    const results = {
      transactions: null,
      liabilities: null,
      investments: null
    };

    try {
      results.transactions = await updateTransactions(itemId);
    } catch (error) {
      logPlaidOperation('safeSyncItem', false, {
        itemId,
        uid,
        operation: 'transactions',
        error: error.message
      });
    }

    try {
      results.liabilities = await updateLiabilities(itemId);
    } catch (error) {
      logPlaidOperation('safeSyncItem', false, {
        itemId,
        uid,
        operation: 'liabilities',
        error: error.message
      });
    }

    try {
      results.investments = await updateInvestmentTransactions(itemId);
    } catch (error) {
      logPlaidOperation('safeSyncItem', false, {
        itemId,
        uid,
        operation: 'investments',
        error: error.message
      });
    }

    logPlaidOperation('safeSyncItem', true, {
      itemId,
      uid,
      results
    });

    return { success: true, results };
  } catch (error) {
    logPlaidOperation('safeSyncItem', false, {
      itemId,
      uid,
      error: error.message
    });
    return { success: false, error: error.message };
  }
};

// Error monitoring and reporting system
const errorMonitoring = {
  encryptionErrors: new Map(),
  webhookFailures: new Map(),
  lastReportTime: null,
  
  // Track encryption errors
  trackEncryptionError: (itemId, uid, error, context = {}) => {
    const key = `${itemId}-${uid}`;
    const errorInfo = {
      itemId,
      uid,
      error: error.message,
      errorCode: error.code,
      context,
      timestamp: new Date(),
      count: 1
    };
    
    if (errorMonitoring.encryptionErrors.has(key)) {
      const existing = errorMonitoring.encryptionErrors.get(key);
      existing.count++;
      existing.lastError = error.message;
      existing.lastTimestamp = new Date();
    } else {
      errorMonitoring.encryptionErrors.set(key, errorInfo);
    }
    
    // Log immediately for critical errors
    if (error.code === 'ERR_CRYPTO_INVALID_AUTH_TAG' || 
        error.code === 'ERR_CRYPTO_INVALID_IV' ||
        error.message.includes('Unsupported state')) {
      logPlaidOperation('errorMonitoring', false, {
        type: 'critical_encryption_error',
        itemId,
        uid,
        error: error.message,
        errorCode: error.code,
        context
      });
    }
  },
  
  // Track webhook failures
  trackWebhookFailure: (itemId, error, context = {}) => {
    const failureInfo = {
      itemId,
      error: error?.message || 'Unknown error',
      context,
      timestamp: new Date(),
      count: 1
    };
    
    if (errorMonitoring.webhookFailures.has(itemId)) {
      const existing = errorMonitoring.webhookFailures.get(itemId);
      existing.count++;
      existing.lastError = error?.message || 'Unknown error';
      existing.lastTimestamp = new Date();
    } else {
      errorMonitoring.webhookFailures.set(itemId, failureInfo);
    }
  },
  
  // Generate error report
  generateErrorReport: () => {
    const now = new Date();
    const report = {
      timestamp: now,
      encryptionErrors: Array.from(errorMonitoring.encryptionErrors.entries()).map(([key, value]) => ({
        ...value,
        key
      })),
      webhookFailures: Array.from(errorMonitoring.webhookFailures.values()),
      summary: {
        totalEncryptionErrors: errorMonitoring.encryptionErrors.size,
        totalWebhookFailures: errorMonitoring.webhookFailures.size,
        criticalErrors: Array.from(errorMonitoring.encryptionErrors.values())
          .filter(e => e.errorCode === 'ERR_CRYPTO_INVALID_AUTH_TAG' || 
                      e.errorCode === 'ERR_CRYPTO_INVALID_IV' ||
                      e.error.includes('Unsupported state')).length
      }
    };
    
    // Log the report
    logPlaidOperation('errorMonitoring', true, {
      type: 'error_report',
      report
    });
    
    errorMonitoring.lastReportTime = now;
    return report;
  },
  
  // Clear old errors (older than 24 hours)
  cleanupOldErrors: () => {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    for (const [key, error] of errorMonitoring.encryptionErrors.entries()) {
      if (error.timestamp < cutoff) {
        errorMonitoring.encryptionErrors.delete(key);
      }
    }
    
    for (const [itemId, failure] of errorMonitoring.webhookFailures.entries()) {
      if (failure.timestamp < cutoff) {
        errorMonitoring.webhookFailures.delete(itemId);
      }
    }
  }
};

// Enhanced decryptValue with error monitoring
const decryptValueWithMonitoring = async (cipherTextBase64, dek, uid, context = {}) => {
  try {
    return await decryptValue(cipherTextBase64, dek, uid);
  } catch (error) {
    // Track encryption errors for monitoring
    if (context.itemId) {
      errorMonitoring.trackEncryptionError(context.itemId, uid, error, context);
    }
    throw error;
  }
};

// Function to diagnose and potentially fix encryption issues for a user
const diagnoseAndFixEncryptionIssues = async (uid) => {
  try {
    logPlaidOperation('diagnoseAndFixEncryptionIssues', true, {
      uid,
      operation: 'start'
    });

    // First, check the encryption key health
    const { checkEncryptionKeyHealth, regenerateUserKeys } = await import('../database/encryption.js');
    const health = await checkEncryptionKeyHealth(uid);
    
    if (health.healthy) {
      logPlaidOperation('diagnoseAndFixEncryptionIssues', true, {
        uid,
        result: 'Keys are healthy, no action needed',
        health
      });
      return { 
        success: true, 
        action: 'none', 
        reason: 'Keys are healthy',
        health 
      };
    }

    // If keys are not healthy, try to regenerate them
    logPlaidOperation('diagnoseAndFixEncryptionIssues', true, {
      uid,
      action: 'regenerating_keys',
      health
    });

    const regenerationResult = await regenerateUserKeys(uid, true); // force = true
    
    if (regenerationResult.success) {
      logPlaidOperation('diagnoseAndFixEncryptionIssues', true, {
        uid,
        result: 'Keys regenerated successfully',
        newVersion: regenerationResult.newVersion
      });
      
      // Clear any cached encryption errors for this user
      if (errorMonitoring.encryptionErrors) {
        for (const [key, error] of errorMonitoring.encryptionErrors.entries()) {
          if (error.uid === uid) {
            errorMonitoring.encryptionErrors.delete(key);
          }
        }
      }
      
      return { 
        success: true, 
        action: 'regenerated', 
        newVersion: regenerationResult.newVersion,
        health 
      };
    } else {
      logPlaidOperation('diagnoseAndFixEncryptionIssues', false, {
        uid,
        error: 'Failed to regenerate keys',
        reason: regenerationResult.reason
      });
      return { 
        success: false, 
        action: 'failed', 
        reason: regenerationResult.reason,
        health 
      };
    }
    
  } catch (error) {
    logPlaidOperation('diagnoseAndFixEncryptionIssues', false, {
      uid,
      error: error.message,
      stack: error.stack
    });
    return { 
      success: false, 
      action: 'error', 
      error: error.message 
    };
  }
};

// Function to identify users with encryption issues
const identifyUsersWithEncryptionIssues = () => {
  try {
    const usersWithIssues = new Map();
    
    // Analyze encryption errors
    for (const [key, error] of errorMonitoring.encryptionErrors.entries()) {
      if (error.uid) {
        if (!usersWithIssues.has(error.uid)) {
          usersWithIssues.set(error.uid, {
            uid: error.uid,
            errorCount: 0,
            lastError: error.timestamp,
            errorTypes: new Set(),
            itemIds: new Set()
          });
        }
        
        const userIssues = usersWithIssues.get(error.uid);
        userIssues.errorCount++;
        userIssues.errorTypes.add(error.error || 'unknown');
        if (error.itemId) {
          userIssues.itemIds.add(error.itemId);
        }
        
        // Update last error timestamp
        if (error.timestamp > userIssues.lastError) {
          userIssues.lastError = error.timestamp;
        }
      }
    }
    
    // Convert to array and sort by error count
    const issuesList = Array.from(usersWithIssues.values()).map(user => ({
      ...user,
      errorTypes: Array.from(user.errorTypes),
      itemIds: Array.from(user.itemIds)
    })).sort((a, b) => b.errorCount - a.errorCount);
    
    logPlaidOperation('identifyUsersWithEncryptionIssues', true, {
      totalUsersWithIssues: issuesList.length,
      totalErrors: Array.from(errorMonitoring.encryptionErrors.values()).length
    });
    
    return {
      success: true,
      usersWithIssues: issuesList,
      summary: {
        totalUsers: issuesList.length,
        totalErrors: Array.from(errorMonitoring.encryptionErrors.values()).length,
        criticalUsers: issuesList.filter(u => u.errorCount > 5).length,
        usersNeedingImmediateAttention: issuesList.filter(u => 
          u.errorCount > 10 || 
          u.errorTypes.some(t => t.includes('Unsupported state') || t.includes('authentication'))
        ).length
      }
    };
    
  } catch (error) {
    logPlaidOperation('identifyUsersWithEncryptionIssues', false, {
      error: error.message,
      stack: error.stack
    });
    return { 
      success: false, 
      error: error.message 
    };
  }
};

// Function to identify specific Plaid items failing for a user
const identifyFailingPlaidItems = async (uid) => {
  try {
    logPlaidOperation('identifyFailingPlaidItems', true, {
      uid,
      operation: 'start'
    });

    // Get all access tokens for this user
    const accessTokens = await AccessToken.find({ userId: uid });
    
    if (!accessTokens || accessTokens.length === 0) {
      logPlaidOperation('identifyFailingPlaidItems', true, {
        uid,
        result: 'No access tokens found for user'
      });
      return {
        success: true,
        uid,
        failingItems: [],
        totalItems: 0,
        summary: 'No access tokens found'
      };
    }

    const failingItems = [];
    const workingItems = [];

    // Test each access token
    for (const tokenDoc of accessTokens) {
      try {
        const accessToken = await getAccessTokenFromItemId(tokenDoc.itemId, uid);
        
        if (accessToken) {
          workingItems.push({
            itemId: tokenDoc.itemId,
            institutionId: tokenDoc.institutionId,
            status: 'working',
            lastTested: new Date().toISOString()
          });
        } else {
          failingItems.push({
            itemId: tokenDoc.itemId,
            institutionId: tokenDoc.institutionId,
            status: 'failing',
            lastError: 'Decryption failed',
            lastTested: new Date().toISOString()
          });
        }
      } catch (error) {
        failingItems.push({
          itemId: tokenDoc.itemId,
          institutionId: tokenDoc.institutionId,
          status: 'error',
          lastError: error.message,
          lastTested: new Date().toISOString()
        });
      }
    }

    const summary = {
      totalItems: accessTokens.length,
      workingItems: workingItems.length,
      failingItems: failingItems.length,
      failureRate: accessTokens.length > 0 ? (failingItems.length / accessTokens.length * 100).toFixed(1) + '%' : '0%'
    };

    logPlaidOperation('identifyFailingPlaidItems', true, {
      uid,
      result: 'Analysis completed',
      summary
    });

    return {
      success: true,
      uid,
      failingItems,
      workingItems,
      summary
    };

  } catch (error) {
    logPlaidOperation('identifyFailingPlaidItems', false, {
      uid,
      error: error.message,
      stack: error.stack
    });
    return {
      success: false,
      uid,
      error: error.message
    };
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
  checkIfChaseBank,
  checkChaseItemStatus,
  retryWithBackoff,
  trackPlaidRequest,
  getPlaidMetrics,
  markItemForReauth,
  isItemStale,
  recoverStaleTransactions,
  runHealthCheck,
  validateWebhookSignature,
  trackWebhookFailure,
  resetWebhookFailures,
  triggerFallbackPolling,
  generateHealthReport,
  safeSyncItem,
  // Error monitoring functions
  handleCorruptedAccessToken,
  decryptValueWithMonitoring,
  errorMonitoring,
  diagnoseAndFixEncryptionIssues,
  identifyUsersWithEncryptionIssues,
  identifyFailingPlaidItems,
  // New token management functions
  cleanUpCorruptedToken,
  cleanUpAllCorruptedTokens,
  getAccessTokenDiagnostics,
  validateAndRepairAccessTokens,
  markTokenAsCorrupted,
};

export default plaidService;
