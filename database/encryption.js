import fs from "fs";
import { LimitedMap } from "../lib/limitedMap.js";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";

class DecryptionError extends Error {
  constructor(message, errorCode) {
    super(message);
    this.name = 'DecryptionError';
    this.errorCode = errorCode;
  }
}

// Validate required environment variables
const requiredEnvVars = [
  "STORAGE_SERVICE_ACCOUNT",
  "GCP_PROJECT_ID",
  "HASH_SALT",
  "KMS_SERVICE_ACCOUNT",
  "GCP_KEY_LOCATION",
  "GCP_KEY_RING",
  "GCP_KEY_NAME",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar] || process.env[envVar].trim() === "") {
    throw new Error(
      `❌ CRITICAL: Environment variable ${envVar} is not set. This is a required environment variable.`,
    );
  }
}

let kmsClient, storage;

// Initialize Storage client
let storageCredentials = null; // Initialize to null
const storageServiceAccountB64 = process.env.STORAGE_SERVICE_ACCOUNT;
let loadedFromEnv = false;

if (storageServiceAccountB64 && storageServiceAccountB64.trim() !== "") {
  try {
    storageCredentials = JSON.parse(
      Buffer.from(storageServiceAccountB64, "base64").toString("utf-8"),
    );
    console.log("✅ Storage credentials loaded from environment variable.");
  } catch (error) {
    throw new Error(
      "❌ CRITICAL: Failed to parse STORAGE_SERVICE_ACCOUNT environment variable. Ensure it is a valid base64 encoded JSON string.",
    );
  }
} else {
  throw new Error(
    "❌ CRITICAL: STORAGE_SERVICE_ACCOUNT environment variable is not set or is empty.",
  );
}

storage = new Storage({
  credentials: storageCredentials,
  projectId: process.env.GCP_PROJECT_ID,
});
console.log("✅ Storage client initialized");

// Initialize KMS client
let kmsCredentials = null;
const kmsServiceAccountB64 = process.env.KMS_SERVICE_ACCOUNT;

if (kmsServiceAccountB64 && kmsServiceAccountB64.trim() !== "") {
  try {
    kmsCredentials = JSON.parse(
      Buffer.from(kmsServiceAccountB64, "base64").toString("utf-8"),
    );
    console.log("✅ KMS credentials loaded from environment variable.");
  } catch (error) {
    throw new Error(
      "❌ CRITICAL: Failed to parse KMS_SERVICE_ACCOUNT environment variable. Ensure it is a valid base64 encoded JSON string.",
    );
  }
} else {
  throw new Error(
    "❌ CRITICAL: KMS_SERVICE_ACCOUNT environment variable is not set or is empty.",
  );
}

kmsClient = new KeyManagementServiceClient({
  credentials: kmsCredentials,
  projectId: process.env.GCP_PROJECT_ID,
});
console.log("✅ KMS client initialized");

const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const LEGACY_GCS_BUCKET_NAME = process.env.LEGACY_GCS_BUCKET_NAME;
if (!LEGACY_GCS_BUCKET_NAME) {
  throw new Error("❌ CRITICAL: LEGACY_GCS_BUCKET_NAME environment variable is not set.");
}

async function getBucket(bucketName) {
  const targetBucketName = bucketName || GCS_BUCKET_NAME;
  if (!targetBucketName) {
    throw new Error("❌ CRITICAL: GCS_BUCKET_NAME environment variable is not set.");
  }

  try {
    const bucket = storage.bucket(targetBucketName);
    const [exists] = await bucket.exists();
    if (exists) {
      return bucket;
    } else {
      throw new Error(
        `❌ CRITICAL: GCS bucket "${targetBucketName}" does not exist or is not accessible.`,
      );
    }
  } catch (error) {
    throw new Error(
      `❌ CRITICAL: Failed to access GCS bucket "${targetBucketName}". Error: ${error.message}`,
    );
  }
}

const KEY_PATH = kmsClient.cryptoKeyPath(
  process.env.GCP_PROJECT_ID,
  process.env.GCP_KEY_LOCATION,
  process.env.GCP_KEY_RING,
  process.env.GCP_KEY_NAME,
);

// DEK cache in memory
const dekCache = new LimitedMap(1000);

// Import User model for data checking
import User from "./models/User.js";

