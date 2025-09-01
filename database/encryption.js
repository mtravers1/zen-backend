import dotenv from "dotenv";
import { LimitedMap } from "../lib/limitedMap.js";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";

dotenv.config();

// ===== ENVIRONMENT VARIABLES VALIDATION LOGS =====
console.log("=".repeat(80));
console.log("🔍 [ENCRYPTION] ENVIRONMENT VARIABLES VALIDATION");
console.log("=".repeat(80));

// Core environment variables
console.log(`[ENCRYPTION] 📋 Core Environment Variables:`);
console.log(`  - ENVIRONMENT: ${process.env.ENVIRONMENT || 'NOT_SET'}`);
console.log(`  - NODE_ENV: ${process.env.NODE_ENV || 'NOT_SET'}`);

// Google Cloud Project Configuration
console.log(`[ENCRYPTION] ☁️ Google Cloud Project Configuration:`);
console.log(`  - GCP_PROJECT_ID: ${process.env.GCP_PROJECT_ID || 'NOT_SET'}`);
console.log(`  - GCP_KEY_LOCATION: ${process.env.GCP_KEY_LOCATION || 'NOT_SET'}`);
console.log(`  - GCP_KEY_RING: ${process.env.GCP_KEY_RING || 'NOT_SET'}`);
console.log(`  - GCP_KEY_NAME: ${process.env.GCP_KEY_NAME || 'NOT_SET'}`);

// Service Accounts
console.log(`[ENCRYPTION] 🔑 Service Accounts:`);
console.log(`  - STORAGE_SERVICE_ACCOUNT: ${process.env.STORAGE_SERVICE_ACCOUNT ? 'SET (Base64)' : 'NOT_SET'}`);
console.log(`  - KMS_SERVICE_ACCOUNT: ${process.env.KMS_SERVICE_ACCOUNT ? 'SET (Base64)' : 'NOT_SET'}`);

// Critical for legacy data recovery
console.log(`[ENCRYPTION] 🔐 Critical Variables for Legacy Data Recovery:`);
console.log(`  - HASH_SALT: ${process.env.HASH_SALT ? 'SET' : 'NOT_SET'}`);
if (process.env.HASH_SALT) {
  console.log(`  - HASH_SALT length: ${process.env.HASH_SALT.length} characters`);
  console.log(`  - HASH_SALT preview: ${process.env.HASH_SALT.substring(0, 20)}...`);
} else {
  console.log(`  - ⚠️ HASH_SALT is NOT_SET - this will cause legacy data recovery failures!`);
}

// Bucket Configuration
console.log(`[ENCRYPTION] 🪣 Bucket Configuration:`);
console.log(`  - BUCKET_NAME: ${process.env.BUCKET_NAME || 'NOT_SET'}`);

console.log("=".repeat(80));

// Validate and parse Storage Service Account
console.log(`[ENCRYPTION] 🔍 Validating Storage Service Account...`);
const serviceAccountBase64 = process.env.STORAGE_SERVICE_ACCOUNT;
if (!serviceAccountBase64) {
  console.error(`[ENCRYPTION] ❌ STORAGE_SERVICE_ACCOUNT is not set!`);
  throw new Error("STORAGE_SERVICE_ACCOUNT environment variable is required");
}

let storageServiceAccount;
try {
  const serviceAccountJsonString = Buffer.from(serviceAccountBase64, "base64").toString("utf8");
  storageServiceAccount = JSON.parse(serviceAccountJsonString);
  console.log(`[ENCRYPTION] ✅ Storage Service Account parsed successfully`);
  console.log(`  - Project ID: ${storageServiceAccount.project_id || 'NOT_FOUND'}`);
  console.log(`  - Client Email: ${storageServiceAccount.client_email || 'NOT_FOUND'}`);
  console.log(`  - Type: ${storageServiceAccount.type || 'NOT_FOUND'}`);
} catch (error) {
  console.error(`[ENCRYPTION] ❌ Failed to parse STORAGE_SERVICE_ACCOUNT:`, error.message);
  throw new Error(`Invalid STORAGE_SERVICE_ACCOUNT format: ${error.message}`);
}

