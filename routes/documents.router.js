import { Router } from "express";
import {
  listDocuments, getDocumentById, createDocument, updateDocument, deleteDocument,
  listOrganizers, listClientDocuments,
} from "../controllers/documents.controller.js";

const router = Router();

router.get("/organizers", listOrganizers);
router.get("/client/:clientId", listClientDocuments);
router.get("/", listDocuments);
router.get("/:id", getDocumentById);
router.post("/", createDocument);
router.patch("/:id", updateDocument);
router.delete("/:id", deleteDocument);

export default router;
