import dotenv from "dotenv";
import { LimitedMap } from "../lib/limitedMap.js";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";
import fs from "fs";
import path from "path";

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
let cloudFailureCount = 0;
const MAX_CLOUD_FAILURES = 3;

// Local DEK storage directory
const LOCAL_DEK_DIR = path.join(process.cwd(), 'local_deks');
if (!fs.existsSync(LOCAL_DEK_DIR)) {
  fs.mkdirSync(LOCAL_DEK_DIR, { recursive: true });
}

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
  cloudFailureCount = MAX_CLOUD_FAILURES;
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

// Function to check if Google Cloud is available and should be used
function isGoogleCloudAvailable() {
  // If we've had too many failures, force local mode
  if (cloudFailureCount >= MAX_CLOUD_FAILURES) {
    return false;
  }
  
  return isCloudAvailable && kmsClient && storage && KEY_PATH;
}

// Function to mark cloud operation as failed
function markCloudFailure() {
  cloudFailureCount++;
  console.log(`[ENCRYPTION] Cloud failure count: ${cloudFailureCount}/${MAX_CLOUD_FAILURES}`);
  
  if (cloudFailureCount >= MAX_CLOUD_FAILURES) {
    console.log("[ENCRYPTION] Maximum cloud failures reached, switching to local mode");
    isCloudAvailable = false;
  }
}

// Function to get local DEK file path
function getLocalDekPath(uid) {
  return path.join(LOCAL_DEK_DIR, `${uid}.key`);
}

// Function to generate a local fallback DEK
function generateLocalFallbackDEK() {
  return crypto.randomBytes(32);
}

// Function to save DEK locally
function saveLocalDek(uid, dek) {
  try {
    const filePath = getLocalDekPath(uid);
    fs.writeFileSync(filePath, dek);
    console.log(`[ENCRYPTION] Local DEK saved for user: ${uid}`);
    return true;
  } catch (error) {
    console.error(`[ENCRYPTION] Failed to save local DEK for user ${uid}:`, error.message);
    return false;
  }
}

// Function to load DEK locally
function loadLocalDek(uid) {
  try {
    const filePath = getLocalDekPath(uid);
    if (fs.existsSync(filePath)) {
      const dek = fs.readFileSync(filePath);
      console.log(`[ENCRYPTION] Local DEK loaded for user: ${uid}`);
      return dek;
    }
    return null;
  } catch (error) {
    console.error(`[ENCRYPTION] Failed to load local DEK for user ${uid}:`, error.message);
      return null;
  }
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
    // Always try local first if cloud is not available
    if (!isGoogleCloudAvailable()) {
      console.log(`[ENCRYPTION] Using local DEK generation for user: ${uid}`);
      const localDek = generateLocalFallbackDEK();
      
      // Save locally and cache
      if (saveLocalDek(uid, localDek)) {
        dekCache.set(uid, localDek);
        return localDek;
      } else {
        // If local save fails, just use in-memory
        dekCache.set(uid, localDek);
        return localDek;
      }
    }

    // Try Google Cloud
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

    console.log(`[ENCRYPTION] Generated new DEK with Google Cloud for user: ${uid}`);
    return dek;
  } catch (error) {
    console.error(`[ENCRYPTION] Failed to generate DEK with Google Cloud for user ${uid}:`, error.message);
    markCloudFailure();
    
    console.log(`[ENCRYPTION] Falling back to local DEK for user: ${uid}`);
    
    // Fallback to local DEK
    const localDek = generateLocalFallbackDEK();
    
    // Save locally and cache
    if (saveLocalDek(uid, localDek)) {
      dekCache.set(uid, localDek);
      return localDek;
    } else {
      // If local save fails, just use in-memory
      dekCache.set(uid, localDek);
      return localDek;
    }
  }
}

