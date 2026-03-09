import { Router } from "express";
import notificationsController from "../controllers/notifications.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

router.get("/", notificationsController.getNotifications);
router.post("/mark-read", notificationsController.markRead);
router.post("/", checkStaffRole("account_manager"), notificationsController.createNotification);
router.delete("/:id", notificationsController.deleteNotification);

export default router;
