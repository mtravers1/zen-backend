import express from "express";
import cookieParser from "cookie-parser";
import logger from "morgan";
import createError from "http-errors";
import cors from "cors";
import firebaseAuth from "./middlewares/firebaseAuth.js";
import { structuredLoggingMiddleware, errorHandlingMiddleware, cleanupMiddleware } from "./middlewares/structuredLogging.js";
import dotenv from "dotenv";
import "./lib/firebaseAdmin.js";
import "./database/database.js";
import router from "./routes/index.js";

dotenv.config();

const app = express();

// database initialization
// require('./database/database');

// CORS configuration for development
const corsOptions = {
  origin: [
    'https://zentavos.com',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));
app.use(logger("dev"));

// Structured logging middleware - must be early in the chain
app.use(structuredLoggingMiddleware);
app.use(cleanupMiddleware);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

// authentication
app.use(
	firebaseAuth.unless({
		path: [
			"/api/auth/signup",
			// "/api/auth/signin",
			"/api/auth/check-email",
			"/api/auth/check-email-firebase",
			"/api/auth/recoverypassword",
			"/api/_info/version",
			"/api/webhook/plaid",
			"/api/webhook/test",
			"/api/plaid/institutions",
			"/api/auth/sendCode",
			"/api/auth/resetPassword",
			"/api/plaid/accounts",
			"/api/account/add-photo",
			"/api/account/get-photo",
			"/api/account/photo",
			"/api/script/update-transactions",
			"/api/payments/webhook/android",
			"/api/payments/webhook/apple",
		],
	})
);

// Load routes
app.use("/api", router);

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

  if (req.app.get('env') !== 'production') {
    errorResponse.error = err;
  }

  res.status(err.status || 500).json(errorResponse);
});

export default app;
