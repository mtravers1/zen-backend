import fs from "fs";
import path from "path";
import { Storage } from "@google-cloud/storage";

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
const storageServiceAccountB64 = process.env.STORAGE_SERVICE_ACCOUNT;
if (!storageServiceAccountB64 || storageServiceAccountB64.trim() === "") {
  throw new Error(
    "❌ CRITICAL: STORAGE_SERVICE_ACCOUNT environment variable is not set or is empty.",
  );
}

try {
  const storageCredentials = Buffer.from(storageServiceAccountB64, "base64").toString("utf-8");

  // Create a temporary file with the credentials
  const tempDir = path.join(process.cwd(), 'tmp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const tempFilePath = path.join(tempDir, 'gcp-storage-credentials.json');
  fs.writeFileSync(tempFilePath, storageCredentials);

  storage = new Storage({
    keyFilename: tempFilePath,
    projectId: process.env.GCP_PROJECT_ID,
  });
  console.log("✅ Storage client initialized");
} catch (error) {
  console.error("❌ CRITICAL: Failed to initialize storage client.", error);
  throw new Error(
    "❌ CRITICAL: Failed to initialize storage client. Ensure STORAGE_SERVICE_ACCOUNT is a valid base64 encoded JSON string.",
  );
}

export { storage };
export const keysBucketName = process.env.GCS_DEK_BUCKET_NAME;
export const filesBucketName = process.env.GCS_FILES_BUCKET_NAME;