import express from "express";
import cookieParser from "cookie-parser";
import logger from "morgan";
import createError from "http-errors";
import cors from "cors";
import rateLimit from "express-rate-limit";
import admin from "firebase-admin";
import fs from "fs";
import firebaseAuth from "./middlewares/firebaseAuth.js";
import {
  structuredLoggingMiddleware,
  errorHandlingMiddleware,
  cleanupMiddleware,
} from "./middlewares/structuredLogging.js";
import routeValidationMiddleware from "./middlewares/routeValidation.js";
import connectDB from "./database/database.js";
import router from "./routes/index.js";

export async function createApp() {
  const app = express();

// database initialization
// require('./database/database');
const additionalOrigins = process.env.CORS_URL.split(",")
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || additionalOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(logger("dev"));
app.use(express.json({ limit: "1mb" })); // Increased limit for iOS receipts
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

// Rate limiting for brute force protection
const isProduction = process.env.NODE_ENV === "production";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 100 : 1000, // Limit each IP to 100 requests per windowMs in production, 1000 otherwise
  message: {
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all requests
app.use(limiter);

// Apply structured logging middleware BEFORE authentication
app.use(structuredLoggingMiddleware);

// Apply route validation middleware FIRST to block invalid routes and attacks
app.use(routeValidationMiddleware);

// authentication
app.use((req, res, next) => {
  // Define paths that should be excluded from authentication
  const excludedPaths = [
    "/api/auth/signup",
    "/api/auth/signin",
    "/api/auth/signin-oauth",
    "/api/auth/signup-oauth",
    "/api/auth/check-email",
    "/api/auth/check-email-firebase",
    "/api/auth/check-oauth-validation",
    "/api/auth/recoverypassword",
    "/api/_info/version",
    "/api/webhook/plaid",
    "/api/webhook/test",
    "/api/plaid/institutions",
    "/api/auth/sendCode",
    "/api/auth/verifyCode",
    "/api/auth/resetPassword",
    "/api/plaid/accounts",
    "/api/account/add-photo",
    "/api/account/get-photo",
    "/api/script/update-transactions",
    "/api/payments/webhook/android",
    "/api/payments/webhook/apple",
    "/api/payments/available-plans",
    "/api/subscriptions/plans",
    "/api/ai/ping",
    "/api/security/clear-dev-blacklist",
  ];

  // Block known attack patterns immediately
  const attackPatterns = [
    "/api/v1/vpnportal",
    "/api/v1/admin",
    "/api/v1/login",
    "/wp-admin",
    "/admin",
    "/phpmyadmin",
  ];

  const isAttackPattern = attackPatterns.some((pattern) =>
    req.path.startsWith(pattern),
  );
  if (isAttackPattern) {
    // Return 404 immediately for known attack patterns
    return res.status(404).json({ error: "Not Found" });
  }

  // Check if the current path should be excluded
  const shouldExclude =
    excludedPaths.includes(req.path) ||
    req.path.startsWith("/api/account/photo/") ||
    (process.env.NODE_ENV === "development" && req.path.startsWith("/dev"));

  if (shouldExclude) {
    // Skip authentication for excluded paths
    return next();
  }

  // Apply authentication for all other paths
  return firebaseAuth(req, res, next);
});

// Load routes

app.use("/api", router);

// Add root route to avoid 401 errors
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Zentavos API",
    version: process.env.VERSION || "1.0.1",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

// Add favicon route to avoid 401 errors
app.get("/favicon.ico", (req, res) => {
  res.status(204).end(); // No content for favicon
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// Structured error handling middleware
app.use(errorHandlingMiddleware);

// Legacy error handler (fallback)
app.use(function (err, req, res, next) {
  const errorResponse = {
    message: err.message,
  };

  if (req.app.get("env") !== "production") {
    errorResponse.error = err;
  }

  res.status(err.status || 500).json(errorResponse);
});

  return app;
}

export default createApp;
