import dotenv from "dotenv";
import { LimitedMap } from "../lib/limitedMap.js";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";

dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  "STORAGE_SERVICE_ACCOUNT",
  "KMS_SERVICE_ACCOUNT",
  "GCP_PROJECT_ID",
  "GCP_KEY_LOCATION",
  "GCP_KEY_RING",
  "GCP_KEY_NAME",
  "USER_ENCRYPTION_KEY_BUCKET_NAME",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const serviceAccountBase64 = process.env.STORAGE_SERVICE_ACCOUNT;
/***
 * # **IMPORTANT**
 * # The bucket name where we store user encryption keys.
 *  using the wrong bucket will lose all data for all users!
 * */
const USER_ENCRYPTION_KEY_BUCKET_NAME =
  process.env.USER_ENCRYPTION_KEY_BUCKET_NAME;

console.log("USER_ENCRYPTION_KEY_BUCKET_NAME", USER_ENCRYPTION_KEY_BUCKET_NAME);
let storageServiceAccount, kmsServiceAccount;

try {
  const serviceAccountJsonString = Buffer.from(
    serviceAccountBase64,
    "base64"
  ).toString("utf8");
  storageServiceAccount = JSON.parse(serviceAccountJsonString);

  // Validate storage service account structure
  if (
    !storageServiceAccount.project_id ||
    !storageServiceAccount.private_key ||
    !storageServiceAccount.client_email
  ) {
    throw new Error("Invalid STORAGE_SERVICE_ACCOUNT: missing required fields");
  }
} catch (error) {
  throw new Error(`Failed to parse STORAGE_SERVICE_ACCOUNT: ${error.message}`);
}

try {
  const kmsServiceAccountBase64 = process.env.KMS_SERVICE_ACCOUNT;
  const kmsServiceAccountJsonString = Buffer.from(
    kmsServiceAccountBase64,
    "base64"
  ).toString("utf8");
  kmsServiceAccount = JSON.parse(kmsServiceAccountJsonString);

  // Validate KMS service account structure
  if (
    !kmsServiceAccount.project_id ||
    !kmsServiceAccount.private_key ||
    !kmsServiceAccount.client_email
  ) {
    throw new Error("Invalid KMS_SERVICE_ACCOUNT: missing required fields");
  }
} catch (error) {
  throw new Error(`Failed to parse KMS_SERVICE_ACCOUNT: ${error.message}`);
}

console.log("🔐 Initializing Google Cloud clients...");
console.log("📦 Project ID:", process.env.GCP_PROJECT_ID);
console.log(
  "🗝️ Storage Service Account Email:",
  storageServiceAccount.client_email
);
console.log("🔑 KMS Service Account Email:", kmsServiceAccount.client_email);

const kmsClient = new KeyManagementServiceClient({
  credentials: kmsServiceAccount,
  projectId: process.env.GCP_PROJECT_ID,
});

const storage = new Storage({
  credentials: storageServiceAccount,
  projectId: process.env.GCP_PROJECT_ID,
});

console.log("✅ Google Cloud clients initialized successfully");
const BUCKET_NAME = "zentavos-bucket";
const KEY_PATH = kmsClient.cryptoKeyPath(
  process.env.GCP_PROJECT_ID,
  process.env.GCP_KEY_LOCATION,
  process.env.GCP_KEY_RING,
  process.env.GCP_KEY_NAME
);

// DEK cache in memory
const dekCache = new LimitedMap(1000); // Limit to 1000 DEKs

async function generateAndStoreEncryptedDEK(uid) {
  const dek = crypto.randomBytes(32);

  const [encryptResponse] = await kmsClient.encrypt({
    name: KEY_PATH,
    plaintext: dek,
  });

  const encryptedDEK = encryptResponse.ciphertext;
  const file = storage
    .bucket(BUCKET_NAME)
    .file(`keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${uid}.key`);
  await file.save(encryptedDEK);

  // Cache the DEK
  dekCache.set(uid, dek);

  return dek;
}

async function getDEKFromBucket(uid) {
  const file = storage
    .bucket(BUCKET_NAME)
    .file(`keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${uid}.key`);
  if (!(await file.exists())[0]) {
    return null;
  }
  const [encryptedDEK] = await file.download();

  const [decryptResponse] = await kmsClient.decrypt({
    name: KEY_PATH,
    ciphertext: encryptedDEK,
  });

  // Ensure we return a proper Buffer
  const plaintext = decryptResponse.plaintext;
  return Buffer.from(plaintext);
}

