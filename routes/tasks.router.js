import { Router } from "express";
import tasksController from "../controllers/tasks.controller.js";

const router = Router();

router.get("/", tasksController.getTasks);
router.post("/", tasksController.createTask);
router.get("/:taskId", tasksController.getTask);
router.patch("/:taskId", tasksController.updateTask);
router.patch("/:taskId/complete", tasksController.completeTask);
router.delete("/:taskId", tasksController.deleteTask);

export default router;
