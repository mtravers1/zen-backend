import accountsService from "../services/accounts.service.js";
import plaidService from "../services/plaid.service.js";
import businessService from "../services/businesses.service.js";

const debugCache = async (req, res) => {
  try {
    console.log('\n🔍 [DEBUG CACHE] Cache Debug Request:', {
      timestamp: new Date().toISOString(),
      userAgent: req.get('User-Agent')
    });
    
    // Import the cache functions
    const { getDekCacheStats, clearDekCache } = await import('../services/accounts.service.js');
    
    const stats = getDekCacheStats();
    
    res.status(200).send({
      cache: {
        stats,
        timestamp: new Date().toISOString(),
        info: {
          description: 'DEK Cache Statistics',
          ttl: '5 minutes',
          purpose: 'Cache Data Encryption Keys to avoid repeated database calls'
        }
      }
    });
    
  } catch (error) {
    console.error('[DEBUG CACHE] Error:', error);
    res.status(500).send({ 
      error: error.message,
      stack: error.stack 
    });
  }
};

const debugDecryption = async (req, res) => {
  try {
    const { profileId } = req.params;
    const uid = req.user.uid;
    
    console.log('\n🔍 [DEBUG DECRYPT] Decryption Debug Request:', {
      profileId,
      uid,
      timestamp: new Date().toISOString()
    });
    
    // Get profile details
    const profiles = await businessService.getUserProfiles(req.user.email, uid);
    const profile = profiles.find((p) => String(p.id) === profileId);
    
    if (!profile) {
      return res.status(404).send({ 
        error: 'Profile not found',
        profileId,
        availableProfiles: profiles.map(p => ({ id: p.id, name: p.name }))
      });
    }
    
    // Get DEK using cache
    const { getCachedDek } = await import('../services/accounts.service.js');
    const dek = await getCachedDek(uid);
    console.log('[DEBUG DECRYPT] DEK obtained:', {
      hasDek: !!dek,
      dekType: typeof dek,
      dekLength: dek ? dek.length : 0,
      uid
    });
    
    // Check if plaid accounts exist
    const PlaidAccount = (await import('../database/models/PlaidAccount.js')).default;
    const plaidAccounts = await PlaidAccount.find({
      _id: { $in: profile.plaidAccounts }
    }).lean();
    
    console.log('[DEBUG DECRYPT] Plaid accounts found:', {
      count: plaidAccounts.length,
      accounts: plaidAccounts.map(acc => ({
        _id: acc._id,
        plaid_account_id: acc.plaid_account_id,
        account_type: acc.account_type,
        hasBalance: !!acc.currentBalance,
        hasName: !!acc.account_name
      }))
    });
    
    // Test decryption for first account
    if (plaidAccounts.length > 0) {
      const testAccount = plaidAccounts[0];
      console.log('[DEBUG DECRYPT] Testing decryption for account:', {
        _id: testAccount._id,
        plaid_account_id: testAccount.plaid_account_id
      });
      
      // Test each encrypted field
      const encryptedFields = ['currentBalance', 'availableBalance', 'account_type', 'account_name', 'institution_name'];
      
      for (const field of encryptedFields) {
        if (testAccount[field]) {
          console.log(`[DEBUG DECRYPT] Testing field: ${field}`);
          try {
            const { decryptValue } = await import('../database/encryption.js');
            const decrypted = await decryptValue(testAccount[field], dek, uid);
            console.log(`[DEBUG DECRYPT] ${field} decryption result:`, {
              success: true,
              originalLength: testAccount[field].length,
              decryptedValue: decrypted,
              decryptedType: typeof decrypted
            });
          } catch (error) {
            console.error(`[DEBUG DECRYPT] ${field} decryption failed:`, {
              error: error.message,
              stack: error.stack
            });
          }
        } else {
          console.log(`[DEBUG DECRYPT] Field ${field} is null/undefined`);
        }
      }
    }
    
    // Return debug info
    res.status(200).send({
      profile: {
        id: profile.id,
        name: profile.name,
        plaidAccountsCount: profile.plaidAccounts?.length || 0
      },
      dek: {
        hasDek: !!dek,
        dekType: typeof dek,
        dekLength: dek ? dek.length : 0,
        uid
      },
      plaidAccounts: {
        count: plaidAccounts.length,
        accounts: plaidAccounts.map(acc => ({
          _id: acc._id,
          plaid_account_id: acc.plaid_account_id,
          account_type: acc.account_type,
          hasBalance: !!acc.currentBalance,
          hasName: !!acc.account_name
        }))
      },
      debug: {
        timestamp: new Date().toISOString(),
        uid,
        profileId
      }
    });
    
  } catch (error) {
    console.error('[DEBUG DECRYPT] Error:', error);
    res.status(500).send({ 
      error: error.message,
      stack: error.stack 
    });
  }
};

