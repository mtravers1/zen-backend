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

// Cache for failed decryption attempts to avoid infinite loops
const failedDecryptionCache = new LimitedMap(1000); // Cache failed attempts
const MAX_DECRYPTION_ATTEMPTS = 3; // Maximum attempts per unique input

// Clean up failed decryption cache periodically to prevent memory leaks
setInterval(() => {
  const cacheSize = failedDecryptionCache.size;
  if (cacheSize > 500) { // If cache gets too large
    failedDecryptionCache.clear();
    console.log(`[ENCRYPTION] Cleared failed decryption cache (was ${cacheSize} entries)`);
  }
  
  // Alert if there are too many failed attempts (potential attack or data corruption)
  if (cacheSize > 100) {
    console.warn(`[ENCRYPTION] WARNING: High number of failed decryption attempts (${cacheSize}). This may indicate data corruption or a potential attack.`);
  }
}, 300000); // Clean every 5 minutes

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
  try {
    const file = storage
      .bucket(BUCKET_NAME)
      .file(`keys/${environment}/${uid}.key`);
    
    if (!(await file.exists())[0]) {
      logEncryptionOperation('getDEKFromBucket', false, { uid, error: 'Key file not found' });
      return null;
    }
    
    const [keyDataString] = await file.download();
    const keyData = JSON.parse(keyDataString.toString());
    
    const encryptedDEK = Buffer.from(keyData.encryptedDEK, 'base64');
    const keyVersion = keyData.version;

    const [decryptResponse] = await kmsClient.decrypt({
      name: KEY_PATH,
      ciphertext: encryptedDEK,
    });

    const dek = decryptResponse.plaintext;
    
    // Cache the DEK and version
    dekCache.set(uid, dek);
    dekVersionCache.set(uid, keyVersion);

    logEncryptionOperation('getDEKFromBucket', true, { uid, keyVersion });
    return { dek, version: keyVersion };
  } catch (error) {
    logEncryptionOperation('getDEKFromBucket', false, { uid, error: error.message });
    return null;
  }
}

