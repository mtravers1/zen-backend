import fs from 'fs';
import { LimitedMap } from "../lib/limitedMap.js";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";

class DecryptionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DecryptionError';
  }
}

// Validate required environment variables
const requiredEnvVars = [
  "STORAGE_SERVICE_ACCOUNT",
  "GCP_PROJECT_ID",
];

// Only require KMS variables if KMS is not bypassed
if (process.env.KMS_BYPASS !== 'true') {
  requiredEnvVars.push("KMS_SERVICE_ACCOUNT", "GCP_KEY_LOCATION", "GCP_KEY_RING", "GCP_KEY_NAME");
}

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.warn(`⚠️ WARNING: Environment variable ${envVar} is not set. This may cause issues.`);
  }
}

let kmsClient, storage;

// Initialize Storage client
let storageCredentials = null; // Initialize to null
const storageServiceAccountB64 = process.env.STORAGE_SERVICE_ACCOUNT;
let loadedFromEnv = false;

if (storageServiceAccountB64 && storageServiceAccountB64.trim() !== '') {
  try {
    storageCredentials = JSON.parse(Buffer.from(storageServiceAccountB64, 'base64').toString('utf-8'));
    console.log("✅ Storage credentials loaded from environment variable.");
    loadedFromEnv = true;
  } catch (error) {
    console.warn("⚠️ WARNING: Failed to parse STORAGE_SERVICE_ACCOUNT environment variable. Attempting fallback for test environment.");
    // Do not throw here, allow fallback
  }
}

if (!loadedFromEnv && process.env.NODE_ENV === 'test') {
  try {
    storageCredentials = JSON.parse(fs.readFileSync('./storage_service_account.json', 'utf-8'));
    console.log("✅ Storage credentials loaded from storage_service_account.json file for test environment.");
  } catch (error) {
    console.error("❌ CRITICAL: Failed to load storage_service_account.json for test environment. Ensure the file exists and is valid JSON.");
    throw error;
  }
}

if (!storageCredentials) {
  throw new Error("❌ CRITICAL: Storage credentials could not be loaded. Ensure STORAGE_SERVICE_ACCOUNT environment variable is set and valid, or storage_service_account.json exists in test environment.");
}

storage = new Storage({
  credentials: storageCredentials,
  projectId: process.env.GCP_PROJECT_ID,
});
console.log("✅ Storage client initialized");

if (process.env.KMS_BYPASS === 'true') {
  console.warn('⚠️ WARNING: Google Cloud KMS is bypassed. DEKs will be stored unencrypted.');
  kmsClient = {
    encrypt: async ({ plaintext }) => {
      console.log('KMS mock: encrypt (passthrough)');
      return [{ ciphertext: plaintext }];
    },
    decrypt: async ({ ciphertext }) => {
      console.log('KMS mock: decrypt (passthrough)');
      return [{ plaintext: ciphertext }];
    },
    cryptoKeyPath: () => 'dummy-kms-path',
  };
  console.log('✅ KMS client mocked (passthrough)');
} else {
  kmsClient = new KeyManagementServiceClient({
    credentials: storageCredentials, // KMS uses the same credentials as Storage
    projectId: process.env.GCP_PROJECT_ID,
  });
  console.log('✅ KMS client initialized');
}

const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const LEGACY_GCS_BUCKET_NAME = process.env.LEGACY_GCS_BUCKET_NAME || 'zentavos-bucket'; // Fallback to hardcoded if not set

async function getBucket(bucketName) {
  const targetBucketName = bucketName || GCS_BUCKET_NAME;
  if (!targetBucketName) {
    console.warn('⚠️ CRITICAL: GCS_BUCKET_NAME environment variable is not set. Using legacy bucket.');
    return storage.bucket(LEGACY_GCS_BUCKET_NAME);
  }

  try {
    const bucket = storage.bucket(targetBucketName);
    const [exists] = await bucket.exists();
    if (exists) {
      return bucket;
    } else {
      console.warn(`⚠️ GCS bucket "${targetBucketName}" does not exist or is not accessible. Falling back to legacy bucket "${LEGACY_GCS_BUCKET_NAME}".`);
      return storage.bucket(LEGACY_GCS_BUCKET_NAME);
    }
  } catch (error) {
    console.warn(`⚠️ Failed to check for GCS bucket "${targetBucketName}". Falling back to legacy bucket "${LEGACY_GCS_BUCKET_NAME}". Error: ${error.message}`);
    return storage.bucket(LEGACY_GCS_BUCKET_NAME);
  }
}

