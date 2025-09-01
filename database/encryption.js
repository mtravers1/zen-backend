import dotenv from "dotenv";
import { LimitedMap } from "../lib/limitedMap.js";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";

dotenv.config();

// ===== ENVIRONMENT VARIABLES VALIDATION =====
console.log("=".repeat(60));
console.log("🔍 [ENCRYPTION] Environment Variables Check");
console.log("=".repeat(60));

// Critical variables for encryption
console.log(`[ENCRYPTION] 📋 Core Variables:`);
console.log(`  - ENVIRONMENT: ${process.env.ENVIRONMENT || 'NOT_SET'}`);
console.log(`  - HASH_SALT: ${process.env.HASH_SALT ? 'SET' : 'NOT_SET'}`);

// Google Cloud Configuration
console.log(`[ENCRYPTION] ☁️ GCP Config:`);
console.log(`  - GCP_PROJECT_ID: ${process.env.GCP_PROJECT_ID || 'NOT_SET'}`);
console.log(`  - GCP_KEY_LOCATION: ${process.env.GCP_KEY_LOCATION || 'NOT_SET'}`);
console.log(`  - GCP_KEY_RING: ${process.env.GCP_KEY_RING || 'NOT_SET'}`);
console.log(`  - GCP_KEY_NAME: ${process.env.GCP_KEY_NAME || 'NOT_SET'}`);

// Service Accounts
console.log(`[ENCRYPTION] 🔑 Service Accounts:`);
console.log(`  - STORAGE_SERVICE_ACCOUNT: ${process.env.STORAGE_SERVICE_ACCOUNT ? 'SET' : 'NOT_SET'}`);
console.log(`  - KMS_SERVICE_ACCOUNT: ${process.env.KMS_SERVICE_ACCOUNT ? 'SET' : 'NOT_SET'}`);

// Critical warning for HASH_SALT
if (!process.env.HASH_SALT) {
  console.log(`[ENCRYPTION] ⚠️ WARNING: HASH_SALT is NOT_SET - legacy data recovery will fail!`);
}

console.log("=".repeat(60));

const serviceAccountBase64 = process.env.STORAGE_SERVICE_ACCOUNT;
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

// Log KEY_PATH for debugging
console.log(`[ENCRYPTION] 🔑 KMS Key Path: ${KEY_PATH}`);
console.log(`[ENCRYPTION] 🪣 Bucket: ${BUCKET_NAME}`);
console.log(`[ENCRYPTION] ✅ Encryption system initialized`);

// DEK cache in memory
const dekCache = new LimitedMap(1000); // Limit to 1000 DEKs

async function generateAndStoreEncryptedDEK(uid) {
  console.log(`[ENCRYPTION] 🔑 Generating new DEK for user: ${uid}`);
  
    const dek = crypto.randomBytes(32);
    const [encryptResponse] = await kmsClient.encrypt({
      name: KEY_PATH,
      plaintext: dek,
    });

    const encryptedDEK = encryptResponse.ciphertext;
  const environment = process.env.ENVIRONMENT || "prod";
  const filePath = `keys/${environment}/${uid}.key`;
  const file = storage.bucket(BUCKET_NAME).file(filePath);
  
  console.log(`[ENCRYPTION] 💾 Saving DEK to: ${filePath}`);
    await file.save(encryptedDEK);

    // Cache the DEK
    dekCache.set(uid, dek);
  console.log(`[ENCRYPTION] ✅ New DEK generated and saved`);

    return dek;
}

async function getDEKFromBucket(uid) {
  const environment = process.env.ENVIRONMENT || "prod";
  const filePath = `keys/${environment}/${uid}.key`;
  const file = storage.bucket(BUCKET_NAME).file(filePath);
  
  console.log(`[ENCRYPTION] 🔍 Looking for DEK: ${filePath}`);
  
  if (!(await file.exists())[0]) {
    console.log(`[ENCRYPTION] ❌ DEK file not found: ${filePath}`);
    return null;
    }

    const [encryptedDEK] = await file.download();
  console.log(`[ENCRYPTION] ✅ DEK downloaded (${encryptedDEK.length} bytes)`);

    const [decryptResponse] = await kmsClient.decrypt({
      name: KEY_PATH,
      ciphertext: encryptedDEK,
    });
    
  console.log(`[ENCRYPTION] ✅ DEK decrypted successfully`);
  return decryptResponse.plaintext;
}

async function getUserDek(uid) {
  try {
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
    console.error("Error getting DEK:", e);
    throw e;
  }
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

// Decrypts a base64-encoded ciphertext using AES-256-GCM and a provided DEK
async function decryptValue(cipherTextBase64, dek) {
  if (
    cipherTextBase64 === null ||
    cipherTextBase64 === undefined ||
    cipherTextBase64 === ""
  )
    return cipherTextBase64;

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
    console.log(`[ENCRYPTION] ❌ Decryption failed: ${e.message}`);
    console.log(`[ENCRYPTION] 🔄 Attempting legacy recovery...`);
    
    // Try multiple legacy decryption methods
    const legacyResult = await tryLegacyDecryption(cipherTextBase64);
    if (legacyResult !== cipherTextBase64) {
      console.log(`[ENCRYPTION] ✅ Legacy decryption successful!`);
      return legacyResult;
    }
    
    console.log(`[ENCRYPTION] ❌ All decryption methods failed, returning original`);
    return cipherTextBase64;
  }
}

