import { Router } from "express";
import staffController from "../controllers/staff.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

router.get("/roles", staffController.getRoles);
router.get("/", staffController.getStaffMembers);
router.get("/:id", staffController.getStaffMember);
router.post("/", staffController.createStaffMember);
router.put("/:id", staffController.updateStaffMember);
router.patch("/:id", staffController.updateStaffMember);
router.delete("/:id", checkStaffRole("director"), staffController.deleteStaffMember);

export default router;
