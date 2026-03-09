import { Router } from "express";
import firmServicesController from "../controllers/firmServices.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

// Firm service catalog
router.get("/", firmServicesController.getFirmServices);
router.get("/:id", firmServicesController.getFirmService);
router.post("/", checkStaffRole("account_manager"), firmServicesController.createFirmService);
router.put("/:id", checkStaffRole("account_manager"), firmServicesController.updateFirmService);
router.patch("/:id", checkStaffRole("account_manager"), firmServicesController.updateFirmService);
router.delete("/:id", checkStaffRole("director"), firmServicesController.deleteFirmService);

// Client service subscriptions (nested under /firm-services/client-subscriptions)
router.get("/client-subscriptions/list", firmServicesController.getClientServices);
router.post("/client-subscriptions", firmServicesController.assignClientService);
router.patch("/client-subscriptions/:id", firmServicesController.updateClientService);

export default router;
