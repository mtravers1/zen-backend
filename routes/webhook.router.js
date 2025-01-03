import { Router } from "express";
import webhookController from "../controllers/webhook.controller.js";

const router = Router();

router.post("/plaid", webhookController.plaidWebhook);

export default router;