// Validate and parse KMS Service Account
console.log(`[ENCRYPTION] 🔍 Validating KMS Service Account...`);
const kmsServiceAccountBase64 = process.env.KMS_SERVICE_ACCOUNT;
if (!kmsServiceAccountBase64) {
  console.error(`[ENCRYPTION] ❌ KMS_SERVICE_ACCOUNT is not set!`);
  throw new Error("KMS_SERVICE_ACCOUNT environment variable is required");
}

let kmsServiceAccount;
try {
  const kmsServiceAccountJsonString = Buffer.from(kmsServiceAccountBase64, "base64").toString("utf8");
  kmsServiceAccount = JSON.parse(kmsServiceAccountJsonString);
  console.log(`[ENCRYPTION] ✅ KMS Service Account parsed successfully`);
  console.log(`  - Project ID: ${kmsServiceAccount.project_id || 'NOT_FOUND'}`);
  console.log(`  - Client Email: ${kmsServiceAccount.client_email || 'NOT_FOUND'}`);
  console.log(`  - Type: ${kmsServiceAccount.type || 'NOT_FOUND'}`);
} catch (error) {
  console.error(`[ENCRYPTION] ❌ Failed to parse KMS_SERVICE_ACCOUNT:`, error.message);
  throw new Error(`Invalid KMS_SERVICE_ACCOUNT format: ${error.message}`);
}

// Initialize Google Cloud clients with validation
console.log(`[ENCRYPTION] 🔧 Initializing Google Cloud clients...`);
let kmsClient, storage, KEY_PATH;

try {
  kmsClient = new KeyManagementServiceClient({
    credentials: kmsServiceAccount,
  });
  console.log(`[ENCRYPTION] ✅ KMS Client initialized successfully`);

  storage = new Storage({
    credentials: storageServiceAccount,
  });
  console.log(`[ENCRYPTION] ✅ Storage Client initialized successfully`);

  // Validate and construct KEY_PATH
  console.log(`[ENCRYPTION] 🔑 Constructing KMS Key Path...`);
  const gcpProjectId = process.env.GCP_PROJECT_ID;
  const gcpKeyLocation = process.env.GCP_KEY_LOCATION;
  const gcpKeyRing = process.env.GCP_KEY_RING;
  const gcpKeyName = process.env.GCP_KEY_NAME;

  if (!gcpProjectId || !gcpKeyLocation || !gcpKeyRing || !gcpKeyName) {
    console.error(`[ENCRYPTION] ❌ Missing required GCP configuration:`);
    console.error(`  - GCP_PROJECT_ID: ${gcpProjectId || 'NOT_SET'}`);
    console.error(`  - GCP_KEY_LOCATION: ${gcpKeyLocation || 'NOT_SET'}`);
    console.error(`  - GCP_KEY_RING: ${gcpKeyRing || 'NOT_SET'}`);
    console.error(`  - GCP_KEY_NAME: ${gcpKeyName || 'NOT_SET'}`);
    throw new Error("Missing required GCP configuration variables");
  }

  KEY_PATH = kmsClient.cryptoKeyPath(gcpProjectId, gcpKeyLocation, gcpKeyRing, gcpKeyName);
  console.log(`[ENCRYPTION] ✅ KMS Key Path constructed successfully`);
  console.log(`  - KEY_PATH: ${KEY_PATH}`);

} catch (error) {
  console.error(`[ENCRYPTION] ❌ Failed to initialize Google Cloud clients:`, error.message);
  throw new Error(`Google Cloud initialization failed: ${error.message}`);
}

// Bucket configuration
const BUCKET_NAME = process.env.BUCKET_NAME || "zentavos-bucket";
console.log(`[ENCRYPTION] 🪣 Using bucket: ${BUCKET_NAME}`);

console.log("=".repeat(80));
console.log("✅ [ENCRYPTION] INITIALIZATION COMPLETE");
console.log("=".repeat(80));

// DEK cache in memory
const dekCache = new LimitedMap(1000); // Limit to 1000 DEKs

