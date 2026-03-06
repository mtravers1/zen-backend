import { Router } from "express";
import clientsController from "../controllers/clients.controller.js";

const router = Router();

// ─── Clients ──────────────────────────────────────────────────────────────────
router.get("/", clientsController.getClients);
router.post("/", clientsController.createClient);
router.get("/:clientId", clientsController.getClient);
router.patch("/:clientId", clientsController.updateClient);
router.delete("/:clientId", clientsController.deleteClient);

// ─── Contacts (nested under clients) ─────────────────────────────────────────
router.get("/contacts/list", clientsController.getContacts);
router.post("/contacts", clientsController.createContact);
router.patch("/contacts/:contactId", clientsController.updateContact);
router.delete("/contacts/:contactId", clientsController.deleteContact);

export default router;