const debugProfile = async (req, res) => {
  try {
    const { profileId } = req.params;
    const uid = req.user.uid;
    
    console.log('\n🔍 [DEBUG] Profile Debug Request:', {
      profileId,
      uid,
      timestamp: new Date().toISOString()
    });
    
    // Get profile details
    const profiles = await businessService.getUserProfiles(req.user.email, uid);
    const profile = profiles.find((p) => String(p.id) === profileId);
    
    if (!profile) {
      return res.status(404).send({ 
        error: 'Profile not found',
        profileId,
        availableProfiles: profiles.map(p => ({ id: p.id, name: p.name }))
      });
    }
    
    console.log('[DEBUG] Profile found:', {
      profileId: profile.id,
      profileName: profile.name,
      plaidAccountsCount: profile.plaidAccounts?.length || 0,
      plaidAccounts: profile.plaidAccounts
    });
    
    // Check if plaid accounts exist
    const PlaidAccount = (await import('../database/models/PlaidAccount.js')).default;
    const plaidAccounts = await PlaidAccount.find({
      _id: { $in: profile.plaidAccounts }
    }).lean();
    
    console.log('[DEBUG] Plaid accounts found:', {
      count: plaidAccounts.length,
      accounts: plaidAccounts.map(acc => ({
        _id: acc._id,
        plaid_account_id: acc.plaid_account_id,
        account_type: acc.account_type,
        hasBalance: !!acc.currentBalance
      }))
    });
    
    // Check if transactions exist
    const Transaction = (await import('../database/models/Transaction.js')).default;
    const transactions = await Transaction.find({
      plaidAccountId: { $in: plaidAccounts.map(acc => acc.plaid_account_id) }
    }).lean();
    
    console.log('[DEBUG] Transactions found:', {
      count: transactions.length,
      accountIds: [...new Set(transactions.map(t => t.plaidAccountId))]
    });
    
    // Return debug info
    res.status(200).send({
      profile: {
        id: profile.id,
        name: profile.name,
        plaidAccountsCount: profile.plaidAccounts?.length || 0
      },
      plaidAccounts: {
        count: plaidAccounts.length,
        accounts: plaidAccounts.map(acc => ({
          _id: acc._id,
          plaid_account_id: acc.plaid_account_id,
          account_type: acc.account_type,
          hasBalance: !!acc.currentBalance
        }))
      },
      transactions: {
        count: transactions.length,
        accountIds: [...new Set(transactions.map(t => t.plaidAccountId))]
      },
      debug: {
        timestamp: new Date().toISOString(),
        uid,
        profileId
      }
    });
    
  } catch (error) {
    console.error('[DEBUG] Error:', error);
    res.status(500).send({ 
      error: error.message,
      stack: error.stack 
    });
  }
};

const addAccount = async (req, res) => {
  let email, uid, token;
  try {
    token = req.body.token;
    email = req.user.email;
    uid = req.user.uid;
    const response = await accountsService.addAccount(token, email, uid);
    res.status(201).send(response);
  } catch (error) {
    // Add detailed error context to the error object
    error.details = {
      operation: 'addAccount',
      user_email: email,
      user_uid: uid,
      has_token: !!token,
      error_source: 'accounts_service'
    };
    res.status(500).send({ message: error.message });
  }
};

