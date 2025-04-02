import accountsService from "../services/accounts.service.js";

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

const getUserTransactions = async (req, res) => {
  try {
    const email = req.user.email;
    const uid = req.user.uid;
    const transactions = await accountsService.getUserTransactions(email, uid);
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
    const transactions = await accountsService.getProfileTransactions(
      email,
      profileId,
      uid
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
    const transactions = await accountsService.getTransactionsByAccount(
      accountId,
      uid
    );
    res.status(200).send(transactions);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

const getAccountDetails = async (req, res) => {
  try {
    const { accountId, profileId } = req.params;
    const accountData = await accountsService.getAccountDetails(
      accountId,
      profileId
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
};

export default accountsController;
