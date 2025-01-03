import webhookService from "../services/webhook.service.js";

const plaidWebhook = async (req, res) => {
  const event = req.body;
  const response = webhookService.webhookHandler(event);
  return res.status(200).send("Webhook received");
};

const webhookController = {
  plaidWebhook,
};

export default webhookController;
