import { Router } from "express";
import paymentsController from "../controllers/payments.controller.js";
import environmentCheck from "../middlewares/environmentCheck.js";

const router = Router();

router.post("/very-receipt", paymentsController.verifyReceipts);
router.post("/webhook/android", paymentsController.weebhookAndroid);
router.post("/webhook/apple", paymentsController.weebhookApple);
router.post("/update-user-uuid", paymentsController.updateUserUUID);
router.post("/mock-upgrade", environmentCheck(['dev', 'development', 'staging']), paymentsController.mockUpgrade);

export default router;
