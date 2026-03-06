import { Router } from "express";
import documentsController from "../controllers/documents.controller.js";

const router = Router();

router.get("/", documentsController.getDocuments);
router.post("/", documentsController.createDocument);
router.get("/:documentId", documentsController.getDocument);
router.patch("/:documentId", documentsController.updateDocument);
router.patch("/:documentId/archive", documentsController.archiveDocument);
router.delete("/:documentId", documentsController.deleteDocument);

export default router;
