import getPlaidClient from "../config/plaid.js";
import plaidService from "./plaid.service.js";
import webTokenDecoder from "../lib/webTokenDecoder.js";
import sha256 from "crypto-js/sha256.js";
import structuredLogger from "../lib/structuredLogger.js";
import { UnknownItemError } from "../lib/errors.js";

// Initialize Plaid client
const plaidClient = getPlaidClient();

const webhookHandler = async (event, signature = null, body = null) => {
  const startTime = Date.now();

  try {
    structuredLogger.logOperationStart("webhookHandler", {
      webhook_type: event.webhook_type,
      webhook_code: event.webhook_code,
      item_id: event.item_id,
      error_code: event.error?.error_code,
      has_signature: !!signature,
    });

    if (!event.webhook_type) {
      throw new Error("Missing webhook_type");
    }

    // Validate webhook signature if provided
    if (signature && body) {
      if (typeof body !== "string") {
        throw new Error("Body must be a string when signature is provided");
      }
      const webhookSecret = process.env.PLAID_WEBHOOK_SECRET;
      if (webhookSecret) {
        const isValid = await structuredLogger.withContext(
          "webhookSignatureValidation",
          {
            item_id: event.item_id,
            has_signature: !!signature,
            has_secret: !!webhookSecret,
          },
          async () => {
            return plaidService.validateWebhookSignature(
              body,
              signature,
              webhookSecret,
            );
          },
        );

        if (!isValid) {
          throw new Error("Invalid webhook signature");
        }
      }
    }

    let isChase = false;
    if (event.item_id) {
      try {
        const accessToken = await structuredLogger.withContext(
          "checkChaseBank",
          {
            item_id: event.item_id,
          },
          async () => {
            const accessToken = await plaidService.getNewestAccessToken({ itemId: event.item_id });
      if (!accessToken) {
        throw new Error(`No valid access token found for item ID: ${event.item_id}`);
      }
      return accessToken;
          },
        );

        if (accessToken) {
          isChase = await structuredLogger.withContext(
            "checkIfChaseBank",
            {
              item_id: event.item_id,
              has_access_token: !!accessToken,
            },
            async () => {
              return await plaidService.checkIfChaseBank(
                event.item_id,
                accessToken,
              );
            },
          );
        }
      } catch (error) {
        structuredLogger.logErrorBlock(error, {
          operation: "checkChaseBank",
          item_id: event.item_id,
          error_classification: "non_fatal_error",
        });
        // Continue processing even if Chase check fails
      }
    }

    const CHASE_DELAY_MS = parseInt(
      process.env.CHASE_WEBHOOK_DELAY_MS || "2000",
      10,
    );

    if (isChase) {
      structuredLogger.logSuccess("chaseDelay", {
        item_id: event.item_id,
        delay_ms: CHASE_DELAY_MS,
      });
      await new Promise((resolve) => setTimeout(resolve, CHASE_DELAY_MS));
    }

    let result;
    switch (event.webhook_type) {
      case "TRANSACTIONS":
        if (
          event.webhook_code === "INITIAL_UPDATE" ||
          event.webhook_code === "HISTORICAL_UPDATE" ||
          event.webhook_code === "DEFAULT_UPDATE" ||
          event.webhook_code === "SYNC_UPDATES_AVAILABLE" ||
          event.webhook_code === "TRANSACTIONS_REMOVED"
        ) {
          if (!event.item_id) {
            throw new Error("Missing item_id for TRANSACTIONS webhook");
          }

          const isKnownItem = await plaidService.doesItemExist(event.item_id);
          if (!isKnownItem) {
            throw new UnknownItemError(`Webhook received for an unknown item: ${event.item_id}`);
          }

          // Check if the item is already known to be expired.
          const isExpired = await plaidService.isItemExpired(event.item_id);
          if (isExpired) {
            structuredLogger.logInfo(
              "Skipping transaction sync for item with expired token.",
              { item_id: event.item_id },
            );
            return "Skipped sync for expired item.";
          }

          result = await structuredLogger.withContext(
            "processTransactionSync",
            {
              item_id: event.item_id,
              webhook_type: event.webhook_type,
              webhook_code: event.webhook_code,
            },
            async () => {
              try {
                const syncResult = await plaidService.updateTransactions(
                  event.item_id,
                );
                plaidService.resetWebhookFailures(event.item_id);
                return syncResult;
              } catch (error) {
                return await plaidService.handlePlaidError(error, event.item_id);
              }
            },
          );
        } else {
          result = `Unhandled TRANSACTIONS webhook code: ${event.webhook_code}`;
        }
        break;

      case "ITEM":
        if (event.webhook_code === "NEW_ACCOUNTS_AVAILABLE") {
          if (!event.item_id) {
            throw new Error("Missing item_id for ITEM webhook");
          }
          const isKnownItem = await plaidService.doesItemExist(event.item_id);
          if (!isKnownItem) {
            throw new UnknownItemError(`Webhook received for an unknown item: ${event.item_id}`);
          }
          result = await structuredLogger.withContext(
            "handleNewAccountsAvailable",
            { item_id: event.item_id },
            async () => {
              await Promise.allSettled([
                plaidService.updateTransactions(event.item_id),
                plaidService.updateHoldings(event.item_id),
                plaidService.updateLiabilities(event.item_id),
              ]);
              plaidService.resetWebhookFailures(event.item_id);
              return "New accounts available. Transactions, Holdings, and Liabilities updated.";
            },
          );
        } else if (event.webhook_code === "ERROR" && event.error?.error_code === "ITEM_LOGIN_REQUIRED") {
            if (!event.item_id) {
                throw new Error("Missing item_id for ITEM webhook");
            }
            const isKnownItem = await plaidService.doesItemExist(event.item_id);
            if (!isKnownItem) {
              throw new UnknownItemError(`Webhook received for an unknown item: ${event.item_id}`);
            }
            result = await structuredLogger.withContext(
            "handleItemError",
            { item_id: event.item_id, error_code: event.error?.error_code },
            async () => {
              return await plaidService.handleItemError(event);
            },
          );
        } else {
          result = `Unhandled ITEM webhook code: ${event.webhook_code}`;
        }
        break;

      case "ACCOUNTS":
        if (event.webhook_code === "DEFAULT_UPDATE" || event.webhook_code === "SYNC_UPDATES_AVAILABLE") {
          if (!event.item_id) {
            throw new Error("Missing item_id for ACCOUNTS webhook");
          }
          const isKnownItem = await plaidService.doesItemExist(event.item_id);
          if (!isKnownItem) {
            throw new UnknownItemError(`Webhook received for an unknown item: ${event.item_id}`);
          }
          result = await structuredLogger.withContext(
            "handleAccountsUpdate",
            { item_id: event.item_id, account_ids: event.account_ids },
            async () => {
              try {
                return await plaidService.handleAccountsUpdate(event);
              } catch (error) {
                return await plaidService.handlePlaidError(error, event.item_id);
              }
            },
          );
        } else {
          result = `Unhandled ACCOUNTS webhook code: ${event.webhook_code}`;
        }
        break;

      case "LIABILITIES":
        if (event.webhook_code === "DEFAULT_UPDATE") {
          if (!event.item_id) {
            throw new Error("Missing item_id for LIABILITIES webhook");
          }
          const isKnownItem = await plaidService.doesItemExist(event.item_id);
          if (!isKnownItem) {
            throw new UnknownItemError(`Webhook received for an unknown item: ${event.item_id}`);
          }
          result = await structuredLogger.withContext(
            "processLiabilitySync",
            {
              item_id: event.item_id,
              webhook_type: event.webhook_type,
              webhook_code: event.webhook_code,
            },
            async () => {
              try {
                const syncResult = await plaidService.updateLiabilities(
                  event.item_id,
                );
                plaidService.resetWebhookFailures(event.item_id);
                return syncResult;
              } catch (error) {
                return await plaidService.handlePlaidError(error, event.item_id);
              }
            },
          );
        } else {
          result = `Unhandled LIABILITIES webhook code: ${event.webhook_code}`;
        }
        break;

      case "INVESTMENTS_TRANSACTIONS":
        if (event.webhook_code === "DEFAULT_UPDATE" || event.webhook_code === "HISTORICAL_UPDATE") {
          if (!event.item_id) {
            throw new Error("Missing item_id for INVESTMENTS_TRANSACTIONS webhook");
          }
          const isKnownItem = await plaidService.doesItemExist(event.item_id);
          if (!isKnownItem) {
            throw new UnknownItemError(`Webhook received for an unknown item: ${event.item_id}`);
          }
          result = await structuredLogger.withContext(
            "processInvestmentSync",
            {
              item_id: event.item_id,
              webhook_type: event.webhook_type,
              webhook_code: event.webhook_code,
            },
            async () => {
              try {
                const syncResult = await plaidService.updateInvestmentTransactions(
                  event.item_id,
                );
                plaidService.resetWebhookFailures(event.item_id);
                return syncResult;
              } catch (error) {
                return await plaidService.handlePlaidError(error, event.item_id);
              }
            },
          );
        } else {
          result = `Unhandled INVESTMENTS_TRANSACTIONS webhook code: ${event.webhook_code}`;
        }
        break;

      case "HOLDINGS":
        if (event.webhook_code === "DEFAULT_UPDATE" || event.webhook_code === "HISTORICAL_UPDATE") {
          if (!event.item_id) {
            throw new Error("Missing item_id for HOLDINGS webhook");
          }
          const isKnownItem = await plaidService.doesItemExist(event.item_id);
          if (!isKnownItem) {
            throw new UnknownItemError(`Webhook received for an unknown item: ${event.item_id}`);
          }
          result = await structuredLogger.withContext(
            "processHoldingsSync",
            {
              item_id: event.item_id,
              webhook_type: event.webhook_type,
              webhook_code: event.webhook_code,
            },
            async () => {
              try {
                const syncResult = await plaidService.updateHoldings(
                  event.item_id,
                );
                plaidService.resetWebhookFailures(event.item_id);
                return syncResult;
              } catch (error) {
                return await plaidService.handlePlaidError(error, event.item_id);
              }
            },
          );
        } else {
          result = `Unhandled HOLDINGS webhook code: ${event.webhook_code}`;
        }
        break;

      default:
        result = `Unhandled webhook type: ${event.webhook_type}`;
    }

    const durationMs = Date.now() - startTime;

    structuredLogger.logSuccess("webhookHandler", {
      webhook_type: event.webhook_type,
      webhook_code: event.webhook_code,
      item_id: event.item_id,
      durationMs,
      result: typeof result === "string" ? result : "success",
    });

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;

    structuredLogger.logErrorBlock(error, {
      operation: "webhookHandler",
      item_id: event.item_id,
      webhook_type: event.webhook_type,
      webhook_code: event.webhook_code,
      durationMs,
      error_classification: "webhook_processing_error",
    });

    throw error;
  }
};

