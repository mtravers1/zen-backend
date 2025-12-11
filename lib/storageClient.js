import { Storage } from "@google-cloud/storage";
import { GoogleAuth } from "google-auth-library";

// Validate required environment variables
const requiredEnvVars = [
  "STORAGE_SERVICE_ACCOUNT",
  "GCP_PROJECT_ID",
  "HASH_SALT",
  "KMS_SERVICE_ACCOUNT",
  "GCP_KEY_LOCATION",
  "GCP_KEY_RING",
  "GCP_KEY_NAME",
  "GCS_DEK_BUCKET_NAME",
  "GCS_FILES_BUCKET_NAME",
  "LEGACY_GCS_ENVIRONMENT_FOLDER",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar] || process.env[envVar].trim() === "") {
    throw new Error(
      `❌ CRITICAL: Environment variable ${envVar} is not set. This is a required environment variable.`,
    );
  }
}

let storage;

// Initialize Storage client
let storageCredentials = null; // Initialize to null
const storageServiceAccountB64 = process.env.STORAGE_SERVICE_ACCOUNT;
console.log("STORAGE_SERVICE_ACCOUNT:", storageServiceAccountB64 ? storageServiceAccountB64.substring(0, 20) + "..." : "Not Set");
let loadedFromEnv = false;

if (!storageServiceAccountB64 || storageServiceAccountB64.trim() === "") {
  throw new Error(
    "❌ CRITICAL: STORAGE_SERVICE_ACCOUNT environment variable is not set or is empty.",
  );
}

try {
  storageCredentials = JSON.parse(
    Buffer.from(storageServiceAccountB64, "base64").toString("utf-8"),
  );
  console.log("✅ Storage credentials loaded from environment variable.");
} catch (error) {
  console.error("❌ CRITICAL: Failed to parse STORAGE_SERVICE_ACCOUNT environment variable.", error);
  throw new Error(
    "❌ CRITICAL: Failed to parse STORAGE_SERVICE_ACCOUNT environment variable. Ensure it is a valid base64 encoded JSON string.",
  );
}

storage = new Storage({
  credentials: storageCredentials,
  projectId: process.env.GCP_PROJECT_ID,
});
console.log("✅ Storage client initialized");

export { storage };
export const keysBucketName = process.env.GCS_DEK_BUCKET_NAME;
console.log("🔵 [DEBUG] GCS_FILES_BUCKET_NAME:", process.env.GCS_FILES_BUCKET_NAME);
export const filesBucketName = process.env.GCS_FILES_BUCKET_NAME;