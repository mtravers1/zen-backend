import express from "express";
import cookieParser from "cookie-parser";
import logger from "morgan";
import createError from "http-errors";
import cors from "cors";
import firebaseAuth from "./middlewares/firebaseAuth.js";
import dotenv from "dotenv";
import "./lib/firebaseAdmin.js";
import "./database/database.js";
import router from "./routes/index.js";

dotenv.config();

const app = express();

// database initialization
// require('./database/database');

app.use(cors());
app.use(logger("dev"));
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
      "/api/plaid/institutions",
      "/api/auth/sendCode",
      "/api/auth/resetPassword",
      "/api/account/add-photo",
      "/api/account/get-photo",
    ],
  })
);

// Load routes
app.use("/api", router);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

export default app;
