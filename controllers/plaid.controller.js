import plaidService from "../services/plaid.service.js";

const createLinkToken = async (req, res) => {
  try {
    const email = req.user.email;
    const { isAndroid } = req.body;
    const linkToken = await plaidService.createLinkToken(email, isAndroid);
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
    const { accessToken, itemId, institutionId } = req.body;
    const token = await plaidService.saveAccessToken(
      email,
      accessToken,
      itemId,
      institutionId
    );
    res.status(200).send(token);
  } catch (error) {
    console.log(error.message);
    res.status(500).send({ message: error.message });
  }
};

const getAccounts = async (req, res) => {
  try {
    const { email } = req.user;

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
    const transactions = await plaidService.getTransactions(req.user.email);

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
};

export default plaidController;
