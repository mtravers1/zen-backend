import accountsService from "../services/accounts.service.js";
import plaidService from "../services/plaid.service.js";

const addAccount = async (req, res) => {
  try {
    const { token } = req.body;
    const email = req.user.email;
    const uid = req.user.uid;
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
    console.log('Serving photo:', fileName);
    
    // Generate signed URL for the photo
    const signedUrl = await accountsService.generateSignedUrl(fileName);
    
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
};

export default accountsController;
