import { Router } from "express";
import tasksController from "../controllers/tasks.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

router.get("/", tasksController.getTasks);
router.get("/:id", tasksController.getTask);
router.post("/", tasksController.createTask);
router.put("/:id", tasksController.updateTask);
router.patch("/:id", tasksController.updateTask);
router.delete("/:id", tasksController.deleteTask);

export default router;
