import { Router } from "express";
import {
  listTemplates, getTemplateById, createTemplate, updateTemplate, deleteTemplate,
  listCustomFields, createCustomField, updateCustomField, deleteCustomField,
  listTags, createTag, updateTag, deleteTag,
  listServices, createService, updateService, deleteService,
} from "../controllers/templates.controller.js";

const router = Router();

// ── Custom Fields (before /:id to avoid route conflict) ────────
router.get("/custom-fields", listCustomFields);
router.post("/custom-fields", createCustomField);
router.patch("/custom-fields/:id", updateCustomField);
router.delete("/custom-fields/:id", deleteCustomField);

// ── Tags ───────────────────────────────────────────────────────
router.get("/tags", listTags);
router.post("/tags", createTag);
router.patch("/tags/:id", updateTag);
router.delete("/tags/:id", deleteTag);

// ── Services ───────────────────────────────────────────────────
router.get("/services", listServices);
router.post("/services", createService);
router.patch("/services/:id", updateService);
router.delete("/services/:id", deleteService);

// ── Document/Job/Invoice Templates (/:id after named sub-routes) ─
router.get("/", listTemplates);
router.post("/", createTemplate);
router.get("/:id", getTemplateById);
router.patch("/:id", updateTemplate);
router.delete("/:id", deleteTemplate);

export default router;
