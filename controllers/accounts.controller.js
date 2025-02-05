import accountsService from "../services/accounts.service.js";

const addAccount = async (req, res) => {
  try {
    const { token } = req.body;
    const email = req.user.email;
    const response = await accountsService.addAccount(token, email);
    res.status(201).send(response);
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};

const getAccounts = async (req, res) => {
  try {
    const { profile } = req.body;
    const accounts = await accountsService.getAccounts(profile);
    res.status(200).send(accounts);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

const getAllUserAccounts = async (req, res) => {
  try {
    const email = req.user.email;
    const accounts = await accountsService.getAllUserAccounts(email);
    res.status(200).send(accounts);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

const getCashFlows = async (req, res) => {
  try {
    const { profile } = req.body;
    const cashFlows = await accountsService.getCashFlows(profile);
    res.status(200).send(cashFlows);
  } catch (error) {
    console.log(error);
    res.status(500).send({ message: error.message });
  }
};

const getUserTransactions = async (req, res) => {
  try {
    const email = req.user.email;
    const transactions = await accountsService.getUserTransactions(email);
    res.status(200).send(transactions);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

const getTransactionsByAccount = async (req, res) => {
  try {
    const { accountId } = req.params;
    const transactions = await accountsService.getTransactionsByAccount(
      accountId
    );
    res.status(200).send(transactions);
  } catch (error) {
    res.status(500).send({ message: error.message });
  }
};

const accountsController = {
  addAccount,
  getAccounts,
  getCashFlows,
  getUserTransactions,
  getTransactionsByAccount,
  getAllUserAccounts,
};

export default accountsController;
