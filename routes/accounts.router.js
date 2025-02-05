import { Router } from "express";
import accountsController from "../controllers/accounts.controller.js";

const router = Router();

router.post("/add-account", accountsController.addAccount);
router.post("/", accountsController.getAccounts);
router.post("/cash-flows", accountsController.getCashFlows);
router.get("/transactions", accountsController.getUserTransactions);
router.get(
  "/transactions/:accountId",
  accountsController.getTransactionsByAccount
);
router.get("/", accountsController.getAllUserAccounts);

export default router;
