import { Router } from "express";
import accountsController from "../controllers/accounts.controller.js";

const router = Router();

router.post("/add-account", accountsController.addAccount);
router.get("/", accountsController.getAccounts);
router.get("/cash-flows", accountsController.getCashFlows);

export default router;
