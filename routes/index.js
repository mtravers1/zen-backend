import { Router } from "express";
import authRouter from "./auth.router.js";
import plaidRouter from "./plaid.router.js";
import webhookRouter from "./webhook.router.js";
import accountRouter from "./accounts.router.js";
import businessRouter from "./businesses.router.js";
import assetsRouter from "./assets.router.js";
import permissionsRouter from "./permissions.router.js";
import tripRoutes from "./trips.router.js";
import filesRouter from "./files.router.js";
import aiRouter from "./ai.router.js";
import paymentsRouter from "./payments.router.js";
import subscriptionsRouter from "./subscriptions.router.js";
import roleRouter from "./role.router.js";
import securityRouter from "./security.router.js";
import usersRouter from "./users.router.js";


const router = Router();

// Load different routes
router.use("/auth", authRouter);
router.use("/plaid", plaidRouter);
router.use("/webhook", webhookRouter);
router.use("/account", accountRouter);
router.use("/business", businessRouter);
router.use("/assets", assetsRouter);
router.use("/permissions", permissionsRouter);
router.use("/trips", tripRoutes);
router.use("/files", filesRouter);
router.use("/ai", aiRouter);
router.use("/payments", paymentsRouter);
router.use("/subscriptions", subscriptionsRouter);
router.use("/role", roleRouter);
router.use("/security", securityRouter);
router.use("/users", usersRouter);

export default router;
