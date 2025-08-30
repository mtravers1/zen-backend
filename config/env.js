// config/env.js
import os from "os";

export const AppEnv = {
  DEVELOPMENT: "development",
  STAGING: "staging", 
  PRODUCTION: "production"
};

export function getAppEnv() {
  // 1) If ENVIRONMENT already exists, use it
  const direct = (process.env.ENVIRONMENT || "").toLowerCase();
  if (direct.startsWith("prod")) return AppEnv.PRODUCTION;
  if (direct.startsWith("stag") || direct === "uat") return AppEnv.STAGING;
  if (direct) return AppEnv.DEVELOPMENT;

  // 2) Heuristics without creating new variables
  const uri = (process.env.PLAID_REDIRECT_URI || "").toLowerCase();
  if (uri.includes("dev.")) return AppEnv.DEVELOPMENT;
  if (uri.includes("stg.") || uri.includes("uat.")) return AppEnv.STAGING;
  if (uri.includes("prod.") || uri.includes("app.")) return AppEnv.PRODUCTION;

  const db = (process.env.MONGODB_DB || "").toLowerCase();
  if (db.includes("dev")) return AppEnv.DEVELOPMENT;
  if (db.includes("stg") || db.includes("uat")) return AppEnv.STAGING;
  if (db.includes("prod")) return AppEnv.PRODUCTION;

  // 3) Last resort: development (fail-safe)
  return AppEnv.DEVELOPMENT;
}

export function requireEnv(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) {
    throw new Error(`[CONFIG] Missing variable: ${name}`);
  }
  return String(v).trim();
}

export function getBaseConfig() {
  const env = getAppEnv();
  
  // Use only variables you already have
  const PROJECT_ID = process.env.GCP_PROJECT_ID?.trim();
  const KEY_LOCATION = requireEnv("GCP_KEY_LOCATION");
  const KEY_RING = requireEnv("GCP_KEY_RING");
  const KEY_NAME = requireEnv("GCP_KEY_NAME");
  const BUCKET = requireEnv("GCP_BUCKET_KEY"); // use as bucket name

  return { env, PROJECT_ID, KEY_LOCATION, KEY_RING, KEY_NAME, BUCKET };
}
