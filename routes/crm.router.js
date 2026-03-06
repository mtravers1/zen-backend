import { Router } from "express";
import leadsController from "../controllers/leads.controller.js";
import contactsController from "../controllers/contacts.controller.js";
import clientsController from "../controllers/clients.controller.js";

const router = Router();

// ── Leads ──────────────────────────────────────────────────────
router.get("/leads/stats", leadsController.getLeadStats);
router.get("/leads", leadsController.listLeads);
router.get("/leads/:id", leadsController.getLeadById);
router.post("/leads", leadsController.createLead);
router.patch("/leads/:id", leadsController.updateLead);
router.patch("/leads/:id/status", leadsController.updateLeadStatus);
router.post("/leads/:id/convert", leadsController.convertLead);
router.delete("/leads/:id", leadsController.deleteLead);

// ── Contacts ───────────────────────────────────────────────────
router.get("/contacts", contactsController.listContacts);
router.get("/contacts/:id", contactsController.getContactById);
router.post("/contacts", contactsController.createContact);
router.patch("/contacts/:id", contactsController.updateContact);
router.delete("/contacts/:id", contactsController.deleteContact);

// ── Clients ────────────────────────────────────────────────────
router.get("/clients/stats", clientsController.getClientStats);
router.get("/clients", clientsController.listClients);
router.get("/clients/:id", clientsController.getClientById);
router.get("/clients/:id/contacts", clientsController.getClientContacts);
router.post("/clients", clientsController.createClient);
router.patch("/clients/:id", clientsController.updateClient);
router.delete("/clients/:id", clientsController.deleteClient);

export default router;
