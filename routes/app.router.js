import { Router } from "express";

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

// health and info
router.get(["/api/info", "/api/health"], (req, res) => {
	res.status(200).json({
		message: "Zentavos API",
		version: process.env.VERSION,
		status: "running",
		timestamp: new Date().toISOString(),
	});
});

// GET App Version
router.get(["/api/version", "/api/_info/version"], (req, res) => {
	res.status(200).send(process.env.VERSION);
});

export default router;