// Legacy decryption fallback for old data
async function tryLegacyDecryption(cipherTextBase64) {
  console.log(`[ENCRYPTION] 🔍 Attempting legacy decryption methods...`);
  
  // Method 1: Try with HASH_SALT as key (for very old data)
  if (process.env.HASH_SALT) {
    console.log(`[ENCRYPTION] 🔑 Trying HASH_SALT as encryption key...`);
    try {
      const saltKey = crypto.createHash('sha256').update(process.env.HASH_SALT).digest();
      const result = await decryptWithKey(cipherTextBase64, saltKey);
      if (result !== cipherTextBase64) {
        console.log(`[ENCRYPTION] ✅ HASH_SALT decryption successful!`);
        return result;
      }
    } catch (e) {
      console.log(`[ENCRYPTION] ❌ HASH_SALT decryption failed: ${e.message}`);
    }
  }
  
  // Method 2: Try with default salt
  console.log(`[ENCRYPTION] 🔑 Trying default salt as encryption key...`);
  try {
    const defaultSalt = 'zentavos_default_salt';
    const defaultKey = crypto.createHash('sha256').update(defaultSalt).digest();
    const result = await decryptWithKey(cipherTextBase64, defaultKey);
    if (result !== cipherTextBase64) {
      console.log(`[ENCRYPTION] ✅ Default salt decryption successful!`);
      return result;
    }
  } catch (e) {
    console.log(`[ENCRYPTION] ❌ Default salt decryption failed: ${e.message}`);
  }
  
  // Method 3: Try with legacy production key
  console.log(`[ENCRYPTION] 🔑 Trying legacy production key...`);
  try {
    const legacyKey = crypto.createHash('sha256').update('zentavos_backend_production_key').digest();
    const result = await decryptWithKey(cipherTextBase64, legacyKey);
    if (result !== cipherTextBase64) {
      console.log(`[ENCRYPTION] ✅ Legacy production key decryption successful!`);
      return result;
    }
  } catch (e) {
    console.log(`[ENCRYPTION] ❌ Legacy production key decryption failed: ${e.message}`);
  }
  
  // Method 4: Try with empty salt (for very old data)
  console.log(`[ENCRYPTION] 🔑 Trying empty salt...`);
  try {
    const emptyKey = crypto.createHash('sha256').update('').digest();
    const result = await decryptWithKey(cipherTextBase64, emptyKey);
    if (result !== cipherTextBase64) {
      console.log(`[ENCRYPTION] ✅ Empty salt decryption successful!`);
      return result;
    }
  } catch (e) {
    console.log(`[ENCRYPTION] ❌ Empty salt decryption failed: ${e.message}`);
  }
  
  // Method 5: Check if data is already decrypted (not encrypted)
  console.log(`[ENCRYPTION] 🔍 Checking if data is already decrypted...`);
  try {
    const parsed = JSON.parse(cipherTextBase64);
    console.log(`[ENCRYPTION] ✅ Data was already decrypted (not encrypted)`);
    return parsed;
  } catch (e) {
    console.log(`[ENCRYPTION] ❌ Data is not JSON, continuing with other methods...`);
  }
  
  console.log(`[ENCRYPTION] ❌ All legacy decryption methods failed`);
  return cipherTextBase64;
}

// Helper function to decrypt with a specific key
async function decryptWithKey(cipherTextBase64, key) {
  try {
    const cipherBuffer = Buffer.from(cipherTextBase64, "base64");
    
    // Check if buffer is long enough for IV + Tag + Encrypted content
    if (cipherBuffer.length < 32) {
      throw new Error("Ciphertext too short for AES-GCM");
    }
    
    const iv = cipherBuffer.slice(0, 16);
    const tag = cipherBuffer.slice(16, 32);
    const encrypted = cipherBuffer.slice(32);
    
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
    
    return JSON.parse(decrypted);
  } catch (e) {
    return cipherTextBase64;
  }
}

function hashEmail(email) {
  const salt = process.env.HASH_SALT;
  if (!salt) {
    console.log(`[ENCRYPTION] ⚠️ HASH_SALT not set for email hashing`);
  }
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase() + salt)
    .digest("hex");
}

function hashValue(value) {
  const salt = process.env.HASH_SALT;
  if (!salt) {
    console.log(`[ENCRYPTION] ⚠️ HASH_SALT not set for value hashing`);
  }
  return crypto
    .createHash("sha256")
    .update(value + salt)
    .digest("hex");
}
export { encryptValue, decryptValue, getUserDek, hashEmail, hashValue };
