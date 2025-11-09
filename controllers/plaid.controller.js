import { createSafeDecrypt } from "../lib/encryptionHelper.js";
import plaidService from "../services/plaid.service.js";
import permissionsService from "../services/permissions.service.js";
import upgradeResponseService from "../services/upgradeResponse.service.js";
import User from "../database/models/User.js";
import PlaidAccount from "../database/models/PlaidAccount.js";
import { getUserDek } from "../database/encryption.js";
import structuredLogger from "../lib/structuredLogger.js";

const createLinkToken = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(
    req,
    "createLinkToken",
  );

  try {
    const email = req.user.email;
    const uid = req.user.uid;
    const {
      isAndroid,
      accountId,
      screen,
      mode,
      access_token,
      plaidEnvironment,
    } = req.body;

    const linkToken = await structuredLogger.withContext(
      "createLinkToken",
      {
        user_id: uid,
        email,
        request_id: requestId,
        metadata: { isAndroid, accountId, screen, plaidEnvironment },
      },
      async () => {
        return await plaidService.createLinkToken(
          email,
          isAndroid,
          accountId,
          uid,
          screen,
          mode,
          access_token,
          plaidEnvironment,
        );
      },
    );

    res.status(200).send({ linkToken });
  } catch (error) {
    // Log the detailed error
    structuredLogger.logErrorBlock(error, {
      operation: "createLinkToken",
      user_id: req.user?.uid,
      request_id: requestId,
      plaid_error_data: error.response?.data, // Log Plaid's specific error response
    });

    // Check if this is a Plaid API error and forward a more specific error message
    if (error.response && error.response.data) {
      const plaidError = error.response.data;
      return res.status(error.response.status || 500).json({
        message: "A Plaid API error occurred.",
        plaid_error: {
          error_code: plaidError.error_code,
          error_message: plaidError.error_message,
          error_type: plaidError.error_type,
          request_id: plaidError.request_id,
        },
      });
    }

    // Fallback for non-Plaid errors
    res.status(500).send({ message: error.message });
  }
};

const getPublicToken = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(req, "getPublicToken");

  try {
    const { linkToken } = req.body;

    const response = await structuredLogger.withContext(
      "getPublicToken",
      {
        request_id: requestId,
        metadata: { hasLinkToken: !!linkToken },
      },
      async () => {
        return await plaidService.getPublicToken(linkToken);
      },
    );

    res.status(200).send(response);
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "getPublicToken",
      request_id: requestId,
      request: structuredLogger.requestContext.get(requestId)?.request,
      response: { statusCode: 500, body: { message: error.message } },
    });

    res.status(500).send({ message: error.message });
  }
};

const getAccessToken = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(req, "getAccessToken");

  try {
    const { publicToken } = req.body;

    const accessToken = await structuredLogger.withContext(
      "getAccessToken",
      {
        request_id: requestId,
        metadata: { hasPublicToken: !!publicToken },
      },
      async () => {
        return await plaidService.getAccessToken(publicToken);
      },
    );

    res.status(200).send(accessToken);
  } catch (error) {
    // Log the detailed error
    structuredLogger.logErrorBlock(error, {
      operation: "getAccessToken",
      user_id: req.user?.uid,
      request_id: requestId,
      plaid_error_data: error.response?.data, // Log Plaid's specific error response
    });

    // Check if this is a Plaid API error and forward a more specific error message
    if (error.response && error.response.data) {
      const plaidError = error.response.data;
      return res.status(error.response.status || 500).json({
        message: "A Plaid API error occurred.",
        plaid_error: {
          error_code: plaidError.error_code,
          error_message: plaidError.error_message,
          error_type: plaidError.error_type,
          request_id: plaidError.request_id,
        },
      });
    }

    // Fallback for non-Plaid errors
    res.status(500).send({ message: error.message });
  }
};

