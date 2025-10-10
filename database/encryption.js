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
const dekCache = new LimitedMap(1000);

// Import User model for data checking
import User from "./models/User.js";

async function generateAndStoreEncryptedDEK(
  bucketKey,
  forceRegenerate = false
) {
  console.log(
    `🔑 Generating DEK for bucket key: ${bucketKey}, forceRegenerate: ${forceRegenerate}`
  );

  // If force regenerate, create backup of old DEK first
  if (forceRegenerate) {
    await backupExistingDEK(bucketKey);
  }

  const dek = crypto.randomBytes(32);

  const [encryptResponse] = await kmsClient.encrypt({
    name: KEY_PATH,
    plaintext: dek,
  });

  const encryptedDEK = encryptResponse.ciphertext;
  const file = storage
    .bucket(BUCKET_NAME)
    .file(`keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${bucketKey}.key`);

  // Log the DEK replacement
  console.log(`🔄 Saving new DEK for bucket key: ${bucketKey}`);
  await file.save(encryptedDEK);

  // Cache the DEK
  dekCache.set(bucketKey, dek);

  console.log(`✅ New DEK generated and stored for bucket key: ${bucketKey}`);
  return dek;
}

async function getDEKFromBucket(bucketKey) {
  const file = storage
    .bucket(BUCKET_NAME)
    .file(`keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${bucketKey}.key`);
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

async function getUserDek(firebaseUid) {
  try {
    console.log(`🔍 Getting DEK for Firebase UID: ${firebaseUid}`);

    // Step 1: Find user in database by Firebase UID
    const user = await User.findOne({ authUid: firebaseUid });

    if (!user) {
      console.error(
        `❌ User not found in database for Firebase UID: ${firebaseUid}`
      );
      throw new Error(`User not found for Firebase UID: ${firebaseUid}`);
    }

    console.log(
      `✅ User found - ID: ${user._id}, Firebase UID: ${firebaseUid}`
    );

    // Step 2: Use user primary key as bucket key
    const bucketKey = user._id.toString();
    console.log(`🔑 Using user primary key as bucket key: ${bucketKey}`);

    // Check in-memory cache first (using bucket key)
    if (dekCache.has(bucketKey)) {
      console.log(`✅ DEK found in cache for bucket key: ${bucketKey}`);
      const cachedDek = dekCache.get(bucketKey);
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
        dekCache.delete(bucketKey);
      } else {
        return cachedDek;
      }
    }

    console.log(`📦 Fetching DEK from bucket for bucket key: ${bucketKey}`);
    let dek = await getDEKFromBucket(bucketKey);

    if (!dek) {
      console.log(`🔑 No DEK found for bucket key: ${bucketKey}`);
      console.log(
        `🔄 Checking for legacy DEK using Firebase UID: ${firebaseUid}`
      );

      // Step 3: Check for legacy DEK using Firebase UID
      const legacyDek = await getDEKFromBucket(firebaseUid);

      if (legacyDek) {
        console.log(`✅ Found legacy DEK for Firebase UID: ${firebaseUid}`);
        console.log(`🔄 Migrating to new bucket key: ${bucketKey}`);

        // Copy the legacy DEK to new bucket key
        await copyDEKToNewBucketKey(firebaseUid, bucketKey);

        // Use the migrated DEK
        dek = legacyDek;
        dekCache.set(bucketKey, dek);

        console.log(
          `✅ DEK migrated from Firebase UID to primary key: ${firebaseUid} -> ${bucketKey}`
        );
      } else {
        console.log(
          `🔑 No legacy DEK found, generating new DEK for bucket key: ${bucketKey}`
        );
        dek = await generateAndStoreEncryptedDEK(bucketKey, false);
      }
    } else {
      console.log(`✅ DEK retrieved from bucket for bucket key: ${bucketKey}`);
      dekCache.set(bucketKey, dek); // Cache it once retrieved
    }

    console.log(
      `🔍 Final DEK length: ${
        dek?.length
      }, type: ${typeof dek}, isBuffer: ${Buffer.isBuffer(dek)}`
    );
    return dek;
  } catch (e) {
    console.error(`❌ Error getting DEK for Firebase UID ${firebaseUid}:`, e);
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
 * Copy DEK from legacy Firebase UID bucket key to new primary key bucket key
 */
async function copyDEKToNewBucketKey(legacyBucketKey, newBucketKey) {
  try {
    console.log(
      `📦 Copying DEK from legacy key ${legacyBucketKey} to new key ${newBucketKey}`
    );

    const legacyFile = storage
      .bucket(BUCKET_NAME)
      .file(`keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${legacyBucketKey}.key`);

    if (!(await legacyFile.exists())[0]) {
      console.log(`❌ Legacy DEK file not found: ${legacyBucketKey}`);
      return false;
    }

    const newFile = storage
      .bucket(BUCKET_NAME)
      .file(`keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${newBucketKey}.key`);

    // Copy the legacy DEK to the new bucket key location
    try {
      await legacyFile.copy(newFile);
      console.log(`✅ DEK copied from ${legacyBucketKey} to ${newBucketKey}`);
      console.log(`💾 Legacy DEK maintained as backup at ${legacyBucketKey}`);
      return true;
    } catch (copyError) {
      // Fallback strategy: download then save, to avoid transient SDK copy issues (e.g., Parse Error)
      console.error(
        `⚠️  Direct copy failed (${copyError?.message}). Falling back to download+save...`
      );
      try {
        const [encryptedDEK] = await legacyFile.download();
        await newFile.save(encryptedDEK);
        console.log(
          `✅ DEK copied via download+save from ${legacyBucketKey} to ${newBucketKey}`
        );
        return true;
      } catch (fallbackError) {
        console.error(
          `❌ Fallback copy (download+save) failed from ${legacyBucketKey} to ${newBucketKey}:`,
          fallbackError
        );
        // Do not throw to avoid hard-failing auth flow; return false so callers can proceed using legacy DEK
        return false;
      }
    }
  } catch (error) {
    console.error(
      `❌ Error copying DEK from ${legacyBucketKey} to ${newBucketKey}:`,
      error
    );
    // Do not throw here to prevent 500 on sign-in; allow caller to continue with legacy DEK
    return false;
  }
}

/**
 * Create backup of existing DEK before regenerating
 */
async function backupExistingDEK(bucketKey) {
  try {
    console.log(
      `💾 Creating backup of existing DEK for bucket key: ${bucketKey}`
    );

    const originalFile = storage
      .bucket(BUCKET_NAME)
      .file(`keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${bucketKey}.key`);

    if (!(await originalFile.exists())[0]) {
      console.log(`ℹ️ No existing DEK to backup for bucket key: ${bucketKey}`);
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = storage
      .bucket(BUCKET_NAME)
      .file(
        `keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/backups/${bucketKey}_${timestamp}.key`
      );

    await originalFile.copy(backupFile);
    console.log(
      `✅ DEK backup created for bucket key ${bucketKey}: ${bucketKey}_${timestamp}.key`
    );
  } catch (error) {
    console.error(
      `❌ Error creating DEK backup for bucket key ${bucketKey}:`,
      error
    );
    throw new Error(
      `Failed to create DEK backup for bucket key ${bucketKey}: ${error.message}`
    );
  }
}

/**
 * Try to recover DEK from backup files
 */
async function tryRecoverDEKFromBackup(bucketKey) {
  try {
    console.log(
      `🔄 Attempting DEK recovery from backup for bucket key: ${bucketKey}`
    );

    const [files] = await storage.bucket(BUCKET_NAME).getFiles({
      prefix: `keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/backups/${bucketKey}_`,
    });

    if (files.length === 0) {
      console.log(`❌ No backup DEK files found for bucket key: ${bucketKey}`);
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
          .file(`keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${bucketKey}.key`);

        await currentFile.save(encryptedDEK);
        dekCache.set(bucketKey, dek);

        console.log(`✅ DEK restored for bucket key: ${bucketKey}`);
        return dek;
      } catch (error) {
        console.error(
          `❌ Failed to recover from backup ${backupFile.name}:`,
          error
        );
        continue;
      }
    }

    console.error(
      `❌ All backup recovery attempts failed for bucket key: ${bucketKey}`
    );
    return null;
  } catch (error) {
    console.error(
      `❌ Error during DEK recovery for bucket key ${bucketKey}:`,
      error
    );
    return null;
  }
}

/**
 * Special function for signup flow - handles DEK creation/migration for new users
 * Logic:
 * 1. Check if DEK exists with Firebase UID
 * 2. If exists, copy to database ID bucket key
 * 3. If not exists, create new DEK with database ID bucket key
 */
async function getUserDekForSignup(firebaseUid, databaseId) {
  try {
    console.log(
      `🔍 Getting DEK for signup - Firebase UID: ${firebaseUid}, Database ID: ${databaseId}`
    );

    const bucketKey = databaseId.toString();
    console.log(`🔑 Using database ID as bucket key: ${bucketKey}`);

    // Step 1: Check if DEK already exists with the database ID (shouldn't happen in signup, but safety check)
    console.log(`📦 Checking for existing DEK with database ID: ${bucketKey}`);
    let dek = await getDEKFromBucket(bucketKey);

    if (dek) {
      console.log(`✅ DEK already exists for database ID: ${bucketKey}`);
      dekCache.set(bucketKey, dek);
      return dek;
    }

    // Step 2: Check if DEK exists with Firebase UID (legacy/migration case)
    console.log(`🔄 Checking for DEK with Firebase UID: ${firebaseUid}`);
    const legacyDek = await getDEKFromBucket(firebaseUid);

    if (legacyDek) {
      console.log(`✅ Found DEK with Firebase UID: ${firebaseUid}`);
      console.log(
        `🔄 Copying DEK from Firebase UID to database ID: ${firebaseUid} -> ${bucketKey}`
      );

      // Copy the DEK from Firebase UID to database ID
      const copySuccess = await copyDEKToNewBucketKey(firebaseUid, bucketKey);

      if (copySuccess) {
        console.log(
          `✅ DEK successfully copied from Firebase UID to database ID: ${firebaseUid} -> ${bucketKey}`
        );
        dek = legacyDek;
        dekCache.set(bucketKey, dek);
      } else {
        console.log(`⚠️ DEK copy failed, but will use legacy DEK for now`);
        dek = legacyDek;
        // Cache with both keys for compatibility
        dekCache.set(bucketKey, dek);
        dekCache.set(firebaseUid, dek);
      }
    } else {
      // Step 3: No existing DEK found, create new one with database ID
      console.log(
        `🔑 No existing DEK found, creating new DEK for database ID: ${bucketKey}`
      );
      dek = await generateAndStoreEncryptedDEK(bucketKey, false);
    }

    console.log(
      `🔍 Final DEK for signup - length: ${
        dek?.length
      }, type: ${typeof dek}, isBuffer: ${Buffer.isBuffer(dek)}`
    );
    return dek;
  } catch (e) {
    console.error(
      `❌ Error getting DEK for signup - Firebase UID: ${firebaseUid}, Database ID: ${databaseId}:`,
      e
    );
    console.error("Stack trace:", e.stack);
    throw e;
  }
}

export {
  encryptValue,
  decryptValue,
  getUserDek,
  getUserDekForSignup,
  hashEmail,
  hashValue,
  copyDEKToNewBucketKey,
  backupExistingDEK,
  tryRecoverDEKFromBackup,
};
