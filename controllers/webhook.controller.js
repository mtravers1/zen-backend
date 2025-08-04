import e from "express";
import webhookService from "../services/webhook.service.js";
import webTokenDecoder from "../lib/webTokenDecoder.js";
import structuredLogger from "../lib/structuredLogger.js";

const plaidWebhook = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(req, 'plaidWebhook');
  
  try {
    const event = req.body;
    const authorization = req.headers["plaid-verification"];

    // Validate webhook payload
    if (!event || !event.webhook_type) {
      structuredLogger.logErrorBlock(new Error("Invalid webhook payload received"), {
        operation: 'plaidWebhook',
        request_id: requestId,
        request: structuredLogger.requestContext.get(requestId)?.request,
        response: { statusCode: 400, body: { error: "Invalid webhook payload" } },
        error_classification: 'validation_error'
      });
      
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    // Verify Plaid webhook signature
    try {
      await structuredLogger.withContext('webhookSignatureVerification', {
        request_id: requestId,
        item_id: event.item_id,
        webhook_type: event.webhook_type,
        webhook_code: event.webhook_code,
        has_signature: !!authorization
      }, async () => {
        webhookService.verifyPlaidToken(authorization, event);
      });
    } catch (verificationError) {
      structuredLogger.logErrorBlock(verificationError, {
        operation: 'plaidWebhook',
        request_id: requestId,
        item_id: event.item_id,
        webhook_type: event.webhook_type,
        request: structuredLogger.requestContext.get(requestId)?.request,
        response: { statusCode: 401, body: { error: "Webhook verification failed" } },
        error_classification: 'authentication_error'
      });
      
      return res.status(401).json({ error: "Webhook verification failed" });
    }

    // Process webhook asynchronously to avoid timeout
    webhookService.webhookHandler(event, authorization, JSON.stringify(req.body)).catch(error => {
      structuredLogger.logErrorBlock(error, {
        operation: 'plaidWebhook',
        request_id: requestId,
        item_id: event.item_id,
        webhook_type: event.webhook_type,
        webhook_code: event.webhook_code,
        request: structuredLogger.requestContext.get(requestId)?.request,
        error_classification: 'webhook_processing_error'
      });
    });

    // Return success immediately
    return res.status(200).json({ 
      status: "success", 
      message: "Webhook received and processing started" 
    });
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'plaidWebhook',
      request_id: requestId,
      request: structuredLogger.requestContext.get(requestId)?.request,
      response: { statusCode: 500, body: { error: "Internal server error" } },
      error_classification: 'internal_error'
    });
    
    return res.status(500).json({ 
      error: "Internal server error",
      message: "Webhook processing failed" 
    });
  }
};

const testWebhook = async (req, res) => {
  const requestId = structuredLogger.startRequestContext(req, 'testWebhook');
  
  try {
    const { itemId, uid } = req.body;
    
    if (!itemId || !uid) {
      structuredLogger.logErrorBlock(new Error("Missing required parameters"), {
        operation: 'testWebhook',
        request_id: requestId,
        request: structuredLogger.requestContext.get(requestId)?.request,
        response: { statusCode: 400, body: { error: "Missing required parameters" } },
        error_classification: 'validation_error'
      });
      
      return res.status(400).json({ error: "Missing required parameters" });
    }

    await structuredLogger.withContext('testWebhook', {
      request_id: requestId,
      item_id: itemId,
      user_id: uid
    }, async () => {
      return await webhookService.testWebhook(itemId, uid);
    });
    
    return res.status(200).json({ 
      status: "success", 
      message: "Test webhook executed successfully" 
    });
  } catch (error) {
    structuredLogger.logErrorBlock(error, {
      operation: 'testWebhook',
      request_id: requestId,
      item_id: req.body?.itemId,
      user_id: req.body?.uid,
      request: structuredLogger.requestContext.get(requestId)?.request,
      response: { statusCode: 500, body: { error: "Test webhook failed" } },
      error_classification: 'test_webhook_error'
    });
    
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
