import { Router } from "express";
import {
  getDashboardOverview,
  getRevenueReport,
  getLeadFunnelReport,
  getTimeTrackingReport,
  listReports, getReportById, createReport, updateReport, deleteReport,
  listAlerts, createAlert, updateAlert, deleteAlert,
  getActivityFeed,
} from "../controllers/reporting.controller.js";

const router = Router();

// ── Dashboard overview ─────────────────────────────────────────
router.get("/overview", getDashboardOverview);

// ── Pre-built reports ──────────────────────────────────────────
router.get("/revenue", getRevenueReport);
router.get("/lead-funnel", getLeadFunnelReport);
router.get("/time-tracking", getTimeTrackingReport);

// ── Saved reports ──────────────────────────────────────────────
router.get("/reports", listReports);
router.get("/reports/:id", getReportById);
router.post("/reports", createReport);
router.patch("/reports/:id", updateReport);
router.delete("/reports/:id", deleteReport);

// ── Alerts ─────────────────────────────────────────────────────
router.get("/alerts", listAlerts);
router.post("/alerts", createAlert);
router.patch("/alerts/:id", updateAlert);
router.delete("/alerts/:id", deleteAlert);

// ── Activity feed ──────────────────────────────────────────────
router.get("/activity", getActivityFeed);

export default router;
