import fs from "fs";
import crypto from "crypto";
import { GoogleAuth } from "google-auth-library";
import { LimitedMap } from "../lib/limitedMap.js";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import { storage, keysBucketName } from "../lib/storageClient.js";

class DecryptionError extends Error {
  constructor(message, errorCode) {
    super(message);
    this.name = 'DecryptionError';
    this.errorCode = errorCode;
  }
}

class DekMigrationInProgressError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DekMigrationInProgressError';
  }
}



let kmsClientInstance;
async function getKmsClient() {
  if (!kmsClientInstance) {
    const kmsServiceAccountB64 = process.env.KMS_SERVICE_ACCOUNT;
    if (!kmsServiceAccountB64 || kmsServiceAccountB64.trim() === "") {
      throw new Error(
        "❌ CRITICAL: KMS_SERVICE_ACCOUNT environment variable is not set or is empty.",
      );
    }
    let kmsCredentials;
    try {
      kmsCredentials = JSON.parse(
        Buffer.from(kmsServiceAccountB64, "base64").toString("utf-8"),
      );
    } catch (error) {
      console.error("❌ CRITICAL: Failed to parse KMS_SERVICE_ACCOUNT environment variable.", error);
      throw new Error(
        "❌ CRITICAL: Failed to parse KMS_SERVICE_ACCOUNT environment variable. Ensure it is a valid base64 encoded JSON string.",
      );
    }
    kmsClientInstance = new KeyManagementServiceClient({
      credentials: kmsCredentials,
      projectId: process.env.GCP_PROJECT_ID,
    });
    console.log("✅ KMS client initialized");
  }
  return kmsClientInstance;
}



/**
 * Resolve and validate a Google Cloud Storage bucket for use (defaults to the configured primary bucket).
 * @param {string} [bucketName] - Optional explicit bucket name; if omitted the configured `GCS_BUCKET_NAME` is used.
 * @returns {object} The Storage Bucket instance for the resolved bucket name.
 * @throws {Error} If no bucket name is configured or the resolved bucket does not exist or is not accessible.
 */
