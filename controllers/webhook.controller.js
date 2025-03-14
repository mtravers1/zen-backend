import e from "express";
import webhookService from "../services/webhook.service.js";
import webTokenDecoder from "../lib/webTokenDecoder.js";

const plaidWebhook = async (req, res) => {
  try {
    const event = req.body;
    const authorization = req.headers["plaid-verification"];
    console.log(authorization);
    webhookService.verifyPlaidToken(authorization, event);
    webhookService.webhookHandler(event);
    return res.status(200).send("Webhook received");
  } catch (error) {
    return res.status(500).send("Webhook error");
  }
};

const testWebhook = async (req, res) => {
  const { email } = req.user;
  const response = webhookService.testWebhook(email);
  return res.status(200).send("test webhook");
};

const webhookController = {
  plaidWebhook,
  testWebhook,
};

export default webhookController;