async function generateAndStoreEncryptedDEK(uid) {
  console.log(`[ENCRYPTION] 🔑 Generating new DEK for user: ${uid}`);
  
  const dek = crypto.randomBytes(32);
  console.log(`[ENCRYPTION] ✅ DEK generated (32 bytes)`);

  console.log(`[ENCRYPTION] 🔐 Encrypting DEK with KMS...`);
  const [encryptResponse] = await kmsClient.encrypt({
    name: KEY_PATH,
    plaintext: dek,
  });
  console.log(`[ENCRYPTION] ✅ DEK encrypted with KMS`);

  const encryptedDEK = encryptResponse.ciphertext;
  const environment = process.env.ENVIRONMENT || "prod";
  const filePath = `keys/${environment}/${uid}.key`;
  console.log(`[ENCRYPTION] 💾 Saving encrypted DEK to: ${filePath}`);
  
  const file = storage.bucket(BUCKET_NAME).file(filePath);
  await file.save(encryptedDEK);
  console.log(`[ENCRYPTION] ✅ Encrypted DEK saved to bucket`);

  // Cache the DEK
  dekCache.set(uid, dek);
  console.log(`[ENCRYPTION] ✅ DEK cached in memory`);

  return dek;
}

async function getDEKFromBucket(uid) {
  console.log(`[ENCRYPTION] 🔍 Retrieving DEK from bucket for user: ${uid}`);
  
  const environment = process.env.ENVIRONMENT || "prod";
  const filePath = `keys/${environment}/${uid}.key`;
  console.log(`[ENCRYPTION] 📁 Checking file: ${filePath}`);
  
  const file = storage.bucket(BUCKET_NAME).file(filePath);
  const fileExists = await file.exists();
  console.log(`[ENCRYPTION] 🔍 File exists: ${fileExists[0]}`);
  
  if (!fileExists[0]) {
    console.log(`[ENCRYPTION] ❌ DEK file not found for user: ${uid}`);
    return null;
  }
  
  console.log(`[ENCRYPTION] 📥 Downloading encrypted DEK...`);
  const [encryptedDEK] = await file.download();
  console.log(`[ENCRYPTION] ✅ Encrypted DEK downloaded (${encryptedDEK.length} bytes)`);

  console.log(`[ENCRYPTION] 🔓 Decrypting DEK with KMS...`);
  const [decryptResponse] = await kmsClient.decrypt({
    name: KEY_PATH,
    ciphertext: encryptedDEK,
  });
  console.log(`[ENCRYPTION] ✅ DEK decrypted successfully`);

  return decryptResponse.plaintext;
}

async function getUserDek(uid) {
  console.log(`[ENCRYPTION] 🔑 Getting DEK for user: ${uid}`);
  
  try {
    // Check in-memory cache first
    if (dekCache.has(uid)) {
      console.log(`[ENCRYPTION] ✅ DEK found in cache for user: ${uid}`);
      return dekCache.get(uid);
    }

    console.log(`[ENCRYPTION] 🔍 DEK not in cache, retrieving from bucket...`);
    let dek = await getDEKFromBucket(uid);

    if (!dek) {
      console.log(`[ENCRYPTION] ❌ No existing DEK found, generating new one...`);
      dek = await generateAndStoreEncryptedDEK(uid);
    } else {
      console.log(`[ENCRYPTION] ✅ DEK retrieved from bucket, caching...`);
      dekCache.set(uid, dek); // Cache it once retrieved
    }

    console.log(`[ENCRYPTION] ✅ DEK ready for user: ${uid}`);
    return dek;
  } catch (e) {
    console.error(`[ENCRYPTION] ❌ Error getting DEK for user ${uid}:`, e.message);
    throw e;
  }
}

