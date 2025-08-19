import { Router } from "express";
import aiController from "../controllers/ai.controller.js";

const router = Router();

console.log("[AI Router] 🔧 Setting up AI routes");
console.log("[AI Router] aiController methods available:", Object.keys(aiController));

router.post("/", (req, res, next) => {
  console.log("[AI Router] 📥 POST / route hit");
  console.log("[AI Router] Request URL:", req.url);
  console.log("[AI Router] Request method:", req.method);
  return aiController.makeRequest(req, res, next);
});

router.get("/stream", (req, res, next) => {
  console.log("[AI Router] 📡 GET /stream route hit");
  return aiController.stream(req, res, next);
});

router.get("/test", (req, res, next) => {
  console.log("[AI Router] 🧪 GET /test route hit");
  return aiController.test(req, res, next);
});

export default router;