async function generateAndStoreEncryptedDEK(
  bucketKey,
  targetBucket = null, // Allow specifying target bucket for migration
) {
  console.log(`✨ Generating new DEK for bucket key: ${bucketKey}`);
  const dek = crypto.randomBytes(32);

  try {
    const [encryptResponse] = await kmsClient.encrypt({
      name: KEY_PATH,
      plaintext: dek,
    });

    const encryptedDEK = encryptResponse.ciphertext;
    const filePath = `keys/${bucketKey}.key`;
    const bucket = targetBucket || (await getBucket());
    const file = bucket.file(filePath);

    console.log(`[SIGNUP-TRACE] Step 4: encryption.js -> Attempting to save key to GCS bucket: ${bucket.name}, path: ${filePath}`);
    // Use simple upload for small files (DEK is ~113 bytes)
    // This avoids the resumable upload endpoint that was causing "URL is required" error
    await file.save(encryptedDEK, {
      resumable: false,
      validation: false, // Skip CRC32C/MD5 validation for encrypted data
      metadata: {
        contentType: "application/octet-stream",
        cacheControl: "private, max-age=0",
      },
    });
  } catch (saveError) {
    console.error(`❌ Failed to save DEK for bucket key: ${bucketKey}`);
    console.error(`❌ Error:`, saveError);
    throw saveError;
  }

  // Cache the DEK
  dekCache.set(bucketKey, [dek]);

  return dek;
}

async function getDEKFromBucket(bucketKey, bucket) {
  let prefix;
  if (bucket.name === process.env.LEGACY_GCS_BUCKET_NAME) {
    let environmentFolder;
    switch (process.env.ENVIRONMENT) {
      case 'production':
        environmentFolder = 'prod';
        break;
      case 'staging':
        environmentFolder = 'staging';
        break;
      case 'development':
      case 'local':
        environmentFolder = 'dev';
        break;
      default: {
        const rawEnv = process.env.ENVIRONMENT;
        if (!rawEnv || rawEnv.trim() === '') {
          environmentFolder = 'dev';
          console.warn(`⚠️ ENVIRONMENT variable is unset or blank for legacy DEK lookup. Defaulting to '${environmentFolder}'.`);
        } else {
          environmentFolder = rawEnv;
        }
        break;
      }
    }
    prefix = `keys/${environmentFolder}/${bucketKey}`;
  } else {
    prefix = `keys/${bucketKey}`;
  }
  console.log(`🔍 Looking for DEKs with prefix: gs://${bucket.name}/${prefix}`);

  let files = [];
  let attempts = 0;
  const maxAttempts = 3;
  const delay = 500; // 500ms

  while (files.length === 0 && attempts < maxAttempts) {
    attempts++;
    if (attempts > 1) {
      console.log(`[DEK_TRACE] DEK not found, retrying... (Attempt ${attempts}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, delay * (attempts - 1))); // increasing delay
    }
    const [foundFiles] = await bucket.getFiles({ prefix });
    files = foundFiles;
  }

  // If no files are found, and we are not in the legacy bucket, check the root of the bucket
  if (files.length === 0 && bucket.name !== process.env.LEGACY_GCS_BUCKET_NAME) {
    console.log(`[DEK_TRACE] DEK not found in keys/ directory, checking root of the bucket`);
    prefix = bucketKey;
    attempts = 0;
    while (files.length === 0 && attempts < maxAttempts) {
      attempts++;
      if (attempts > 1) {
        console.log(`[DEK_TRACE] DEK not found, retrying... (Attempt ${attempts}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, delay * (attempts - 1))); // increasing delay
      }
      const [foundFiles] = await bucket.getFiles({ prefix });
      files = foundFiles;
    }
  }

  if (files.length === 0) {
    console.log(
      `⚠️ DEK files not found for bucket key: ${bucketKey} in bucket ${bucket.name}`,
    );
    return [];
  }

  console.log(
    `✅ ${files.length} DEK file(s) found, downloading and decrypting...`,
  );

  const deks = [];
  for (const file of files) {
    try {
      const [encryptedDEK] = await file.download();
      const [decryptResponse] = await kmsClient.decrypt({
        name: KEY_PATH,
        ciphertext: encryptedDEK,
      });

      const plaintext = decryptResponse.plaintext;
      console.log(`✅ DEK decrypted successfully from file: ${file.name}`);
      deks.push(Buffer.from(plaintext));
    } catch (decryptError) {
      if (
        decryptError.message &&
        decryptError.message.includes("Decryption failed")
      ) {
        console.warn(`⚠️ DEK decryption failed for file: ${file.name}`);
        console.warn(`⚠️ Error: ${decryptError.message}`);
        console.warn(
          `⚠️ The DEK may have been encrypted with a different KMS key or is corrupted`,
        );

        // Move failing DEK to dead-letter queue
        await moveDEKToDeadLetterQueue(file, bucket);

        // Continue to the next file
        continue;
      } else {
        // Re-throw other errors
        throw decryptError;
      }
    }
  }

  return deks;
}

