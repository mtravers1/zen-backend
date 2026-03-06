import * as Sentry from "@sentry/node";

import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import logger from "morgan";
import createError from "http-errors";
import cors from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import admin from "firebase-admin";
import fs from "fs";
import firebaseAuth from "./middlewares/firebaseAuth.js";
import decodeUserMiddleware from "./middlewares/decodeUserMiddleware.js";
import { redactEmail } from "./lib/emailUtils.js";
import {
	structuredLoggingMiddleware,
	errorHandlingMiddleware,
	cleanupMiddleware,
} from "./middlewares/structuredLogging.js";
import routeValidationMiddleware, {
	recordInvalidRequest,
} from "./middlewares/routeValidation.js";
import connectDB from "./database/database.js";
import router from "./routes/index.js";
import appRouter from "./routes/app.router.js";

Sentry.init({
	dsn: "https://3b0788b88b1203668fd993c64bdebc8f@o4510568686092288.ingest.us.sentry.io/4510580113145856",
	sendDefaultPii: true,
	integrations: [
		// send console.log, console.warn, and console.error calls as logs to Sentry
		Sentry.consoleLoggingIntegration({ levels: ["log", "warn", "error"] }),
	],
	// Enable logs to be sent to Sentry
	enableLogs: true,
	release: process.env.SENTRY_RELEASE,
	environment: process.env.ENVIRONMENT,
	tracesSampleRate: 1.0,
	registerEsmLoaderHooks: false,
});

export async function createApp() {
	const app = express();

	// database initialization
	// require('./database/database');
	const additionalOrigins = process.env.CORS_URL.split(",")
		.map((origin) => origin.trim())
		.filter((origin) => origin.length > 0);

	const corsOptions = {
		origin: function (origin, callback) {
			if (!origin || additionalOrigins.includes(origin) || origin === "null") {
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

	// Apply structured logging first to ensure all requests have an ID.
	app.use(structuredLoggingMiddleware);

	// Apply cleanup middleware periodically to remove old request contexts
	app.use(cleanupMiddleware);

	// authentication
	app.use((req, res, next) => {
		// Define paths that should be excluded from authentication
		const excludedPaths = [
			"/robots.txt",
			"/favicon.ico",
			"/api/_info/version",
			"/api/info",
			"/api/version",
			"/api/health",
			"/api/auth/signup",
			"/api/auth/signin",
			"/api/auth/signin-oauth",
			"/api/auth/signup-oauth",
			"/api/auth/check-email",
			"/api/auth/check-email-firebase",
			"/api/auth/check-oauth-validation",
			"/api/auth/recoverypassword",
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
			// New public endpoints
			"/api/admin/health",
			"/api/settings/client-portal",
		];

		// Block known attack patterns immediately
		const attackPatterns = [
			"/api/v1/vpnportal",
			"/api/v1/admin",
			"/api/v1/login",
			"/wp-admin",
			"/phpmyadmin",
		];

		const isAttackPattern = attackPatterns.some((pattern) =>
			req.path.startsWith(pattern)
		);
		if (isAttackPattern) {
			// Return 404 immediately for known attack patterns
			return res.status(404).json({ error: "Not Found" });
		}

		// Check if the current path should be excluded
		const shouldExclude =
			excludedPaths.includes(req.path) ||
			req.path.startsWith("/api/account/photo/") ||
			req.path.startsWith("/api/users/photo/") ||
			(process.env.NODE_ENV === "development" && req.path.startsWith("/dev"));

		if (shouldExclude) {
			// Skip authentication for excluded paths
			return next();
		}

		// Apply authentication for all other paths
		return firebaseAuth(req, res, next);
	});

	// Rate limiting for brute force protectionconst isProduction = process.env.NODE_ENV === "production";

	const webhookLimiter = rateLimit({
		windowMs: 5 * 60 * 1000, // 5 minutes
		max: 1000, // Allow a high number of requests for the webhook
		message: {
			error: "Too many requests from this IP, please try again later.",
		},
		standardHeaders: true,
		legacyHeaders: false,
	});

	const generalLimiter = rateLimit({
		windowMs: 15 * 60 * 1000, // 15 minutes
		max: 500, // Balanced rate limit for production, adjust based on monitoring and caching improvements.
		message: {
			error: "Too many requests from this IP, please try again later.",
		},
		standardHeaders: true,
		legacyHeaders: false,
		keyGenerator: (req) => {
			if (req.user && req.user.uid) {
				return req.user.uid;
			}
			return ipKeyGenerator(req);
		},
		handler: (req, res, next, options) => {
			const key = options.keyGenerator(req, res);
			const userIdentifier = req.user
				? `${redactEmail(req.user.email)} (key: ${key})`
				: `key: ${key}`;
			console.log(
				`[REQUEST ${req.requestId}] RATE LIMIT EXCEEDED for user: ${userIdentifier} on path: ${req.path}`
			);

			const retryAfter = Math.ceil(options.windowMs / 1000);
			res.setHeader("Retry-After", String(retryAfter));
			res.status(options.statusCode).send(options.message);
		},
	});

	// Apply rate limiting to all requests
	// Enable trust proxy to allow rate limiting to work correctly behind a reverse proxy
	app.set("trust proxy", 1);

	// Apply specific limiter for the webhook
	app.use("/api/payments/webhook/android", webhookLimiter);

	// Apply general limiter to all other routes
	app.use(generalLimiter);

	// Apply route validation middleware FIRST to block invalid routes and attacks
	app.use(routeValidationMiddleware);

	// Load routes
	app.use("/api", router);
	app.use("/", appRouter);

	// The Sentry error handler must be registered before any other error middleware and after all controllers
	Sentry.setupExpressErrorHandler(app);

	// catch 404 and forward to error handler
	app.use(function (req, res, next) {
		// Record this invalid request for security stats and automatic blacklisting
		recordInvalidRequest(req.ip || req.connection.remoteAddress);
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
		res.end(res.Sentry + "\n");
	});

	return app;
}

export default createApp;