async function getUserDek(uid) {
  try {
    console.log(`🔍 Getting DEK for user: ${uid}`);

    // Check in-memory cache first
    if (dekCache.has(uid)) {
      console.log(`✅ DEK found in cache for user: ${uid}`);
      const cachedDek = dekCache.get(uid);
      console.log(
        `🔍 Cached DEK length: ${
          cachedDek?.length
        }, type: ${typeof cachedDek}, isBuffer: ${Buffer.isBuffer(cachedDek)}`
      );

      // If cached DEK is not a Buffer, clear cache and fetch fresh
      if (!Buffer.isBuffer(cachedDek)) {
        console.log(
          `🔄 Cached DEK is not a Buffer, clearing cache and fetching fresh`
        );
        dekCache.delete(uid);
      } else {
        return cachedDek;
      }
    }

    console.log(`📦 Fetching DEK from bucket for user: ${uid}`);
    let dek = await getDEKFromBucket(uid);

    if (!dek) {
      console.log(`🔑 Generating new DEK for user: ${uid}`);
      dek = await generateAndStoreEncryptedDEK(uid);
    } else {
      console.log(`✅ DEK retrieved from bucket for user: ${uid}`);
      dekCache.set(uid, dek); // Cache it once retrieved
    }

    console.log(
      `🔍 Final DEK length: ${
        dek?.length
      }, type: ${typeof dek}, isBuffer: ${Buffer.isBuffer(dek)}`
    );
    return dek;
  } catch (e) {
    console.error(`❌ Error getting DEK for user ${uid}:`, e);
    console.error("Stack trace:", e.stack);

    // Add more context to the error
    if (e.message && e.message.includes("URL is required")) {
      console.error("🚨 Google Cloud Storage URL configuration issue detected");
      console.error("📋 Debug info:");
      console.error("- Project ID:", process.env.GCP_PROJECT_ID);
      console.error("- Bucket Name:", BUCKET_NAME);
      console.error(
        "- Storage Service Account Email:",
        storageServiceAccount?.client_email
      );
    }

    throw e;
  }
}

// Encrypts a value using AES-256-GCM and a provided data encryption key (DEK)
async function encryptValue(value, dek) {
  if (value === null || value === undefined) return value;

  try {
    // Convert the value to a JSON string to ensure it's properly formatted
    const jsonString = JSON.stringify(value);

    // Generate a random 16-byte initialization vector (IV)
    const iv = crypto.randomBytes(16);

    // Create an AES-256-GCM cipher using the DEK and IV
    const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);

    // Encrypt the JSON string
    const encrypted = Buffer.concat([
      cipher.update(jsonString, "utf8"),
      cipher.final(),
    ]);

    // Get the authentication tag to ensure integrity during decryption
    const tag = cipher.getAuthTag();

    // Combine IV + Auth Tag + Encrypted content, and return as base64 string
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  } catch (e) {
    console.error("Error encrypting value:", e);
    return value;
  }
}

// Decrypts a base64-encoded ciphertext using AES-256-GCM and a provided DEK
async function decryptValue(cipherTextBase64, dek) {
  if (
    cipherTextBase64 === null ||
    cipherTextBase64 === undefined ||
    cipherTextBase64 === ""
  )
    return cipherTextBase64;

  try {
    // Decode the base64-encoded ciphertext
    const cipherBuffer = Buffer.from(cipherTextBase64, "base64");

    // Extract IV (first 16 bytes), authentication tag (next 16), and encrypted content (remaining)
    const iv = cipherBuffer.slice(0, 16);
    const tag = cipherBuffer.slice(16, 32);
    const encrypted = cipherBuffer.slice(32);

    // Create a decipher using AES-256-GCM with the same DEK and IV
    const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);

    // Set the authentication tag
    decipher.setAuthTag(tag);

    // Decrypt the content and convert it back to UTF-8 string
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");

    // Parse the decrypted JSON string and return the original value
    return JSON.parse(decrypted);
  } catch (e) {
    console.error(
      `❌ Decryption failed for value: ${
        typeof cipherTextBase64 === "string"
          ? cipherTextBase64.substring(0, 50)
          : cipherTextBase64
      }...`
    );
    console.error(`❌ Decryption error:`, e.message);
    console.error(`❌ DEK available:`, !!dek);
    console.error(`❌ DEK length:`, dek?.length);
    return cipherTextBase64; // Return original value if decryption fails
  }
}

function hashEmail(email) {
  const salt = process.env.HASH_SALT;
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase() + salt)
    .digest("hex");
}

function hashValue(value) {
  const salt = process.env.HASH_SALT;
  return crypto
    .createHash("sha256")
    .update(value + salt)
    .digest("hex");
}
export { encryptValue, decryptValue, getUserDek, hashEmail, hashValue };