/**
 * DEK Retrieval Flow:
 * 1. Check for cached DEK.
 * 2. Find user in database by Firebase UID.
 * 3. Search for DEK in the primary GCS bucket using the user's database ID.
 * 4. If not found, search in the legacy GCS bucket.
 * 5. If found in legacy, migrate the DEK to the primary bucket.
 * 6. If not found anywhere, throw a critical error.
 */
async function getUserDek(firebaseUid) {
  let user;
  try {
    // Find user in database
    user = await User.findOne({ authUid: firebaseUid });
    if (!user) {
      throw new Error(`User not found for Firebase UID: ${firebaseUid}`);
    }
    const bucketKey = user._id.toString();
    console.log(`[DEK_TRACE] Starting DEK retrieval for user ${bucketKey}`);

    // 1. Check cache first
    if (dekCache.has(bucketKey)) {
      const cachedDeks = dekCache.get(bucketKey);
      if (cachedDeks.length > 0) {
        console.log(`[DEK_TRACE] Found ${cachedDeks.length} DEK(s) in cache.`);
        return cachedDeks;
      }
    }
    console.log(`[DEK_TRACE] No valid DEKs in cache.`);

    let allDeks = [];
    const primaryBucket = await getBucket();
    const legacyBucket = storage.bucket(LEGACY_GCS_BUCKET_NAME);

    // 2. Check primary bucket with databaseId
    console.log(`[DEK_TRACE] Checking primary bucket with databaseId: ${bucketKey}`);
    const primaryDeks = await getDEKFromBucket(bucketKey, primaryBucket);
    if (primaryDeks.length > 0) {
      console.log(`[DEK_TRACE] Found ${primaryDeks.length} DEK(s) in primary bucket.`);
      allDeks = allDeks.concat(primaryDeks);
    }

    // 3. Check legacy bucket with databaseId
    console.log(`[DEK_TRACE] Checking legacy bucket with databaseId: ${bucketKey}`);
    const legacyDbIdDeks = await getDEKFromBucket(bucketKey, legacyBucket);
    if (legacyDbIdDeks.length > 0) {
      console.log(`[DEK_TRACE] Found ${legacyDbIdDeks.length} legacy DEK(s) with databaseId. Migrating...`);
      await copyDEKToNewBucketKey(bucketKey, legacyBucket, primaryBucket);
      allDeks = allDeks.concat(legacyDbIdDeks);
    }

    // 4. Check legacy bucket with firebaseUid
    console.log(`[DEK_TRACE] Checking legacy bucket with firebaseUid: ${firebaseUid}`);
    const legacyFirebaseUidDeks = await getDEKFromBucket(firebaseUid, legacyBucket);
    if (legacyFirebaseUidDeks.length > 0) {
      console.log(`[DEK_TRACE] Found ${legacyFirebaseUidDeks.length} legacy DEK(s) with firebaseUid. Migrating...`);
      await copyDEKToNewBucketKey(firebaseUid, legacyBucket, primaryBucket, bucketKey); // Copy to new key name
      allDeks = allDeks.concat(legacyFirebaseUidDeks);
    }

    // 5. Final processing
    if (allDeks.length === 0) {
      const errorMessage = `CRITICAL: No DEK found for user ${bucketKey} (Firebase UID: ${firebaseUid}). Data may be inaccessible.`;
      console.error(`❌ ${errorMessage}`);
      throw new Error(errorMessage);
    }

    // Remove duplicates
    const uniqueDeks = Array.from(new Set(allDeks.map(dek => dek.toString('hex')))).map(hex => Buffer.from(hex, 'hex'));
    console.log(`[DEK_TRACE] Found a total of ${uniqueDeks.length} unique DEK(s).`);

    dekCache.set(bucketKey, uniqueDeks);
    return uniqueDeks;

  } catch (e) {
    console.error(
      `❌ Error getting DEK for Firebase UID: ${firebaseUid}, Database ID: ${user?._id} - ${e.message}`,
    );
    throw e;
  }
}