async function getDEKFromBucket(uid) {
  console.log(`[ENCRYPTION] 🪣 Starting DEK retrieval from bucket for user: ${uid}`);
  
  try {
    // Check local storage first
    console.log(`[ENCRYPTION] 🔍 Checking local storage first...`);
    const localDek = loadLocalDek(uid);
    if (localDek) {
      console.log(`[ENCRYPTION] ✅ Local DEK found for user: ${uid}`);
      console.log(`[ENCRYPTION] 📏 Local DEK length: ${localDek.length} bytes`);
      return localDek;
    } else {
      console.log(`[ENCRYPTION] ❌ No local DEK found for user: ${uid}`);
    }

    if (!isGoogleCloudAvailable()) {
      console.log(`[ENCRYPTION] ⏭️ Google Cloud unavailable, cannot check bucket`);
    return null;
    }

    console.log(`[ENCRYPTION] ☁️ Google Cloud available, checking bucket...`);
    const file = storage.bucket(BUCKET_NAME).file(`keys/${environment}/${uid}.key`);
    console.log(`[ENCRYPTION] 📁 Checking file: keys/${environment}/${uid}.key`);
    
    const fileExists = await file.exists();
    console.log(`[ENCRYPTION] 🔍 File exists check: ${fileExists[0]}`);
    
    if (!fileExists[0]) {
      console.log(`[ENCRYPTION] ❌ DEK file not found in bucket for user: ${uid}`);
  return null;
}

    console.log(`[ENCRYPTION] ✅ DEK file found, downloading...`);
    const [encryptedDEK] = await file.download();
    console.log(`[ENCRYPTION] 📥 Downloaded encrypted DEK, length: ${encryptedDEK.length} bytes`);

    console.log(`[ENCRYPTION] 🔓 Decrypting DEK with KMS...`);
    const [decryptResponse] = await kmsClient.decrypt({
      name: KEY_PATH,
      ciphertext: encryptedDEK,
    });
    
    const decryptedDEK = decryptResponse.plaintext;
    console.log(`[ENCRYPTION] ✅ DEK decrypted successfully, length: ${decryptedDEK.length} bytes`);

    return decryptedDEK;
  } catch (error) {
    console.error(`[ENCRYPTION] ❌ Failed to get DEK from bucket for user ${uid}:`);
    console.error(`  - Error type: ${error.constructor.name}`);
    console.error(`  - Error message: ${error.message}`);
    console.error(`  - Error stack: ${error.stack?.split('\n')[0] || 'No stack trace'}`);
    
    markCloudFailure();
    
    // If the DEK is corrupted, try to remove it and return null
    if (error.message.includes('Decryption failed: the ciphertext is invalid')) {
      console.log(`[ENCRYPTION] 🗑️ Detected corrupted DEK, attempting cleanup...`);
      try {
        if (isGoogleCloudAvailable()) {
          console.log(`[ENCRYPTION] 🗑️ Removing corrupted DEK for user ${uid}`);
          const file = storage.bucket(BUCKET_NAME).file(`keys/${environment}/${uid}.key`);
          await file.delete();
          console.log(`[ENCRYPTION] ✅ Successfully removed corrupted DEK for user ${uid}`);
        }
      } catch (deleteError) {
        console.error(`[ENCRYPTION] ❌ Failed to remove corrupted DEK for user ${uid}:`, deleteError.message);
      }
    }
    
    // Check local storage as final fallback
    console.log(`[ENCRYPTION] 🔍 Final fallback: checking local storage...`);
    const localDek = loadLocalDek(uid);
    if (localDek) {
      console.log(`[ENCRYPTION] ✅ Using local fallback DEK for user: ${uid}`);
      return localDek;
    } else {
      console.log(`[ENCRYPTION] ❌ No local fallback DEK found for user: ${uid}`);
  }
  
  return null;
  }
}

async function getUserDek(uid) {
  console.log(`[ENCRYPTION] 🔑 Starting DEK retrieval for user: ${uid}`);
  
  try {
    // Check if we've already failed to get DEK for this user
    if (failedDekCache.has(uid)) {
      const failedInfo = failedDekCache.get(uid);
      const timeSinceFailure = Date.now() - failedInfo.timestamp;
      
      console.log(`[ENCRYPTION] ⚠️ User ${uid} has recent failure record:`);
      console.log(`  - Failure time: ${new Date(failedInfo.timestamp).toISOString()}`);
      console.log(`  - Time since failure: ${Math.round(timeSinceFailure / 1000)}s`);
      console.log(`  - Error: ${failedInfo.error}`);
      
      // Wait 5 minutes before retrying
      if (timeSinceFailure < 5 * 60 * 1000) {
        const remainingTime = Math.round((5 * 60 * 1000 - timeSinceFailure) / 1000);
        console.log(`[ENCRYPTION] ⏭️ Skipping DEK retrieval for user ${uid} (recent failure, retry in ${remainingTime}s)`);
        throw new Error(`DEK retrieval failed recently for user ${uid}`);
  } else {
        // Remove from failed cache after 5 minutes
        console.log(`[ENCRYPTION] ✅ Removing user ${uid} from failed cache (5 minutes passed)`);
        failedDekCache.delete(uid);
      }
    }

    // Check in-memory cache first
    if (dekCache.has(uid)) {
      console.log(`[ENCRYPTION] ✅ DEK found in memory cache for user: ${uid}`);
      const cachedDek = dekCache.get(uid);
      console.log(`[ENCRYPTION] 📏 Cached DEK length: ${cachedDek.length} bytes`);
      return cachedDek;
    }

    console.log(`[ENCRYPTION] 🔍 DEK not in cache, attempting to retrieve...`);
    let dek = await getDEKFromBucket(uid);

    if (!dek) {
      console.log(`[ENCRYPTION] ❌ No existing DEK found, generating new one...`);
      dek = await generateAndStoreEncryptedDEK(uid);
  } else {
      console.log(`[ENCRYPTION] ✅ DEK retrieved successfully, length: ${dek.length} bytes`);
      dekCache.set(uid, dek); // Cache it once retrieved
    }

    console.log(`[ENCRYPTION] 🎯 Final DEK for user ${uid}: ${dek ? 'SUCCESS' : 'FAILED'}`);
    if (dek) {
      console.log(`[ENCRYPTION] 📏 Final DEK length: ${dek.length} bytes`);
    }
    
    return dek;
  } catch (e) {
    console.error(`[ENCRYPTION] ❌ Error getting DEK for user ${uid}:`);
    console.error(`  - Error type: ${e.constructor.name}`);
    console.error(`  - Error message: ${e.message}`);
    console.error(`  - Error stack: ${e.stack?.split('\n')[0] || 'No stack trace'}`);
    
    // Cache the failure to avoid repeated attempts
    failedDekCache.set(uid, {
      timestamp: Date.now(),
      error: e.message,
      errorType: e.constructor.name
    });
    
    console.log(`[ENCRYPTION] 💾 Cached failure for user ${uid} to avoid repeated attempts`);
    throw e;
  }
}