const saveAccessToken = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(
    req,
    "saveAccessToken",
  );

  try {
    const email = req.user.email;
    const uid = req.user.uid;
    const { accessToken, itemId, institutionId } = req.body;
    console.log(
      `[CONTROLLER] saveAccessToken request - uid: ${uid}, itemId: ${itemId}, institutionId: ${institutionId}`,
    );

    const canAddAccount = await permissionsService.canAddAccount(
      uid,
      institutionId,
    );

    if (!canAddAccount.success) {
      console.log(
        `[CONTROLLER] Permission denied for uid: ${uid}, institutionId: ${institutionId}`,
        canAddAccount,
      );
      return res.status(403).send(canAddAccount);
    }

    console.log(
      `[CONTROLLER] saveAccessToken success - uid: ${uid}, itemId: ${itemId}`,
    );
    const token = await structuredLogger.withContext(
      "saveAccessToken",
      {
        user_id: uid,
        email,
        item_id: itemId,
        institution_id: institutionId,
        request_id: requestId,
        metadata: { hasAccessToken: !!accessToken },
      },
      async () => {
        return await plaidService.saveAccessToken(
          email,
          accessToken,
          itemId,
          institutionId,
          uid,
        );
      },
    );

    res.status(200).send(token);
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "saveAccessToken",
      user_id: req.user?.uid,
      item_id: req.body?.itemId,
      request_id: requestId,
      request: structuredLogger.requestContext.get(requestId)?.request,
      response: { statusCode: 500, body: { message: error.message } },
    });

    res.status(500).send({ message: error.message });
  }
};

const getAccounts = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(req, "getAccounts");

  try {
    // const { email } = req.user;
    const email = "galvanerick27@gmail.com";

    const accounts = await structuredLogger.withContext(
      "getAccounts",
      {
        email,
        request_id: requestId,
      },
      async () => {
        return await plaidService.getAccounts(email);
      },
    );

    res.status(200).send(accounts);
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "getAccounts",
      request_id: requestId,
      request: structuredLogger.requestContext.get(requestId)?.request,
      response: { statusCode: 500, body: { message: error.message } },
    });

    res.status(500).send({ message: error.message });
  }
};

const getBalance = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(req, "getBalance");

  try {
    const email = req.user.email;

    const balance = await structuredLogger.withContext(
      "getBalance",
      {
        user_id: req.user?.uid,
        email,
        request_id: requestId,
      },
      async () => {
        return await plaidService.getBalance(email);
      },
    );

    res.status(200).send(balance);
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "getBalance",
      user_id: req.user?.uid,
      request_id: requestId,
      request: structuredLogger.requestContext.get(requestId)?.request,
      response: { statusCode: 500, body: { message: error.message } },
    });

    res.status(500).send({ message: error.message });
  }
};

const getInstitutions = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(
    req,
    "getInstitutions",
  );

  try {
    const institutions = await structuredLogger.withContext(
      "getInstitutions",
      {
        request_id: requestId,
      },
      async () => {
        return await plaidService.getInstitutions();
      },
    );

    res.status(200).send(institutions);
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "getInstitutions",
      request_id: requestId,
      request: structuredLogger.requestContext.get(requestId)?.request,
      response: { statusCode: 500, body: { message: error.message } },
    });

    res.status(500).send({ message: error.message });
  }
};

