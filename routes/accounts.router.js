import { Router } from "express";
import accountsController from "../controllers/accounts.controller.js";
import transactionsController from "../controllers/transactions.controller.js";
import cashflowController from "../controllers/cashflow.controller.js";

const router = Router();

// Accounts routes
router.post("/add-account", accountsController.addAccount);
router.post("/", accountsController.getAccounts);
router.get("/details/:accountId/:profileId", accountsController.getAccountDetails);
router.get("/", accountsController.getAllUserAccounts);
router.post("/add-photo", accountsController.addAccountPhoto);
router.post("/get-photo", accountsController.getAccountPhoto);
router.get("/photo/:fileName", accountsController.serveAccountPhoto);
router.delete("/:accountId", accountsController.deletePlaidAccount);

// Transactions routes
router.get("/transactions", transactionsController.getUserTransactions);
router.get("/transactions/:accountId", transactionsController.getTransactionsByAccount);
router.get("/profile-transactions/:profileId", transactionsController.getProfileTransactions);

// Cashflow routes
router.post("/cash-flows", cashflowController.getCashFlows);
router.post("/cash-flows-weekly", cashflowController.getCashFlowsWeekly);
router.post("/cash-flows-by-plaidaccount", cashflowController.getCashFlowsByPlaidAccount);

export default router;