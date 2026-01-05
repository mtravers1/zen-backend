import { Router } from "express";
import appController from "../controllers/app.controller.js";

const router = Router();

// GET App Version
router.get("/version", appController.getAppVersion);
router.get("/_info/version", appController.getAppVersion);

// Health check
router.get("/health", (req, res) => {
	res.type("application/json");
	res.send({ status: "OK" });
});

// robots.txt for to prevent from indexing
router.get("/robots.txt", (req, res) => {
	res.type("text/plain");
	res.send("User-agent: *\nDisallow: /");
});

export default router;
