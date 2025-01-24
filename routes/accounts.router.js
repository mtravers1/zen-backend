import { Router } from "express";
import accountsController from "../controllers/accounts.controller.js";

const router = Router();

router.post("/add-account", accountsController.addAccount);
router.get("/", accountsController.getAccounts);
router.get("/cash-flows", accountsController.getCashFlows);
router.get("/transactions", accountsController.getUserTransactions);
router.get(
  "/transactions/:accountId",
  accountsController.getTransactionsByAccount
);

export default router;
