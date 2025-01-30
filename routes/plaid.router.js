import { Router } from "express";
import plaidController from "../controllers/plaid.controller.js";

const router = Router();

router.post("/access", plaidController.createLinkToken);
router.post("/public-token", plaidController.getPublicToken);
router.post("/access-token", plaidController.getAccessToken);
router.get("/accounts", plaidController.getAccounts);
router.post("/save-token", plaidController.saveAccessToken);
router.post("/balance", plaidController.getBalance);
router.get("/institutions", plaidController.getInstitutions);
router.get("/transactions", plaidController.getTransactions);
router.get("/detect-internal", plaidController.detectInternalTransfers);

export default router;
