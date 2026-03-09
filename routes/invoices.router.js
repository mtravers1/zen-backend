import { Router } from "express";
import invoicesController from "../controllers/invoices.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

router.get("/", invoicesController.getInvoices);
router.get("/:id", invoicesController.getInvoice);
router.post("/", invoicesController.createInvoice);
router.put("/:id", invoicesController.updateInvoice);
router.patch("/:id", invoicesController.updateInvoice);
router.delete("/:id", checkStaffRole("account_manager"), invoicesController.deleteInvoice);

export default router;
