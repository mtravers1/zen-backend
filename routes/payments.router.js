import { Router } from "express";
import paymentsController from "../controllers/payments.controller.js";

const router = Router();

router.post("/very-receipt", paymentsController.verifyReceipts);
router.post("/webhook/android", paymentsController.weebhookAndroid);
router.post("/webhook/apple", paymentsController.weebhookApple);
router.post("/update-user-uuid", paymentsController.updateUserUUID);

export default router;
