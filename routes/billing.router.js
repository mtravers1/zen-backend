import { Router } from "express";
import invoicesController from "../controllers/invoices.controller.js";
import {
  listPayments, getPaymentById, createPayment, updatePayment, deletePayment,
  listProposals, getProposalById, createProposal, updateProposal, acceptProposal, convertProposalToInvoice, deleteProposal,
  listTimeEntries, createTimeEntry, updateTimeEntry, deleteTimeEntry,
  listRecurringInvoices, createRecurringInvoice, updateRecurringInvoice, deleteRecurringInvoice,
  getWIP,
} from "../controllers/billing.controller.js";

const router = Router();

// ── Invoices ───────────────────────────────────────────────────
router.get("/invoices/stats", invoicesController.getInvoiceStats);
router.get("/invoices", invoicesController.listInvoices);
router.get("/invoices/:id", invoicesController.getInvoiceById);
router.post("/invoices", invoicesController.createInvoice);
router.patch("/invoices/:id", invoicesController.updateInvoice);
router.post("/invoices/:id/send", invoicesController.sendInvoice);
router.post("/invoices/:id/record-payment", invoicesController.recordPayment);
router.delete("/invoices/:id", invoicesController.deleteInvoice);

// ── Payments ───────────────────────────────────────────────────
router.get("/payments", listPayments);
router.get("/payments/:id", getPaymentById);
router.post("/payments", createPayment);
router.patch("/payments/:id", updatePayment);
router.delete("/payments/:id", deletePayment);

// ── Proposals ──────────────────────────────────────────────────
router.get("/proposals", listProposals);
router.get("/proposals/:id", getProposalById);
router.post("/proposals", createProposal);
router.patch("/proposals/:id", updateProposal);
router.post("/proposals/:id/accept", acceptProposal);
router.post("/proposals/:id/convert", convertProposalToInvoice);
router.delete("/proposals/:id", deleteProposal);

// ── Time Entries ───────────────────────────────────────────────
router.get("/time-entries", listTimeEntries);
router.post("/time-entries", createTimeEntry);
router.patch("/time-entries/:id", updateTimeEntry);
router.delete("/time-entries/:id", deleteTimeEntry);

// ── Recurring Invoices ─────────────────────────────────────────
router.get("/recurring", listRecurringInvoices);
router.post("/recurring", createRecurringInvoice);
router.patch("/recurring/:id", updateRecurringInvoice);
router.delete("/recurring/:id", deleteRecurringInvoice);

// ── WIP ────────────────────────────────────────────────────────
router.get("/wip", getWIP);

export default router;
