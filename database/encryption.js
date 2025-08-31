import dotenv from "dotenv";
import { LimitedMap } from "../lib/limitedMap.js";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";

dotenv.config();

const serviceAccountBase64 = process.env.STORAGE_SERVICE_ACCOUNT;
const environment = process.env.ENVIRONMENT || "dev";
const serviceAccountJsonString = Buffer.from(
  serviceAccountBase64,
  "base64" 
).toString("utf8");
const storageServiceAccount = JSON.parse(serviceAccountJsonString);

const kmsServiceAccountBase64 = process.env.KMS_SERVICE_ACCOUNT;
const kmsServiceAccountJsonString = Buffer.from(
  kmsServiceAccountBase64,
  "base64"
).toString("utf8");
const kmsServiceAccount = JSON.parse(kmsServiceAccountJsonString);

// Initialize clients with error handling
let kmsClient = null;
let storage = null;
let isCloudAvailable = true;

try {
  kmsClient = new KeyManagementServiceClient({
    credentials: kmsServiceAccount,
  });
  
  storage = new Storage({
    credentials: storageServiceAccount,
  });
  
  console.log("[ENCRYPTION] Google Cloud clients initialized successfully");
} catch (error) {
  console.error("[ENCRYPTION] Failed to initialize Google Cloud clients:", error.message);
  isCloudAvailable = false;
}

const BUCKET_NAME = "zentavos-bucket";
const KEY_PATH = kmsClient ? kmsClient.cryptoKeyPath(
  process.env.GCP_PROJECT_ID,
  process.env.GCP_KEY_LOCATION,
  process.env.GCP_KEY_RING,
  process.env.GCP_KEY_NAME
) : null;

// DEK cache in memory
const dekCache = new LimitedMap(1000); // Limit to 1000 DEKs

// Cache for failed decryption attempts to avoid repeated failures
const failedDecryptionCache = new LimitedMap(1000);

// Cache for failed DEK operations to avoid repeated failures
const failedDekCache = new LimitedMap(100);

// Local fallback DEK storage (in-memory only, not persistent)
const localDekStorage = new Map();

// Function to check if Google Cloud is available
function isGoogleCloudAvailable() {
  return isCloudAvailable && kmsClient && storage && KEY_PATH;
}

// Function to generate a local fallback DEK
function generateLocalFallbackDEK() {
  return crypto.randomBytes(32);
}

// Function to encrypt data with local fallback
function encryptWithLocalFallback(data, dek) {
  try {
    const jsonString = JSON.stringify(data);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(jsonString, "utf8"),
      cipher.final(),
    ]);
    
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  } catch (e) {
    console.error("[ENCRYPTION] Local encryption failed:", e.message);
    return data;
  }
}

// Function to decrypt data with local fallback
function decryptWithLocalFallback(cipherTextBase64, dek) {
  try {
    const cipherBuffer = Buffer.from(cipherTextBase64, "base64");
    
    if (cipherBuffer.length < 33) {
      return cipherTextBase64;
    }
    
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
    console.log(`[ENCRYPTION] Local decryption failed: ${e.message}`);
    return cipherTextBase64;
  }
}

async function generateAndStoreEncryptedDEK(uid) {
  try {
    if (!isGoogleCloudAvailable()) {
      console.log(`[ENCRYPTION] Google Cloud unavailable, using local fallback for user: ${uid}`);
      const localDek = generateLocalFallbackDEK();
      localDekStorage.set(uid, localDek);
      dekCache.set(uid, localDek);
      return localDek;
    }

    const dek = crypto.randomBytes(32);

    const [encryptResponse] = await kmsClient.encrypt({
      name: KEY_PATH,
      plaintext: dek,
    });

    const encryptedDEK = encryptResponse.ciphertext;
    const file = storage.bucket(BUCKET_NAME).file(`keys/${environment}/${uid}.key`);
    await file.save(encryptedDEK);

    // Cache the DEK
    dekCache.set(uid, dek);

    console.log(`[ENCRYPTION] Generated new DEK for user: ${uid}`);
    return dek;
  } catch (error) {
    console.error(`[ENCRYPTION] Failed to generate DEK with Google Cloud for user ${uid}:`, error.message);
    console.log(`[ENCRYPTION] Falling back to local DEK for user: ${uid}`);
    
    // Fallback to local DEK
    const localDek = generateLocalFallbackDEK();
    localDekStorage.set(uid, localDek);
    dekCache.set(uid, localDek);
    
    return localDek;
  }
}

