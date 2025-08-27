import { Router } from "express";
import accountsController from "../controllers/accounts.controller.js";

const router = Router();

router.get("/debug/:profileId", accountsController.debugProfile);
router.get("/debug-decrypt/:profileId", accountsController.debugDecryption);
router.get("/debug-cache", accountsController.debugCache);
router.post("/add-account", accountsController.addAccount);
router.post("/", accountsController.getAccounts);
router.post("/cash-flows", accountsController.getCashFlows);
router.post("/cash-flows-weekly", accountsController.getCashFlowsWeekly);
router.post("/cash-flows-by-plaidaccount", accountsController.getCashFlowsByPlaidAccount);
router.get(
  "/profile-transactions/:profileId",
  accountsController.getProfileTransactions
);
router.get("/transactions", accountsController.getUserTransactions);
router.get(
  "/transactions/:accountId",
  accountsController.getTransactionsByAccount
);
router.get("/details/:accountId/:profileId", accountsController.getAccountDetails);
router.get("/", accountsController.getAllUserAccounts);
router.post("/add-photo", accountsController.addAccountPhoto);
router.post("/get-photo", accountsController.getAccountPhoto);
router.get("/photo/:fileName", accountsController.serveAccountPhoto);
router.delete("/:accountId", accountsController.deleteAccount);

// Cache management endpoints
router.get('/cache/stats', accountsController.getCacheStats);
router.post('/cache/clear', accountsController.clearAllCaches);
router.post('/cache/clear-decryption', accountsController.clearDecryptionCache);

export default router;
