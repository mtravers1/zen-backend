import dotenv from "dotenv";
import { LimitedMap } from "../lib/limitedMap.js";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";

dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'STORAGE_SERVICE_ACCOUNT',
  'KMS_SERVICE_ACCOUNT', 
  'GCP_PROJECT_ID',
  'GCP_KEY_LOCATION',
  'GCP_KEY_RING',
  'GCP_KEY_NAME'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`[ENCRYPTION] Missing required environment variable: ${envVar}`);
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

console.log(`[ENCRYPTION] Environment validation passed. Environment: ${process.env.ENVIRONMENT || 'prod'}`);

const serviceAccountBase64 = process.env.STORAGE_SERVICE_ACCOUNT;
const environment = process.env.ENVIRONMENT || "prod";
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

console.log(`[ENCRYPTION] Service accounts parsed successfully`);
console.log(`[ENCRYPTION] Storage project: ${storageServiceAccount.project_id}`);
console.log(`[ENCRYPTION] KMS project: ${kmsServiceAccount.project_id}`);

const kmsClient = new KeyManagementServiceClient({
  credentials: kmsServiceAccount,
});

const storage = new Storage({
  credentials: storageServiceAccount,
});
const BUCKET_NAME = "zentavos-bucket";
const KEY_PATH = kmsClient.cryptoKeyPath(
  process.env.GCP_PROJECT_ID,
  process.env.GCP_KEY_LOCATION,
  process.env.GCP_KEY_RING,
  process.env.GCP_KEY_NAME
);

console.log(`[ENCRYPTION] KMS Key Path: ${KEY_PATH}`);
console.log(`[ENCRYPTION] Storage Bucket: ${BUCKET_NAME}`);

// DEK cache in memory with version tracking
const dekCache = new LimitedMap(1000); // Limit to 1000 DEKs
const dekVersionCache = new LimitedMap(1000); // Track key versions

// Cache for successfully decrypted data to avoid reprocessing
const decryptedDataCache = new LimitedMap(2000); // Limit to 2000 decrypted items
const DECRYPTED_CACHE_TTL = 10 * 60 * 1000; // 10 minutes TTL

// Cache for successful decryption keys to avoid reprocessing
const decryptionKeyCache = new LimitedMap(2000); // Limit to 2000 key mappings
const KEY_CACHE_TTL = 30 * 60 * 1000; // 30 minutes TTL - longer for keys

// Structured logging for encryption operations
const logEncryptionOperation = (operation, success, details = {}) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    operation,
    success,
    ...details
  };

  if (success) {
    console.log(`[ENCRYPTION] ${operation}:`, logEntry);
  } else {
    console.error(`[ENCRYPTION] ${operation} FAILED:`, logEntry);
  }
  
  // TODO: Consider migrating to a proper logging library like Winston or Pino
  // for production use to support log levels, rotation, and transport configuration
};

async function generateAndStoreEncryptedDEK(uid) {
  try {
    console.log(`[ENCRYPTION] Starting key generation for user: ${uid}`);
    
    const dek = crypto.randomBytes(32);
    const keyVersion = Date.now(); // Use timestamp as version
    
    console.log(`[ENCRYPTION] Generated DEK, attempting to encrypt with KMS...`);
    console.log(`[ENCRYPTION] KMS Key Path: ${KEY_PATH}`);

    const [encryptResponse] = await kmsClient.encrypt({
      name: KEY_PATH,
      plaintext: dek,
    });

    console.log(`[ENCRYPTION] Successfully encrypted DEK with KMS`);

    const encryptedDEK = encryptResponse.ciphertext;
    const file = storage
      .bucket(BUCKET_NAME)
      .file(`keys/${environment}/${uid}.key`);
    
    console.log(`[ENCRYPTION] Attempting to store key in bucket: ${BUCKET_NAME}, path: keys/${environment}/${uid}.key`);
    
    // Store both encrypted DEK and version
    const keyData = {
      encryptedDEK: encryptedDEK.toString('base64'),
      version: keyVersion,
      createdAt: new Date().toISOString()
    };
    
    await file.save(JSON.stringify(keyData));
    console.log(`[ENCRYPTION] Successfully stored key file in bucket`);

    // Cache the DEK and version
    dekCache.set(uid, dek);
    dekVersionCache.set(uid, keyVersion);

    logEncryptionOperation('generateAndStoreEncryptedDEK', true, { uid, keyVersion });
    return { dek, version: keyVersion };
  } catch (error) {
    console.error(`[ENCRYPTION] Key generation failed for user ${uid}:`, error);
    console.error(`[ENCRYPTION] Error details:`, {
      message: error.message,
      stack: error.stack,
      code: error.code,
      status: error.status
    });
    
    logEncryptionOperation('generateAndStoreEncryptedDEK', false, { uid, error: error.message });
    throw error;
  }
}

