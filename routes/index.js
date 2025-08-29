import express from "express";
import authRouter from "./auth.router.js";
import usersRouter from "./users.router.js";
import businessesRouter from "./businesses.router.js";
import accountsRouter from "./accounts.router.js";
import paymentsRouter from "./payments.router.js";
import tripsRouter from "./trips.router.js";
import assetsRouter from "./assets.router.js";
import permissionsRouter from "./permissions.router.js";
import rolesRouter from "./roles.router.js";
import filesRouter from "./files.router.js";
import webhookRouter from "./webhook.router.js";
import aiRouter from "./ai.router.js";
import appRouter from "./app.router.js";
import plaidRouter from "./plaid.router.js";

const router = express.Router();

// Health check endpoint
router.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.ENVIRONMENT || "prod"
  });
});

// Encryption system health endpoint
router.get("/encryption/health", async (req, res) => {
  try {
    const { analyzeDecryptionFailures } = await import('../database/encryption.js');
    
    // Get the user ID from query params or use a default for system-wide check
    const uid = req.query.uid;
    
    if (uid) {
      // Check specific user
      const analysis = await analyzeDecryptionFailures(uid);
      res.json({
        status: "success",
        user: uid,
        analysis,
        timestamp: new Date().toISOString()
      });
    } else {
      // System-wide status
      res.json({
        status: "success",
        message: "Encryption system monitoring endpoint",
        note: "Use ?uid=<user_id> to check specific user encryption health",
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error("Encryption health check failed:", error);
    res.status(500).json({
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Emergency key regeneration endpoint (admin only)
router.post("/encryption/regenerate/:uid", async (req, res) => {
  try {
    const { emergencyKeyRegeneration } = await import('../database/encryption.js');
    const { uid } = req.params;
    
    // TODO: Add admin authentication middleware here
    
    console.log(`Emergency key regeneration requested for user: ${uid}`);
    const result = await emergencyKeyRegeneration(uid);
    
    if (result.success) {
      res.json({
        status: "success",
        message: "Keys regenerated successfully",
        user: uid,
        newVersion: result.newVersion,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(500).json({
        status: "error",
        message: "Key regeneration failed",
        user: uid,
        error: result.error,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error("Emergency key regeneration failed:", error);
    res.status(500).json({
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API routes
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/businesses", businessesRouter);
router.use("/accounts", accountsRouter);
router.use("/payments", paymentsRouter);
router.use("/trips", tripsRouter);
router.use("/assets", assetsRouter);
router.use("/permissions", permissionsRouter);
router.use("/roles", rolesRouter);
router.use("/files", filesRouter);
router.use("/webhook", webhookRouter);
router.use("/ai", aiRouter);
router.use("/app", appRouter);
router.use("/plaid", plaidRouter);

export default router;
