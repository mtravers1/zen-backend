import { Router } from "express";
import activitiesController from "../controllers/activities.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

router.get("/", activitiesController.getActivities);
router.post("/", activitiesController.createActivity);

export default router;
