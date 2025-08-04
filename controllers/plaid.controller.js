import plaidService from "../services/plaid.service.js";
import structuredLogger from "../lib/structuredLogger.js";

const createLinkToken = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(req, 'createLinkToken');
  
  try {
    const email = req.user.email;
    const uid = req.user.uid;
    const { isAndroid, accountId, screen } = req.body;
    
    const linkToken = await structuredLogger.withContext('createLinkToken', {
      user_id: uid,
      email,
      request_id: requestId,
      metadata: { isAndroid, accountId, screen }
    }, async () => {
      return await plaidService.createLinkToken(email, isAndroid, accountId, uid, screen);
    });
    
    res.status(200).send({ linkToken });
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'createLinkToken',
      user_id: req.user?.uid,
      request_id: requestId,
      request: structuredLogger.requestContext.get(requestId)?.request,
      response: { statusCode: 500, body: { message: error.message } }
    });
    
    res.status(500).send({ message: error.message });
  }
};

const getPublicToken = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(req, 'getPublicToken');
  
  try {
    const { linkToken } = req.body;
    
    const response = await structuredLogger.withContext('getPublicToken', {
      request_id: requestId,
      metadata: { hasLinkToken: !!linkToken }
    }, async () => {
      return await plaidService.getPublicToken(linkToken);
    });
    
    res.status(200).send(response);
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'getPublicToken',
      request_id: requestId,
      request: structuredLogger.requestContext.get(requestId)?.request,
      response: { statusCode: 500, body: { message: error.message } }
    });
    
    res.status(500).send({ message: error.message });
  }
};

const getAccessToken = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(req, 'getAccessToken');
  
  try {
    const { publicToken } = req.body;
    
    const accessToken = await structuredLogger.withContext('getAccessToken', {
      request_id: requestId,
      metadata: { hasPublicToken: !!publicToken }
    }, async () => {
      return await plaidService.getAccessToken(publicToken);
    });
    
    res.status(200).send(accessToken);
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'getAccessToken',
      request_id: requestId,
      request: structuredLogger.requestContext.get(requestId)?.request,
      response: { statusCode: 500, body: { message: error.message } }
    });
    
    res.status(500).send({ message: error.message });
  }
};

const saveAccessToken = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(req, 'saveAccessToken');
  
  try {
    const email = req.user.email;
    const uid = req.user.uid;
    const { accessToken, itemId, institutionId } = req.body;
    
    const token = await structuredLogger.withContext('saveAccessToken', {
      user_id: uid,
      email,
      item_id: itemId,
      institution_id: institutionId,
      request_id: requestId,
      metadata: { hasAccessToken: !!accessToken }
    }, async () => {
      return await plaidService.saveAccessToken(email, accessToken, itemId, institutionId, uid);
    });
    
    res.status(200).send(token);
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'saveAccessToken',
      user_id: req.user?.uid,
      item_id: req.body?.itemId,
      request_id: requestId,
      request: structuredLogger.requestContext.get(requestId)?.request,
      response: { statusCode: 500, body: { message: error.message } }
    });
    
    res.status(500).send({ message: error.message });
  }
};

const getAccounts = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(req, 'getAccounts');
  
  try {
    // const { email } = req.user;
    const email = "galvanerick27@gmail.com";

    const accounts = await structuredLogger.withContext('getAccounts', {
      email,
      request_id: requestId
    }, async () => {
      return await plaidService.getAccounts(email);
    });
    
    res.status(200).send(accounts);
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'getAccounts',
      request_id: requestId,
      request: structuredLogger.requestContext.get(requestId)?.request,
      response: { statusCode: 500, body: { message: error.message } }
    });
    
    res.status(500).send({ message: error.message });
  }
};

const getBalance = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(req, 'getBalance');
  
  try {
    const email = req.user.email;
    
    const balance = await structuredLogger.withContext('getBalance', {
      user_id: req.user?.uid,
      email,
      request_id: requestId
    }, async () => {
      return await plaidService.getBalance(email);
    });
    
    res.status(200).send(balance);
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'getBalance',
      user_id: req.user?.uid,
      request_id: requestId,
      request: structuredLogger.requestContext.get(requestId)?.request,
      response: { statusCode: 500, body: { message: error.message } }
    });
    
    res.status(500).send({ message: error.message });
  }
};

const getInstitutions = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(req, 'getInstitutions');
  
  try {
    const institutions = await structuredLogger.withContext('getInstitutions', {
      request_id: requestId
    }, async () => {
      return await plaidService.getInstitutions();
    });
    
    res.status(200).send(institutions);
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'getInstitutions',
      request_id: requestId,
      request: structuredLogger.requestContext.get(requestId)?.request,
      response: { statusCode: 500, body: { message: error.message } }
    });
    
    res.status(500).send({ message: error.message });
  }
};

const getTransactions = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(req, 'getTransactions');
  
  try {
    const uid = req.user.uid;
    
    const transactions = await structuredLogger.withContext('getTransactions', {
      user_id: uid,
      email: req.user.email,
      request_id: requestId
    }, async () => {
      return await plaidService.getTransactions(req.user.email, uid);
    });
    
    res.status(200).send(transactions);
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'getTransactions',
      user_id: req.user?.uid,
      request_id: requestId,
      request: structuredLogger.requestContext.get(requestId)?.request,
      response: { statusCode: 500, body: { message: error.message } }
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
};

export default plaidController;
