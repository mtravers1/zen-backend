import { Router } from "express";
import webhookController from "../controllers/webhook.controller.js";

const router = Router();

router.post("/plaid", webhookController.plaidWebhook);
router.post("/test", webhookController.testWebhook);

export default router;
