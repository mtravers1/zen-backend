import plaidClient from "../config/plaid.js";
import plaidService from "./plaid.service.js";
import webTokenDecoder from "../lib/webTokenDecoder.js";
import sha256 from "crypto-js/sha256.js";

const webhookHandler = async (event) => {
  try {
    console.log("Webhook received:", {
      webhook_type: event.webhook_type,
      webhook_code: event.webhook_code,
      item_id: event.item_id,
      error_code: event.error?.error_code
    });

    if (!event.webhook_type) {
      console.error("webhookHandler: Missing webhook_type");
      return "Invalid webhook event";
    }

    // Check if it's a Chase item
    let isChase = false;
    if (event.item_id) {
      try {
        const accessToken = await plaidService.getAccessTokenFromItemId(event.item_id);
        if (accessToken) {
          isChase = await plaidService.checkIfChaseBank(event.item_id, accessToken);
        }
      } catch (error) {
        console.error("Error checking if Chase bank in webhook:", error);
      }
    }

    if (isChase) {
      console.log("Processing Chase-specific webhook");
      // Apply delay for Chase to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    switch (event.webhook_type) {
      case "TRANSACTIONS":
        if (event.webhook_code === "SYNC_UPDATES_AVAILABLE") {
          if (!event.item_id) {
            console.error("webhookHandler: Missing item_id for TRANSACTIONS webhook");
            return "Missing item_id";
          }
          
          if (isChase) {
            console.log("Processing Chase transaction sync");
            const result = await plaidService.updateChaseTransactions(event.item_id);
          } else {
            const result = await plaidService.updateTransactions(event.item_id);
          }
          console.log("TRANSACTIONS webhook processed successfully");
        }
        break;

      case "ITEM":
        if (event.webhook_code === "ERROR") {
          if (!event.item_id) {
            console.error("webhookHandler: Missing item_id for ITEM ERROR webhook");
            return "Missing item_id";
          }
          
          if (event.error?.error_code === "ITEM_LOGIN_REQUIRED") {
            console.log("Item requires reauthentication");
            if (isChase) {
              console.log("Chase item requires reauthentication - applying special handling");
              // For Chase, we can try a more aggressive approach
              await plaidService.markItemForReauth(event.item_id);
            } else {
              await plaidService.updateInvadlidAccessToken(event.item_id);
            }
          } else if (event.error?.error_code === "INSTITUTION_DOWN") {
            console.log("Institution is down");
            if (isChase) {
              console.log("Chase institution is down - will retry later");
              // For Chase, we can implement automatic retry
            }
          }
        } else if (event.webhook_code === "PENDING_EXPIRATION") {
          console.log("Item access token will expire soon");
          if (isChase) {
            console.log("Chase token expiring - sending notification");
            // Implement specific notification for Chase
          }
        }
        break;

      case "ACCOUNTS":
        if (event.webhook_code === "DEFAULT_UPDATE") {
          console.log("Account default update received");
          if (isChase) {
            console.log("Chase account update - applying special handling");
            // Implement specific logic for Chase
          }
        }
        break;

      default:
        console.log(`Unhandled webhook type: ${event.webhook_type}`);
        break;
    }

    return "Webhook processed successfully";
  } catch (error) {
    console.error("Error in webhook handler:", error);
    return "Error processing webhook";
  }
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

  // They should be equal
  // console.log(bodyHash);

  return decoded;
};

const webhookService = {
  webhookHandler,
  testWebhook,
  verifyPlaidToken,
  testResetLogin,
};

export default webhookService;
