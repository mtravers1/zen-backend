import express from "express";
import webhookService from "../services/webhook.service.js";
import { UnknownItemError } from "../lib/errors.js";
import structuredLogger from "../lib/structuredLogger.js";
import User from "../database/models/User.js";

const router = express.Router();

// Middleware to ensure webhooks always return 200
// This prevents Plaid from unnecessarily retrying webhooks
const webhookErrorHandler = (err, req, res, next) => {
  console.error("Webhook error:", err);

  // Always return 200 for webhooks, even in case of error
  // Plaid will automatically resend important webhooks
  res.status(200).json({
    status: "error",
    message: "Webhook processed with errors",
    timestamp: new Date().toISOString(),
  });
};

// Health check for webhook endpoint
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    message: "Webhook endpoint is available",
  });
});

// Plaid webhook endpoint
router.post("/plaid", async (req, res, next) => {
  try {
    console.log("Plaid webhook received:", {
      body: req.body,
      headers: req.headers,
      timestamp: new Date().toISOString(),
    });

    const result = await webhookService.webhookHandler(
      req.body,
      req.headers["plaid-verification"],
      JSON.stringify(req.body),
    );

    res.status(200).json({
      status: "success",
      message: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Webhook processing error:", error);

    if (error instanceof UnknownItemError) {
      let authUid = null;
      let databaseId = null;
      if (req.body.client_user_id) {
        databaseId = req.body.client_user_id;
        const user = await User.findById(databaseId);
        if (user) {
          authUid = user.authUid;
        }
      }

      // Log the orphan item as a warning for manual cleanup later.
      structuredLogger.logWarning("unknown_plaid_item_webhook", {
        item_id: req.body.item_id,
        webhook_type: req.body.webhook_type,
        webhook_code: req.body.webhook_code,
        authUid: authUid,
        databaseId: databaseId,
        error_message: error.message,
      });

      return res.status(404).json({ error: "Item not found" });
    }

    // Always return 200 to avoid unnecessary retries for other errors
    res.status(200).json({
      status: "error",
      message: "Webhook processed with errors",
      timestamp: new Date().toISOString(),
    });
  }
});

// Apply error middleware
router.use(webhookErrorHandler);

export default router;