const KEY_PATH = kmsClient.cryptoKeyPath(
  process.env.GCP_PROJECT_ID,
  process.env.GCP_KEY_LOCATION,
  process.env.GCP_KEY_RING,
  process.env.GCP_KEY_NAME
);

// DEK cache in memory
const dekCache = new LimitedMap(1000);
const DEK_VERSIONS = new Map();

// Import User model for data checking
import User from "./models/User.js";

async function generateAndStoreEncryptedDEK(
  bucketKey,
  forceRegenerate = false,
  targetBucket = null // Allow specifying target bucket for migration
) {
  // Check for regeneration safeguard
  if (process.env.ALLOW_DEK_REGENERATION !== 'true' && !forceRegenerate) {
    const errorMessage = `CRITICAL: DEK regeneration attempted for user ${bucketKey} but ALLOW_DEK_REGENERATION is not 'true'. Aborting to prevent data loss.`;
    console.error(`❌ ${errorMessage}`);
    throw new Error(errorMessage);
  }

  // If force regenerate, create backup of old DEK first
  if (forceRegenerate) {
    await backupExistingDEK(bucketKey, targetBucket);
  }

  console.log(`✨ Generating new DEK for bucket key: ${bucketKey}`);
  const dek = crypto.randomBytes(32);
  const version = Date.now();

  try {
    const [encryptResponse] = await kmsClient.encrypt({
      name: KEY_PATH,
      plaintext: dek,
    });

    const encryptedDEK = encryptResponse.ciphertext;
    const filePath = `keys/${bucketKey}_v${version}.key`;
    const bucket = targetBucket || await getBucket();
    const file = bucket.file(filePath);

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
    console.error(`❌ Error: ${saveError.message}`);
    throw saveError;
  }

  // Cache the DEK
  const dekDetails = { dek, version, createdAt: new Date() };
  dekCache.set(bucketKey, dekDetails);

  // Store versions in DEK_VERSIONS map
  const versions = DEK_VERSIONS.get(bucketKey) || [];
  versions.push(version);
  DEK_VERSIONS.set(bucketKey, versions);

  return dek;
}

