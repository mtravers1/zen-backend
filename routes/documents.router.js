import { Router } from "express";
import documentsController from "../controllers/documents.controller.js";
import checkStaffRole from "../middlewares/checkStaffRole.js";

const router = Router();

router.use(checkStaffRole("executive_assistant"));

router.get("/", documentsController.getDocuments);
router.get("/:id", documentsController.getDocument);
router.post("/", documentsController.createDocument);
router.put("/:id", documentsController.updateDocument);
router.patch("/:id", documentsController.updateDocument);
router.delete("/:id", documentsController.deleteDocument);

export default router;
