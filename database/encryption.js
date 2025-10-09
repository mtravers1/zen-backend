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

// Import User model for data checking
import User from "./models/User.js";

async function generateAndStoreEncryptedDEK(uid, forceRegenerate = false) {
  console.log(
    `🔑 Generating DEK for user: ${uid}, forceRegenerate: ${forceRegenerate}`
  );

  // SAFETY CHECK: Never regenerate DEK if user has existing data unless explicitly forced
  if (!forceRegenerate) {
    const hasExistingData = await checkUserHasEncryptedData(uid);
    if (hasExistingData) {
      console.error(
        `🚨 CRITICAL: Attempted to regenerate DEK for user ${uid} who has existing encrypted data!`
      );
      console.error(
        `🚨 This would cause PERMANENT DATA LOSS. Aborting DEK generation.`
      );
      throw new Error(
        `Cannot regenerate DEK for user ${uid}: User has existing encrypted data. Use forceRegenerate=true only after data backup.`
      );
    }
  }

  // If force regenerate, create backup of old DEK first
  if (forceRegenerate) {
    await backupExistingDEK(uid);
  }

  const dek = crypto.randomBytes(32);

  const [encryptResponse] = await kmsClient.encrypt({
    name: KEY_PATH,
    plaintext: dek,
  });

  const encryptedDEK = encryptResponse.ciphertext;
  const file = storage
    .bucket(BUCKET_NAME)
    .file(`keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${uid}.key`);

  // Log the DEK replacement
  console.log(`🔄 Saving new DEK for user: ${uid}`);
  await file.save(encryptedDEK);

  // Cache the DEK
  dekCache.set(uid, dek);

  console.log(`✅ New DEK generated and stored for user: ${uid}`);
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
      console.log(`🔑 No DEK found for user: ${uid}`);

      // CRITICAL SAFETY CHECK: Check if user has existing encrypted data
      const hasExistingData = await checkUserHasEncryptedData(uid);

      if (hasExistingData) {
        console.error(
          `🚨 CRITICAL ERROR: User ${uid} has encrypted data but no DEK found!`
        );
        console.error(`🚨 This indicates a serious data integrity issue.`);
        console.error(`🚨 Attempting DEK recovery...`);

        // Try to recover DEK from backup
        dek = await tryRecoverDEKFromBackup(uid);

        if (!dek) {
          console.error(
            `🚨 FATAL: Cannot recover DEK for user ${uid}. Data may be permanently lost.`
          );
          throw new Error(
            `Critical DEK recovery failure for user ${uid}. Contact system administrator immediately.`
          );
        }

        console.log(`✅ DEK recovered from backup for user: ${uid}`);
      } else {
        console.log(
          `✅ New user detected, safe to generate new DEK for user: ${uid}`
        );
        dek = await generateAndStoreEncryptedDEK(uid, false);
      }
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

/**
 * Check if user has existing encrypted data that would be lost if DEK is regenerated
 */
async function checkUserHasEncryptedData(uid) {
  try {
    console.log(`🔍 Checking if user ${uid} has existing encrypted data...`);

    // Check if user exists in database
    const user = await User.findOne({ authUid: uid });

    if (!user) {
      console.log(`✅ No user found for UID ${uid}, safe to generate new DEK`);
      return false;
    }

    // Check if user has encrypted fields that would indicate existing data
    const hasEncryptedName =
      user.name?.firstName && user.name.firstName !== "New";
    const hasEncryptedEmail = user.email && user.email.length > 0;
    const hasEncryptedPhone = user.phone && user.phone.length > 0;

    const hasEncryptedData =
      hasEncryptedName || hasEncryptedEmail || hasEncryptedPhone;

    console.log(`🔍 User ${uid} encrypted data check:`, {
      hasUser: !!user,
      hasEncryptedName,
      hasEncryptedEmail,
      hasEncryptedPhone,
      hasEncryptedData,
    });

    return hasEncryptedData;
  } catch (error) {
    console.error(`❌ Error checking encrypted data for user ${uid}:`, error);
    // In case of error, assume user has data to be safe
    return true;
  }
}

/**
 * Create backup of existing DEK before regenerating
 */
async function backupExistingDEK(uid) {
  try {
    console.log(`💾 Creating backup of existing DEK for user: ${uid}`);

    const originalFile = storage
      .bucket(BUCKET_NAME)
      .file(`keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${uid}.key`);

    if (!(await originalFile.exists())[0]) {
      console.log(`ℹ️ No existing DEK to backup for user: ${uid}`);
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = storage
      .bucket(BUCKET_NAME)
      .file(
        `keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/backups/${uid}_${timestamp}.key`
      );

    await originalFile.copy(backupFile);
    console.log(
      `✅ DEK backup created for user ${uid}: ${uid}_${timestamp}.key`
    );
  } catch (error) {
    console.error(`❌ Error creating DEK backup for user ${uid}:`, error);
    throw new Error(
      `Failed to create DEK backup for user ${uid}: ${error.message}`
    );
  }
}

/**
 * Try to recover DEK from backup files
 */
async function tryRecoverDEKFromBackup(uid) {
  try {
    console.log(`🔄 Attempting DEK recovery from backup for user: ${uid}`);

    const [files] = await storage.bucket(BUCKET_NAME).getFiles({
      prefix: `keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/backups/${uid}_`,
    });

    if (files.length === 0) {
      console.log(`❌ No backup DEK files found for user: ${uid}`);
      return null;
    }

    // Sort by creation time (newest first) and try each backup
    files.sort(
      (a, b) =>
        new Date(b.metadata.timeCreated) - new Date(a.metadata.timeCreated)
    );

    for (const backupFile of files) {
      try {
        console.log(`🔄 Trying backup file: ${backupFile.name}`);

        const [encryptedDEK] = await backupFile.download();

        const [decryptResponse] = await kmsClient.decrypt({
          name: KEY_PATH,
          ciphertext: encryptedDEK,
        });

        const { plaintext } = decryptResponse;
        const dek = Buffer.from(plaintext);

        console.log(
          `✅ Successfully recovered DEK from backup: ${backupFile.name}`
        );

        // Restore the recovered DEK as the current DEK
        const currentFile = storage
          .bucket(BUCKET_NAME)
          .file(`keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${uid}.key`);

        await currentFile.save(encryptedDEK);
        dekCache.set(uid, dek);

        console.log(`✅ DEK restored for user: ${uid}`);
        return dek;
      } catch (error) {
        console.error(
          `❌ Failed to recover from backup ${backupFile.name}:`,
          error
        );
        continue;
      }
    }

    console.error(`❌ All backup recovery attempts failed for user: ${uid}`);
    return null;
  } catch (error) {
    console.error(`❌ Error during DEK recovery for user ${uid}:`, error);
    return null;
  }
}

export {
  encryptValue,
  decryptValue,
  getUserDek,
  hashEmail,
  hashValue,
  checkUserHasEncryptedData,
  backupExistingDEK,
  tryRecoverDEKFromBackup,
};
