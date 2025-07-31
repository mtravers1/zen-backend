import e from "express";
import webhookService from "../services/webhook.service.js";
import webTokenDecoder from "../lib/webTokenDecoder.js";

const plaidWebhook = async (req, res) => {
  try {
    const event = req.body;
    const authorization = req.headers["plaid-verification"];

    // Validate webhook payload
    if (!event || !event.webhook_type) {
      console.error("Invalid webhook payload received");
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    // Verify Plaid webhook signature
    try {
      webhookService.verifyPlaidToken(authorization, event);
    } catch (verificationError) {
      console.error("Webhook verification failed:", verificationError.message);
      return res.status(401).json({ error: "Webhook verification failed" });
    }

    // Process webhook asynchronously to avoid timeout
    webhookService.webhookHandler(event).catch(error => {
      console.error("Webhook processing error:", error);
    });

    // Return success immediately
    return res.status(200).json({ 
      status: "success", 
      message: "Webhook received and processing started" 
    });
  } catch (error) {
    console.error("Webhook controller error:", error);
    return res.status(500).json({ 
      error: "Internal server error",
      message: "Webhook processing failed" 
    });
  }
};

const testWebhook = async (req, res) => {
  try {
    const { itemId, uid } = req.body;
    
    if (!itemId || !uid) {
      return res.status(400).json({ error: "Missing required parameters" });
    }

    await webhookService.testWebhook(itemId, uid);
    return res.status(200).json({ 
      status: "success", 
      message: "Test webhook executed successfully" 
    });
  } catch (error) {
    console.error("Test webhook error:", error);
    return res.status(500).json({ 
      error: "Test webhook failed",
      message: error.message 
    });
  }
};

const webhookController = {
  plaidWebhook,
  testWebhook,
};

export default webhookController;
