import { Router } from "express";
import pipelinesController from "../controllers/pipelines.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

router.get("/", pipelinesController.getPipelines);
router.get("/:id", pipelinesController.getPipeline);
router.post("/", checkStaffRole("account_manager"), pipelinesController.createPipeline);
router.put("/:id", checkStaffRole("account_manager"), pipelinesController.updatePipeline);
router.patch("/:id", checkStaffRole("account_manager"), pipelinesController.updatePipeline);
router.delete("/:id", checkStaffRole("director"), pipelinesController.deletePipeline);

export default router;
