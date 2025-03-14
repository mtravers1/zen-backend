import plaidClient from "../config/plaid.js";
import plaidService from "./plaid.service.js";
import webTokenDecoder from "../lib/webTokenDecoder.js";
import sha256 from "crypto-js/sha256.js";

const webhookHandler = async (event) => {
  console.log(event);
  if (event.webhook_type === "TRANSACTIONS") {
    if (event.webhook_code === "SYNC_UPDATES_AVAILABLE") {
      await plaidService.updateTransactions(event.item_id);
    }
  } else if (event.webhook_type === "INVESTMENTS_TRANSACTIONS") {
    if (event.webhook_code === "DEFAULT_UPDATE") {
      await plaidService.updateInvestmentTransactions(event.item_id);
    }
  } else if (event.webhook_type === "LIABILITIES") {
    if (event.webhook_code === "DEFAULT_UPDATE") {
      //TODO: Implement this
      await plaidService.updateLiabilities(event.item_id);
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
