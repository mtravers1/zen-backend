import * as Sentry from "@sentry/node";
import accountsService from "../services/account.service.js";
import cashflowService from "../services/cashflow.service.js";
import transactionsService from "../services/transactions.service.js";
import businessService from "../services/businesses.service.js";
import plaidService from "../services/plaid.service.js";

const addAccount = async (req, res) => {
  try {
    const { token, accessToken, access_token, publicToken, profileId } = req.body;
    let finalToken = token || accessToken || access_token;

    if (publicToken) {
      const tokenResponse = await plaidService.getAccessToken(publicToken);
      finalToken = tokenResponse.access_token;
    }

    const email = req.user.email;
    const uid = req.user.uid;
    const response = await accountsService.addAccount(finalToken, email, uid, profileId);
    res.status(201).send(response);
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};

const getAccounts = async (req, res) => {
  try {
    const { profile } = req.body;
    const uid = req.user.uid;
    const accounts = await accountsService.getAccounts(profile, uid);
    res.status(200).send(accounts);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

const getAllUserAccounts = async (req, res) => {
  try {
    const { profileId } = req.query;
    const email = req.user.email;
    const uid = req.user.uid;

    let accounts;
    if (profileId) {
      accounts = await accountsService.getAccountsByProfile(profileId, uid);
    } else {
      accounts = await accountsService.getAllUserAccounts(email, uid);
    }

    res.status(200).send(accounts);
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};


const getAccountDetails = async (req, res) => {
  try {
    const { accountId, profileId } = req.params;
    const uid = req.user.uid;
    const email = req.user.email;
    console.log(
      `[getAccountDetails] accountId: ${accountId}, profileId: ${profileId}, uid: ${uid}`,
    );

    const accountData = await accountsService.getAccountDetails(
      accountId,
      profileId,
      uid,
      email,
    );
    res.status(200).send(accountData);
  } catch (error) {
    console.error("Error in getAccountDetails controller:", error);
    res.status(500).send({ message: error.message, error: error });
  }
};

const addAccountPhoto = async (req, res) => {
  try {
    const { fileName } = req.body;
    console.log(fileName);
    const url = await accountsService.generateUploadUrl(fileName);
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
    const url = await accountsService.generateSignedUrl(fileName);
    res.status(200).send({ downloadUrl: url });
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};
const serveAccountPhoto = async (req, res) => {
  try {
    const { fileName } = req.params;
    console.log("🔍 [serveAccountPhoto] Serving photo:", fileName);

    // Generate signed URL for the photo first
    const signedUrl = await accountsService.generateSignedUrl(fileName);
    console.log("🔍 [serveAccountPhoto] Signed URL generated:", signedUrl);

    if (!signedUrl) {
      console.error(
        "❌ [serveAccountPhoto] Failed to generate signed URL for:",
        fileName,
      );
      return res
        .status(404)
        .send({ message: "Photo not found or access denied" });
    }

    // Redirect to the signed URL
    console.log(
      "🔍 [serveAccountPhoto] Redirecting to signed URL for:",
      fileName,
    );
    res.redirect(signedUrl);
  } catch (error) {
    console.error("❌ [serveAccountPhoto] Error:", error);
    error.details = {
      operation: "serveAccountPhoto",
      fileName: req.params.fileName,
      user_email: req.user?.email,
      user_uid: req.user?.uid,
      error_type: "server_error",
    };
    res.status(500).send({ message: error.message });
  }
};

// const getInvestmentTransactionsByAccount = async (req, res) => {
//   try {
//     const { accountId } = req.params;
//     const uid = req.user.uid;
//     const transactions = await accountsService.getInvestmentTransactionsByAccount(
//       accountId,
//       uid,
//     );
//     res.status(200).send(transactions);
//   } catch (error) {
//     res.status(500).send({ message: error.message });
//   }
// };

async function deletePlaidAccount(req, res) {
  const { accountId } = req.params; 
  try {
    const uid = req.user.uid;
    const response = await accountsService.deletePlaidAccount(accountId, uid);
    if (!response) {
      return res.status(404).send({ message: "Account not found" });
    }
    res.status(200).send(response);
  } catch (error) {
    // Check if this is the specific Plaid error for an item that's already been removed.
    if (error.response?.data?.error_code === 'ITEM_NOT_FOUND') {
      // Log this as a warning to Sentry, as it's an expected but notable event.
      Sentry.captureMessage("Plaid item not found during deletion (already removed)", {
        level: "warning",
        extra: {
          accountId: req.params.accountId, // Corrected: get from req.params
          user_uid: req.user.uid,
          plaid_error: error.response.data,
        },
      });
      // Return a success response.
      return res.status(200).send({ message: "Plaid item already removed." });
    }

    if (error.message === "User not found") {
      return res.status(403).send({ message: "Forbidden" });
    }
    console.log(error);
    Sentry.captureException(error); // Capture any other unexpected errors
    res.status(500).send({ message: error.message });
  }
};

const accountsController = {
  addAccount,
  getAccounts,
  getAccountDetails,
  getAllUserAccounts,
  addAccountPhoto,
  getAccountPhoto,
  serveAccountPhoto,
    deletePlaidAccount,
};

export default accountsController;