async function getDEKFromBucket(uid) {
  try {
    if (!isGoogleCloudAvailable()) {
      console.log(`[ENCRYPTION] Google Cloud unavailable, checking local storage for user: ${uid}`);
      return localDekStorage.get(uid) || null;
    }

    const file = storage.bucket(BUCKET_NAME).file(`keys/${environment}/${uid}.key`);
    if (!(await file.exists())[0]) {
      return null;
    }
    const [encryptedDEK] = await file.download();

    const [decryptResponse] = await kmsClient.decrypt({
      name: KEY_PATH,
      ciphertext: encryptedDEK,
    });

    return decryptResponse.plaintext;
  } catch (error) {
    console.error(`[ENCRYPTION] Failed to get DEK from bucket for user ${uid}:`, error.message);
    
    // If the DEK is corrupted, try to remove it and return null
    if (error.message.includes('Decryption failed: the ciphertext is invalid')) {
      try {
        if (isGoogleCloudAvailable()) {
          console.log(`[ENCRYPTION] Removing corrupted DEK for user ${uid}`);
          const file = storage.bucket(BUCKET_NAME).file(`keys/${environment}/${uid}.key`);
          await file.delete();
          console.log(`[ENCRYPTION] Successfully removed corrupted DEK for user ${uid}`);
        }
      } catch (deleteError) {
        console.error(`[ENCRYPTION] Failed to remove corrupted DEK for user ${uid}:`, deleteError.message);
      }
    }
    
    // Check local storage as fallback
    const localDek = localDekStorage.get(uid);
    if (localDek) {
      console.log(`[ENCRYPTION] Using local fallback DEK for user: ${uid}`);
      return localDek;
    }
    
    return null;
  }
}

async function getUserDek(uid) {
  try {
    // Check if we've already failed to get DEK for this user
    if (failedDekCache.has(uid)) {
      const failedInfo = failedDekCache.get(uid);
      const timeSinceFailure = Date.now() - failedInfo.timestamp;
      
      // Wait 5 minutes before retrying
      if (timeSinceFailure < 5 * 60 * 1000) {
        console.log(`[ENCRYPTION] Skipping DEK retrieval for user ${uid} (recent failure)`);
        throw new Error(`DEK retrieval failed recently for user ${uid}`);
      } else {
        // Remove from failed cache after 5 minutes
        failedDekCache.delete(uid);
      }
    }

    // Check in-memory cache first
    if (dekCache.has(uid)) {
      return dekCache.get(uid);
    }

    let dek = await getDEKFromBucket(uid);

    if (!dek) {
      dek = await generateAndStoreEncryptedDEK(uid);
    } else {
      dekCache.set(uid, dek); // Cache it once retrieved
    }

    return dek;
  } catch (e) {
    console.error(`[ENCRYPTION] Error getting DEK for user ${uid}:`, e.message);
    
    // Cache the failure to avoid repeated attempts
    failedDekCache.set(uid, {
      timestamp: Date.now(),
      error: e.message
    });
    
    throw e;
  }
}

// Enhanced function to detect if data needs encryption/decryption
function shouldProcessData(value) {
  if (value === null || value === undefined || value === "") {
    return false;
  }
  
  // If it's not a string, it doesn't need processing
  if (typeof value !== 'string') {
    return false;
  }
  
  // If it's a short string (likely not encrypted), don't process
  if (value.length < 33) {
    return false;
  }
  
  // Check if it looks like base64 (basic validation)
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(value)) {
    return false;
  }
  
  return true;
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

