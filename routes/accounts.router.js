import { Router } from "express";
import accountsController from "../controllers/accounts.controller.js";

const router = Router();

router.post("/add-account", accountsController.addAccount);
router.post("/", accountsController.getAccounts);
router.post("/cash-flows", accountsController.getCashFlows);
router.get(
  "/profile-transactions/:profileId",
  accountsController.getProfileTransactions
);
router.get("/transactions", accountsController.getUserTransactions);
router.get(
  "/transactions/:accountId",
  accountsController.getTransactionsByAccount
);
router.get("/", accountsController.getAllUserAccounts);
router.post("/add-photo", accountsController.addAccountPhoto);
router.post("/get-photo", accountsController.getAccountPhoto);

export default router;
