import { Router } from "express";

// ── Existing mobile-app routes ─────────────────────────────────────────────
import authRouter from "./auth.router.js";
import plaidRouter from "./plaid.router.js";
import webhookRouter from "./webhook.router.js";
import accountRouter from "./accounts.router.js";
import businessRouter from "./businesses.router.js";
import assetsRouter from "./assets.router.js";
import permissionsRouter from "./permissions.router.js";
import tripRoutes from "./trips.router.js";
import filesRouter from "./files.router.js";
import aiRouter from "./ai.router.js";
import paymentsRouter from "./payments.router.js";
import subscriptionsRouter from "./subscriptions.router.js";
import roleRouter from "./role.router.js";
import securityRouter from "./security.router.js";
import usersRouter from "./users.router.js";

// ── Dashboard / web-portal routes ─────────────────────────────────────────
import clientsRouter from "./clients.router.js";
import contactsRouter from "./contacts.router.js";
import invoicesRouter from "./invoices.router.js";
import firmPaymentsRouter from "./firmPayments.router.js";
import timeEntriesRouter from "./timeEntries.router.js";
import recurringInvoicesRouter from "./recurringInvoices.router.js";
import proposalsRouter from "./proposals.router.js";
import jobsRouter from "./jobs.router.js";
import pipelinesRouter from "./pipelines.router.js";
import tasksRouter from "./tasks.router.js";
import messagesRouter from "./messages.router.js";
import activitiesRouter from "./activities.router.js";
import templatesRouter from "./templates.router.js";
import reportsRouter from "./reports.router.js";
import offersRouter from "./offers.router.js";
import notificationsRouter from "./notifications.router.js";
import firmServicesRouter from "./firmServices.router.js";
import documentsRouter from "./documents.router.js";
import staffRouter from "./staff.router.js";
import staffAuthRouter from "./staff.auth.router.js";

const router = Router();

// ── Mobile-app routes ──────────────────────────────────────────────────────
router.use("/auth", authRouter);
router.use("/plaid", plaidRouter);
router.use("/webhook", webhookRouter);
router.use("/account", accountRouter);
router.use("/business", businessRouter);
router.use("/assets", assetsRouter);
router.use("/permissions", permissionsRouter);
router.use("/trips", tripRoutes);
router.use("/files", filesRouter);
router.use("/ai", aiRouter);
router.use("/payments", paymentsRouter);
router.use("/subscriptions", subscriptionsRouter);
router.use("/role", roleRouter);
router.use("/security", securityRouter);
router.use("/users", usersRouter);

// ── Dashboard routes (require staffRole) ──────────────────────────────────
router.use("/clients", clientsRouter);
router.use("/contacts", contactsRouter);
router.use("/invoices", invoicesRouter);
router.use("/firm-payments", firmPaymentsRouter);
router.use("/time-entries", timeEntriesRouter);
router.use("/recurring-invoices", recurringInvoicesRouter);
router.use("/proposals", proposalsRouter);
router.use("/jobs", jobsRouter);
router.use("/pipelines", pipelinesRouter);
router.use("/tasks-dashboard", tasksRouter);
router.use("/messages-dashboard", messagesRouter);
router.use("/activities", activitiesRouter);
router.use("/templates", templatesRouter);
router.use("/reports", reportsRouter);
router.use("/offers", offersRouter);
router.use("/notifications", notificationsRouter);
router.use("/firm-services", firmServicesRouter);
router.use("/documents-dashboard", documentsRouter);
router.use("/staff", staffRouter);
router.use("/staff-auth", staffAuthRouter);

export default router;
