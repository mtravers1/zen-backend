import { Router } from "express";
import plaidController from "../controllers/plaid.controller.js";
import platformDetection from "../middlewares/platformDetection.js";
import plaidService from "../services/plaid.service.js";

const router = Router();

router.post("/access", plaidController.createLinkToken);
router.post("/public-token", plaidController.getPublicToken);
router.post("/access-token", plaidController.getAccessToken);
router.post("/repair-token", plaidController.repairAccessToken);
router.get("/accounts", plaidController.getAccounts);
router.post("/save-token", platformDetection, plaidController.saveAccessToken);
router.post("/check-institution-limit", plaidController.checkInstitutionLimit);
router.get("/institutions-connected", plaidController.getConnectedInstitutions);
router.get(
  "/upfront-institution-status",
  plaidController.getUpfrontInstitutionStatus
);
router.post(
  "/institution-update-token",
  plaidController.getInstitutionUpdateToken
);
router.post("/balance", plaidController.getBalance);
router.get("/institutions", plaidController.getInstitutions);
router.get("/transactions", plaidController.getTransactions);
router.get("/detect-internal", plaidController.detectInternalTransfers);

// Diagnostic endpoint for access tokens
router.get("/diagnostics", async (req, res) => {
  try {
    console.log("[PLAID Router] 🔍 GET /diagnostics route hit");

    const diagnostics = await plaidService.getAccessTokenDiagnostics();

    return res.status(200).json({
      status: "success",
      message: "Plaid access token diagnostics retrieved",
      diagnostics,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[PLAID Router] Error getting diagnostics:", error);

    return res.status(500).json({
      status: "error",
      message: "Failed to get Plaid diagnostics",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Repair endpoint for access tokens
router.post("/repair", async (req, res) => {
  try {
    console.log("[PLAID Router] 🔧 POST /repair route hit");

    const repairResult = await plaidService.validateAndRepairAccessTokens();

    return res.status(200).json({
      status: "success",
      message: "Plaid access token repair completed",
      repairResult,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[PLAID Router] Error repairing access tokens:", error);

    return res.status(500).json({
      status: "error",
      message: "Failed to repair Plaid access tokens",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