async function getDEKFromBucket(bucketKey, bucket) {
  const prefix = `keys/${bucketKey}`;
  console.log(`🔍 Looking for DEKs with prefix: gs://${bucket.name}/${prefix}`);

  const [files] = await bucket.getFiles({ prefix });

  if (files.length === 0) {
    console.log(`⚠️ DEK files not found for bucket key: ${bucketKey} in bucket ${bucket.name}`);
    return [];
  }

  console.log(`✅ ${files.length} DEK file(s) found, downloading and decrypting...`);

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
          `⚠️ The DEK may have been encrypted with a different KMS key or is corrupted`
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
 * STEP 1: User exists in Firebase (verified by caller)
 * STEP 2: Find user in database using Firebase UID
 * STEP 3: Get Database ID from user record
 * STEP 4: Search for DEK using Database ID (PRIMARY) in the new bucket
 * STEP 5: If not found, search in the legacy bucket
 * STEP 6: If found in legacy, migrate to new bucket
 * STEP 7: If not found anywhere, regenerate (with safeguard)
 */
async function getUserDek(firebaseUid) {
  let user;
  try {
    console.log(`🔍 [STEP 2] Looking up user in database with Firebase UID: ${firebaseUid}`);
    user = await User.findOne({ authUid: firebaseUid });

    if (!user) {
      throw new Error(`User not found for Firebase UID: ${firebaseUid}`);
    }

    const bucketKey = user._id.toString();
    console.log(`✅ [STEP 2] User found in database`);
    console.log(`🔑 [STEP 3] Database ID extracted: ${bucketKey} (will be used as PRIMARY bucket key)`);

    if (dekCache.has(bucketKey)) {
      const cachedDeks = dekCache.get(bucketKey);
      if (Array.isArray(cachedDeks) && cachedDeks.length > 0) {
        console.log(`✅ DEK(s) retrieved from cache for bucket key: ${bucketKey}`);
        return cachedDeks;
      }
      dekCache.delete(bucketKey);
    }

    const currentBucket = await getBucket();
    let deks = await getDEKFromBucket(bucketKey, currentBucket);

    // If no DEK found in current bucket, try legacy bucket
    if (deks.length === 0 && currentBucket.name !== LEGACY_GCS_BUCKET_NAME) {
      console.warn(`⚠️ [STEP 4] No valid DEK found with Database ID: ${bucketKey} in current bucket (${currentBucket.name}). Checking legacy bucket (${LEGACY_GCS_BUCKET_NAME}).`);
      const legacyBucket = storage.bucket(LEGACY_GCS_BUCKET_NAME);
      const legacyDeks = await getDEKFromBucket(bucketKey, legacyBucket);

      if (legacyDeks.length > 0) {
        console.log(`✅ Found valid legacy DEK with Database ID: ${bucketKey} in legacy bucket. Migrating to current bucket (${currentBucket.name}).`);
        await copyDEKToNewBucketKey(bucketKey, legacyBucket, currentBucket);
        deks = legacyDeks;
        dekCache.set(bucketKey, deks);
      } else {
        // Try legacy Firebase UID if no DEK found with DB ID in either bucket
        console.warn(`⚠️ No valid DEK found with Database ID: ${bucketKey} in either current or legacy bucket. Trying legacy Firebase UID: ${firebaseUid}.`);
        const legacyFirebaseUidDeks = await getDEKFromBucket(firebaseUid, legacyBucket);

        if (legacyFirebaseUidDeks.length > 0) {
          console.log(`✅ Found valid legacy DEK with Firebase UID: ${firebaseUid} in legacy bucket. Migrating to current bucket (${currentBucket.name}) with Database ID: ${bucketKey}.`);
          await copyDEKToNewBucketKey(firebaseUid, legacyBucket, currentBucket, bucketKey); // Pass new bucketKey for target
          deks = legacyFirebaseUidDeks;
          dekCache.set(bucketKey, deks);
        } else {
          // No valid DEK found anywhere - regenerate (with safeguard)
          console.warn(`⚠️ No valid DEK found anywhere for user ${bucketKey}. Attempting regeneration.`);
          const newDek = await generateAndStoreEncryptedDEK(bucketKey, false, currentBucket);
          deks = [newDek];
        }
      }
    } else if (deks.length === 0) {
      // No valid DEK found anywhere - regenerate (with safeguard)
      console.warn(`⚠️ No valid DEK found anywhere for user ${bucketKey}. Attempting regeneration.`);
      const newDek = await generateAndStoreEncryptedDEK(bucketKey, false, currentBucket);
      deks = [newDek];
    } else {
      console.log(`✅ [STEP 4] DEK found and valid with Database ID: ${bucketKey} in bucket ${currentBucket.name}`);
      dekCache.set(bucketKey, deks);
    }

    return deks;
  } catch (e) {
    console.error(`❌ Error getting DEK for Firebase UID: ${firebaseUid}, Database ID: ${user?._id} - ${e.message}`);
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
        `⚠️ Decryption failed with one of the keys. Trying next key...`
      );
    }
  }

  console.error(
    `❌ Decryption failed for value: ${
      typeof cipherTextBase64 === "string"
        ? cipherTextBase64.substring(0, 50)
        : cipherTextBase64
    }...`
  );
  console.error(`❌ All decryption attempts failed.`);
  return cipherTextBase64; // Return original value if decryption fails
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
async function copyDEKToNewBucketKey(sourceKey, sourceBucket, targetBucket, targetKey = null) {
  try {
    const finalTargetKey = targetKey || sourceKey;
    console.log(
      `📦 Copying DEK from source key ${sourceKey} in bucket ${sourceBucket.name} to target key ${finalTargetKey} in bucket ${targetBucket.name}`
    );

    const sourceFile = sourceBucket.file(`keys/${sourceKey}.key`);

    if (!(await sourceFile.exists())[0]) {
      console.log(`❌ Source DEK file not found: ${sourceKey} in bucket ${sourceBucket.name}`);
      return false;
    }

    const version = Date.now();
    const targetFile = targetBucket.file(`keys/${finalTargetKey}_v${version}.key`);

    // Copy the DEK to the new bucket key location
    try {
      await sourceFile.copy(targetFile);
      console.log(`✅ DEK copied from ${sourceFile.name} to ${targetFile.name}`);
      return true;
    } catch (copyError) {
      // Fallback strategy: download then save, to avoid transient SDK copy issues (e.g., Parse Error)
      console.error(
        `⚠️  Direct copy failed (${copyError?.message}). Falling back to download+save...`
      );
      try {
        const [encryptedDEK] = await sourceFile.download();
        await targetFile.save(encryptedDEK, { resumable: false });
        console.log(
          `✅ DEK copied via download+save from ${sourceFile.name} to ${targetFile.name}`
        );
        return true;
      } catch (fallbackError) {
        console.error(
          `❌ Fallback copy (download+save) failed from ${sourceKey} to ${finalTargetKey}:`,
          fallbackError
        );
        // Do not throw to avoid hard-failing auth flow; return false so callers can proceed using legacy DEK
        return false;
      }
    }
  } catch (error) {
    console.error(
      `❌ Error copying DEK from ${sourceKey} to ${targetKey}:`,
      error
    );
    // Do not throw here to prevent 500 on sign-in; allow caller to continue with legacy DEK
    return false;
  }
}