// Enhanced function to detect if data needs encryption/decryption
function shouldProcessData(value) {
  console.log(`[ENCRYPTION] 🔍 Analyzing data for processing:`);
  console.log(`  - Value type: ${typeof value}`);
  console.log(`  - Value length: ${value?.length || 'undefined'}`);
  
  // Safely show value preview only for strings
  if (typeof value === 'string') {
    console.log(`  - Value preview: ${value.substring(0, 50)}...`);
  } else {
    console.log(`  - Value preview: ${String(value).substring(0, 50)}...`);
  }
  
  if (value === null || value === undefined || value === "") {
    console.log(`[ENCRYPTION] ⏭️ Skipping - value is null/undefined/empty`);
    return false;
  }
  
  // If it's not a string, it doesn't need processing
  if (typeof value !== 'string') {
    console.log(`[ENCRYPTION] ⏭️ Skipping - not a string (${typeof value})`);
    return false;
  }
  
  // If it's a short string (likely not encrypted), don't process
  if (value.length < 33) {
    console.log(`[ENCRYPTION] ⏭️ Skipping - too short (${value.length} chars, minimum: 33)`);
    return false;
  }
  
  // Check if it looks like base64 (basic validation)
  const base64Pattern = /^[A-Za-z0-9+/_-]*={0,2}$/;
  const isBase64Like = base64Pattern.test(value);
  console.log(`[ENCRYPTION] 🔍 Base64 pattern check: ${isBase64Like ? '✅ PASS' : '❌ FAIL'}`);
  
  if (!isBase64Like) {
    console.log(`[ENCRYPTION] ⏭️ Skipping - doesn't look like base64`);
    return false;
  }
  
  console.log(`[ENCRYPTION] ✅ Data approved for processing`);
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
  console.log(`[ENCRYPTION] 🔍 Starting decryption process for data length: ${cipherTextBase64?.length || 'undefined'}`);
  
  if (!shouldProcessData(cipherTextBase64)) {
    console.log(`[ENCRYPTION] ⏭️ Skipping decryption - data not processable`);
    return cipherTextBase64;
  }

  // Check if we've already failed to decrypt this value
  const cacheKey = `${cipherTextBase64}:${dek.toString('hex').substring(0, 8)}`;
  if (failedDecryptionCache.has(cacheKey)) {
    const failedInfo = failedDecryptionCache.get(cacheKey);
    console.log(`[ENCRYPTION] ⏭️ Skipping previously failed decryption for: ${cipherTextBase64.substring(0, 20)}... (failed at ${new Date(failedInfo.timestamp).toISOString()})`);
    return cipherTextBase64;
  }

  try {
    console.log(`[ENCRYPTION] 🔐 Attempting to decode base64 data...`);
    
    // Decode the base64-encoded ciphertext
    const cipherBuffer = Buffer.from(cipherTextBase64, "base64");
    console.log(`[ENCRYPTION] 📏 Decoded buffer length: ${cipherBuffer.length} bytes`);

    // Validate buffer length (IV + Auth Tag + minimum encrypted content)
    if (cipherBuffer.length < 33) {
      console.log(`[ENCRYPTION] ❌ Data too short to be encrypted: ${cipherBuffer.length} bytes (minimum: 33)`);
      return cipherTextBase64;
    }

    console.log(`[ENCRYPTION] ✂️ Extracting IV, tag, and encrypted content...`);

    // Extract IV (first 16 bytes), authentication tag (next 16), and encrypted content (remaining)
    const iv = cipherBuffer.slice(0, 16);
    const tag = cipherBuffer.slice(16, 32);
    const encrypted = cipherBuffer.slice(32);

    console.log(`[ENCRYPTION] 📊 Extracted components:`);
    console.log(`  - IV length: ${iv.length} bytes`);
    console.log(`  - Tag length: ${tag.length} bytes`);
    console.log(`  - Encrypted content length: ${encrypted.length} bytes`);
    console.log(`  - Total: ${iv.length + tag.length + encrypted.length} bytes`);

    // Validate component lengths
    if (iv.length !== 16) {
      console.log(`[ENCRYPTION] ❌ Invalid IV length: ${iv.length} bytes (expected: 16)`);
      throw new Error(`Invalid IV length: ${iv.length} bytes`);
    }
    
    if (tag.length !== 16) {
      console.log(`[ENCRYPTION] ❌ Invalid tag length: ${tag.length} bytes (expected: 16)`);
      throw new Error(`Invalid tag length: ${tag.length} bytes`);
    }
    
    if (encrypted.length === 0) {
      console.log(`[ENCRYPTION] ❌ No encrypted content found`);
      throw new Error('No encrypted content found');
    }

    console.log(`[ENCRYPTION] 🔑 Creating decipher with DEK length: ${dek.length} bytes`);

    // Create a decipher using AES-256-GCM with the same DEK and IV
    const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);
    console.log(`[ENCRYPTION] ✅ Decipher created successfully`);

    // Set the authentication tag
    console.log(`[ENCRYPTION] 🏷️ Setting authentication tag...`);
    decipher.setAuthTag(tag);
    console.log(`[ENCRYPTION] ✅ Authentication tag set`);

    // Decrypt the content and convert it back to UTF-8 string
    console.log(`[ENCRYPTION] 🔓 Decrypting content...`);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
    
    console.log(`[ENCRYPTION] ✅ Content decrypted successfully, length: ${decrypted.length} characters`);

    // Parse the decrypted JSON string and return the original value
    console.log(`[ENCRYPTION] 🔍 Parsing decrypted JSON...`);
    const result = JSON.parse(decrypted);
    console.log(`[ENCRYPTION] ✅ JSON parsed successfully, result type: ${typeof result}`);
    
    if (typeof result === 'string') {
      console.log(`[ENCRYPTION] 📝 Result is string, length: ${result.length}`);
    } else if (typeof result === 'object') {
      console.log(`[ENCRYPTION] 📦 Result is object, keys: ${Object.keys(result).join(', ')}`);
    }
    
    return result;
  } catch (e) {
    // Log the failure and cache it to avoid repeated attempts
    console.log(`[ENCRYPTION] ❌ Decryption failed for data (${cipherTextBase64.length} chars):`);
    console.log(`  - Error type: ${e.constructor.name}`);
    console.log(`  - Error message: ${e.message}`);
    console.log(`  - Error stack: ${e.stack?.split('\n')[0] || 'No stack trace'}`);
    
    // Additional error context
    if (e.message.includes('Unsupported state')) {
      console.log(`[ENCRYPTION] 💡 This usually means the authentication tag is invalid or the data was encrypted with a different key`);
    } else if (e.message.includes('Invalid key length')) {
      console.log(`[ENCRYPTION] 💡 This means the DEK length is incorrect (expected 32 bytes)`);
    } else if (e.message.includes('Invalid iv length')) {
      console.log(`[ENCRYPTION] 💡 This means the IV length is incorrect (expected 16 bytes)`);
    }
    
    failedDecryptionCache.set(cacheKey, {
      timestamp: Date.now(),
      error: e.message,
      errorType: e.constructor.name,
      dataLength: cipherTextBase64.length,
      dekLength: dek.length
    });
    
    // Return the original value (it might not be encrypted or was encrypted with different keys)
    console.log(`[ENCRYPTION] 🔄 Returning original ciphertext due to decryption failure`);
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
    
    // Remove local file if it exists
    const localPath = getLocalDekPath(uid);
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
      console.log(`[ENCRYPTION] Removed local DEK file for user: ${uid}`);
    }
    
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
    cloudFailureCount: cloudFailureCount,
    maxCloudFailures: MAX_CLOUD_FAILURES,
    dekCacheSize: dekCache.size,
    failedDecryptionCacheSize: failedDecryptionCache.size,
    failedDekCacheSize: failedDekCache.size,
    localDekDirectory: LOCAL_DEK_DIR,
    environment: environment
  };
}

// Function to reset cloud failure count (for testing/recovery)
function resetCloudFailureCount() {
  cloudFailureCount = 0;
  console.log("[ENCRYPTION] Cloud failure count reset");
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
  getSystemStatus,
  resetCloudFailureCount,
  markCloudFailure
};
