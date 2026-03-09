import { Router } from "express";
import firmPaymentsController from "../controllers/firmPayments.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

router.get("/", firmPaymentsController.getPayments);
router.get("/:id", firmPaymentsController.getPayment);
router.post("/", firmPaymentsController.createPayment);
router.put("/:id", firmPaymentsController.updatePayment);
router.patch("/:id", firmPaymentsController.updatePayment);
router.delete("/:id", checkStaffRole("account_manager"), firmPaymentsController.deletePayment);

export default router;
