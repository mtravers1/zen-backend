import { Router } from "express";
import plaidController from "../controllers/plaid.controller.js";
import platformDetection from "../middlewares/platformDetection.js";

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
  plaidController.getUpfrontInstitutionStatus,
);
router.post(
  "/institution-update-token",
  plaidController.getInstitutionUpdateToken,
);
router.post("/balance", plaidController.getBalance);
router.get("/institutions", plaidController.getInstitutions);
router.get("/transactions", plaidController.getTransactions);
router.get("/detect-internal", plaidController.detectInternalTransfers);
router.post("/link-token-for-update", plaidController.getLinkTokenForUpdate);

export default router;
