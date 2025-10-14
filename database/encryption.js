import dotenv from "dotenv";
import { LimitedMap } from "../lib/limitedMap.js";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";

dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  "STORAGE_SERVICE_ACCOUNT",
  "KMS_SERVICE_ACCOUNT",
  "GCP_PROJECT_ID",
  "GCP_KEY_LOCATION",
  "GCP_KEY_RING",
  "GCP_KEY_NAME",
  "USER_ENCRYPTION_KEY_BUCKET_NAME",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const serviceAccountBase64 = process.env.STORAGE_SERVICE_ACCOUNT;
/***
 * # **IMPORTANT**
 * # The bucket name where we store user encryption keys.
 *  using the wrong bucket will lose all data for all users!
 * */
const USER_ENCRYPTION_KEY_BUCKET_NAME =
  process.env.USER_ENCRYPTION_KEY_BUCKET_NAME;

console.log("USER_ENCRYPTION_KEY_BUCKET_NAME", USER_ENCRYPTION_KEY_BUCKET_NAME);
let storageServiceAccount, kmsServiceAccount;

try {
  const serviceAccountJsonString = Buffer.from(
    serviceAccountBase64,
    "base64"
  ).toString("utf8");
  storageServiceAccount = JSON.parse(serviceAccountJsonString);

  // Validate storage service account structure
  if (
    !storageServiceAccount.project_id ||
    !storageServiceAccount.private_key ||
    !storageServiceAccount.client_email
  ) {
    throw new Error("Invalid STORAGE_SERVICE_ACCOUNT: missing required fields");
  }
} catch (error) {
  throw new Error(`Failed to parse STORAGE_SERVICE_ACCOUNT: ${error.message}`);
}

try {
  const kmsServiceAccountBase64 = process.env.KMS_SERVICE_ACCOUNT;
  const kmsServiceAccountJsonString = Buffer.from(
    kmsServiceAccountBase64,
    "base64"
  ).toString("utf8");
  kmsServiceAccount = JSON.parse(kmsServiceAccountJsonString);

  // Validate KMS service account structure
  if (
    !kmsServiceAccount.project_id ||
    !kmsServiceAccount.private_key ||
    !kmsServiceAccount.client_email
  ) {
    throw new Error("Invalid KMS_SERVICE_ACCOUNT: missing required fields");
  }
} catch (error) {
  throw new Error(`Failed to parse KMS_SERVICE_ACCOUNT: ${error.message}`);
}

console.log("🔐 Initializing Google Cloud clients...");
console.log("📦 Project ID:", process.env.GCP_PROJECT_ID);
console.log(
  "🗝️ Storage Service Account Email:",
  storageServiceAccount.client_email
);
console.log("🔑 KMS Service Account Email:", kmsServiceAccount.client_email);

// Ensure credentials have universe_domain field
if (!storageServiceAccount.universe_domain) {
  storageServiceAccount.universe_domain = "googleapis.com";
}
if (!kmsServiceAccount.universe_domain) {
  kmsServiceAccount.universe_domain = "googleapis.com";
}

// Initialize Google Cloud clients with direct credentials
console.log("🔧 Initializing clients with direct credentials...");

// Ensure service accounts have all required OAuth URLs
const storageCredentials = {
  ...storageServiceAccount,
  type: "service_account",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
};

const kmsCredentials = {
  ...kmsServiceAccount,
  type: "service_account",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
};

console.log("📋 Credentials validation:", {
  storage: {
    hasEmail: !!storageCredentials.client_email,
    hasPrivateKey: !!storageCredentials.private_key,
    tokenUri: storageCredentials.token_uri,
    hasType: !!storageCredentials.type,
  },
  kms: {
    hasEmail: !!kmsCredentials.client_email,
    hasPrivateKey: !!kmsCredentials.private_key,
    tokenUri: kmsCredentials.token_uri,
    hasType: !!kmsCredentials.type,
  },
});

