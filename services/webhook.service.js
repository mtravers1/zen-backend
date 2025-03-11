import plaidClient from "../config/plaid.js";
import plaidService from "./plaid.service.js";
import webTokenDecoder from "../lib/webTokenDecoder.js";
import sha256 from "crypto-js/sha256.js";

const webhookHandler = async (event) => {
  console.log(event);
  if (event.webhook_type === "TRANSACTIONS") {
    if (event.webhook_code === "SYNC_UPDATES_AVAILABLE") {
      const response = await plaidService.updateTransactions(event.item_id);
      console.log(response);
    }

    if (event.webhook_code === "DEFAULT_UPDATE") {
      //TODO: Handle default update
    }
    if (event.webhook_code === "HISTORICAL_UPDATE") {
      //TODO: Handle historical update
    }
    if (event.webhook_code === "TRANSACTIONS_REMOVED") {
      //TODO: Handle transactions removed
    }
  }
  return "Webhook received";
};

const testWebhook = async (email) => {
  const tokens = await plaidService.getUserAccessTokens(email);
  console.log("testing webhook " + tokens[0].accessToken);
  const response = await plaidClient.sandboxItemFireWebhook({
    access_token: tokens[0].accessToken,
    webhook_code: "SYNC_UPDATES_AVAILABLE",
    // webhook_type: "TRANSACTIONS",
  });
  console.log(response.data);
  return response.data;
};

const verifyPlaidToken = async (token, body) => {
  const decoded = webTokenDecoder(token);
  if (!decoded) {
    throw new Error("Invalid token");
  }
  console.log(decoded);
  const timestamp = decoded.iat;
  const now = Math.floor(Date.now() / 1000);
  if (now - timestamp > 300) {
    throw new Error("Token expired or invalid");
  }

  const bodyString = JSON.stringify(body);
  console.log(bodyString);
  const bodyHash = sha256(bodyString).toString();

  //Deberian ser iguales
  console.log(bodyHash);

  return decoded;
};

const webhookService = {
  webhookHandler,
  testWebhook,
  verifyPlaidToken,
};

export default webhookService;
