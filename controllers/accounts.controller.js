import accountsService from "../services/accounts.service.js";
import businessService from "../services/businesses.service.js";

const addAccount = async (req, res) => {
  try {
    const { token } = req.body;
    const email = req.user.email;
    const uid = req.user.uid;
    const response = await accountsService.addAccount(token, email, uid);
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
      uid,
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
      paginate: paginate === "true",
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

    const profiles = await businessService.getUserProfiles(email, uid);
    const profile = profiles.find((p) => p.id.toString() === profileId);

    if (!profile) {
      return res.status(404).send({ message: "Profile not found" });
    }

    const transactions = await accountsService.getProfileTransactions(
      profile,
      uid,
      {
        page: parseInt(page),
        limit: parseInt(limit),
        paginate: paginate === "true",
      },
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
        paginate: paginate === "true",
      },
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
    console.log(
      `[getAccountDetails] accountId: ${accountId}, profileId: ${profileId}, uid: ${uid}`,
    );

    const accountData = await accountsService.getAccountDetails(
      accountId,
      profileId,
      uid,
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
  try {
    const { accountId } = req.params;
    const uid = req.user.uid;
    const response = await accountsService.deletePlaidAccount(accountId, uid);
    if (!response) {
      return res.status(404).send({ message: "Account not found" });
    }
    res.status(200).send(response);
  } catch (error) {
    if (error.message === "User not found") {
      return res.status(403).send({ message: "Forbidden" });
    }
    console.log(error);
    res.status(500).send({ message: error.message });
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
  getProfileTransactions,
  getCashFlowsByPlaidAccount,
  // getInvestmentTransactionsByAccount,
  serveAccountPhoto,
    deletePlaidAccount,
};

export default accountsController;
