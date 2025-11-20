import { Router } from "express";
import aiController from "../controllers/ai.controller.js";

const router = Router();

console.log("[AI Router] 🔧 Setting up AI routes");
console.log(
  "[AI Router] aiController methods available:",
  Object.keys(aiController),
);

// Main route for AI requests
router.post("/", (req, res, next) => {
  console.log("[AI Router] 📥 POST / route hit");
  console.log("[AI Router] Request URL:", req.url);
  console.log("[AI Router] Request method:", req.method);
  return aiController.makeRequest(req, res, next);
});

// Route for response streaming
router.get("/stream", (req, res, next) => {
  console.log("[AI Router] 📡 GET /stream route hit");
  return aiController.stream(req, res, next);
});

// Route for testing
router.post("/test", (req, res, next) => {
  console.log("[AI Router] 🧪 POST /test route hit");
  return aiController.test(req, res, next);
});

// Route to check status of a specific request
router.get("/status/:requestId", (req, res, next) => {
  console.log("[AI Router] 📊 GET /status/:requestId route hit");
  console.log("[AI Router] Request ID:", req.params.requestId);
  return aiController.checkRequestStatus(req, res, next);
});

// Route to list active requests for the user
router.get("/requests", (req, res, next) => {
  console.log("[AI Router] 📋 GET /requests route hit");
  return aiController.getActiveRequests(req, res, next);
});

// Route to cancel a request
router.delete("/cancel/:requestId", (req, res, next) => {
  console.log("[AI Router] ❌ DELETE /cancel/:requestId route hit");
  console.log("[AI Router] Request ID to cancel:", req.params.requestId);
  return aiController.cancelRequest(req, res, next);
});

// Health check endpoint for mobile app authentication testing
router.get("/health", (req, res) => {
  console.log("[AI Router] 🏥 GET /health route hit");

  // This endpoint requires authentication (via firebaseAuth middleware)
  // If we reach here, authentication is working
  const { uid } = req.user || {};

  if (!uid) {
    return res.status(401).json({
      status: "unauthorized",
      message: "Authentication required",
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(200).json({
    status: "healthy",
    message: "AI service is accessible",
    authenticated: true,
    uid: uid,
    timestamp: new Date().toISOString(),
  });
});

// Simple connectivity test endpoint (no authentication required)
router.get("/ping", (req, res) => {
  console.log("[AI Router] 🏓 GET /ping route hit");

  return res.status(200).json({
    status: "pong",
    message: "AI service is reachable",
    timestamp: new Date().toISOString(),
  });
});

export default router;