const getTransactions = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(
    req,
    "getTransactions",
  );

  try {
    const uid = req.user.uid;

    const transactions = await structuredLogger.withContext(
      "getTransactions",
      {
        user_id: uid,
        email: req.user.email,
        request_id: requestId,
      },
      async () => {
        return await plaidService.getTransactions(req.user.email, uid);
      },
    );

    res.status(200).send(transactions);
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: "getTransactions",
      user_id: req.user?.uid,
      request_id: requestId,
      request: structuredLogger.requestContext.get(requestId)?.request,
      response: { statusCode: 500, body: { message: error.message } },
    });

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

    const canAddAccount = await permissionsService.canAddAccount(
      uid,
      institutionId,
    );

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
    const safeDecrypt = createSafeDecrypt(uid, dek);

    const institutionsMap = new Map();

    for (const account of accounts) {
      const institutionId = account.institution_id;

      const decryptedAccountName = await safeDecrypt(
        account.account_name,
      );
      const decryptedAccountType = await safeDecrypt(
        account.account_type,
      );
      const decryptedInstitutionName = await safeDecrypt(
        account.institution_name,
      );

      if (!institutionsMap.has(institutionId)) {
        institutionsMap.set(institutionId, {
          institution_id: institutionId,
          institution_name: decryptedInstitutionName,
          accounts: [],
        });
      }

      institutionsMap.get(institutionId).accounts.push({
        account_id: account.plaid_account_id,
        account_name: decryptedAccountName,
        account_type: decryptedAccountType,
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

    console.log(
      `[CONTROLLER] getUpfrontInstitutionStatus request - uid: ${uid}`,
    );

    const user = await User.findOne({ authUid: uid });
    if (!user) {
      return res.status(404).send({ error: "User not found" });
    }

    const userId = user._id.toString();

    // Get user's current plan and permissions
    const checkUserRole =
      permissionsService.checkUserRole || (() => user.account_type || "Free");
    const rolePermission = await checkUserRole(user);

    // Import permissions config
    const permissionsConfig = await import("../config/permissions.js").then(
      (m) => m.default,
    );
    const rolePermissions = permissionsConfig[rolePermission];

    if (!rolePermissions) {
      return res.status(500).send({ error: "Plan configuration not found" });
    }

    // Count current institutions
    const institutionsCount =
      await permissionsService.countUserInstitutions(userId);
    const maxInstitutions = rolePermissions.accounts_max;

    // Determine if user can add new institutions
    const canAddNewInstitution =
      maxInstitutions === -1 || institutionsCount < maxInstitutions;

    // Get connected institutions (reuse existing logic)
    const accounts = await PlaidAccount.find({ owner_id: user._id });
    const connected_institutions = [];

    if (accounts.length > 0) {
      const dek = await getUserDek(uid);
      const safeDecrypt = createSafeDecrypt(uid, dek);
      const institutionsMap = new Map();

      for (const account of accounts) {
        const institutionId = account.institution_id;

        const decryptedInstitutionName = await safeDecrypt(
          account.institution_name,
        );
        const decryptedAccessToken = await safeDecrypt(
          account.accessToken,
        );

        if (!institutionsMap.has(institutionId)) {
          const accountsCount = accounts.filter(
            (acc) => acc.institution_id === institutionId,
          ).length;
          institutionsMap.set(institutionId, {
            institution_id: institutionId,
            institution_name: decryptedInstitutionName,
            access_token: decryptedAccessToken,
            item_id: account.itemId,
            accounts_count: accountsCount,
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
        upgrade_required: !canAddNewInstitution,
      },
    };

    console.log(
      `[CONTROLLER] getUpfrontInstitutionStatus success - uid: ${uid}, plan: ${rolePermission}, institutions: ${institutionsCount}/${maxInstitutions}, can_add: ${canAddNewInstitution}`,
    );
    res.status(200).send(response);
  } catch (error) {
    console.error(
      `[CONTROLLER] getUpfrontInstitutionStatus error - uid: ${req.user?.uid}:`,
      error.message,
    );
    res.status(500).send({ error: "Internal server error" });
  }
};

const getInstitutionUpdateToken = async (req, res) => {
  try {
    const uid = req.user.uid;
    const { institution_id } = req.body;

    console.log(
      `[CONTROLLER] getInstitutionUpdateToken request - uid: ${uid}, institution_id: ${institution_id}`,
    );

    if (!institution_id) {
      return res.status(400).send({ error: "institution_id is required" });
    }

    const result = await plaidService.getInstitutionUpdateToken(
      institution_id,
      uid,
    );

    console.log(
      `[CONTROLLER] getInstitutionUpdateToken success - uid: ${uid}, institution_id: ${institution_id}`,
    );
    res.status(200).send(result);
  } catch (error) {
    console.error(
      `[CONTROLLER] getInstitutionUpdateToken error - uid: ${req.user?.uid}, institution_id: ${req.body?.institution_id}:`,
      error.message,
    );

    if (error.message === "User not found") {
      return res.status(404).send({ error: "User not found" });
    } else if (
      error.message === "Institution not found or user does not have access"
    ) {
      return res
        .status(404)
        .send({ error: "Institution not found or user does not have access" });
    }

    res.status(500).send({ error: "Internal server error" });
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
  getInstitutionUpdateToken,
};

export default plaidController;
