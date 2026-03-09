import { Router } from "express";
import reportsController from "../controllers/reports.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

router.get("/insights", reportsController.getInsights);
router.get("/", reportsController.getReports);
router.get("/:id", reportsController.getReport);
router.post("/", reportsController.createReport);
router.put("/:id", reportsController.updateReport);
router.patch("/:id", reportsController.updateReport);
router.delete("/:id", checkStaffRole("account_manager"), reportsController.deleteReport);

export default router;
