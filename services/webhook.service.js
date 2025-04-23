import plaidClient from "../config/plaid.js";
import plaidService from "./plaid.service.js";
import webTokenDecoder from "../lib/webTokenDecoder.js";
import sha256 from "crypto-js/sha256.js";

const webhookHandler = async (event) => {
  console.log(event);

  switch (event.webhook_type) {
    case "TRANSACTIONS":
      if (event.webhook_code === "SYNC_UPDATES_AVAILABLE") {
        await plaidService.updateTransactions(event.item_id);
      }
      break;

    case "INVESTMENTS_TRANSACTIONS":
      if (
        event.webhook_code === "DEFAULT_UPDATE" ||
        event.webhook_code === "HISTORICAL_UPDATE"
      ) {
        await plaidService.updateInvestmentTransactions(event.item_id);
      }
      break;

    case "LIABILITIES":
      if (event.webhook_code === "DEFAULT_UPDATE") {
        await plaidService.updateLiabilities(event.item_id);
      }
      break;

    case "ITEM":
      switch (event.webhook_code) {
        case "ERROR":
          if (event.error?.error_code === "ITEM_LOGIN_REQUIRED") {
            await plaidService.updateInvadlidAccessToken(event.item_id);
          }
          break;
        case "LOGIN_REPAIRED":
          await plaidService.repairAccessTokenWebhook(event.item_id);
          break;
      }
      break;
  }

  return "Webhook received";
};

const testWebhook = async (itemId, uid) => {
  const accessToken = await plaidService.getAccessTokenFromItemId(itemId, uid);

  const response = await plaidClient.sandboxItemFireWebhook({
    access_token: accessToken,
    webhook_code: "DEFAULT_UPDATE",
    webhook_type: "INVESTMENTS_TRANSACTIONS",
  });
  console.log(response.data);
  return accessToken;
};

const testResetLogin = async (accessToken) => {
  const response = await plaidClient.sandboxItemResetLogin({
    access_token: accessToken,
  });
  console.log(response.data);
  return response.data;
};

const verifyPlaidToken = (token, body) => {
  const decoded = webTokenDecoder(token);
  if (!decoded) {
    throw new Error("Invalid token");
  }
  const timestamp = decoded.iat;
  const now = Math.floor(Date.now() / 1000);
  if (now - timestamp > 300) {
    throw new Error("Token expired or invalid");
  }
  const bodyString = JSON.stringify(body);
  const bodyHash = sha256(bodyString).toString();

  //Deberian ser iguales
  // console.log(bodyHash);

  return decoded;
};

const webhookService = {
  webhookHandler,
  testWebhook,
  verifyPlaidToken,
};

export default webhookService;