// Initialize KMS with credentials
const kmsClient = new KeyManagementServiceClient({
  credentials: kmsCredentials,
  projectId: process.env.GCP_PROJECT_ID,
});
console.log("✅ KMS client initialized");

// Initialize Storage with credentials directly
// The key fix is using resumable:false in file.save(), not JWT manipulation
const storage = new Storage({
  credentials: storageCredentials,
  projectId: process.env.GCP_PROJECT_ID,
  apiEndpoint: "https://storage.googleapis.com",
});
console.log("✅ Storage client initialized with direct credentials");
console.log("📦 Storage client details:", {
  projectId: storage.projectId,
  apiEndpoint: "https://storage.googleapis.com",
  hasAuthClient: !!storage.authClient,
  authClientType: storage.authClient?.constructor?.name,
});

console.log("✅ Google Cloud clients initialized successfully");
const BUCKET_NAME = "zentavos-bucket";
const KEY_PATH = kmsClient.cryptoKeyPath(
  process.env.GCP_PROJECT_ID,
  process.env.GCP_KEY_LOCATION,
  process.env.GCP_KEY_RING,
  process.env.GCP_KEY_NAME
);

// DEK cache in memory
const dekCache = new LimitedMap(1000);

// Import User model for data checking
import User from "./models/User.js";

async function generateAndStoreEncryptedDEK(
  bucketKey,
  forceRegenerate = false
) {
  console.log(`\n========== STEP 1: Starting DEK Generation ==========`);
  console.log(`🔑 [STEP 1.1] Bucket key: ${bucketKey}`);
  console.log(`🔑 [STEP 1.2] Force regenerate: ${forceRegenerate}`);

  // If force regenerate, create backup of old DEK first
  if (forceRegenerate) {
    console.log(`🔄 [STEP 1.3] Creating backup of existing DEK...`);
    await backupExistingDEK(bucketKey);
    console.log(`✅ [STEP 1.3] Backup created`);
  }

  console.log(`🔑 [STEP 2] Generating random DEK bytes...`);
  const dek = crypto.randomBytes(32);
  console.log(`✅ [STEP 2] Generated DEK of length: ${dek.length} bytes`);

  console.log(`🔐 [STEP 3] Encrypting DEK with KMS...`);
  console.log(`🔐 [STEP 3.1] KMS KEY_PATH: ${KEY_PATH}`);
  console.log(`🔐 [STEP 3.2] Calling kmsClient.encrypt...`);

  try {
    const [encryptResponse] = await kmsClient.encrypt({
      name: KEY_PATH,
      plaintext: dek,
    });
    console.log(`✅ [STEP 3] DEK encrypted with KMS successfully`);

    const encryptedDEK = encryptResponse.ciphertext;
    console.log(
      `✅ [STEP 3.3] Encrypted DEK length: ${encryptedDEK.length} bytes`
    );

    const filePath = `keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${bucketKey}.key`;
    console.log(`\n========== STEP 4: Preparing to Save to Bucket ==========`);
    console.log(`📦 [STEP 4.1] Bucket name: ${BUCKET_NAME}`);
    console.log(`📦 [STEP 4.2] File path: ${filePath}`);
    console.log(`📦 [STEP 4.3] Full path: gs://${BUCKET_NAME}/${filePath}`);
    console.log(`📦 [STEP 4.4] Storage client details:`, {
      projectId: storage.projectId,
      hasAuthClient: !!storage.authClient,
      authClientType: storage.authClient?.constructor?.name,
    });

    console.log(`📦 [STEP 4.5] Getting bucket object...`);
    const bucket = storage.bucket(BUCKET_NAME);
    console.log(`✅ [STEP 4.5] Bucket object retrieved`);

    console.log(`📦 [STEP 4.6] Getting file object...`);
    const file = bucket.file(filePath);
    console.log(`✅ [STEP 4.6] File object retrieved`);

    console.log(`\n========== STEP 5: Saving DEK to Bucket ==========`);
    console.log(`🔄 [STEP 5.1] Starting file.save() with resumable:false...`);
    console.log(
      `📊 [STEP 5.2] DEK size: ${encryptedDEK.length} bytes (using simple upload)`
    );

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

    console.log(
      `✅ [STEP 5] DEK saved successfully to bucket with simple upload!`
    );
  } catch (saveError) {
    console.error(`\n========== ERROR in DEK Generation ==========`);
    console.error(`❌ Failed at bucket save operation`);
    console.error(`❌ Error name: ${saveError.name}`);
    console.error(`❌ Error message: ${saveError.message}`);
    console.error(`❌ Error code: ${saveError.code}`);
    console.error(`❌ Error stack:`, saveError.stack);
    console.error(`❌ Full error object:`, JSON.stringify(saveError, null, 2));
    throw saveError;
  }

  // Cache the DEK
  console.log(`📦 [STEP 6] Caching DEK in memory...`);
  dekCache.set(bucketKey, dek);
  console.log(`✅ [STEP 6] DEK cached`);

  console.log(`✅ ========== DEK Generation Complete ==========\n`);
  return dek;
}

