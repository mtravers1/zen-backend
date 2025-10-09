import { Router } from "express";
import {
  getSecurityStats,
  blacklistIP,
  removeFromBlacklist,
  clearDevelopmentBlacklist,
} from "../middlewares/routeValidation.js";

const router = Router();

/**
 * GET /security/stats
 * Returns security statistics
 */
router.get("/stats", (req, res) => {
  try {
    const stats = getSecurityStats();
    res.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting security statistics:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

/**
 * POST /security/blacklist
 * Adds an IP to blacklist
 */
router.post("/blacklist", (req, res) => {
  try {
    const { ip, duration } = req.body;

    if (!ip) {
      return res.status(400).json({
        success: false,
        error: "IP address is required",
      });
    }

    // Basic IP validation
    const ipRegex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipRegex.test(ip)) {
      return res.status(400).json({
        success: false,
        error: "Invalid IP address format",
      });
    }

    blacklistIP(ip, duration);

    res.json({
      success: true,
      message: `IP ${ip} added to blacklist`,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error adding IP to blacklist:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

/**
 * DELETE /security/blacklist/:ip
 * Removes an IP from blacklist
 */
router.delete("/blacklist/:ip", (req, res) => {
  try {
    const { ip } = req.params;

    const removed = removeFromBlacklist(ip);

    if (removed) {
      res.json({
        success: true,
        message: `IP ${ip} removed from blacklist`,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(404).json({
        success: false,
        error: `IP ${ip} not found in blacklist`,
      });
    }
  } catch (error) {
    console.error("Error removing IP from blacklist:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

/**
 * POST /security/emergency-stop
 * For emergencies - blocks all suspicious IPs immediately
 */
router.post("/emergency-stop", (req, res) => {
  try {
    const { reason } = req.body;

    console.warn(`🚨 EMERGENCY STOP ACTIVATED: ${reason || "Not specified"}`);
    console.warn(`🚨 Timestamp: ${new Date().toISOString()}`);
    console.warn(`🚨 Activated by: ${req.user?.email || "System"}`);

    // Here you can implement additional emergency logic
    // Like blocking all unauthorized IPs, etc.

    res.json({
      success: true,
      message: "Emergency stop activated",
      timestamp: new Date().toISOString(),
      reason: reason || "Not specified",
    });
  } catch (error) {
    console.error("Error in emergency stop:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

/**
 * POST /security/clear-dev-blacklist
 * Clears blacklist for development IPs (localhost, etc.)
 */
router.post("/clear-dev-blacklist", (req, res) => {
  try {
    const cleared = clearDevelopmentBlacklist();

    res.json({
      success: true,
      message: `Cleared ${cleared} development IPs from blacklist`,
      clearedCount: cleared,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error clearing development blacklist:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

export default router;
