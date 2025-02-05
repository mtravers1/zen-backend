import { Router } from "express";
import infoRouter from "./app.router.js";
import authRouter from "./auth.router.js";
import plaidRouter from "./plaid.router.js";
import webhookRouter from "./webhook.router.js";
import accountRouter from "./accounts.router.js";
import businessRouter from "./businesses.router.js";

const router = Router();

// Load different routes

router.use("/_info", infoRouter);
router.use("/auth", authRouter);
router.use("/plaid", plaidRouter);
router.use("/webhook", webhookRouter);
router.use("/account", accountRouter);
router.use("/business", businessRouter);

// router.use('/users', require('./users.router'));
// router.use('/roles', require('./roles.router'));

export default router;
