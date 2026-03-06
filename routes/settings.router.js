import { Router } from "express";
import {
  getFirmSettings, updateFirmSettings,
  getTeamMembers,
  getIntegrations, updateIntegration,
  getBillingSettings, updateBillingSettings,
  getClientPortalSettings, updateClientPortalSettings,
} from "../controllers/settings.controller.js";

const router = Router();

// Firm settings
router.get("/firm", getFirmSettings);
router.patch("/firm", updateFirmSettings);

// Team
router.get("/team", getTeamMembers);

// Integrations
router.get("/integrations", getIntegrations);
router.patch("/integrations", updateIntegration);

// Billing settings
router.get("/billing", getBillingSettings);
router.patch("/billing", updateBillingSettings);

// Client portal / signup
router.get("/client-portal", getClientPortalSettings);
router.patch("/client-portal", updateClientPortalSettings);

export default router;
