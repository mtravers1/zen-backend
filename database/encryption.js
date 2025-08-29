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

// Add circuit breaker for persistent failures
const decryptionCircuitBreaker = new Map();
const CIRCUIT_BREAKER_THRESHOLD = 5; // Number of failures before circuit opens
const CIRCUIT_BREAKER_TIMEOUT = 5 * 60 * 1000; // 5 minutes timeout

function trackDecryptionAttempt(cipherTextBase64, uid) {
  const key = `${cipherTextBase64}:${uid || 'no-uid'}`;
  const now = Date.now();
  
  // Clean up expired attempts more aggressively
  for (const [attemptKey, attempt] of decryptionAttempts.entries()) {
    if (now - attempt.timestamp > ATTEMPT_EXPIRY) {
      decryptionAttempts.delete(attemptKey);
    }
  }
  
  // Check circuit breaker for this user
  if (uid && decryptionCircuitBreaker.has(uid)) {
    const circuit = decryptionCircuitBreaker.get(uid);
    if (now - circuit.lastFailure < CIRCUIT_BREAKER_TIMEOUT) {
      console.warn(`[ENCRYPTION] Circuit breaker open for user ${uid}, skipping decryption attempts`);
      return { count: MAX_ATTEMPTS + 1, timestamp: now, failures: new Set(['circuit_breaker']) };
    } else {
      // Circuit breaker timeout expired, reset it
      decryptionCircuitBreaker.delete(uid);
      console.log(`[ENCRYPTION] Circuit breaker reset for user ${uid}`);
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

// Function to open circuit breaker for a user
function openCircuitBreaker(uid) {
  const now = Date.now();
  decryptionCircuitBreaker.set(uid, {
    lastFailure: now,
    failureCount: (decryptionCircuitBreaker.get(uid)?.failureCount || 0) + 1
  });
  console.error(`[ENCRYPTION] Circuit breaker opened for user ${uid} due to persistent decryption failures`);
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
    failedAttempts: Array.from(attempt.failures),
    recommendations: [
      'Check if user keys are corrupted',
      'Verify key rotation history',
      'Consider regenerating user keys',
      'Check if data was encrypted with different keys'
    ]
  });
  
  // Attempt data recovery as a last resort
  if (uid) {
    try {
      console.log(`[ENCRYPTION] Attempting data recovery for user: ${uid}`);
      const recoveryResult = await attemptDataRecovery(uid, cipherTextBase64);
      
      if (recoveryResult.success) {
        logEncryptionOperation('decryptValue', true, { 
          uid, 
          attempt: 'recovery',
          method: recoveryResult.method,
          note: 'Data recovered successfully using recovery strategy'
        });
        
        // Cache the successful recovery method for future use
        if (recoveryResult.method === 'current_key' || recoveryResult.method === 'previous_key') {
          setDecryptionKeyInCache(cipherTextBase64, uid, recoveryResult.data, recoveryResult.method);
        }
        
        return recoveryResult.data;
      } else {
        console.log(`[ENCRYPTION] Data recovery failed for user ${uid}:`, recoveryResult.error);
      }
    } catch (recoveryError) {
      console.error(`[ENCRYPTION] Data recovery attempt failed for user ${uid}:`, recoveryError);
    }
  }
  
  // If this is a user with persistent decryption failures, open circuit breaker
  if (uid && attempt.count >= MAX_ATTEMPTS) {
    console.error(`[ENCRYPTION] ⚠️ User ${uid} has persistent decryption failures. Opening circuit breaker.`);
    openCircuitBreaker(uid);
    
    // Suggest key regeneration
    console.error(`[ENCRYPTION] ⚠️ Consider running checkEncryptionKeyHealth(${uid}) or regenerateUserKeys(${uid})`);
    
    // Clear caches for this user to force fresh key retrieval
    clearDecryptedCache(uid);
    clearDecryptionKeyCache(uid);
    dekCache.delete(uid);
    dekVersionCache.delete(uid);
  }
  
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
      // Don't log this as an error since it's expected for new users or users without key rotation
      logEncryptionOperation('getPreviousDek', false, { 
        uid, 
        error: 'Previous key file not found',
        details: { 
          filePath: `keys/${environment}/${uid}.key.previous`,
          note: 'This is normal for new users or users without key rotation history'
        }
      });
      return null;
    }
    
    const [keyDataString] = await file.download();
    const keyData = JSON.parse(keyDataString.toString());
    
    const encryptedDEK = Buffer.from(keyData.encryptedDEK, 'base64');

    const [decryptResponse] = await kmsClient.decrypt({
      name: KEY_PATH,
      ciphertext: encryptedDEK,
    });

    logEncryptionOperation('getPreviousDek', true, { 
      uid, 
      keyVersion: keyData.version,
      rotatedAt: keyData.rotatedAt
    });

    return decryptResponse.plaintext;
  } catch (error) {
    // Only log as error if it's not a "file not found" error
    if (error.code === 404 || error.message.includes('not found')) {
      logEncryptionOperation('getPreviousDek', false, { 
        uid, 
        error: 'Previous key file not found',
        details: { 
          filePath: `keys/${environment}/${uid}.key.previous`,
          note: 'This is normal for new users or users without key rotation history'
        }
      });
    } else {
      logEncryptionOperation('getPreviousDek', false, { 
        uid, 
        error: error.message,
        details: { 
          errorType: error.constructor.name,
          errorCode: error.code,
          stack: error.stack
        }
      });
    }
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

// Check encryption key health for a user
async function checkEncryptionKeyHealth(uid) {
  try {
    logEncryptionOperation('checkEncryptionKeyHealth', true, { uid, operation: 'start' });
    
    // Get current key
    const currentDek = await getUserDek(uid);
    if (!currentDek) {
      logEncryptionOperation('checkEncryptionKeyHealth', false, { 
        uid, 
        error: 'No current key found',
        recommendation: 'Generate new key'
      });
      return { healthy: false, issue: 'no_current_key', recommendation: 'generate_new_key' };
    }
    
    // Get previous key
    const previousDek = await getPreviousDek(uid);
    if (!previousDek) {
      logEncryptionOperation('checkEncryptionKeyHealth', false, { 
        uid, 
        error: 'No previous key found',
        recommendation: 'Backup current key before rotation'
      });
      return { healthy: false, issue: 'no_previous_key', recommendation: 'backup_and_rotate' };
    }
    
    // Test current key with a simple encryption/decryption
    try {
      const testValue = { test: 'encryption_health_check', timestamp: Date.now() };
      const encrypted = await encryptValue(testValue, currentDek.dek, uid);
      const decrypted = await decryptValue(encrypted, currentDek.dek, uid);
      
      if (JSON.stringify(decrypted) === JSON.stringify(testValue)) {
        logEncryptionOperation('checkEncryptionKeyHealth', true, { 
          uid, 
          result: 'Current key working correctly'
        });
        return { healthy: true, currentKeyWorking: true };
      } else {
        logEncryptionOperation('checkEncryptionKeyHealth', false, { 
          uid, 
          error: 'Current key decryption mismatch',
          recommendation: 'Regenerate key'
        });
        return { healthy: false, issue: 'decryption_mismatch', recommendation: 'regenerate_key' };
      }
    } catch (error) {
      logEncryptionOperation('checkEncryptionKeyHealth', false, { 
        uid, 
        error: 'Key test failed',
        details: { errorMessage: error.message, errorCode: error.code },
        recommendation: 'Regenerate key'
      });
      return { healthy: false, issue: 'key_test_failed', recommendation: 'regenerate_key' };
    }
    
  } catch (error) {
    logEncryptionOperation('checkEncryptionKeyHealth', false, { 
      uid, 
      error: 'Health check failed',
      details: { errorMessage: error.message, errorCode: error.code }
    });
    return { healthy: false, issue: 'health_check_failed', error: error.message };
  }
}

// Regenerate encryption keys for a user (use with caution)
async function regenerateUserKeys(uid, force = false) {
  try {
    logEncryptionOperation('regenerateUserKeys', true, { uid, force, operation: 'start' });
    
    // Check if regeneration is needed
    if (!force) {
      const health = await checkEncryptionKeyHealth(uid);
      if (health.healthy) {
        logEncryptionOperation('regenerateUserKeys', false, { 
          uid, 
          error: 'Keys are healthy, regeneration not needed',
          recommendation: 'Use force=true to override'
        });
        return { success: false, reason: 'keys_healthy' };
      }
    }
    
    // Backup current key before regeneration
    const currentDek = await getUserDek(uid);
    if (currentDek) {
      try {
        const file = storage
          .bucket(BUCKET_NAME)
          .file(`keys/${environment}/${uid}.key.backup.${Date.now()}`);
        
        const [encryptResponse] = await kmsClient.encrypt({
          name: KEY_PATH,
          plaintext: currentDek,
        });
        
        const backupData = {
          encryptedDEK: encryptResponse.ciphertext.toString('base64'),
          version: await getUserDekVersion(uid),
          backedUpAt: new Date().toISOString(),
          reason: 'regeneration'
        };
        
        await file.save(JSON.stringify(backupData));
        logEncryptionOperation('regenerateUserKeys', true, { 
          uid, 
          note: 'Current key backed up before regeneration'
        });
      } catch (backupError) {
        logEncryptionOperation('regenerateUserKeys', false, { 
          uid, 
          error: 'Failed to backup current key',
          details: { backupError: backupError.message }
        });
        // Continue with regeneration even if backup fails
      }
    }
    
    // Generate new keys
    const newKeyData = await generateAndStoreEncryptedDEK(uid);
    
    logEncryptionOperation('regenerateUserKeys', true, { 
      uid, 
      result: 'Keys regenerated successfully',
      newVersion: newKeyData.version
    });
    
    return { success: true, newVersion: newKeyData.version };
    
  } catch (error) {
    logEncryptionOperation('regenerateUserKeys', false, { 
      uid, 
      error: 'Key regeneration failed',
      details: { errorMessage: error.message, errorCode: error.code }
    });
    throw error;
  }
}

// Analyze decryption failures and provide recovery recommendations
async function analyzeDecryptionFailures(uid, limit = 100) {
  try {
    logEncryptionOperation('analyzeDecryptionFailures', true, { uid, operation: 'start' });
    
    // Get user's current key status
    const currentDek = await getUserDek(uid);
    const previousDek = await getPreviousDek(uid);
    const keyVersion = currentDek ? await getUserDekVersion(uid) : null;
    
    // Check key health
    const health = await checkEncryptionKeyHealth(uid);
    
    // Analyze recent decryption attempts for this user
    const userAttempts = [];
    for (const [key, attempt] of decryptionAttempts.entries()) {
      if (key.includes(uid) && (Date.now() - attempt.timestamp) < 300000) { // Last 5 minutes
        userAttempts.push({
          timestamp: attempt.timestamp,
          count: attempt.count,
          failures: Array.from(attempt.failures),
          timeSinceFirst: Date.now() - attempt.timestamp
        });
      }
    }
    
    const analysis = {
      uid,
      timestamp: new Date().toISOString(),
      keyStatus: {
        hasCurrentKey: !!currentDek,
        hasPreviousKey: !!previousDek,
        currentKeyVersion: keyVersion,
        keyHealth: health
      },
      recentFailures: userAttempts,
      recommendations: []
    };
    
    // Generate recommendations based on analysis
    if (!currentDek) {
      analysis.recommendations.push('Generate new encryption keys for user');
    } else if (!previousDek) {
      analysis.recommendations.push('Backup current key and create fallback key');
    } else if (health.healthy === false) {
      analysis.recommendations.push(`Key health issue: ${health.issue}. Recommendation: ${health.recommendation}`);
    }
    
    if (userAttempts.length > 0) {
      const totalFailures = userAttempts.reduce((sum, attempt) => sum + attempt.count, 0);
      if (totalFailures > 10) {
        analysis.recommendations.push('High failure rate detected - consider immediate key regeneration');
      }
    }
    
    if (analysis.recommendations.length === 0) {
      analysis.recommendations.push('No immediate action required - keys appear healthy');
    }
    
    logEncryptionOperation('analyzeDecryptionFailures', true, { 
      uid, 
      result: 'Analysis completed',
      recommendations: analysis.recommendations.length
    });
    
    return analysis;
    
  } catch (error) {
    logEncryptionOperation('analyzeDecryptionFailures', false, { 
      uid, 
      error: 'Analysis failed',
      details: { errorMessage: error.message, errorCode: error.code }
    });
    return { 
      uid, 
      error: 'Analysis failed', 
      message: error.message,
      recommendations: ['Check system logs for detailed error information']
    };
  }
}

// Emergency key regeneration for users with persistent decryption failures
async function emergencyKeyRegeneration(uid) {
  try {
    logEncryptionOperation('emergencyKeyRegeneration', true, { uid, operation: 'start' });
    
    console.log(`[ENCRYPTION] Starting emergency key regeneration for user: ${uid}`);
    
    // Clear all caches for this user
    clearDecryptedCache(uid);
    clearDecryptionKeyCache(uid);
    dekCache.delete(uid);
    dekVersionCache.delete(uid);
    
    // Remove from circuit breaker
    decryptionCircuitBreaker.delete(uid);
    
    // Generate completely new keys
    const newKeyData = await generateAndStoreEncryptedDEK(uid);
    
    // Clear any existing previous key files to avoid confusion
    try {
      const previousKeyFile = storage
        .bucket(BUCKET_NAME)
        .file(`keys/${environment}/${uid}.key.previous`);
      
      if ((await previousKeyFile.exists())[0]) {
        await previousKeyFile.delete();
        console.log(`[ENCRYPTION] Removed old previous key file for user: ${uid}`);
      }
    } catch (error) {
      console.warn(`[ENCRYPTION] Could not remove old previous key file for user ${uid}:`, error.message);
    }
    
    logEncryptionOperation('emergencyKeyRegeneration', true, { 
      uid, 
      newVersion: newKeyData.version,
      note: 'All caches cleared and new keys generated'
    });
    
    console.log(`[ENCRYPTION] Emergency key regeneration completed for user: ${uid}`);
    return { success: true, newVersion: newKeyData.version };
    
  } catch (error) {
    logEncryptionOperation('emergencyKeyRegeneration', false, { 
      uid, 
      error: error.message,
      details: { errorType: error.constructor.name, errorCode: error.code }
    });
    
    console.error(`[ENCRYPTION] Emergency key regeneration failed for user ${uid}:`, error);
    return { success: false, error: error.message };
  }
}

// Data recovery system for corrupted encryption keys
const dataRecoveryCache = new Map();
const RECOVERY_ATTEMPTS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function attemptDataRecovery(uid, encryptedData) {
  try {
    logEncryptionOperation('attemptDataRecovery', true, { uid, operation: 'start' });
    
    console.log(`[ENCRYPTION] Attempting data recovery for user: ${uid}`);
    
    // Check if we've already attempted recovery for this data
    const recoveryKey = `${uid}:${JSON.stringify(encryptedData)}`;
    const cachedRecovery = dataRecoveryCache.get(recoveryKey);
    
    if (cachedRecovery && (Date.now() - cachedRecovery.timestamp) < RECOVERY_ATTEMPTS_CACHE_TTL) {
      console.log(`[ENCRYPTION] Recovery already attempted recently for user: ${uid}`);
      return cachedRecovery.result;
    }
    
    // Strategy 1: Try with current key (if different from the one that failed)
    try {
      const currentKeyData = await getUserDek(uid);
      if (currentKeyData && currentKeyData.dek) {
        const result = await attemptDecryption(encryptedData, currentKeyData.dek, uid, 'recovery_current');
        if (result.success) {
          const recoveryResult = { success: true, method: 'current_key', data: result.value };
          dataRecoveryCache.set(recoveryKey, { result: recoveryResult, timestamp: Date.now() });
          return recoveryResult;
        }
      }
    } catch (error) {
      console.log(`[ENCRYPTION] Current key recovery failed for user ${uid}:`, error.message);
    }
    
    // Strategy 2: Try with previous key
    try {
      const previousDek = await getPreviousDek(uid);
      if (previousDek) {
        const result = await attemptDecryption(encryptedData, previousDek, uid, 'recovery_previous');
        if (result.success) {
          const recoveryResult = { success: true, method: 'previous_key', data: result.value };
          dataRecoveryCache.set(recoveryKey, { result: recoveryResult, timestamp: Date.now() });
          return recoveryResult;
        }
      }
    } catch (error) {
      console.log(`[ENCRYPTION] Previous key recovery failed for user ${uid}:`, error.message);
    }
    
    // Strategy 3: Try with backup keys from different time periods
    const backupKeyPaths = [
      `keys/${environment}/${uid}.key.backup.${Date.now() - 24 * 60 * 60 * 1000}`, // 1 day ago
      `keys/${environment}/${uid}.key.backup.${Date.now() - 7 * 24 * 60 * 60 * 1000}`, // 1 week ago
      `keys/${environment}/${uid}.key.backup.${Date.now() - 30 * 24 * 60 * 60 * 1000}` // 1 month ago
    ];
    
    for (const backupPath of backupKeyPaths) {
      try {
        const backupFile = storage.bucket(BUCKET_NAME).file(backupPath);
        if ((await backupFile.exists())[0]) {
          const [keyDataString] = await backupFile.download();
          const keyData = JSON.parse(keyDataString.toString());
          const encryptedDEK = Buffer.from(keyData.encryptedDEK, 'base64');
          
          const [decryptResponse] = await kmsClient.decrypt({
            name: KEY_PATH,
            ciphertext: encryptedDEK,
          });
          
          const backupDek = decryptResponse.plaintext;
          const result = await attemptDecryption(encryptedData, backupDek, uid, 'recovery_backup');
          
          if (result.success) {
            const recoveryResult = { success: true, method: 'backup_key', data: result.value, backupPath };
            dataRecoveryCache.set(recoveryKey, { result: recoveryResult, timestamp: Date.now() });
            return recoveryResult;
          }
        }
      } catch (error) {
        console.log(`[ENCRYPTION] Backup key recovery failed for path ${backupPath}:`, error.message);
      }
    }
    
    // Strategy 4: Try with system-wide fallback keys (if configured)
    if (process.env.SYSTEM_FALLBACK_KEY) {
      try {
        const fallbackDek = Buffer.from(process.env.SYSTEM_FALLBACK_KEY, 'base64');
        const result = await attemptDecryption(encryptedData, fallbackDek, uid, 'recovery_system_fallback');
        if (result.success) {
          const recoveryResult = { success: true, method: 'system_fallback', data: result.value };
          dataRecoveryCache.set(recoveryKey, { result: recoveryResult, timestamp: Date.now() });
          return recoveryResult;
        }
      } catch (error) {
        console.log(`[ENCRYPTION] System fallback recovery failed for user ${uid}:`, error.message);
      }
    }
    
    // All recovery strategies failed
    const recoveryResult = { success: false, method: 'none', error: 'All recovery strategies failed' };
    dataRecoveryCache.set(recoveryKey, { result: recoveryResult, timestamp: Date.now() });
    
    logEncryptionOperation('attemptDataRecovery', false, { 
      uid, 
      error: 'All recovery strategies failed',
      strategiesAttempted: ['current_key', 'previous_key', 'backup_keys', 'system_fallback']
    });
    
    return recoveryResult;
    
  } catch (error) {
    logEncryptionOperation('attemptDataRecovery', false, { 
      uid, 
      error: error.message,
      details: { errorType: error.constructor.name, errorCode: error.code }
    });
    
    return { success: false, method: 'error', error: error.message };
  }
}

// Automatic key backup system
const AUTOMATIC_BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_BACKUP_KEYS = 7; // Keep 7 days of backups

async function createAutomaticKeyBackup(uid) {
  try {
    const currentDek = await getUserDek(uid);
    if (!currentDek || !currentDek.dek) {
      console.log(`[ENCRYPTION] No current key to backup for user: ${uid}`);
      return false;
    }
    
    const timestamp = Date.now();
    const backupPath = `keys/${environment}/${uid}.key.backup.${timestamp}`;
    
    // Encrypt the current DEK with KMS before persisting
    const [encryptResponse] = await kmsClient.encrypt({
      name: KEY_PATH,
      plaintext: currentDek.dek,
    });
    
    const backupData = {
      encryptedDEK: encryptResponse.ciphertext.toString('base64'),
      version: currentDek.version,
      backedUpAt: new Date().toISOString(),
      originalCreatedAt: new Date().toISOString()
    };
    
    const backupFile = storage.bucket(BUCKET_NAME).file(backupPath);
    await backupFile.save(JSON.stringify(backupData));
    
    console.log(`[ENCRYPTION] Automatic key backup created for user: ${uid} at ${backupPath}`);
    
    // Clean up old backups to prevent storage bloat
    await cleanupOldBackups(uid);
    
    return true;
  } catch (error) {
    console.error(`[ENCRYPTION] Automatic key backup failed for user ${uid}:`, error);
    return false;
  }
}

async function cleanupOldBackups(uid) {
  try {
    const bucket = storage.bucket(BUCKET_NAME);
    const [files] = await bucket.getFiles({
      prefix: `keys/${environment}/${uid}.key.backup.`
    });
    
    if (files.length > MAX_BACKUP_KEYS) {
      // Sort by timestamp (newest first) and remove oldest
      const sortedFiles = files.sort((a, b) => {
        const timestampA = parseInt(a.name.split('.').pop());
        const timestampB = parseInt(b.name.split('.').pop());
        return timestampB - timestampA;
      });
      
      const filesToDelete = sortedFiles.slice(MAX_BACKUP_KEYS);
      
      for (const file of filesToDelete) {
        try {
          await file.delete();
          console.log(`[ENCRYPTION] Cleaned up old backup: ${file.name}`);
        } catch (deleteError) {
          console.warn(`[ENCRYPTION] Could not delete old backup ${file.name}:`, deleteError.message);
        }
      }
    }
  } catch (error) {
    console.warn(`[ENCRYPTION] Backup cleanup failed for user ${uid}:`, error.message);
  }
}

// Schedule automatic backups for all users
async function scheduleAutomaticBackups() {
  try {
    console.log(`[ENCRYPTION] Scheduling automatic key backups every ${AUTOMATIC_BACKUP_INTERVAL / (60 * 60 * 1000)} hours`);
    
    setInterval(async () => {
      try {
        // Get all users with keys (this would need to be implemented based on your user management)
        // For now, we'll just log that the backup system is running
        console.log(`[ENCRYPTION] Automatic backup system running at ${new Date().toISOString()}`);
        
        // TODO: Implement user enumeration and backup creation
        // const users = await getAllUsersWithKeys();
        // for (const user of users) {
        //   await createAutomaticKeyBackup(user.uid);
        // }
        
      } catch (error) {
        console.error(`[ENCRYPTION] Automatic backup cycle failed:`, error);
      }
    }, AUTOMATIC_BACKUP_INTERVAL);
    
  } catch (error) {
    console.error(`[ENCRYPTION] Failed to schedule automatic backups:`, error);
  }
}

// Fallback data system for when decryption completely fails
const fallbackDataCache = new Map();
const FALLBACK_CACHE_TTL = 60 * 60 * 1000; // 1 hour

// Default fallback values for common data types
const DEFAULT_FALLBACK_VALUES = {
  // Financial data
  'net_worth': 0,
  'balance': 0,
  'income': 0,
  'spending': 0,
  'transactions': [],
  
  // Account data
  'accounts': [],
  'account_balance': 0,
  'account_type': 'unknown',
  
  // Business data
  'business_name': 'Business Account',
  'business_logo': null,
  'business_type': 'unknown',
  
  // User data
  'user_name': 'User',
  'user_email': 'user@example.com',
  
  // Generic data
  'description': 'Data temporarily unavailable',
  'amount': 0,
  'date': new Date().toISOString(),
  'status': 'pending'
};

function getFallbackData(dataType, uid) {
  const cacheKey = `${uid}:${dataType}`;
  const cached = fallbackDataCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < FALLBACK_CACHE_TTL) {
    return cached.data;
  }
  
  // Generate appropriate fallback data based on type
  let fallbackData;
  
  switch (dataType) {
    case 'net_worth':
    case 'balance':
    case 'income':
    case 'spending':
    case 'amount':
      fallbackData = 0;
      break;
      
    case 'accounts':
      fallbackData = [{
        id: 'fallback_account',
        name: 'Account',
        type: 'unknown',
        balance: 0,
        status: 'active'
      }];
      break;
      
    case 'transactions':
      fallbackData = [{
        id: 'fallback_transaction',
        description: 'Transaction',
        amount: 0,
        date: new Date().toISOString(),
        type: 'unknown',
        status: 'pending'
      }];
      break;
      
    case 'business_logo':
      fallbackData = null;
      break;
      
    case 'business_name':
      fallbackData = 'Business Account';
      break;
      
    default:
      fallbackData = DEFAULT_FALLBACK_VALUES[dataType] || 'Data unavailable';
  }
  
  // Cache the fallback data
  fallbackDataCache.set(cacheKey, {
    data: fallbackData,
    timestamp: Date.now()
  });
  
  return fallbackData;
}

