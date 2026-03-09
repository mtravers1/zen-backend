import { Router } from "express";
import jobsController from "../controllers/jobs.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

router.get("/", jobsController.getJobs);
router.get("/:id", jobsController.getJob);
router.post("/", jobsController.createJob);
router.put("/:id", jobsController.updateJob);
router.patch("/:id", jobsController.updateJob);
router.delete("/:id", checkStaffRole("account_manager"), jobsController.deleteJob);

export default router;