async function getDEKFromBucket(bucketKey) {
  console.log(`\n========== getDEKFromBucket: Starting ==========`);
  console.log(`🔍 [GET DEK 1] Bucket key: ${bucketKey}`);

  const filePath = `keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${bucketKey}.key`;
  console.log(`🔍 [GET DEK 2] File path: ${filePath}`);
  console.log(`🔍 [GET DEK 3] Full path: gs://${BUCKET_NAME}/${filePath}`);

  console.log(`📦 [GET DEK 4] Getting bucket object...`);
  const bucket = storage.bucket(BUCKET_NAME);
  console.log(`✅ [GET DEK 4] Bucket object retrieved`);

  console.log(`📦 [GET DEK 5] Getting file object...`);
  const file = bucket.file(filePath);
  console.log(`✅ [GET DEK 5] File object retrieved`);

  console.log(`🔍 [GET DEK 6] Checking if file exists...`);
  const [exists] = await file.exists();
  console.log(`✅ [GET DEK 6] File exists check completed: ${exists}`);

  if (!exists) {
    console.log(`⚠️ [GET DEK] File does not exist in bucket, returning null`);
    return null;
  }

  console.log(`📥 [GET DEK 7] Downloading encrypted DEK from bucket...`);
  const [encryptedDEK] = await file.download();
  console.log(
    `✅ [GET DEK 7] Downloaded encrypted DEK, length: ${encryptedDEK.length} bytes`
  );

  console.log(`🔐 [GET DEK 8] Decrypting DEK with KMS...`);
  const [decryptResponse] = await kmsClient.decrypt({
    name: KEY_PATH,
    ciphertext: encryptedDEK,
  });
  console.log(`✅ [GET DEK 8] DEK decrypted successfully`);

  // Ensure we return a proper Buffer
  const plaintext = decryptResponse.plaintext;
  const dekBuffer = Buffer.from(plaintext);
  console.log(
    `✅ [GET DEK 9] Converted to Buffer, length: ${dekBuffer.length} bytes`
  );
  console.log(`✅ ========== getDEKFromBucket: Complete ==========\n`);

  return dekBuffer;
}