// Enhanced decrypt function with better error handling and fallback
async function decryptValue(cipherTextBase64, dek) {
  if (!shouldProcessData(cipherTextBase64)) {
    return cipherTextBase64;
  }

  // Check if we've already failed to decrypt this value
  const cacheKey = `${cipherTextBase64}:${dek.toString('hex').substring(0, 8)}`;
  if (failedDecryptionCache.has(cacheKey)) {
    console.log(`[ENCRYPTION] Skipping previously failed decryption for: ${cipherTextBase64.substring(0, 20)}...`);
    return cipherTextBase64;
  }

  try {
    // Decode the base64-encoded ciphertext
    const cipherBuffer = Buffer.from(cipherTextBase64, "base64");

    // Validate buffer length (IV + Auth Tag + minimum encrypted content)
    if (cipherBuffer.length < 33) {
      console.log(`[ENCRYPTION] Data too short to be encrypted: ${cipherTextBase64.length} chars`);
      return cipherTextBase64;
    }

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
    const result = JSON.parse(decrypted);
    console.log(`[ENCRYPTION] Successfully decrypted data: ${typeof result}`);
    return result;
  } catch (e) {
    // Log the failure and cache it to avoid repeated attempts
    console.log(`[ENCRYPTION] Decryption failed for data (${cipherTextBase64.length} chars): ${e.message}`);
    failedDecryptionCache.set(cacheKey, {
      timestamp: Date.now(),
      error: e.message,
      dataLength: cipherTextBase64.length
    });
    
    // Return the original value (it might not be encrypted or was encrypted with different keys)
    return cipherTextBase64;
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

// Function to check if data is encrypted
function isEncrypted(value) {
  return shouldProcessData(value);
}

// Function to get encryption status
function getEncryptionStatus(value) {
  if (!shouldProcessData(value)) {
    return { encrypted: false, reason: 'not_processable' };
  }
  
  try {
    const buffer = Buffer.from(value, 'base64');
    if (buffer.length < 33) {
      return { encrypted: false, reason: 'too_short' };
    }
    
    // Try to extract IV and tag
    const iv = buffer.slice(0, 16);
    const tag = buffer.slice(16, 32);
    
    if (iv.length === 16 && tag.length === 16) {
      return { encrypted: true, reason: 'valid_format' };
    } else {
      return { encrypted: false, reason: 'invalid_format' };
    }
  } catch (e) {
    return { encrypted: false, reason: 'invalid_base64' };
  }
}

// Function to force regenerate DEK for a user (useful for recovery)
async function forceRegenerateDEK(uid) {
  try {
    console.log(`[ENCRYPTION] Force regenerating DEK for user: ${uid}`);
    
    // Remove from caches
    dekCache.delete(uid);
    failedDekCache.delete(uid);
    localDekStorage.delete(uid);
    
    // Try to remove existing file if Google Cloud is available
    if (isGoogleCloudAvailable()) {
      try {
        const file = storage.bucket(BUCKET_NAME).file(`keys/${environment}/${uid}.key`);
        if ((await file.exists())[0]) {
          await file.delete();
          console.log(`[ENCRYPTION] Removed existing DEK file for user: ${uid}`);
        }
      } catch (deleteError) {
        console.log(`[ENCRYPTION] Could not remove existing DEK file for user ${uid}:`, deleteError.message);
      }
    }
    
    // Generate new DEK
    const newDek = await generateAndStoreEncryptedDEK(uid);
    console.log(`[ENCRYPTION] Successfully force regenerated DEK for user: ${uid}`);
    return newDek;
  } catch (error) {
    console.error(`[ENCRYPTION] Failed to force regenerate DEK for user ${uid}:`, error.message);
    throw error;
  }
}

// Function to get system status
function getSystemStatus() {
  return {
    googleCloudAvailable: isGoogleCloudAvailable(),
    dekCacheSize: dekCache.size,
    failedDecryptionCacheSize: failedDecryptionCache.size,
    failedDekCacheSize: failedDekCache.size,
    localDekStorageSize: localDekStorage.size,
    environment: environment
  };
}

export {
  encryptValue,
  decryptValue,
  getUserDek,
  hashEmail,
  hashValue,
  isEncrypted,
  getEncryptionStatus,
  forceRegenerateDEK,
  getSystemStatus
};