// Encrypts a value using AES-256-GCM and a provided data encryption key (DEK)
async function encryptValue(value, dek) {
  if (value === null || value === undefined) return value;

  try {
    const encryptionKey = Array.isArray(dek) ? dek[0] : dek;
    // Convert the value to a JSON string to ensure it's properly formatted
    const jsonString = JSON.stringify(value);

    // Generate a random 16-byte initialization vector (IV)
    const iv = crypto.randomBytes(16);

    // Create an AES-256-GCM cipher using the DEK and IV
    const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);

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
async function decryptValue(cipherTextBase64, deks) {
  if (
    cipherTextBase64 === null ||
    cipherTextBase64 === undefined ||
    cipherTextBase64 === ""
  )
    return cipherTextBase64;

  for (const dek of deks) {
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
      console.warn(
        `⚠️ Decryption failed with one of the keys. Trying next key...`,
      );
    }
  }

  console.error(
    `❌ Decryption failed for value: ${
      typeof cipherTextBase64 === "string"
        ? cipherTextBase64.substring(0, 50)
        : cipherTextBase64
    }...`,
  );
  console.error(`❌ All decryption attempts failed.`);
  const errorCode = `ALL_DEK_FAILED-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  throw new DecryptionError(
    `All decryption attempts failed. Please report error code: ${errorCode}`,
    errorCode,
  );
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
async function copyDEKToNewBucketKey(
  sourceKey,
  sourceBucket,
  targetBucket,
  targetKey = null,
) {
  try {
    const finalTargetKey = targetKey || sourceKey;
    console.log(
      `📦 Copying DEK from source key ${sourceKey} in bucket ${sourceBucket.name} to target key ${finalTargetKey} in bucket ${targetBucket.name}`,
    );

    let sourcePath;
    if (sourceBucket.name === process.env.LEGACY_GCS_BUCKET_NAME) {
      let environmentFolder;
      switch (process.env.ENVIRONMENT) {
        case 'production':
          environmentFolder = 'prod';
          break;
        case 'staging':
          environmentFolder = 'staging';
          break;
        case 'development':
        case 'local':
          environmentFolder = 'dev';
          break;
        default: {
          const rawEnv = process.env.ENVIRONMENT?.trim();
          if (!rawEnv) {
            console.warn(
              "[DEK_TRACE] ENVIRONMENT not set for legacy copy; defaulting to 'dev'.",
            );
            environmentFolder = "dev";
          } else {
            environmentFolder = rawEnv;
          }
          break;
        }
      }
      sourcePath = `keys/${environmentFolder}/${sourceKey}.key`;
    } else {
      sourcePath = `keys/${sourceKey}.key`;
    }
    const sourceFile = sourceBucket.file(sourcePath);

    if (!(await sourceFile.exists())[0]) {
      console.log(
        `❌ Source DEK file not found: ${sourceKey} in bucket ${sourceBucket.name}`,
      );
      return false;
    }

    const version = Date.now();
    const targetFile = targetBucket.file(
      `keys/${finalTargetKey}_v${version}.key`,
    );

    // Copy the DEK to the new bucket key location
    try {
      await sourceFile.copy(targetFile);
      console.log(
        `✅ DEK copied from ${sourceFile.name} to ${targetFile.name}`,
      );
      return true;
    } catch (copyError) {
      // Fallback strategy: download then save, to avoid transient SDK copy issues (e.g., Parse Error)
      console.error(
        `⚠️  Direct copy failed (${copyError?.message}). Falling back to download+save...`,
      );
      try {
        const [encryptedDEK] = await sourceFile.download();
        await targetFile.save(encryptedDEK, { resumable: false });
        console.log(
          `✅ DEK copied via download+save from ${sourceFile.name} to ${targetFile.name}`,
        );
        return true;
      } catch (fallbackError) {
        console.error(
          `❌ Fallback copy (download+save) failed from ${sourceKey} to ${finalTargetKey}:`,
          fallbackError,
        );
        // Do not throw to avoid hard-failing auth flow; return false so callers can proceed using legacy DEK
        return false;
      }
    }
  } catch (error) {
    console.error(
      `❌ Error copying DEK from ${sourceKey} to ${targetKey}:`,
      error,
    );
    // Do not throw here to prevent 500 on sign-in; allow caller to continue with legacy DEK
    return false;
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
    const bucketKey = databaseId.toString();
    const currentBucket = await getBucket();

    // For a new signup, we should always generate a new key.
    // The legacy check is now handled by getUserDek.
    console.log(`[SIGNUP_TRACE] Generating new DEK for new user. DB_ID: ${bucketKey}`);
    const newDek = await generateAndStoreEncryptedDEK(
      bucketKey,
      currentBucket,
    );
    
    // Cache the new DEK
    dekCache.set(bucketKey, [newDek]);

    return [newDek];
  } catch (e) {
    console.error(
      `❌ Error generating DEK for signup (Firebase UID: ${firebaseUid}, DB ID: ${databaseId}) - ${e.message}`,
    );
    throw e;
  }
}

async function moveDEKToDeadLetterQueue(file, bucket) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const deadLetterPath = `keys/dead-letter/${file.name}_${timestamp}`;
    const deadLetterFile = bucket.file(deadLetterPath);

    await file.move(deadLetterFile);
    console.log(`Moved failing DEK to dead-letter queue: ${deadLetterPath}`);
  } catch (error) {
    console.error(
      `Failed to move failing DEK to dead-letter queue: ${error.message}`,
    );
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
  moveDEKToDeadLetterQueue,
  DecryptionError,
};
