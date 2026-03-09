import { Router } from "express";
import timeEntriesController from "../controllers/timeEntries.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

router.get("/", timeEntriesController.getTimeEntries);
router.get("/:id", timeEntriesController.getTimeEntry);
router.post("/", timeEntriesController.createTimeEntry);
router.put("/:id", timeEntriesController.updateTimeEntry);
router.patch("/:id", timeEntriesController.updateTimeEntry);
router.delete("/:id", timeEntriesController.deleteTimeEntry);

export default router;
