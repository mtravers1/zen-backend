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

class CorruptedDataError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CorruptedDataError';
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

const dekCache = new LimitedMap(1000);

import User from "./models/User.js";

async function generateAndStoreEncryptedDEK(
  bucketKey,
  targetBucket = null,
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
    await file.save(encryptedDEK, {
      resumable: false,
      validation: false,
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

  dekCache.set(bucketKey, [dek]);

  return dek;
}

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

async function getDEKFromBucket(bucketKey, bucket, kmsKeyPath = null) {
  let prefix = getDEKPath(bucketKey, bucket);
  console.log(`🔍 Looking for DEKs with prefix: gs://${bucket.name}/${prefix}`);

  let files = await getFilesWithRetry(bucket, prefix);

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

        await moveDEKToDeadLetterQueue(file, bucket);

        continue;
      } else {
        throw decryptError;
      }
    }
  }

  return deks;
}

async function getUserDek(firebaseUid) {
  const user = await User.findOne({ authUid: firebaseUid });
  if (!user) {
    throw new Error(`User not found for Firebase UID: ${firebaseUid}`);
  }
  const bucketKey = user._id.toString();
  console.log(`[DEK_TRACE] getUserDek called for UID: ${firebaseUid}, resolved to bucketKey: ${bucketKey}`);

  if (dekCache.has(bucketKey)) {
    const cachedDeks = dekCache.get(bucketKey);
    if (cachedDeks.length > 0) {
      console.log(`[DEK_TRACE] Found ${cachedDeks.length} DEK(s) in cache.`);
      return cachedDeks;
    }
  }

  console.log(`[DEK_TRACE] DEK not in cache for user ${bucketKey}. Retrieving...`);
  const deks = await migrateAndCacheDek(firebaseUid);
  return deks;
}

async function encryptValue(value, dek) {
  if (value === null || value === undefined) return value;

  try {
    const encryptionKey = Array.isArray(dek) ? dek[0] : dek;
    const dekHash = crypto.createHash('sha256').update(encryptionKey).digest('hex');
    
    const jsonString = JSON.stringify(value);

    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(jsonString, "utf8"),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  } catch (e) {
    console.error("Error encrypting value:", e);
    throw e;
  }
}

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

  const cipherBuffer = Buffer.from(cipherTextBase64, "base64");

  if (cipherBuffer.length < 32) {
    throw new CorruptedDataError("Value is too short to be valid ciphertext.");
  }

  for (const dek of deks) {
    try {
      const dekHash = crypto.createHash('sha256').update(dek).digest('hex');
      
      const iv = cipherBuffer.slice(0, 16);
      const tag = cipherBuffer.slice(16, 32);
      const encrypted = cipherBuffer.slice(32);

      const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);

      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString("utf8");

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

    try {
      await sourceFile.copy(targetFile);
      console.log(
        `✅ DEK copied from ${sourceFile.name} to ${targetFile.name}`,
      );
      return true;
    } catch (copyError) {
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
        return false;
      }
    }
  } catch (error) {
    console.error(
      `❌ Error copying DEK from ${sourceKey} to ${targetKey}:`,
      error,
    );
    return false;
  }
}

async function getUserDekForSignup(firebaseUid, databaseId) {
  try {
    if (!databaseId) {
      throw new Error(
        `❌ CRITICAL: databaseId is required for DEK generation (Firebase UID: ${firebaseUid})`,
      );
    }
    const bucketKey = databaseId.toString();
    const currentBucket = await getBucket();

    console.log(`[SIGNUP_TRACE] Generating new DEK for new user. DB_ID: ${bucketKey}`);
    const newDek = await generateAndStoreEncryptedDEK(
      bucketKey,
      currentBucket,
    );
    
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

async function migrateAndCacheDek(firebaseUid) {
  let user;
  try {
    user = await User.findOne({ authUid: firebaseUid });
    if (!user) {
      throw new Error(`User not found for Firebase UID: ${firebaseUid}`);
    }
    const bucketKey = user._id.toString();
    console.log(`[DEK_TRACE] Starting DEK retrieval for user ${bucketKey}`);

    if (dekCache.has(bucketKey)) {
      const cachedDeks = dekCache.get(bucketKey);
      if (cachedDeks.length > 0) {
        console.log(`[DEK_TRACE] Found ${cachedDeks.length} DEK(s) in cache.`);
        return cachedDeks;
      }
    }

    const primaryBucket = await getBucket();

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
  CorruptedDataError,
  getBucket,
};