async function getDEKFromBucket(uid) {
  const startTime = Date.now();
  try {
    console.log(`[ENCRYPTION] getDEKFromBucket starting for user: ${uid} at ${new Date().toISOString()}`);
    
    const file = storage
      .bucket(BUCKET_NAME)
      .file(`keys/${environment}/${uid}.key`);
    
    console.log(`[ENCRYPTION] Checking if key file exists: keys/${environment}/${uid}.key`);
    
    if (!(await file.exists())[0]) {
      const duration = Date.now() - startTime;
      console.log(`[ENCRYPTION] Key file not found for user: ${uid} after ${duration}ms`);
      logEncryptionOperation('getDEKFromBucket', false, { uid, error: 'Key file not found', duration });
      return null;
    }
    
    console.log(`[ENCRYPTION] Key file found, downloading for user: ${uid}`);
    const [keyDataString] = await file.download();
    const keyData = JSON.parse(keyDataString.toString());
    console.log(`[ENCRYPTION] Key data downloaded and parsed for user: ${uid}`);
    
    const encryptedDEK = Buffer.from(keyData.encryptedDEK, 'base64');
    const keyVersion = keyData.version;
    console.log(`[ENCRYPTION] Calling KMS decrypt for user: ${uid}, version: ${keyVersion}`);

    const [decryptResponse] = await kmsClient.decrypt({
      name: KEY_PATH,
      ciphertext: encryptedDEK,
    });

    const dek = decryptResponse.plaintext;
    console.log(`[ENCRYPTION] KMS decrypt successful for user: ${uid}`);
    
    // Cache the DEK and version
    dekCache.set(uid, dek);
    dekVersionCache.set(uid, keyVersion);
    console.log(`[ENCRYPTION] DEK cached for user: ${uid}`);

    const duration = Date.now() - startTime;
    console.log(`[ENCRYPTION] getDEKFromBucket completed successfully for user: ${uid} in ${duration}ms`);
    logEncryptionOperation('getDEKFromBucket', true, { uid, keyVersion, duration });
    return { dek, version: keyVersion };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[ENCRYPTION] getDEKFromBucket failed for user ${uid} after ${duration}ms:`, error);
    console.error(`[ENCRYPTION] Error details:`, {
      message: error.message,
      stack: error.stack,
      code: error.code,
      status: error.status,
      duration
    });
    
    logEncryptionOperation('getDEKFromBucket', false, { uid, error: error.message, duration });
    return null;
  }
}

async function getUserDek(uid) {
  const startTime = Date.now();
  try {
    console.log(`[ENCRYPTION] getUserDek called for user: ${uid} at ${new Date().toISOString()}`);
    
    if (!uid) {
      throw new Error('UID is required to get DEK');
    }
    
    // Check in-memory cache first
    if (dekCache.has(uid)) {
      const cachedDek = dekCache.get(uid);
      const version = dekVersionCache.get(uid);
      
      // Validate cached DEK
      if (cachedDek && Buffer.isBuffer(cachedDek) && cachedDek.length === 32) {
        const duration = Date.now() - startTime;
        console.log(`[ENCRYPTION] Found valid DEK in cache for user: ${uid}, version: ${version}, duration: ${duration}ms`);
        logEncryptionOperation('getUserDek', true, { uid, source: 'cache', version, duration });
        return { dek: cachedDek, version };
      } else {
        console.warn(`[ENCRYPTION] Invalid cached DEK for user: ${uid}, clearing cache`);
        dekCache.delete(uid);
        dekVersionCache.delete(uid);
      }
    }

    console.log(`[ENCRYPTION] DEK not in cache or invalid, checking bucket for user: ${uid}`);
    let keyData = await getDEKFromBucket(uid);

    if (!keyData || !keyData.dek || !Buffer.isBuffer(keyData.dek) || keyData.dek.length !== 32) {
      console.log(`[ENCRYPTION] No valid key found in bucket, generating new keys for user: ${uid}`);
      keyData = await generateAndStoreEncryptedDEK(uid);
      console.log(`[ENCRYPTION] Successfully generated new keys for user: ${uid}`);
    } else {
      console.log(`[ENCRYPTION] Found existing valid keys in bucket for user: ${uid}`);
    }

    // Validate the key before caching
    if (!keyData.dek || !Buffer.isBuffer(keyData.dek) || keyData.dek.length !== 32) {
      throw new Error(`Invalid DEK generated for user: ${uid}`);
    }

    // Cache the DEK and version
    dekCache.set(uid, keyData.dek);
    dekVersionCache.set(uid, keyData.version);

    const duration = Date.now() - startTime;
    console.log(`[ENCRYPTION] getUserDek completed successfully for user: ${uid} in ${duration}ms`);
    logEncryptionOperation('getUserDek', true, { uid, source: 'bucket', version: keyData.version, duration });
    
    return { dek: keyData.dek, version: keyData.version };
  } catch (e) {
    const duration = Date.now() - startTime;
    console.error(`[ENCRYPTION] getUserDek failed for user ${uid} after ${duration}ms:`, e);
    console.error(`[ENCRYPTION] Error details:`, {
      message: e.message,
      stack: e.stack,
      code: e.code,
      status: e.status,
      duration
    });
    
    // Clear cache on error
    if (uid) {
      dekCache.delete(uid);
      dekVersionCache.delete(uid);
    }
    
    logEncryptionOperation('getUserDek', false, { uid, error: e.message, duration });
    throw e;
  }
}

// Get key version for a user
async function getUserDekVersion(uid) {
  try {
    // Check cache first
    if (dekVersionCache.has(uid)) {
      return dekVersionCache.get(uid);
    }

    // Try to get from bucket
    const keyData = await getDEKFromBucket(uid);
    return keyData ? keyData.version : null;
  } catch (error) {
    logEncryptionOperation('getUserDekVersion', false, { uid, error: error.message });
    return null;
  }
}

// Cache management functions for decrypted data
function getDecryptedFromCache(cipherTextBase64, uid) {
  if (!cipherTextBase64 || !uid) return null;
  
  const cacheKey = `${cipherTextBase64}:${uid}`;
  const cached = decryptedDataCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < DECRYPTED_CACHE_TTL) {
    logEncryptionOperation('getDecryptedFromCache', true, { 
      uid, 
      source: 'cache',
      dataType: typeof cached.data
    });
    return cached.data;
  }
  
  return null;
}

function setDecryptedInCache(cipherTextBase64, uid, decryptedData) {
  if (!cipherTextBase64 || !uid || decryptedData === null || decryptedData === undefined) return;
  
  const cacheKey = `${cipherTextBase64}:${uid}`;
  decryptedDataCache.set(cacheKey, {
    data: decryptedData,
    timestamp: Date.now()
  });
  
  logEncryptionOperation('setDecryptedInCache', true, { 
    uid, 
    dataType: typeof decryptedData,
    cacheSize: decryptedDataCache.size
  });
}

// Cache management functions for decryption keys
function getDecryptionKeyFromCache(cipherTextBase64, uid) {
  if (!cipherTextBase64 || !uid) return null;
  
  const cacheKey = `${cipherTextBase64}:${uid}`;
  const cached = decryptionKeyCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < KEY_CACHE_TTL) {
    logEncryptionOperation('getDecryptionKeyFromCache', true, { 
      uid, 
      source: 'key_cache',
      keyType: typeof cached.key,
      keyLength: cached.key?.length
    });
    return cached.key;
  }
  
  return null;
}

function setDecryptionKeyInCache(cipherTextBase64, uid, key, keyType = 'current') {
  if (!cipherTextBase64 || !uid || !key) return;
  
  const cacheKey = `${cipherTextBase64}:${uid}`;
  decryptionKeyCache.set(cacheKey, {
    key: key,
    keyType: keyType, // 'current', 'fallback', 'previous'
    timestamp: Date.now()
  });
  
  logEncryptionOperation('setDecryptionKeyInCache', true, { 
    uid, 
    keyType: keyType,
    keyLength: key.length,
    cacheSize: decryptionKeyCache.size
  });
}

function clearDecryptedCache(uid = null) {
  if (uid) {
    // Clear cache for specific user
    for (const [key] of decryptedDataCache.entries()) {
      if (key.includes(`:${uid}`)) {
        decryptedDataCache.delete(key);
      }
    }
    logEncryptionOperation('clearDecryptedCache', true, { uid, scope: 'user' });
  } else {
    // Clear entire cache
    decryptedDataCache.clear();
    logEncryptionOperation('clearDecryptedCache', true, { scope: 'all' });
  }
}

function clearDecryptionKeyCache(uid = null) {
  if (uid) {
    // Clear cache for specific user
    for (const [key] of decryptionKeyCache.entries()) {
      if (key.includes(`:${uid}`)) {
        decryptionKeyCache.delete(key);
      }
    }
    logEncryptionOperation('clearDecryptionKeyCache', true, { uid, scope: 'user' });
  } else {
    // Clear entire cache
    decryptionKeyCache.clear();
    logEncryptionOperation('clearDecryptionKeyCache', true, { scope: 'all' });
  }
}

function getDecryptedCacheStats() {
  const now = Date.now();
  const stats = {
    totalEntries: decryptedDataCache.size,
    validEntries: 0,
    expiredEntries: 0,
    cacheSize: 0
  };
  
  for (const [key, value] of decryptedDataCache.entries()) {
    if ((now - value.timestamp) < DECRYPTED_CACHE_TTL) {
      stats.validEntries++;
    } else {
      stats.expiredEntries++;
    }
    stats.cacheSize += JSON.stringify(value.data).length;
  }
  
  return stats;
}

function getDecryptionKeyCacheStats() {
  const now = Date.now();
  const stats = {
    totalEntries: decryptionKeyCache.size,
    validEntries: 0,
    expiredEntries: 0,
    cacheSize: 0,
    keyTypes: {
      current: 0,
      fallback: 0,
      previous: 0
    }
  };
  
  for (const [key, value] of decryptionKeyCache.entries()) {
    if ((now - value.timestamp) < KEY_CACHE_TTL) {
      stats.validEntries++;
      stats.keyTypes[value.keyType] = (stats.keyTypes[value.keyType] || 0) + 1;
    } else {
      stats.expiredEntries++;
    }
    stats.cacheSize += value.key.length;
  }
  
  return stats;
}

// Encrypts a value using AES-256-GCM with version tracking
async function encryptValue(value, dek, uid = null) {
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

    // Get key version for tracking
    const keyVersion = uid ? await getUserDekVersion(uid) : null;

    // Combine IV + Auth Tag + Encrypted content, and return as base64 string
    const result = Buffer.concat([iv, tag, encrypted]).toString("base64");
    
    logEncryptionOperation('encryptValue', true, { 
      uid, 
      keyVersion, 
      valueType: typeof value,
      encryptedLength: result.length 
    });
    
    return result;
  } catch (e) {
    logEncryptionOperation('encryptValue', false, { 
      uid, 
      error: e.message, 
      valueType: typeof value 
    });
    console.error("Error encrypting value:", e);
    return value;
  }
}

// Track decryption attempts to prevent infinite loops
const decryptionAttempts = new Map();
const MAX_ATTEMPTS = 3;
const ATTEMPT_EXPIRY = 30000; // 30 seconds - reduced from 120 seconds

function trackDecryptionAttempt(cipherTextBase64, uid) {
  const key = `${cipherTextBase64}:${uid || 'no-uid'}`;
  const now = Date.now();
  
  // Clean up expired attempts more aggressively
  for (const [attemptKey, attempt] of decryptionAttempts.entries()) {
    if (now - attempt.timestamp > ATTEMPT_EXPIRY) {
      decryptionAttempts.delete(attemptKey);
    }
  }
  
  // Get or create attempt tracking
  let attempt = decryptionAttempts.get(key);
  
  if (!attempt) {
    attempt = {
      count: 0,
      timestamp: now,
      failures: new Set(),
      lastAttempt: now
    };
  } else {
    // Reset count if enough time has passed since last attempt
    if (now - attempt.lastAttempt > 10000) { // 10 seconds
      attempt.count = 0;
      attempt.failures.clear();
      attempt.timestamp = now;
    }
    attempt.count++;
    attempt.lastAttempt = now;
  }
  
  decryptionAttempts.set(key, attempt);
  
  return attempt;
}

// Decrypts a base64-encoded ciphertext using AES-256-GCM with fallback support
async function decryptValue(cipherTextBase64, dek, uid = null, fallbackDek = null) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`\n🔍 [decryptValue ${requestId}] ====== DECRYPTION REQUEST ======`);
  console.log(`[decryptValue ${requestId}] Timestamp: ${new Date().toISOString()}`);
  console.log(`[decryptValue ${requestId}] Input parameters:`, {
    hasCipherText: !!cipherTextBase64,
    cipherTextLength: cipherTextBase64?.length || 0,
    hasDek: !!dek,
    dekType: typeof dek,
    dekLength: dek?.length || 0,
    uid: uid || 'NULL',
    uidType: typeof uid,
    uidLength: uid ? uid.length : 0,
    hasFallbackDek: !!fallbackDek,
    requestId: requestId
  });
  
  // Validate UID first
  if (!uid) {
    console.error(`[decryptValue ${requestId}] ❌ UID is null or undefined`);
    console.error(`[decryptValue ${requestId}] This will prevent caching and fallback key lookup`);
    console.error(`[decryptValue ${requestId}] Call stack:`, new Error().stack);
  } else if (typeof uid !== 'string') {
    console.error(`[decryptValue ${requestId}] ❌ UID is not a string:`, {
      uid: uid,
      uidType: typeof uid,
      uidValue: uid
    });
  } else if (uid.trim() === '') {
    console.error(`[decryptValue ${requestId}] ❌ UID is empty string`);
  } else {
    console.log(`[decryptValue ${requestId}] ✅ UID validation passed:`, {
      uid: uid,
      uidType: typeof uid,
      uidLength: uid.length,
      uidTrimmed: uid.trim().length
    });
  }
  
  if (
    cipherTextBase64 === null ||
    cipherTextBase64 === undefined ||
    cipherTextBase64 === ""
  )
    return cipherTextBase64;
    
  // Check cache first for successful decryption keys
  if (uid) {
    const cachedKey = getDecryptionKeyFromCache(cipherTextBase64, uid);
    if (cachedKey) {
      try {
        logEncryptionOperation('decryptValue', true, { 
          uid, 
          source: 'key_cache',
          note: 'Using cached decryption key'
        });
        
        // Try to decrypt with the cached key
        const result = await attemptDecryption(cipherTextBase64, cachedKey, uid, 'cached');
        if (result.success) {
          return result.value;
        } else {
          // Cached key failed, remove it from cache
          logEncryptionOperation('decryptValue', false, {
            uid,
            source: 'key_cache',
            error: 'Cached key failed, removing from cache'
          });
          const cacheKey = `${cipherTextBase64}:${uid}`;
          decryptionKeyCache.delete(cacheKey);
        }
      } catch (error) {
        // Cached key failed, remove it from cache
        logEncryptionOperation('decryptValue', false, {
          uid,
          source: 'key_cache',
          error: 'Cached key failed with exception',
          exception: error.message
        });
        const cacheKey = `${cipherTextBase64}:${uid}`;
        decryptionKeyCache.delete(cacheKey);
      }
    }
  }
    
  // Track decryption attempts
  const attempt = trackDecryptionAttempt(cipherTextBase64, uid);
  
  // Check if we've exceeded max attempts
  if (attempt.count > MAX_ATTEMPTS) {
    logEncryptionOperation('decryptValue', false, {
      uid,
      error: 'Max decryption attempts exceeded',
      details: {
        attempts: attempt.count,
        maxAllowed: MAX_ATTEMPTS,
        timeSinceFirst: Date.now() - attempt.timestamp
      }
    });
    return null;
  }

  // Validate input type
  if (typeof cipherTextBase64 !== 'string') {
    logEncryptionOperation('decryptValue', false, { 
      uid, 
      error: 'Invalid input type - expected string',
      inputType: typeof cipherTextBase64,
      inputValue: cipherTextBase64 === null ? 'null' : cipherTextBase64 === undefined ? 'undefined' : 'other'
    });
    
    // Return null instead of throwing to prevent crashes
    console.warn(`[Encryption] Skipping decryption for non-string value: ${typeof cipherTextBase64} (${cipherTextBase64 === null ? 'null' : cipherTextBase64 === undefined ? 'undefined' : 'other'})`);
    return null;
  }

  // Additional validation for string content
  if (cipherTextBase64.trim() === '') {
    logEncryptionOperation('decryptValue', false, { 
      uid, 
      error: 'Empty string provided for decryption',
      inputType: 'string',
      inputLength: cipherTextBase64.length
    });
    return null;
  }

  // Try with current DEK first
  if (!attempt.failures.has('current')) {
    try {
      const result = await attemptDecryption(cipherTextBase64, dek, uid, 'current');
      if (result.success) {
        // Cache successful decryption key
        if (uid) {
          setDecryptionKeyInCache(cipherTextBase64, uid, dek, 'current');
        }
        return result.value;
      }
      // Track failed attempt
      attempt.failures.add('current');
    } catch (error) {
      // Track failed attempt
      attempt.failures.add('current');
      logEncryptionOperation('decryptValue', false, { 
        uid, 
        attempt: 'current', 
        error: error.message,
        errorCode: error.code
      });
    }
  }

  // Try with fallback DEK if provided
  if (fallbackDek && !attempt.failures.has('fallback')) {
    try {
      const result = await attemptDecryption(cipherTextBase64, fallbackDek, uid, 'fallback');
      if (result.success) {
        // Cache successful decryption key
        if (uid) {
          setDecryptionKeyInCache(cipherTextBase64, uid, fallbackDek, 'fallback');
        }
        logEncryptionOperation('decryptValue', true, { 
          uid, 
          attempt: 'fallback', 
          note: 'Successfully decrypted with fallback key'
        });
        return result.value;
      }
      // Track failed attempt
      attempt.failures.add('fallback');
    } catch (error) {
      // Track failed attempt
      attempt.failures.add('fallback');
      logEncryptionOperation('decryptValue', false, { 
        uid, 
        attempt: 'fallback', 
        error: error.message,
        errorCode: error.code
      });
    }
  }

  // Try to get previous DEK and attempt decryption
  if (!attempt.failures.has('previous') && uid) {
    try {
      const previousDek = await getPreviousDek(uid);
      if (previousDek) {
        const result = await attemptDecryption(cipherTextBase64, previousDek, uid, 'previous');
        if (result.success) {
          // Cache successful decryption key
          setDecryptionKeyInCache(cipherTextBase64, uid, previousDek, 'previous');
          logEncryptionOperation('decryptValue', true, { 
            uid, 
            attempt: 'previous', 
            note: 'Successfully decrypted with previous key'
          });
          return result.value;
        }
        // Track failed attempt
        attempt.failures.add('previous');
      } else {
        logEncryptionOperation('decryptValue', false, {
          uid,
          attempt: 'previous',
          error: 'No previous key available',
          details: {
            hasUid: true,
            keyFound: false
          }
        });
      }
    } catch (error) {
      // Track failed attempt
      attempt.failures.add('previous');
      logEncryptionOperation('decryptValue', false, { 
        uid, 
        attempt: 'previous', 
        error: error.message,
        errorCode: error.code
      });
    }
  } else if (!uid) {
    logEncryptionOperation('decryptValue', false, {
      uid: null,
      attempt: 'previous',
      error: 'No uid provided for key version lookup',
      details: {
        hasUid: false,
        inputLength: cipherTextBase64.length
      }
    });
  }

  // If all attempts fail, log the failure and return null
  logEncryptionOperation('decryptValue', false, { 
    uid, 
    error: 'All decryption attempts failed',
    inputLength: cipherTextBase64.length,
    failedAttempts: Array.from(attempt.failures)
  });
  
  return null;
}

// Helper function to attempt decryption with a specific key
async function attemptDecryption(cipherTextBase64, dek, uid, attemptType) {
  // Early validation to prevent unnecessary processing
  if (!dek || !Buffer.isBuffer(dek) || dek.length !== 32) {
    logEncryptionOperation('attemptDecryption', false, {
      uid,
      attemptType,
      error: 'Invalid DEK',
      details: {
        hasKey: !!dek,
        keyType: typeof dek,
        keyLength: dek ? dek.length : 0,
        isBuffer: Buffer.isBuffer(dek)
      }
    });
    return { success: false, error: 'Invalid encryption key' };
  }

  if (!cipherTextBase64 || typeof cipherTextBase64 !== 'string') {
    logEncryptionOperation('attemptDecryption', false, {
      uid,
      attemptType,
      error: 'Invalid input',
      details: {
        inputType: typeof cipherTextBase64,
        hasInput: !!cipherTextBase64
      }
    });
    return { success: false, error: 'Invalid input format' };
  }

  // Check if the string looks like base64 (including URL-safe base64)
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(cipherTextBase64)) {
    logEncryptionOperation('attemptDecryption', false, {
      uid,
      attemptType,
      error: 'Invalid base64',
      details: {
        inputLength: cipherTextBase64.length
      }
    });
    return { success: false, error: 'Invalid base64 format' };
  }

  try {
    // Decode the base64-encoded ciphertext
    const cipherBuffer = Buffer.from(cipherTextBase64, "base64");

    // Validate buffer length (IV + Auth Tag + minimum encrypted content)
    if (cipherBuffer.length < 33) {
      logEncryptionOperation('attemptDecryption', false, {
        uid,
        attemptType,
        error: 'Invalid length',
        details: {
          length: cipherBuffer.length,
          minRequired: 33
        }
      });
      return { success: false, error: 'Invalid ciphertext length' };
    }

    // Extract IV (first 16 bytes), authentication tag (next 16), and encrypted content (remaining)
    const iv = cipherBuffer.slice(0, 16);
    const tag = cipherBuffer.slice(16, 32);
    const encrypted = cipherBuffer.slice(32);

    // Validate IV and tag
    if (iv.length !== 16 || tag.length !== 16) {
      logEncryptionOperation('attemptDecryption', false, {
        uid,
        attemptType,
        error: 'Invalid components',
        details: {
          ivLength: iv.length,
          tagLength: tag.length,
          expectedLength: 16
        }
      });
      return { success: false, error: 'Invalid encryption components' };
    }

    // Validate encrypted content length
    if (encrypted.length === 0) {
      logEncryptionOperation('attemptDecryption', false, {
        uid,
        attemptType,
        error: 'Empty content',
        details: {
          totalLength: cipherBuffer.length,
          encryptedLength: encrypted.length
        }
      });
      return { success: false, error: 'Empty encrypted content' };
    }

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
    const parsedValue = JSON.parse(decrypted);
    
    return { success: true, value: parsedValue };
  } catch (error) {
    // Provide more specific error information
    const errorInfo = {
      attemptType,
      uid,
      cipherTextLength: cipherTextBase64.length,
      errorCode: error.code,
      errorMessage: error.message
    };
    
    logEncryptionOperation('attemptDecryption', false, errorInfo);
    throw error;
  }
}

// Get previous key version for fallback (implement based on your key rotation strategy)
async function getPreviousDek(uid) {
  try {
    // This is a placeholder - implement based on your key rotation strategy
    // You might store previous keys in a separate location or use a different approach
    const file = storage
      .bucket(BUCKET_NAME)
      .file(`keys/${environment}/${uid}.key.previous`);
    
    if (!(await file.exists())[0]) {
      return null;
    }
    
    const [keyDataString] = await file.download();
    const keyData = JSON.parse(keyDataString.toString());
    
    const encryptedDEK = Buffer.from(keyData.encryptedDEK, 'base64');

    const [decryptResponse] = await kmsClient.decrypt({
      name: KEY_PATH,
      ciphertext: encryptedDEK,
    });

    return decryptResponse.plaintext;
  } catch (error) {
    logEncryptionOperation('getPreviousDek', false, { uid, error: error.message });
    return null;
  }
}

// Rotate encryption key for a user
async function rotateUserKey(uid) {
  try {
    // Get current key
    const currentDek = await getUserDek(uid);
    const currentVersion = await getUserDekVersion(uid);
    
    // Generate new key
    const newKeyData = await generateAndStoreEncryptedDEK(uid);
    
    // Store previous key for fallback
    if (currentDek && currentVersion) {
      const file = storage
        .bucket(BUCKET_NAME)
        .file(`keys/${environment}/${uid}.key.previous`);
      
      // Encrypt the current DEK with KMS before persisting
      const [encryptResponse] = await kmsClient.encrypt({
        name: KEY_PATH,
        plaintext: currentDek,
      });
      const previousKeyData = {
        encryptedDEK: encryptResponse.ciphertext.toString('base64'),
        version: currentVersion,
        rotatedAt: new Date().toISOString()
      };
      
      await file.save(JSON.stringify(previousKeyData));
    }
    
    logEncryptionOperation('rotateUserKey', true, { 
      uid, 
      oldVersion: currentVersion, 
      newVersion: newKeyData.version 
    });
    
    return newKeyData;
  } catch (error) {
    logEncryptionOperation('rotateUserKey', false, { uid, error: error.message });
    throw error;
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

export {
  encryptValue,
  decryptValue,
  getUserDek,
  getUserDekVersion,
  getPreviousDek,
  rotateUserKey,
  hashEmail,
  hashValue,
  logEncryptionOperation,
  getDecryptedFromCache,
  setDecryptedInCache,
  clearDecryptedCache,
  getDecryptedCacheStats,
  getDecryptionKeyFromCache,
  setDecryptionKeyInCache,
  clearDecryptionKeyCache,
  getDecryptionKeyCacheStats
};