/**
 * Create backup of existing DEK before regenerating
 */
async function backupExistingDEK(bucketKey, currentBucket) {
  try {
    console.log(
      `💾 Creating backup of existing DEK for bucket key: ${bucketKey} in bucket ${currentBucket.name}`
    );

    const originalFile = currentBucket.file(`keys/${bucketKey}.key`);

    if (!(await originalFile.exists())[0]) {
      console.log(`ℹ️ No existing DEK to backup for bucket key: ${bucketKey} in bucket ${currentBucket.name}`);
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = currentBucket.file(
      `keys/backups/${bucketKey}_${timestamp}.key`
    );

    try {
      await originalFile.copy(backupFile);
      console.log(
        `✅ DEK backup created for bucket key ${bucketKey}: ${backupFile.name}`
      );
    } catch (copyError) {
      console.warn(
        `⚠️ Direct copy for backup failed (${copyError?.message}). Falling back to download+save...`
      );
      try {
        const [encryptedDEK] = await originalFile.download();
        await backupFile.save(encryptedDEK, { resumable: false });
        console.log(
          `✅ DEK backup created via download+save for bucket key ${bucketKey}: ${backupFile.name}`
        );
      } catch (fallbackError) {
        console.error(
          `❌ Fallback backup (download+save) failed for bucket key ${bucketKey}:`,
          fallbackError
        );
        throw new Error(
          `Failed to create DEK backup for bucket key ${bucketKey}: ${fallbackError.message}`
        );
      }
    }
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
async function tryRecoverDEKFromBackup(bucketKey, currentBucket) {
  try {
    console.log(
      `🔄 Attempting DEK recovery from backup for bucket key: ${bucketKey} in bucket ${currentBucket.name}`
    );

    const [files] = await currentBucket.getFiles({
      prefix: `keys/backups/${bucketKey}_`,
    });

    if (files.length === 0) {
      console.log(`❌ No backup DEK files found for bucket key: ${bucketKey} in bucket ${currentBucket.name}`);
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
        const currentFile = currentBucket.file(`keys/${bucketKey}.key`);

        await currentFile.save(encryptedDEK);
        dekCache.set(bucketKey, dek);

        console.log(`✅ DEK restored for bucket key: ${bucketKey} in bucket ${currentBucket.name}`);
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
      `❌ All backup recovery attempts failed for bucket key: ${bucketKey} in bucket ${currentBucket.name}`
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
    const bucketKey = databaseId.toString();
    const currentBucket = await getBucket();
    const legacyBucket = storage.bucket(LEGACY_GCS_BUCKET_NAME);

    // Check if DEK already exists with the database ID in the current bucket
    let deks = await getDEKFromBucket(bucketKey, currentBucket);

    if (deks.length > 0) {
      dekCache.set(bucketKey, deks);
      return deks;
    }

    // Check if DEK exists with Firebase UID in the legacy bucket (legacy/migration case)
    const legacyFirebaseUidDeks = await getDEKFromBucket(firebaseUid, legacyBucket);

    if (legacyFirebaseUidDeks.length > 0) {
      const copySuccess = await copyDEKToNewBucketKey(firebaseUid, legacyBucket, currentBucket, bucketKey);

      if (copySuccess) {
        deks = legacyFirebaseUidDeks;
        dekCache.set(bucketKey, deks);
      } else {
        // If copy failed, still use the legacy DEK but log a warning
        console.warn(`⚠️ Failed to copy legacy DEK for Firebase UID: ${firebaseUid} to new bucket. Proceeding with legacy DEK.`);
        deks = legacyFirebaseUidDeks;
        dekCache.set(bucketKey, deks);
        dekCache.set(firebaseUid, deks); // Cache under both keys for robustness
      }
      return deks;
    }

    // No existing DEK found anywhere - create new one (with safeguard)
    const newDek = await generateAndStoreEncryptedDEK(bucketKey, false, currentBucket);
    return [newDek];
  } catch (e) {
    console.error(
      `❌ Error getting DEK for signup (Firebase UID: ${firebaseUid}, DB ID: ${databaseId}) - ${e.message}`
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
    console.error(`Failed to move failing DEK to dead-letter queue: ${error.message}`);
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
  moveDEKToDeadLetterQueue,
  DecryptionError,
};