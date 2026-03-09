import { Router } from "express";
import templatesController from "../controllers/templates.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

router.get("/", templatesController.getTemplates);
router.get("/:id", templatesController.getTemplate);
router.post("/", templatesController.createTemplate);
router.put("/:id", templatesController.updateTemplate);
router.patch("/:id", templatesController.updateTemplate);
router.delete("/:id", checkStaffRole("account_manager"), templatesController.deleteTemplate);

export default router;