// Encrypts a value using AES-256-GCM and a provided data encryption key (DEK)
async function encryptValue(value, dek) {
  if (value === null || value === undefined) return value;

  console.log(`[ENCRYPTION] 🔐 Encrypting value (type: ${typeof value})`);
  
  try {
    // Convert the value to a JSON string to ensure it's properly formatted
    const jsonString = JSON.stringify(value);
    console.log(`[ENCRYPTION] 📝 JSON string length: ${jsonString.length} characters`);

    // Generate a random 16-byte initialization vector (IV)
    const iv = crypto.randomBytes(16);
    console.log(`[ENCRYPTION] 🎲 IV generated (16 bytes)`);

    // Create an AES-256-GCM cipher using the DEK and IV
    const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
    console.log(`[ENCRYPTION] 🔧 Cipher created with AES-256-GCM`);

    // Encrypt the JSON string
    const encrypted = Buffer.concat([
      cipher.update(jsonString, "utf8"),
      cipher.final(),
    ]);
    console.log(`[ENCRYPTION] 🔒 Content encrypted (${encrypted.length} bytes)`);

    // Get the authentication tag to ensure integrity during decryption
    const tag = cipher.getAuthTag();
    console.log(`[ENCRYPTION] 🏷️ Auth tag generated (16 bytes)`);

    // Combine IV + Auth Tag + Encrypted content, and return as base64 string
    const result = Buffer.concat([iv, tag, encrypted]).toString("base64");
    console.log(`[ENCRYPTION] ✅ Encryption complete (${result.length} characters)`);
    
    return result;
  } catch (e) {
    console.error(`[ENCRYPTION] ❌ Error encrypting value:`, e.message);
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

  console.log(`[ENCRYPTION] 🔓 Decrypting value (${cipherTextBase64.length} characters)`);

  try {
    // Decode the base64-encoded ciphertext
    const cipherBuffer = Buffer.from(cipherTextBase64, "base64");
    console.log(`[ENCRYPTION] 📊 Decoded buffer length: ${cipherBuffer.length} bytes`);

    // Extract IV (first 16 bytes), authentication tag (next 16), and encrypted content (remaining)
    const iv = cipherBuffer.slice(0, 16);
    const tag = cipherBuffer.slice(16, 32);
    const encrypted = cipherBuffer.slice(32);
    
    console.log(`[ENCRYPTION] ✂️ Extracted components:`);
    console.log(`  - IV: ${iv.length} bytes`);
    console.log(`  - Tag: ${tag.length} bytes`);
    console.log(`  - Encrypted: ${encrypted.length} bytes`);

    // Create a decipher using AES-256-GCM with the same DEK and IV
    const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);
    console.log(`[ENCRYPTION] 🔧 Decipher created with AES-256-GCM`);

    // Set the authentication tag
    decipher.setAuthTag(tag);
    console.log(`[ENCRYPTION] 🏷️ Auth tag set`);

    // Decrypt the content and convert it back to UTF-8 string
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
    console.log(`[ENCRYPTION] 🔓 Content decrypted (${decrypted.length} characters)`);

    // Parse the decrypted JSON string and return the original value
    const result = JSON.parse(decrypted);
    console.log(`[ENCRYPTION] ✅ Decryption complete (type: ${typeof result})`);
    
    return result;
  } catch (e) {
    console.error(`[ENCRYPTION] ❌ Error decrypting value:`, e.message);
    console.log(`[ENCRYPTION] 🔄 Returning original ciphertext due to decryption failure`);
    return cipherTextBase64;
  }
}

function hashEmail(email) {
  console.log(`[ENCRYPTION] 🔐 Hashing email: ${email}`);
  const salt = process.env.HASH_SALT;
  
  if (!salt) {
    console.error(`[ENCRYPTION] ❌ HASH_SALT is not set for email hashing!`);
    throw new Error("HASH_SALT is required for email hashing");
  }
  
  console.log(`[ENCRYPTION] ✅ HASH_SALT available (${salt.length} characters)`);
  const hash = crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase() + salt)
    .digest("hex");
  
  console.log(`[ENCRYPTION] ✅ Email hashed successfully`);
  return hash;
}

function hashValue(value) {
  console.log(`[ENCRYPTION] 🔐 Hashing value (type: ${typeof value})`);
  const salt = process.env.HASH_SALT;
  
  if (!salt) {
    console.error(`[ENCRYPTION] ❌ HASH_SALT is not set for value hashing!`);
    throw new Error("HASH_SALT is required for value hashing");
  }
  
  console.log(`[ENCRYPTION] ✅ HASH_SALT available (${salt.length} characters)`);
  const hash = crypto
    .createHash("sha256")
    .update(value + salt)
    .digest("hex");
  
  console.log(`[ENCRYPTION] ✅ Value hashed successfully`);
  return hash;
}
export { encryptValue, decryptValue, getUserDek, hashEmail, hashValue };
