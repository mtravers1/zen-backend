import { Router } from "express";
import controller from "../controllers/accounts.controller.js";

const router = Router();

router.get("/debug/:profileId", controller.debugProfile);
router.get("/debug-decrypt/:profileId", controller.debugDecryption);
router.get("/debug-cache", controller.debugCache);
router.get("/debug-encryption/:uid", controller.debugEncryption);
router.post("/add-account", controller.addAccount);
router.post("/", controller.getAccounts);
router.post("/cash-flows", controller.getCashFlows);
router.post("/cash-flows-weekly", controller.getCashFlowsWeekly);
router.post("/cash-flows-by-plaidaccount", controller.getCashFlowsByPlaidAccount);
router.get(
  "/profile-transactions/:profileId",
  controller.getProfileTransactions
);
router.get("/transactions", controller.getUserTransactions);
router.get(
  "/transactions/:accountId",
  controller.getTransactionsByAccount
);
router.get("/details/:accountId/:profileId", controller.getAccountDetails);
router.get("/", controller.getAllUserAccounts);
router.post("/add-photo", controller.addAccountPhoto);
router.post("/get-photo", controller.getAccountPhoto);
router.get("/photo/:fileName", controller.serveAccountPhoto);
router.delete("/:accountId", controller.deleteAccount);

// Cache management endpoints
router.get('/cache/stats', controller.getCacheStats);
router.post('/cache/clear', controller.clearAllCaches);
router.post('/cache/clear-decryption', controller.clearDecryptionCache);

export default router;