async function getUserDek(firebaseUid) {
  try {
    console.log(`\n========== getUserDek: Starting ==========`);
    console.log(`🔍 [USER DEK 1] Firebase UID: ${firebaseUid}`);

    // Step 1: Find user in database by Firebase UID
    console.log(`📊 [USER DEK 2] Looking up user in database...`);
    const user = await User.findOne({ authUid: firebaseUid });

    if (!user) {
      console.error(
        `❌ [USER DEK 2] User not found in database for Firebase UID: ${firebaseUid}`
      );
      throw new Error(`User not found for Firebase UID: ${firebaseUid}`);
    }

    console.log(`✅ [USER DEK 2] User found - DB ID: ${user._id}`);

    // Step 2: Use user primary key as bucket key
    const bucketKey = user._id.toString();
    console.log(`🔑 [USER DEK 3] Using user DB ID as bucket key: ${bucketKey}`);

    // Check in-memory cache first
    console.log(`💾 [USER DEK 4] Checking cache...`);
    if (dekCache.has(bucketKey)) {
      console.log(`✅ [USER DEK 4] DEK found in cache!`);
      const cachedDek = dekCache.get(bucketKey);
      console.log(`🔍 [USER DEK 4.1] Cached DEK details:`, {
        length: cachedDek?.length,
        type: typeof cachedDek,
        isBuffer: Buffer.isBuffer(cachedDek),
      });

      if (!Buffer.isBuffer(cachedDek)) {
        console.log(
          `🔄 [USER DEK 4.2] Cached DEK is not a Buffer, clearing cache`
        );
        dekCache.delete(bucketKey);
      } else {
        console.log(
          `✅ ========== getUserDek: Complete (from cache) ==========\n`
        );
        return cachedDek;
      }
    }
    console.log(`⚠️ [USER DEK 4] No valid DEK in cache`);

    // Step 3: Fetch from bucket with primary key
    console.log(`\n[USER DEK STEP 3] Fetching DEK from bucket...`);
    console.log(`📦 [USER DEK 5] Fetching for bucket key: ${bucketKey}`);
    let dek = await getDEKFromBucket(bucketKey);

    if (!dek) {
      console.log(`⚠️ [USER DEK STEP 3] No DEK found with primary key`);

      // Step 4: Check for legacy DEK with Firebase UID
      console.log(`\n[USER DEK STEP 4] Checking for legacy DEK...`);
      console.log(`🔄 [USER DEK 6] Looking for Firebase UID: ${firebaseUid}`);
      const legacyDek = await getDEKFromBucket(firebaseUid);

      if (legacyDek) {
        console.log(`✅ [USER DEK STEP 4] Found legacy DEK with Firebase UID`);
        console.log(
          `🔄 [USER DEK 7] Migrating to primary key: ${firebaseUid} -> ${bucketKey}`
        );

        await copyDEKToNewBucketKey(firebaseUid, bucketKey);
        console.log(`✅ [USER DEK 7] Migration complete`);

        dek = legacyDek;
        dekCache.set(bucketKey, dek);
      } else {
        console.log(`⚠️ [USER DEK STEP 4] No legacy DEK found either`);
        console.log(`\n[USER DEK STEP 5] Generating new DEK...`);
        console.log(
          `🔑 [USER DEK 8] Creating new DEK for bucket key: ${bucketKey}`
        );
        dek = await generateAndStoreEncryptedDEK(bucketKey, false);
        console.log(`✅ [USER DEK STEP 5] New DEK generated`);
      }
    } else {
      console.log(`✅ [USER DEK STEP 3] DEK retrieved from bucket`);
      dekCache.set(bucketKey, dek);
      console.log(`✅ [USER DEK 9] DEK cached`);
    }

    console.log(`🔍 [USER DEK 10] Final DEK validation:`, {
      length: dek?.length,
      type: typeof dek,
      isBuffer: Buffer.isBuffer(dek),
    });

    console.log(`✅ ========== getUserDek: Complete ==========\n`);
    return dek;
  } catch (e) {
    console.error(`\n========== ERROR in getUserDek ==========`);
    console.error(`❌ Firebase UID: ${firebaseUid}`);
    console.error(`❌ Error message: ${e.message}`);
    console.error(`❌ Stack trace:`, e.stack);

    if (e.message && e.message.includes("URL is required")) {
      console.error(
        `\n🚨 Google Cloud Storage URL configuration issue detected`
      );
      console.error(`📋 Debug info:`);
      console.error(`- Project ID: ${process.env.GCP_PROJECT_ID}`);
      console.error(`- Bucket Name: ${BUCKET_NAME}`);
      console.error(
        `- Storage Service Account Email: ${storageServiceAccount?.client_email}`
      );
    }

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
    console.error(
      `❌ Decryption failed for value: ${
        typeof cipherTextBase64 === "string"
          ? cipherTextBase64.substring(0, 50)
          : cipherTextBase64
      }...`
    );
    console.error(`❌ Decryption error:`, e.message);
    console.error(`❌ DEK available:`, !!dek);
    console.error(`❌ DEK length:`, dek?.length);
    return cipherTextBase64; // Return original value if decryption fails
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

/**
 * Copy DEK from legacy Firebase UID bucket key to new primary key bucket key
 */
async function copyDEKToNewBucketKey(legacyBucketKey, newBucketKey) {
  try {
    console.log(
      `📦 Copying DEK from legacy key ${legacyBucketKey} to new key ${newBucketKey}`
    );

    const legacyFile = storage
      .bucket(BUCKET_NAME)
      .file(`keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${legacyBucketKey}.key`);

    if (!(await legacyFile.exists())[0]) {
      console.log(`❌ Legacy DEK file not found: ${legacyBucketKey}`);
      return false;
    }

    const newFile = storage
      .bucket(BUCKET_NAME)
      .file(`keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${newBucketKey}.key`);

    // Copy the legacy DEK to the new bucket key location
    try {
      await legacyFile.copy(newFile);
      console.log(`✅ DEK copied from ${legacyBucketKey} to ${newBucketKey}`);
      console.log(`💾 Legacy DEK maintained as backup at ${legacyBucketKey}`);
      return true;
    } catch (copyError) {
      // Fallback strategy: download then save, to avoid transient SDK copy issues (e.g., Parse Error)
      console.error(
        `⚠️  Direct copy failed (${copyError?.message}). Falling back to download+save...`
      );
      try {
        const [encryptedDEK] = await legacyFile.download();
        await newFile.save(encryptedDEK);
        console.log(
          `✅ DEK copied via download+save from ${legacyBucketKey} to ${newBucketKey}`
        );
        return true;
      } catch (fallbackError) {
        console.error(
          `❌ Fallback copy (download+save) failed from ${legacyBucketKey} to ${newBucketKey}:`,
          fallbackError
        );
        // Do not throw to avoid hard-failing auth flow; return false so callers can proceed using legacy DEK
        return false;
      }
    }
  } catch (error) {
    console.error(
      `❌ Error copying DEK from ${legacyBucketKey} to ${newBucketKey}:`,
      error
    );
    // Do not throw here to prevent 500 on sign-in; allow caller to continue with legacy DEK
    return false;
  }
}

/**
 * Create backup of existing DEK before regenerating
 */
async function backupExistingDEK(bucketKey) {
  try {
    console.log(
      `💾 Creating backup of existing DEK for bucket key: ${bucketKey}`
    );

    const originalFile = storage
      .bucket(BUCKET_NAME)
      .file(`keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${bucketKey}.key`);

    if (!(await originalFile.exists())[0]) {
      console.log(`ℹ️ No existing DEK to backup for bucket key: ${bucketKey}`);
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = storage
      .bucket(BUCKET_NAME)
      .file(
        `keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/backups/${bucketKey}_${timestamp}.key`
      );

    await originalFile.copy(backupFile);
    console.log(
      `✅ DEK backup created for bucket key ${bucketKey}: ${bucketKey}_${timestamp}.key`
    );
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
async function tryRecoverDEKFromBackup(bucketKey) {
  try {
    console.log(
      `🔄 Attempting DEK recovery from backup for bucket key: ${bucketKey}`
    );

    const [files] = await storage.bucket(BUCKET_NAME).getFiles({
      prefix: `keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/backups/${bucketKey}_`,
    });

    if (files.length === 0) {
      console.log(`❌ No backup DEK files found for bucket key: ${bucketKey}`);
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
        const currentFile = storage
          .bucket(BUCKET_NAME)
          .file(`keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${bucketKey}.key`);

        await currentFile.save(encryptedDEK);
        dekCache.set(bucketKey, dek);

        console.log(`✅ DEK restored for bucket key: ${bucketKey}`);
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
      `❌ All backup recovery attempts failed for bucket key: ${bucketKey}`
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
    console.log(`\n========== getUserDekForSignup: Starting ==========`);
    console.log(`🔍 [SIGNUP DEK 1] Firebase UID: ${firebaseUid}`);
    console.log(`🔍 [SIGNUP DEK 2] Database ID: ${databaseId}`);

    const bucketKey = databaseId.toString();
    console.log(
      `🔑 [SIGNUP DEK 3] Using database ID as bucket key: ${bucketKey}`
    );

    // Step 1: Check if DEK already exists with the database ID
    console.log(
      `\n[SIGNUP DEK STEP 1] Checking for existing DEK with database ID...`
    );
    console.log(`📦 [SIGNUP DEK 4] Looking for: ${bucketKey}`);
    let dek = await getDEKFromBucket(bucketKey);

    if (dek) {
      console.log(
        `✅ [SIGNUP DEK STEP 1] DEK already exists for database ID: ${bucketKey}`
      );
      dekCache.set(bucketKey, dek);
      console.log(
        `✅ ========== getUserDekForSignup: Complete (existing DEK) ==========\n`
      );
      return dek;
    }
    console.log(`⚠️ [SIGNUP DEK STEP 1] No DEK found with database ID`);

    // Step 2: Check if DEK exists with Firebase UID (legacy/migration case)
    console.log(
      `\n[SIGNUP DEK STEP 2] Checking for legacy DEK with Firebase UID...`
    );
    console.log(`🔄 [SIGNUP DEK 5] Looking for: ${firebaseUid}`);
    const legacyDek = await getDEKFromBucket(firebaseUid);

    if (legacyDek) {
      console.log(
        `✅ [SIGNUP DEK STEP 2] Found legacy DEK with Firebase UID: ${firebaseUid}`
      );
      console.log(
        `🔄 [SIGNUP DEK 6] Copying DEK: ${firebaseUid} -> ${bucketKey}`
      );

      const copySuccess = await copyDEKToNewBucketKey(firebaseUid, bucketKey);

      if (copySuccess) {
        console.log(`✅ [SIGNUP DEK 6] DEK copied successfully`);
        dek = legacyDek;
        dekCache.set(bucketKey, dek);
      } else {
        console.log(`⚠️ [SIGNUP DEK 6] DEK copy failed, using legacy DEK`);
        dek = legacyDek;
        dekCache.set(bucketKey, dek);
        dekCache.set(firebaseUid, dek);
      }
      console.log(
        `✅ ========== getUserDekForSignup: Complete (legacy DEK) ==========\n`
      );
      return dek;
    }
    console.log(`⚠️ [SIGNUP DEK STEP 2] No legacy DEK found`);

    // Step 3: No existing DEK found, create new one
    console.log(`\n[SIGNUP DEK STEP 3] Creating new DEK...`);
    console.log(
      `🔑 [SIGNUP DEK 7] Calling generateAndStoreEncryptedDEK for: ${bucketKey}`
    );
    dek = await generateAndStoreEncryptedDEK(bucketKey, false);
    console.log(`✅ [SIGNUP DEK STEP 3] New DEK created successfully`);

    console.log(`🔍 [SIGNUP DEK 8] Final DEK validation:`, {
      length: dek?.length,
      type: typeof dek,
      isBuffer: Buffer.isBuffer(dek),
    });

    console.log(
      `✅ ========== getUserDekForSignup: Complete (new DEK) ==========\n`
    );
    return dek;
  } catch (e) {
    console.error(`\n========== ERROR in getUserDekForSignup ==========`);
    console.error(`❌ Firebase UID: ${firebaseUid}`);
    console.error(`❌ Database ID: ${databaseId}`);
    console.error(`❌ Error message: ${e.message}`);
    console.error(`❌ Stack trace:`, e.stack);
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
  backupExistingDEK,
  tryRecoverDEKFromBackup,
};
