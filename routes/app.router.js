import { Router } from "express";
import appController from "../controllers/app.controller.js";

const router = Router();

// robots.txt for to prevent from indexing
router.get("/robots.txt", (req, res) => {
	res.type("text/plain");
	res.send("User-agent: *\nDisallow: /");
});

// Add favicon route to avoid 401 errors
router.get("/favicon.ico", (req, res) => {
	res.status(204).end(); // No content for favicon
});

// Add root route to avoid 401 errors
router.get("/api/info", (req, res) => {
	res.status(200).json({
		message: "Zentavos API",
		version: process.env.VERSION || "1.0.1",
		status: "running",
		timestamp: new Date().toISOString(),
	});
});

// GET App Version
router.get("/api/version", appController.getAppVersion);
router.get("/api/_info/version", appController.getAppVersion);

// Health check
router.get("/api/health", (req, res) => {
	res.type("application/json");
	res.send({ status: "OK" });
});

export default router;
