import { Router } from "express";
import recurringInvoicesController from "../controllers/recurringInvoices.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

router.get("/", recurringInvoicesController.getAll);
router.get("/:id", recurringInvoicesController.getOne);
router.post("/", recurringInvoicesController.create);
router.put("/:id", recurringInvoicesController.update);
router.patch("/:id", recurringInvoicesController.update);
router.delete("/:id", checkStaffRole("account_manager"), recurringInvoicesController.remove);

export default router;