const getAccounts = async (req, res) => {
  const requestId = req.requestId || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    console.log(`\n🔍 [getAccounts Controller ${requestId}] ====== ACCOUNTS REQUEST ======`);
    console.log(`[getAccounts Controller ${requestId}] Timestamp: ${new Date().toISOString()}`);
    console.log(`[getAccounts Controller ${requestId}] Request user object:`, req.user);
    console.log(`[getAccounts Controller ${requestId}] Request user keys:`, req.user ? Object.keys(req.user) : 'no user object');
    console.log(`[getAccounts Controller ${requestId}] Request user uid:`, req.user?.uid);
    console.log(`[getAccounts Controller ${requestId}] Request user uid type:`, typeof req.user?.uid);
    console.log(`[getAccounts Controller ${requestId}] Request user uid length:`, req.user?.uid ? req.user.uid.length : 0);
    console.log(`[getAccounts Controller ${requestId}] Request body:`, req.body);
    console.log(`[getAccounts Controller ${requestId}] Request headers:`, Object.keys(req.headers));
    console.log(`[getAccounts Controller ${requestId}] Request IP:`, req.ip);
    console.log(`[getAccounts Controller ${requestId}] Request URL:`, req.url);
    console.log(`[getAccounts Controller ${requestId}] Request method:`, req.method);
    
    const { profile } = req.body;
    const uid = req.user?.uid;
    
    if (!uid) {
      console.error(`[getAccounts Controller ${requestId}] ❌ UID is missing from req.user`);
      console.error(`[getAccounts Controller ${requestId}] Full req.user object:`, JSON.stringify(req.user, null, 2));
      console.error(`[getAccounts Controller ${requestId}] Request headers:`, JSON.stringify(req.headers, null, 2));
      console.error(`[getAccounts Controller ${requestId}] Request body:`, JSON.stringify(req.body, null, 2));
      
      return res.status(401).send({ 
        message: 'Authentication failed - UID not found',
        requestId: requestId,
        userObject: req.user,
        userKeys: req.user ? Object.keys(req.user) : [],
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`[getAccounts Controller ${requestId}] ✅ UID extracted successfully:`, {
      uid: uid,
      uidType: typeof uid,
      uidLength: uid.length,
      timestamp: new Date().toISOString()
    });
    
    const accounts = await accountsService.getAccounts(profile, uid);
    res.status(200).send(accounts);
  } catch (error) {
    console.error(`[getAccounts Controller ${requestId}] ❌ Error:`, {
      error: error.message,
      errorStack: error.stack,
      timestamp: new Date().toISOString(),
      requestId: requestId
    });
    res.status(500).send({ message: error.message });
  }
};

const getAllUserAccounts = async (req, res) => {
  try {
    const email = req.user.email;
    const uid = req.user.uid;
    const accounts = await accountsService.getAllUserAccounts(email, uid);
    res.status(200).send(accounts);
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};

const getCashFlows = async (req, res) => {
  try {
    const { profile } = req.body;
    const uid = req.user.uid;
    const cashFlows = await accountsService.getCashFlows(profile, uid);
    res.status(200).send(cashFlows);
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};

const getCashFlowsWeekly = async (req, res) => {
  try {
    const { profile } = req.body;
    const uid = req.user.uid;
    const cashFlows = await accountsService.getCashFlowsWeekly(profile, uid);
    res.status(200).send(cashFlows);
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};

const getCashFlowsByPlaidAccount = async (req, res) => {
  try {
    const { account } = req.body;
    const uid = req.user.uid;

    const cashFlows = await accountsService.getCashFlowsByPlaidAccount(
      account,
      uid
    );
    res.status(200).send(cashFlows);
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};

const getUserTransactions = async (req, res) => {
  try {
    const email = req.user.email;
    const uid = req.user.uid;
    const { page = 1, limit = 50, paginate = false } = req.query;
    const transactions = await accountsService.getUserTransactions(email, uid, {
      page: parseInt(page),
      limit: parseInt(limit),
      paginate: paginate === 'true'
    });
    res.status(200).send(transactions);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

const getProfileTransactions = async (req, res) => {
  try {
    const email = req.user.email;
    const uid = req.user.uid;
    const { profileId } = req.params;
    const { page = 1, limit = 50, paginate = false } = req.query;
    const transactions = await accountsService.getProfileTransactions(
      email,
      profileId,
      uid,
      {
        page: parseInt(page),
        limit: parseInt(limit),
        paginate: paginate === 'true'
      }
    );
    res.status(200).send(transactions);
  } catch (e) {
    console.log(e);
    res.status(500).send(e);
  }
};

const getTransactionsByAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const uid = req.user.uid;
    const { page = 1, limit = 50, paginate = false } = req.query;
    const transactions = await accountsService.getTransactionsByAccount(
      accountId, 
      uid,
      {
        page: parseInt(page),
        limit: parseInt(limit),
        paginate: paginate === 'true'
      }
    );
    res.status(200).send(transactions);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

const getAccountDetails = async (req, res) => {
  try {
    const { accountId, profileId } = req.params;
    const uid = req.user.uid;

    const accountData = await accountsService.getAccountDetails(
      accountId,
      profileId,
      uid
    );
    res.status(200).send(accountData);
  } catch (error) {
    console.error(error.message);
    res.status(500).send({ message: error.message });
  }
};

const addAccountPhoto = async (req, res) => {
  try {
    const { fileName } = req.body;
    console.log(fileName);
    const { generateUploadUrl } = await import('../services/accounts.service.js');
    const url = await generateUploadUrl(fileName);
    res.status(200).send({ uploadUrl: url });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};

const getAccountPhoto = async (req, res) => {
  try {
    const { fileName } = req.body;
    console.log(fileName);
    const { generateSignedUrl } = await import('../services/accounts.service.js');
    const url = await generateSignedUrl(fileName);
    res.status(200).send({ downloadUrl: url });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};

const serveAccountPhoto = async (req, res) => {
  try {
    const { fileName } = req.params;
    console.log('Serving photo:', fileName);
    
    // Generate signed URL for the photo
    const { generateSignedUrl } = await import('../services/accounts.service.js');
    const signedUrl = await generateSignedUrl(fileName);
    
    if (!signedUrl) {
      const error = new Error('Photo not found');
      error.details = {
        operation: 'serveAccountPhoto',
        fileName,
        user_email: req.user?.email,
        user_uid: req.user?.uid,
        error_type: 'file_not_found'
      };
      return res.status(404).send({ message: 'Photo not found' });
    }
    
    // Redirect to the signed URL
    res.redirect(signedUrl);
  } catch (error) {
    error.details = {
      operation: 'serveAccountPhoto',
      fileName: req.params.fileName,
      user_email: req.user?.email,
      user_uid: req.user?.uid,
      error_type: 'server_error'
    };
    res.status(500).send({ message: error.message });
  }
};

const deleteAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const email = req.user.email;
    
    const result = await accountsService.removeAccount(accountId, email);
    res.status(200).send({ message: 'Account deleted successfully', result });
  } catch (error) {
    error.details = {
      operation: 'deleteAccount',
      accountId: req.params.accountId,
      user_email: req.user?.email,
      user_uid: req.user?.uid,
      error_type: 'delete_error'
    };
    res.status(500).send({ message: error.message });
  }
};

// Cache management methods
const getCacheStats = async (req, res) => {
  try {
    const { getDekCacheStats, getDecryptionCacheStats, getDecryptionKeyCacheStats } = await import('../services/accounts.service.js');
    
    const dekStats = getDekCacheStats();
    const decryptionStats = getDecryptionCacheStats();
    const keyCacheStats = getDecryptionKeyCacheStats();
    
    res.json({
      success: true,
      data: {
        dek: dekStats,
        decryption: decryptionStats,
        decryptionKeys: keyCacheStats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Cache Stats] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cache statistics'
    });
  }
};

const clearAllCaches = async (req, res) => {
  try {
    const { uid } = req.body;
    const { clearAllCaches: clearCaches } = await import('../services/accounts.service.js');
    
    if (uid) {
      clearCaches(uid);
      res.json({
        success: true,
        message: `All caches cleared for user: ${uid}`
      });
    } else {
      clearCaches();
      res.json({
        success: true,
        message: 'All caches cleared for all users'
      });
    }
  } catch (error) {
    console.error('[Cache Clear] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear caches'
    });
  }
};

const clearDecryptionCache = async (req, res) => {
  try {
    const { uid } = req.body;
    const { clearDecryptionCache: clearDecryptCache } = await import('../services/accounts.service.js');
    
    if (uid) {
      clearDecryptCache(uid);
      res.json({
        success: true,
        message: `Decryption cache cleared for user: ${uid}`
      });
    } else {
      clearDecryptCache();
      res.json({
        success: true,
        message: 'Decryption cache cleared for all users'
      });
    }
  } catch (error) {
    console.error('[Decryption Cache Clear] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear decryption cache'
    });
  }
};

const accountsController = {
  addAccount,
  getAccounts,
  getAccountDetails,
  getCashFlows,
  getCashFlowsWeekly,
  getUserTransactions,
  getTransactionsByAccount,
  getAllUserAccounts,
  addAccountPhoto,
  getAccountPhoto,
  serveAccountPhoto,
  deleteAccount,
  getProfileTransactions,
  getCashFlowsByPlaidAccount,
  debugProfile,
  debugDecryption,
  debugCache,
  getCacheStats,
  clearAllCaches,
  clearDecryptionCache,
};

export default {
  addAccount,
  getAccounts,
  getAllUserAccounts,
  getCashFlows,
  getCashFlowsWeekly,
  getCashFlowsByPlaidAccount,
  getUserTransactions,
  getProfileTransactions,
  getTransactionsByAccount,
  getAccountDetails,
  addAccountPhoto,
  getAccountPhoto,
  serveAccountPhoto,
  deleteAccount,
  debugProfile,
  debugDecryption,
  debugCache,
  getCacheStats,
  clearAllCaches,
  clearDecryptionCache,
};
