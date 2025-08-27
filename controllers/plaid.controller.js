import plaidService from "../services/plaid.service.js";
import permissionsService from "../services/permissions.service.js";
import upgradeResponseService from "../services/upgradeResponse.service.js";
import User from "../database/models/User.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import { decryptValue, getUserDek } from "../database/encryption.js";

const createLinkToken = async (req, res) => {
  try {
    const email = req.user.email;
    const uid = req.user.uid;
    const { isAndroid, accountId, screen, mode, access_token } = req.body;
    const linkToken = await plaidService.createLinkToken(
      email,
      isAndroid,
      accountId,
      uid,
      screen,
      mode,
      access_token
    );
    res.status(200).send({ linkToken });
  } catch (error) {
    console.log(error.message);
    res.status(500).send({ message: error.message });
  }
};

const getPublicToken = async (req, res) => {
  try {
    const { linkToken } = req.body;
    const response = await plaidService.getPublicToken(linkToken);
    res.status(200).send(response);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

const getAccessToken = async (req, res) => {
  try {
    const { publicToken } = req.body;
    const accessToken = await plaidService.getAccessToken(publicToken);
    res.status(200).send(accessToken);
  } catch (error) {
    console.log(error.message);
    res.status(500).send({ message: error.message });
  }
};

const saveAccessToken = async (req, res) => {
  try {
    const email = req.user.email;
    const uid = req.user.uid;
    const { accessToken, itemId, institutionId } = req.body;
    
    console.log(`[CONTROLLER] saveAccessToken request - uid: ${uid}, itemId: ${itemId}, institutionId: ${institutionId}`);
    
    const canAddAccount = await permissionsService.canAddAccount(uid, institutionId);
    
    if (!canAddAccount.success) {
      console.log(`[CONTROLLER] Permission denied for uid: ${uid}, institutionId: ${institutionId}`, canAddAccount);
      return res.status(403).send(canAddAccount);
    }
    
    const token = await plaidService.saveAccessToken(
      email,
      accessToken,
      itemId,
      institutionId,
      uid
    );
    
    console.log(`[CONTROLLER] saveAccessToken success - uid: ${uid}, itemId: ${itemId}`);
    res.status(200).send(token);
  } catch (error) {
    console.error(`[CONTROLLER] saveAccessToken error - uid: ${req.user?.uid}, itemId: ${req.body?.itemId}:`, error.message);
    res.status(500).send({ message: error.message });
  }
};

const getAccounts = async (req, res) => {
  try {
    const email = req.user.email;
    const accounts = await plaidService.getAccounts(email);
    res.status(200).send(accounts);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

const getBalance = async (req, res) => {
  try {
    const email = req.user.email;
    const balance = await plaidService.getBalance(email);
    res.status(200).send(balance);
  } catch (error) {
    console.log(error.message);
    res.status(500).send({ message: error.message });
  }
};

const getInstitutions = async (req, res) => {
  try {
    const institutions = await plaidService.getInstitutions();
    res.status(200).send(institutions);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

const getTransactions = async (req, res) => {
  try {
    const uid = req.user.uid;
    const transactions = await plaidService.getTransactions(
      req.user.email,
      uid
    );

    res.status(200).send(transactions);
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};

const detectInternalTransfers = async (req, res) => {
  try {
    const { email } = req.user;
    const internalTransfers = plaidService.detectInternalTransfers(email);
    res.status(200).send(internalTransfers);
  } catch (error) {
    console.log(error);
    res.status(500).send({ error });
  }
};

const repairAccessToken = async (req, res) => {
  try {
    const { accountId } = req.body;
    const email = req.user.email;
    const response = await plaidService.repairAccessToken(accountId, email);
    res.status(200).send(response);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

const checkInstitutionLimit = async (req, res) => {
  try {
    const { institutionId } = req.body;
    const uid = req.user.uid;
    
    if (!institutionId) {
      return res.status(400).send({ error: "institutionId is required" });
    }
    
    const canAddAccount = await permissionsService.canAddAccount(uid, institutionId);
    
    if (canAddAccount.success) {
      return res.status(200).send({ success: true });
    } else {
      return res.status(403).send(canAddAccount);
    }
    
  } catch (error) {
    console.log(error.message);
    res.status(500).send({ error: "Internal server error" });
  }
};

const getConnectedInstitutions = async (req, res) => {
  try {
    const uid = req.user.uid;
    
    const user = await User.findOne({ authUid: uid });
    if (!user) {
      return res.status(404).send({ error: "User not found" });
    }
    
    const accounts = await PlaidAccount.find({ owner_id: user._id });
    
    if (!accounts.length) {
      return res.status(200).send({ connected_institutions: [] });
    }
    
    const dek = await getUserDek(uid);
    
    const institutionsMap = new Map();
    
    for (const account of accounts) {
      const institutionId = account.institution_id;
      
      const decryptedAccountName = await decryptValue(account.account_name, dek);
      const decryptedAccountType = await decryptValue(account.account_type, dek);
      const decryptedInstitutionName = await decryptValue(account.institution_name, dek);
      const decryptedAccessToken = await decryptValue(account.accessToken, dek);
      
      if (!institutionsMap.has(institutionId)) {
        institutionsMap.set(institutionId, {
          institution_id: institutionId,
          institution_name: decryptedInstitutionName,
          access_token: decryptedAccessToken,
          item_id: account.itemId,
          accounts: []
        });
      }
      
      institutionsMap.get(institutionId).accounts.push({
        account_id: account.plaid_account_id,
        account_name: decryptedAccountName,
        account_type: decryptedAccountType
      });
    }
    
    const connected_institutions = Array.from(institutionsMap.values());
    
    res.status(200).send({ connected_institutions });
    
  } catch (error) {
    console.error("Error getting connected institutions:", error);
    res.status(500).send({ error: "Internal server error" });
  }
};

const getUpfrontInstitutionStatus = async (req, res) => {
  try {
    const uid = req.user.uid;
    
    console.log(`[CONTROLLER] getUpfrontInstitutionStatus request - uid: ${uid}`);
    
    const user = await User.findOne({ authUid: uid });
    if (!user) {
      return res.status(404).send({ error: "User not found" });
    }
    
    const userId = user._id.toString();
    
    // Get user's current plan and permissions
    const checkUserRole = permissionsService.checkUserRole || (() => user.account_type || "Free");
    const rolePermission = await checkUserRole(user);
    
    // Import permissions config
    const permissionsConfig = await import("../config/permissions.js").then(m => m.default);
    const rolePermissions = permissionsConfig[rolePermission];
    
    if (!rolePermissions) {
      return res.status(500).send({ error: "Plan configuration not found" });
    }
    
    // Count current institutions
    const institutionsCount = await permissionsService.countUserInstitutions(userId);
    const maxInstitutions = rolePermissions.accounts_max;
    
    // Determine if user can add new institutions
    const canAddNewInstitution = maxInstitutions === -1 || institutionsCount < maxInstitutions;
    
    // Get connected institutions (reuse existing logic)
    const accounts = await PlaidAccount.find({ owner_id: user._id });
    const connected_institutions = [];
    
    if (accounts.length > 0) {
      const dek = await getUserDek(uid);
      const institutionsMap = new Map();
      
      for (const account of accounts) {
        const institutionId = account.institution_id;
        
        const decryptedInstitutionName = await decryptValue(account.institution_name, dek);
        const decryptedAccessToken = await decryptValue(account.accessToken, dek);
        
        if (!institutionsMap.has(institutionId)) {
          const accountsCount = accounts.filter(acc => acc.institution_id === institutionId).length;
          institutionsMap.set(institutionId, {
            institution_id: institutionId,
            institution_name: decryptedInstitutionName,
            access_token: decryptedAccessToken,
            item_id: account.itemId,
            accounts_count: accountsCount
          });
        }
      }
      
      connected_institutions.push(...Array.from(institutionsMap.values()));
    }
    
    const response = {
      connected_institutions,
      user_status: {
        current_plan: rolePermission,
        institutions_current: institutionsCount,
        institutions_max: maxInstitutions,
        can_add_new_institution: canAddNewInstitution,
        upgrade_required: !canAddNewInstitution
      }
    };
    
    console.log(`[CONTROLLER] getUpfrontInstitutionStatus success - uid: ${uid}, plan: ${rolePermission}, institutions: ${institutionsCount}/${maxInstitutions}, can_add: ${canAddNewInstitution}`);
    res.status(200).send(response);
    
  } catch (error) {
    console.error(`[CONTROLLER] getUpfrontInstitutionStatus error - uid: ${req.user?.uid}:`, error.message);
    res.status(500).send({ error: "Internal server error" });
  }
};

const resumeInstitution = async (req, res) => {
  try {
    const { institutionId, isAndroid } = req.body;
    const uid = req.user.uid;
    
    console.log(`[CONTROLLER] resumeInstitution request - uid: ${uid}, institutionId: ${institutionId}, isAndroid: ${isAndroid}`);
    
    if (!institutionId) {
      return res.status(400).send({ error: "institutionId is required" });
    }
    
    // Reutilizar función existente con nuevo parámetro institutionId
    const linkToken = await plaidService.createLinkToken(
      null,                    // email (not needed for resume)
      isAndroid,               // isAndroid  
      null,                    // accountId
      uid,                     // uid
      "add-account",           // screen
      null,                    // mode
      null,                    // accessToken
      institutionId            // 🔑 institutionId para pre-selección
    );
    
    console.log(`[CONTROLLER] resumeInstitution success - uid: ${uid}, institutionId: ${institutionId}`);
    res.status(200).json({ linkToken });
  } catch (error) {
    console.error(`[CONTROLLER] resumeInstitution error - uid: ${req.user?.uid}, institutionId: ${req.body?.institutionId}:`, error.message);
    res.status(500).send({ message: error.message });
  }
};

const plaidController = {
  createLinkToken,
  getPublicToken,
  getAccessToken,
  getAccounts,
  saveAccessToken,
  getBalance,
  getInstitutions,
  getTransactions,
  detectInternalTransfers,
  repairAccessToken,
  checkInstitutionLimit,
  getConnectedInstitutions,
  getUpfrontInstitutionStatus,
  resumeInstitution,
};

export default plaidController;
