import { Router } from "express";
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

// ── New feature routers ──────────────────────────────────────────
import crmRouter from "./crm.router.js";
import billingRouter from "./billing.router.js";
import workflowRouter from "./workflow.router.js";
import documentsRouter from "./documents.router.js";
import templatesRouter from "./templates.router.js";
import settingsRouter from "./settings.router.js";
import communicationsRouter from "./communications.router.js";
import reportingRouter from "./reporting.router.js";
import insightsRouter from "./insights.router.js";
import adminRouter from "./admin.router.js";

const router = Router();

// ── Existing routes ──────────────────────────────────────────────
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

// ── CRM ──────────────────────────────────────────────────────────
router.use("/crm", crmRouter);

// ── Billing ──────────────────────────────────────────────────────
router.use("/billing", billingRouter);

// ── Workflow ─────────────────────────────────────────────────────
router.use("/workflow", workflowRouter);

// ── Documents ────────────────────────────────────────────────────
router.use("/documents", documentsRouter);

// ── Templates / Custom Fields / Tags / Services ──────────────────
router.use("/templates", templatesRouter);

// ── Settings ─────────────────────────────────────────────────────
router.use("/settings", settingsRouter);

// ── Communications (threads, messages, notifications) ────────────
router.use("/communications", communicationsRouter);

// ── Reporting & Analytics ─────────────────────────────────────────
router.use("/reporting", reportingRouter);

// ── Insights ─────────────────────────────────────────────────────
router.use("/insights", insightsRouter);

// ── Admin ─────────────────────────────────────────────────────────
router.use("/admin", adminRouter);

export default router;