const testWebhook = async (itemId, uid) => {
  try {
    structuredLogger.logOperationStart("testWebhook", {
      item_id: itemId,
      uid,
    });

    const result = await plaidService.updateTransactions(itemId);

    structuredLogger.logSuccess("testWebhook", {
      item_id: itemId,
      uid,
      result: "Test webhook completed successfully",
    });

    return result;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      item_id: itemId,
      uid,
      error: error.message,
    });
    throw error;
  }
};

const testResetLogin = async (accessToken) => {
  try {
    if (!accessToken || typeof accessToken !== "string") {
      throw new Error("Valid access token is required");
    }

    structuredLogger.logOperationStart("testResetLogin", {
      note: "Testing reset login",
    });

    const response = await plaidClient.itemResetLogin({
      access_token: accessToken,
    });

    structuredLogger.logSuccess("testResetLogin", {
      result: "Reset login test completed",
    });

    return response.data;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      error: error.message,
    });
    throw error;
  }
};

const verifyPlaidToken = (token, body) => {
  try {
    structuredLogger.logOperationStart("verifyPlaidToken", {
      token_provided: !!token,
      body_provided: !!body,
    });

    if (!token || !body || !process.env.PLAID_WEBHOOK_SECRET) {
      return false;
    }

    const expectedToken = sha256(
      process.env.PLAID_WEBHOOK_SECRET + body,
    ).toString();
    const isValid = token === expectedToken;

    return isValid;
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      error: error.message,
    });
    return false;
  }
};

// Health check for webhook processing
const getWebhookHealth = () => {
  const health = {
    timestamp: new Date().toISOString(),
    failureTracker: {
      totalItems: plaidService.webhookFailureTracker
        ? plaidService.webhookFailureTracker.size
        : 0,
      itemsWithFailures: [],
    },
  };

  if (plaidService.webhookFailureTracker) {
    // Ensure it's a Map before iterating
    if (!(plaidService.webhookFailureTracker instanceof Map)) {
      structuredLogger.logErrorBlock(
        new Error("webhookFailureTracker is not a Map"),
        {
          operation: "getWebhookHealth",
        },
      );
      return health;
    }
    for (const [
      itemId,
      failures,
    ] of plaidService.webhookFailureTracker.entries()) {
      health.failureTracker.itemsWithFailures.push({
        itemId,
        failureCount: failures,
      });
    }
  }

  structuredLogger.logOperationStart("getWebhookHealth");

  return health;
};

export {
  webhookHandler,
  testWebhook,
  testResetLogin,
  verifyPlaidToken,
  getWebhookHealth,
};

// Create default export object
const webhookService = {
  webhookHandler,
  testWebhook,
  testResetLogin,
  verifyPlaidToken,
  getWebhookHealth,
};

export default webhookService;