// Enhanced safeDecryptValue function that provides fallback data
async function safeDecryptValueWithFallback(value, dek, uid, dataType = 'generic') {
  try {
    // First try normal decryption
    const decrypted = await decryptValue(value, dek, uid);
    
    if (decrypted !== null) {
      return decrypted;
    }
    
    // If decryption fails, try data recovery
    if (uid) {
      const recoveryResult = await attemptDataRecovery(uid, value);
      if (recoveryResult.success) {
        console.log(`[ENCRYPTION] Data recovered for user ${uid} using ${recoveryResult.method}`);
        return recoveryResult.data;
      }
    }
    
    // If all else fails, provide fallback data
    console.warn(`[ENCRYPTION] Providing fallback data for user ${uid}, type: ${dataType}`);
    const fallbackData = getFallbackData(dataType, uid);
    
    // Log that we're using fallback data for monitoring
    logEncryptionOperation('safeDecryptValueWithFallback', false, {
      uid,
      dataType,
      note: 'Using fallback data due to decryption failure',
      fallbackData: typeof fallbackData === 'object' ? 'object' : fallbackData
    });
    
    return fallbackData;
    
  } catch (error) {
    console.error(`[ENCRYPTION] Error in safeDecryptValueWithFallback for user ${uid}:`, error);
    
    // Even if everything fails, return fallback data
    const fallbackData = getFallbackData(dataType, uid);
    console.warn(`[ENCRYPTION] Critical failure, using emergency fallback for user ${uid}`);
    
    return fallbackData;
  }
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
  getDecryptionKeyCacheStats,
  checkEncryptionKeyHealth,
  regenerateUserKeys,
  analyzeDecryptionFailures,
  emergencyKeyRegeneration,
  attemptDataRecovery,
  createAutomaticKeyBackup,
  cleanupOldBackups,
  scheduleAutomaticBackups,
  safeDecryptValueWithFallback
};