async function getUserDek(uid) {
  try {
    console.log(`[ENCRYPTION] getUserDek called for user: ${uid}`);
    
    // Check in-memory cache first
    if (dekCache.has(uid)) {
      const version = dekVersionCache.get(uid);
      console.log(`[ENCRYPTION] Found DEK in cache for user: ${uid}, version: ${version}`);
      logEncryptionOperation('getUserDek', true, { uid, source: 'cache', version });
      return dekCache.get(uid);
    }

    console.log(`[ENCRYPTION] DEK not in cache, checking bucket for user: ${uid}`);
    let keyData = await getDEKFromBucket(uid);

    if (!keyData) {
      console.log(`[ENCRYPTION] No key found in bucket, generating new keys for user: ${uid}`);
      keyData = await generateAndStoreEncryptedDEK(uid);
      console.log(`[ENCRYPTION] Successfully generated new keys for user: ${uid}`);
    } else {
      console.log(`[ENCRYPTION] Found existing keys in bucket for user: ${uid}`);
    }

    return keyData.dek;
  } catch (e) {
    console.error(`[ENCRYPTION] getUserDek failed for user ${uid}:`, e);
    console.error(`[ENCRYPTION] Error details:`, {
      message: e.message,
      stack: e.stack,
      code: e.code,
      status: e.status
    });
    
    logEncryptionOperation('getUserDek', false, { uid, error: e.message });
    console.error("Error getting DEK:", e);
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

// Decrypts a base64-encoded ciphertext using AES-256-GCM with fallback support
async function decryptValue(cipherTextBase64, dek, uid = null, fallbackDek = null) {
  if (
    cipherTextBase64 === null ||
    cipherTextBase64 === undefined ||
    cipherTextBase64 === ""
  )
    return cipherTextBase64;

  // Validate input type
  if (typeof cipherTextBase64 !== 'string') {
    logEncryptionOperation('decryptValue', false, { 
      uid, 
      error: 'Invalid input type - expected string',
      inputType: typeof cipherTextBase64
    });
    return null;
  }

  // Additional validation for obviously invalid data
  if (cipherTextBase64.length < 33) {
    logEncryptionOperation('decryptValue', false, { 
      uid, 
      error: 'Input too short for valid encrypted data',
      inputLength: cipherTextBase64.length,
      minimumRequired: 33
    });
    return null;
  }

  // Check if the string looks like base64 (including URL-safe base64)
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(cipherTextBase64)) {
    logEncryptionOperation('decryptValue', false, { 
      uid, 
      error: 'Input does not appear to be valid base64',
      inputLength: cipherTextBase64.length
    });
    return null;
  }

  // Check if this input has already failed too many times
  const cacheKey = `${uid || 'unknown'}_${cipherTextBase64.substring(0, 20)}_${cipherTextBase64.length}`;
  const failedAttempts = failedDecryptionCache.get(cacheKey) || 0;
  
  if (failedAttempts >= MAX_DECRYPTION_ATTEMPTS) {
    logEncryptionOperation('decryptValue', false, { 
      uid, 
      error: 'Maximum decryption attempts exceeded for this input',
      inputLength: cipherTextBase64.length,
      failedAttempts
    });
    return null;
  }

  // Try with current DEK first
  try {
    const result = await attemptDecryption(cipherTextBase64, dek, uid, 'current');
    if (result.success) {
      return result.value;
    }
  } catch (error) {
    logEncryptionOperation('decryptValue', false, { 
      uid, 
      attempt: 'current', 
      error: error.message,
      errorCode: error.code
    });
  }

  // Try with fallback DEK if provided
  if (fallbackDek) {
    try {
      const result = await attemptDecryption(cipherTextBase64, fallbackDek, uid, 'fallback');
      if (result.success) {
        logEncryptionOperation('decryptValue', true, { 
          uid, 
          attempt: 'fallback', 
          note: 'Successfully decrypted with fallback key'
        });
        return result.value;
      }
    } catch (error) {
      logEncryptionOperation('decryptValue', false, { 
        uid, 
        attempt: 'fallback', 
        error: error.message,
        errorCode: error.code
      });
    }
  }

  // Try to get previous DEK and attempt decryption
  try {
    const previousDek = await getPreviousDek(uid);
    if (previousDek) {
      const result = await attemptDecryption(cipherTextBase64, previousDek, uid, 'previous');
      if (result.success) {
        logEncryptionOperation('decryptValue', true, { 
          uid, 
          attempt: 'previous', 
          note: 'Successfully decrypted with previous key'
        });
        return result.value;
      }
    }
  } catch (error) {
    logEncryptionOperation('decryptValue', false, { 
      uid, 
      attempt: 'previous', 
      error: error.message,
      errorCode: error.code
    });
  }

  // Increment failed attempts counter
  failedDecryptionCache.set(cacheKey, failedAttempts + 1);

  // If all attempts fail, log the failure and return null
  logEncryptionOperation('decryptValue', false, { 
    uid, 
    error: 'All decryption attempts failed',
    inputLength: cipherTextBase64.length,
    failedAttempts: failedAttempts + 1
  });
  
  return null;
}

// Helper function to attempt decryption with a specific key
async function attemptDecryption(cipherTextBase64, dek, uid, attemptType) {
  // Validate DEK
  if (!dek || !Buffer.isBuffer(dek) || dek.length !== 32) {
    throw new Error(`Invalid DEK provided for ${attemptType} attempt: ${dek ? `length=${dek.length}, type=${typeof dek}` : 'null/undefined'}`);
  }

  // Validate cipherTextBase64 is a string
  if (typeof cipherTextBase64 !== 'string') {
    throw new Error(`cipherTextBase64 must be a string for ${attemptType} attempt, got ${typeof cipherTextBase64}`);
  }

  // Check if the string looks like base64 (including URL-safe base64)
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(cipherTextBase64)) {
    throw new Error(`Invalid base64 format for ${attemptType} attempt`);
  }

  try {
    // Decode the base64-encoded ciphertext
    const cipherBuffer = Buffer.from(cipherTextBase64, "base64");

    // Validate buffer length (IV + Auth Tag + minimum encrypted content)
    if (cipherBuffer.length < 33) {
      throw new Error(`Invalid ciphertext length for ${attemptType} attempt: ${cipherBuffer.length} bytes (minimum 33 required)`);
    }

    // Extract IV (first 16 bytes), authentication tag (next 16), and encrypted content (remaining)
    const iv = cipherBuffer.slice(0, 16);
    const tag = cipherBuffer.slice(16, 32);
    const encrypted = cipherBuffer.slice(32);

    // Validate IV and tag
    if (iv.length !== 16 || tag.length !== 16) {
      throw new Error(`Invalid IV or auth tag length for ${attemptType} attempt: IV=${iv.length}, Tag=${tag.length}`);
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

// Function to clear failed decryption cache manually
function clearFailedDecryptionCache() {
  const cacheSize = failedDecryptionCache.size;
  failedDecryptionCache.clear();
  console.log(`[ENCRYPTION] Manually cleared failed decryption cache (was ${cacheSize} entries)`);
  return { cleared: true, previousSize: cacheSize };
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
  clearFailedDecryptionCache
};