async function getBucket(bucketName) {
  const targetBucketName = bucketName || keysBucketName;
  if (!targetBucketName) {
    throw new Error("❌ CRITICAL: GCS_DEK_BUCKET_NAME environment variable is not set.");
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



// DEK cache in memory
const dekCache = new LimitedMap(1000);

// Import User model for data checking
import User from "./models/User.js";

/**
 * Generate a new 32-byte data encryption key (DEK), encrypt it with KMS, store the encrypted DEK in Cloud Storage, cache the plaintext DEK, and return the plaintext.
 *
 * @param {string} bucketKey - Identifier used as the storage key name (typically the user's database ID).
 * @param {object|null} targetBucket - Optional Google Cloud Storage Bucket object to write the encrypted DEK to; if null the configured primary bucket is used.
 * @returns {Buffer} The generated plaintext 32-byte DEK.
 * @throws {Error} If KMS encryption or saving the encrypted DEK to Cloud Storage fails.
 */
async function generateAndStoreEncryptedDEK(
  bucketKey,
  targetBucket = null, // Allow specifying target bucket for migration
) {
  console.log(`✨ Generating new DEK for bucket key: ${bucketKey}`);
  const dek = crypto.randomBytes(32);

  try {
    const kmsClient = await getKmsClient();
    const KEY_PATH = kmsClient.cryptoKeyPath(
      process.env.GCP_PROJECT_ID,
      process.env.GCP_KEY_LOCATION,
      process.env.GCP_KEY_RING,
      process.env.GCP_KEY_NAME,
    );
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

/**
 * List files in a bucket matching a prefix, retrying until at least one match is found or the attempt limit is reached.
 *
 * @param {string} prefix - The file name prefix to search for.
 * @param {number} [maxAttempts=3] - Maximum number of listing attempts.
 * @param {number} [baseDelay=500] - Base delay in milliseconds used between retries (multiplied by attempt index).
 * @return {Array} An array of file objects matching the prefix; may be empty if no files are found after all attempts.
 */
async function getFilesWithRetry(bucket, prefix, maxAttempts = 3, baseDelay = 500) {
  let files = [];
  let attempts = 0;
  while (files.length === 0 && attempts < maxAttempts) {
    attempts++;
    if (attempts > 1) {
      console.log(`[DEK_TRACE] DEK not found, retrying... (Attempt ${attempts}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, baseDelay * (attempts - 1)));
    }
    const [foundFiles] = await bucket.getFiles({ prefix });
    files = foundFiles;
  }
  return files;
}

/**
 * Constructs the GCS path for a DEK file, handling legacy and modern path structures.
 *
 * @param {string} bucketKey - The logical key for the DEK (e.g., user ID).
 * @param {object} bucket - The GCS Bucket object.
 * @param {boolean} [includeExtension=false] - Whether to include the '.key' extension in the path.
 * @returns {string} The constructed GCS path for the DEK file.
 */
function getDEKPath(bucketKey, bucket, includeExtension = false) {
  let path;
  if (bucket.name === process.env.LEGACY_GCS_BUCKET_NAME) {
    const environmentFolder = process.env.LEGACY_GCS_ENVIRONMENT_FOLDER;
    path = `keys/${environmentFolder}/${bucketKey}`;
  } else {
    path = `keys/${bucketKey}`;
  }

  if (includeExtension) {
    path += '.key';
  }

  return path;
}

/**
 * Locate encrypted DEK files for a given bucket key in the specified GCS bucket, download and decrypt them, and return their plaintext DEKs.
 *
 * Searches for DEK files under `keys/{bucketKey}` or, when the provided bucket is the legacy bucket, under `keys/{env}/{bucketKey}` (where `env` is derived from ENVIRONMENT). If not found in the keys directory for non-legacy buckets, the function also checks the bucket root for a file named exactly `bucketKey`. Each found encrypted DEK is downloaded and decrypted with the configured KMS key; decrypted plaintext DEKs are returned as Buffer instances. Encrypted DEKs that fail KMS decryption are moved to a dead-letter location and skipped.
 *
 * @param {string} bucketKey - Identifier used to locate DEK files in the bucket.
 * @param {object} bucket - Google Cloud Storage Bucket instance to search.
 * @returns {Buffer[]} An array of decrypted DEKs (Buffers). Returns an empty array if no DEK files are found or none can be decrypted.
 * @throws {Error} If file listing, download, or non-decryption-related decryption operations fail.
 */
async function getDEKFromBucket(bucketKey, bucket, kmsKeyPath = null) {
  let prefix = getDEKPath(bucketKey, bucket);
  console.log(`🔍 Looking for DEKs with prefix: gs://${bucket.name}/${prefix}`);

  let files = await getFilesWithRetry(bucket, prefix);

  // If no files are found, and we are not in the legacy bucket, check the root of the bucket
  if (files.length === 0 && bucket.name !== process.env.LEGACY_GCS_BUCKET_NAME) {
    console.log(`[DEK_TRACE] DEK not found in keys/ directory, checking root of the bucket`);
    prefix = bucketKey;
    files = await getFilesWithRetry(bucket, prefix);
  }

  const activeFiles = files.filter(file => !file.name.endsWith('.deleted'));

  if (activeFiles.length === 0) {
    console.log(
      `⚠️ DEK files not found for bucket key: ${bucketKey} in bucket ${bucket.name}`,
    );
    return [];
  }

  console.log(
    `✅ ${activeFiles.length} DEK file(s) found, downloading and decrypting...`,
  );

  const deks = [];
  const kmsClient = await getKmsClient();
  const KEY_PATH = kmsKeyPath || kmsClient.cryptoKeyPath(
    process.env.GCP_PROJECT_ID,
    process.env.GCP_KEY_LOCATION,
    process.env.GCP_KEY_RING,
    process.env.GCP_KEY_NAME,
  );
  for (const file of activeFiles) {
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
 * Retrieve and cache the user's data encryption keys (DEKs) by Firebase UID.
 *
 * Searches the in-memory cache, then the primary GCS bucket and legacy bucket(s), migrates any found legacy DEKs to the primary bucket, deduplicates results, caches them, and returns the plaintext DEKs.
 *
 * @param {string} firebaseUid - Firebase Authentication UID of the user.
 * @returns {Buffer[]} An array of unique plaintext DEKs as Buffers.
 * @throws {Error} If the user does not exist, no DEK is found for the user, or an error occurs during retrieval or migration.
 */
async function getUserDek(firebaseUid) {
  const user = await User.findOne({ authUid: firebaseUid });
  if (!user) {
    throw new Error(`User not found for Firebase UID: ${firebaseUid}`);
  }
  const bucketKey = user._id.toString();
  console.log(`[DEK_TRACE] getUserDek called for UID: ${firebaseUid}, resolved to bucketKey: ${bucketKey}`);

  // 1. Check cache first
  if (dekCache.has(bucketKey)) {
    const cachedDeks = dekCache.get(bucketKey);
    if (cachedDeks.length > 0) {
      console.log(`[DEK_TRACE] Found ${cachedDeks.length} DEK(s) in cache.`);
      return cachedDeks;
    }
  }

  // 2. If not in cache, retrieve it, cache it, and return it.
  console.log(`[DEK_TRACE] DEK not in cache for user ${bucketKey}. Retrieving...`);
  const deks = await migrateAndCacheDek(firebaseUid);
  return deks;
}

// Encrypts a value using AES-256-GCM and a provided data encryption key (DEK)
async function encryptValue(value, dek) {
  if (value === null || value === undefined) return value;

  try {
    const encryptionKey = Array.isArray(dek) ? dek[0] : dek;
    const dekHash = crypto.createHash('sha256').update(encryptionKey).digest('hex');
    
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
    throw e; // Re-throw the error to propagate encryption failures
  }
}

/**
 * Decrypts a base64-encoded AES-256-GCM ciphertext using one of the provided data encryption keys (DEKs) and returns the original value.
 *
 * Tries each DEK in order; on successful decryption parses and returns the JSON-decoded plaintext. If the input is null, undefined, or an empty string, it is returned unchanged.
 *
 * @param {string|null|undefined} cipherTextBase64 - The ciphertext encoded as a base64 string (IV || authTag || ciphertext).
 * @param {Buffer[]|Array<Buffer>} deks - An array of 32-byte DEKs to attempt for decryption; the function tries each key until one succeeds.
 * @returns {*} The decrypted value parsed from JSON, or the original input if it was null, undefined, or an empty string.
 * @throws {DecryptionError} When all provided DEKs fail to decrypt the ciphertext; the error includes an `errorCode` for reporting.
 */
async function decryptValue(cipherTextBase64, deks) {
  if (
    cipherTextBase64 === null ||
    cipherTextBase64 === undefined ||
    cipherTextBase64 === ""
  )
    return cipherTextBase64;

  const isBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(cipherTextBase64);
  if (!isBase64) {
    return cipherTextBase64;
  }

  for (const dek of deks) {
    try {
      const dekHash = crypto.createHash('sha256').update(dek).digest('hex');
      
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
        `⚠️ Decryption failed with one of the keys. Trying next key...`, e
      );
    }
  }

  const errorCode = `ALL_DEK_FAILED-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  throw new DecryptionError(
    `All decryption attempts failed. Please report error code: ${errorCode}`,
    errorCode,
  );
}

/**
 * Produces a SHA-256 hash of an email after trimming, lowercasing, and appending the configured salt.
 * @param {string} email - The email address to hash.
 * @returns {string} Hex-encoded SHA-256 digest of the salted, normalized email.
 */
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
 * Copy an encrypted DEK file from a source bucket/key to a new key in a target bucket, preserving a versioned filename.
 *
 * Attempts a direct server-side copy; if that fails, falls back to downloading the encrypted DEK and saving it to the target location.
 *
 * @param {string} sourceKey - The logical key name (bucketKey or legacy UID) identifying the DEK in the source bucket (without path or extension).
 * @param {object} sourceBucket - The GCS Bucket instance containing the source DEK file.
 * @param {object} targetBucket - The GCS Bucket instance where the DEK should be copied to.
 * @param {string|null} [targetKey=null] - Optional override for the target logical key name; when omitted, `sourceKey` is used.
 * @returns {Promise<boolean>} `true` if the DEK was successfully copied to the target bucket; `false` otherwise.
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

    const sourcePath = getDEKPath(sourceKey, sourceBucket, true);
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
 * Create and store a new data encryption key (DEK) for a user signing up and cache it under the provided database ID.
 *
 * @param {string} firebaseUid - Firebase authentication UID, used for logging and tracing.
 * @param {string|number} databaseId - Database user ID that will be used as the bucket key for storing the DEK.
 * @throws {Error} If `databaseId` is missing or empty.
 * @returns {Buffer[]} An array containing the newly generated plaintext DEK (as a Buffer).
 */
async function getUserDekForSignup(firebaseUid, databaseId) {
  try {
    if (!databaseId) {
      throw new Error(
        `❌ CRITICAL: databaseId is required for DEK generation (Firebase UID: ${firebaseUid})`,
      );
    }
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

/**
 * Move a DEK file to the dead-letter location within the given bucket.
 *
 * @param {import('@google-cloud/storage').File} file - The file object representing the failing DEK to move.
 * @param {import('@google-cloud/storage').Bucket} bucket - Target bucket where the dead-letter file will be placed.
 */
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

async function migrateAndCacheDek(firebaseUid) {
  let user;
  try {
    user = await User.findOne({ authUid: firebaseUid });
    if (!user) {
      throw new Error(`User not found for Firebase UID: ${firebaseUid}`);
    }
    const bucketKey = user._id.toString();
    console.log(`[DEK_TRACE] Starting DEK retrieval for user ${bucketKey}`);

    // Check cache first
    if (dekCache.has(bucketKey)) {
      const cachedDeks = dekCache.get(bucketKey);
      if (cachedDeks.length > 0) {
        console.log(`[DEK_TRACE] Found ${cachedDeks.length} DEK(s) in cache.`);
        return cachedDeks;
      }
    }

    const primaryBucket = await getBucket();

    // Check primary bucket with databaseId
    console.log(`[DEK_TRACE] Checking primary bucket with databaseId: ${bucketKey}`);
    const primaryDeks = await getDEKFromBucket(bucketKey, primaryBucket);
    if (primaryDeks.length > 0) {
      console.log(`[DEK_TRACE] Found ${primaryDeks.length} DEK(s) in primary bucket.`);
      dekCache.set(bucketKey, primaryDeks);
      return primaryDeks;
    }

    const errorMessage = `CRITICAL: No DEK found for user ${bucketKey} (Firebase UID: ${firebaseUid}). Data may be inaccessible.`;
    console.error(`❌ ${errorMessage}`);
    const errorCode = `NO_DEK_FOUND-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    throw new DecryptionError(errorMessage, errorCode);

  } catch (e) {
    console.error(
      `❌ Error getting DEK for Firebase UID: ${firebaseUid}, Database ID: ${user?._id} - ${e.message}`,
    );
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
  moveDEKToDeadLetterQueue,
  migrateAndCacheDek,
  DecryptionError,
  DekMigrationInProgressError,
  getBucket,
};