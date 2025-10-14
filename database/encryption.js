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

// Initialize KMS with auth object (new recommended way)
const kmsClient = new KeyManagementServiceClient({
  auth: kmsCredentials,
  projectId: process.env.GCP_PROJECT_ID,
});
console.log("✅ KMS client initialized");

// Initialize Storage with auth object (new recommended way)
// The key fix is using resumable:false in file.save(), not JWT manipulation
const storage = new Storage({
  auth: storageCredentials,
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

// Diagnostic function to verify KMS configuration
async function verifyKMSConfiguration() {
  console.log(`🔧 Verifying KMS configuration...`);
  console.log(`📦 Project ID: ${process.env.GCP_PROJECT_ID}`);
  console.log(`🌍 Key Location: ${process.env.GCP_KEY_LOCATION}`);
  console.log(`🔑 Key Ring: ${process.env.GCP_KEY_RING}`);
  console.log(`🗝️ Key Name: ${process.env.GCP_KEY_NAME}`);
  console.log(`🔗 Full Key Path: ${KEY_PATH}`);

  try {
    // Test specific key access only (less permissions required)
    console.log(`🔍 Testing specific crypto key access...`);
    const [cryptoKey] = await kmsClient.getCryptoKey({
      name: KEY_PATH,
    });

    console.log(`✅ Crypto key accessible:`, {
      name: cryptoKey.name,
      purpose: cryptoKey.purpose,
      versionTemplate: cryptoKey.versionTemplate,
    });

    // Test encryption/decryption with a small test
    console.log(`🔍 Testing encryption/decryption with test data...`);
    const testData = Buffer.from("test-dek-verification");

    const [encryptResponse] = await kmsClient.encrypt({
      name: KEY_PATH,
      plaintext: testData,
    });

    const [decryptResponse] = await kmsClient.decrypt({
      name: KEY_PATH,
      ciphertext: encryptResponse.ciphertext,
    });

    if (!testData.equals(Buffer.from(decryptResponse.plaintext))) {
      throw new Error(`Test encryption/decryption failed - data mismatch`);
    }

    console.log(`✅ KMS encryption/decryption test successful`);

    return true;
  } catch (kmsError) {
    console.error(
      `❌ KMS configuration verification failed:`,
      kmsError.message
    );
    console.error(`❌ This may affect DEK operations`);
    return false;
  }
}

// Run KMS verification on startup
verifyKMSConfiguration().then((success) => {
  if (success) {
    console.log(`✅ KMS configuration verified successfully`);
  } else {
    console.error(
      `❌ KMS configuration verification failed - DEK operations may fail`
    );
  }
});

async function generateAndStoreEncryptedDEK(
  bucketKey,
  forceRegenerate = false
) {
  // If force regenerate, create backup of old DEK first
  if (forceRegenerate) {
    await backupExistingDEK(bucketKey);
  }

  console.log(`🔐 Generating new DEK for bucket key: ${bucketKey}`);
  console.log(`🔑 Using KMS Key Path: ${KEY_PATH}`);
  console.log(`📦 Target bucket: ${BUCKET_NAME}`);

  const dek = crypto.randomBytes(32);
  console.log(`✅ Generated 32-byte DEK: ${dek.length} bytes`);

  try {
    console.log(`🔒 Encrypting DEK with KMS...`);
    const [encryptResponse] = await kmsClient.encrypt({
      name: KEY_PATH,
      plaintext: dek,
    });

    const encryptedDEK = encryptResponse.ciphertext;
    console.log(`✅ DEK encrypted successfully: ${encryptedDEK.length} bytes`);

    const filePath = `keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${bucketKey}.key`;
    const file = storage.bucket(BUCKET_NAME).file(filePath);

    console.log(
      `📤 Uploading encrypted DEK to: gs://${BUCKET_NAME}/${filePath}`
    );

    // Use simple upload for small files (DEK is ~113 bytes)
    // This avoids the resumable upload endpoint that was causing "URL is required" error
    await file.save(encryptedDEK, {
      resumable: false,
      validation: false, // Skip CRC32C/MD5 validation for encrypted data
      metadata: {
        contentType: "application/octet-stream",
        cacheControl: "private, max-age=0",
        customMetadata: {
          dekVersion: "1.0",
          generatedAt: new Date().toISOString(),
          kmsKeyPath: KEY_PATH,
          environment: process.env.NODE_ENV || "unknown",
        },
      },
    });

    console.log(`✅ DEK uploaded successfully to GCS`);

    // CRITICAL: Verify the DEK can be decrypted immediately after upload
    console.log(
      `🔍 Verifying DEK integrity by attempting immediate decryption...`
    );
    try {
      const [downloadedDEK] = await file.download();
      console.log(`📥 Downloaded DEK from GCS: ${downloadedDEK.length} bytes`);

      const [decryptResponse] = await kmsClient.decrypt({
        name: KEY_PATH,
        ciphertext: downloadedDEK,
      });

      const decryptedDEK = Buffer.from(decryptResponse.plaintext);
      console.log(`🔓 Decrypted DEK from GCS: ${decryptedDEK.length} bytes`);

      // Verify the decrypted DEK matches the original
      if (!dek.equals(decryptedDEK)) {
        throw new Error(
          `DEK verification failed: original and decrypted DEKs do not match`
        );
      }

      console.log(`✅ DEK integrity verified successfully`);
    } catch (verifyError) {
      console.error(`❌ DEK verification failed for bucket key: ${bucketKey}`);
      console.error(`❌ Verification error: ${verifyError.message}`);

      // Delete the corrupted DEK file
      try {
        await file.delete();
        console.log(`🗑️ Deleted corrupted DEK file from GCS`);
      } catch (deleteError) {
        console.error(
          `❌ Failed to delete corrupted DEK file: ${deleteError.message}`
        );
      }

      throw new Error(`DEK verification failed: ${verifyError.message}`);
    }
  } catch (saveError) {
    console.error(`❌ Failed to save DEK for bucket key: ${bucketKey}`);
    console.error(`❌ Error: ${saveError.message}`);
    throw saveError;
  }

  // Cache the DEK only after successful verification
  dekCache.set(bucketKey, dek);
  console.log(`💾 DEK cached in memory for bucket key: ${bucketKey}`);
  return dek;
}

async function getDEKFromBucket(bucketKey) {
  const filePath = `keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${bucketKey}.key`;
  console.log(`🔍 Looking for DEK at: gs://${BUCKET_NAME}/${filePath}`);

  const file = storage.bucket(BUCKET_NAME).file(filePath);

  const [exists] = await file.exists();
  if (!exists) {
    console.log(`⚠️ DEK file not found for bucket key: ${bucketKey}`);
    return null;
  }

  console.log(`✅ DEK file exists, downloading and validating...`);

  try {
    // Get file metadata first to check for environment mismatch
    const [metadata] = await file.getMetadata();
    console.log(`📋 DEK file metadata:`, {
      size: metadata.size,
      created: metadata.timeCreated,
      customMetadata: metadata.metadata || {},
    });

    // Check if DEK was created in different environment
    const dekEnvironment = metadata.metadata?.environment;
    const currentEnvironment = process.env.NODE_ENV || "unknown";

    if (dekEnvironment && dekEnvironment !== currentEnvironment) {
      console.warn(`⚠️ DEK environment mismatch!`);
      console.warn(`⚠️ DEK environment: ${dekEnvironment}`);
      console.warn(`⚠️ Current environment: ${currentEnvironment}`);
      console.warn(`⚠️ This may cause decryption failures`);
    }

    // Check KMS key path compatibility
    const dekKmsKeyPath = metadata.metadata?.kmsKeyPath;
    if (dekKmsKeyPath && dekKmsKeyPath !== KEY_PATH) {
      console.warn(`⚠️ DEK KMS key mismatch!`);
      console.warn(`⚠️ DEK KMS key: ${dekKmsKeyPath}`);
      console.warn(`⚠️ Current KMS key: ${KEY_PATH}`);
      console.warn(`⚠️ This will cause decryption failures`);
    }

    const [encryptedDEK] = await file.download();
    console.log(`📥 Downloaded DEK: ${encryptedDEK.length} bytes`);

    // Validate encrypted DEK size (should be ~113 bytes for 32-byte DEK)
    if (encryptedDEK.length < 50 || encryptedDEK.length > 200) {
      console.warn(`⚠️ DEK size suspicious: ${encryptedDEK.length} bytes`);
      console.warn(`⚠️ Expected size: ~113 bytes for 32-byte DEK`);
    }

    console.log(`🔓 Attempting decryption with KMS key: ${KEY_PATH}`);
    const [decryptResponse] = await kmsClient.decrypt({
      name: KEY_PATH,
      ciphertext: encryptedDEK,
    });

    // Ensure we return a proper Buffer
    const plaintext = decryptResponse.plaintext;
    const dekBuffer = Buffer.from(plaintext);

    // Validate decrypted DEK size
    if (dekBuffer.length !== 32) {
      console.error(
        `❌ Invalid DEK size after decryption: ${dekBuffer.length} bytes`
      );
      console.error(`❌ Expected: 32 bytes`);
      throw new Error(`Invalid DEK size: ${dekBuffer.length} bytes`);
    }

    console.log(`✅ DEK decrypted successfully for bucket key: ${bucketKey}`);
    console.log(`✅ DEK size validated: ${dekBuffer.length} bytes`);
    return dekBuffer;
  } catch (decryptError) {
    // If decryption fails due to invalid ciphertext, the DEK might be:
    // 1. Encrypted with a different KMS key
    // 2. Corrupted
    // 3. From a different environment
    if (
      decryptError.message &&
      decryptError.message.includes("Decryption failed")
    ) {
      console.error(`❌ DEK decryption failed for bucket key: ${bucketKey}`);
      console.error(`❌ Error: ${decryptError.message}`);
      console.error(`❌ KMS Key Path used: ${KEY_PATH}`);
      console.error(
        `❌ The DEK may have been encrypted with a different KMS key or is corrupted`
      );

      // Get file metadata for debugging
      try {
        const [metadata] = await file.getMetadata();
        console.error(`❌ DEK metadata:`, {
          size: metadata.size,
          created: metadata.timeCreated,
          customMetadata: metadata.metadata || {},
        });
      } catch (metaError) {
        console.error(`❌ Failed to get DEK metadata: ${metaError.message}`);
      }

      // Return null to trigger DEK regeneration
      return null;
    }

    // Re-throw other errors
    throw decryptError;
  }
}

/**
 * DEK Retrieval Flow:
 * STEP 1: User exists in Firebase (verified by caller)
 * STEP 2: Find user in database using Firebase UID
 * STEP 3: Get Database ID from user record
 * STEP 4: Search for DEK using Database ID (PRIMARY)
 * STEP 5: If not found, search using Firebase UID (FALLBACK for legacy data)
 */
async function getUserDek(firebaseUid) {
  try {
    // STEP 1: Firebase user existence already verified by caller

    // STEP 2: Find user in database by Firebase UID
    console.log(
      `🔍 [STEP 2] Looking up user in database with Firebase UID: ${firebaseUid}`
    );
    const user = await User.findOne({ authUid: firebaseUid });

    if (!user) {
      throw new Error(`User not found for Firebase UID: ${firebaseUid}`);
    }

    // STEP 3: Get Database ID from user record
    const bucketKey = user._id.toString();
    console.log(`✅ [STEP 2] User found in database`);
    console.log(
      `🔑 [STEP 3] Database ID extracted: ${bucketKey} (will be used as PRIMARY bucket key)`
    );

    // Check in-memory cache first
    if (dekCache.has(bucketKey)) {
      const cachedDek = dekCache.get(bucketKey);

      if (!Buffer.isBuffer(cachedDek)) {
        dekCache.delete(bucketKey);
      } else {
        return cachedDek;
      }
    }

    // STEP 4: Fetch DEK from bucket using Database ID (PRIMARY)
    console.log(
      `📦 [STEP 4 - PRIMARY] Searching for DEK with Database ID: ${bucketKey}`
    );
    let dek = await getDEKFromBucket(bucketKey);

    if (!dek) {
      console.warn(
        `⚠️ [STEP 4] No valid DEK found with Database ID: ${bucketKey}`
      );

      // STEP 5: Fallback to Firebase UID (legacy support)
      console.log(
        `🔄 [STEP 5 - FALLBACK] Searching for DEK with Firebase UID: ${firebaseUid}`
      );
      const legacyDek = await getDEKFromBucket(firebaseUid);

      if (legacyDek) {
        console.log(
          `✅ Found valid legacy DEK with Firebase UID: ${firebaseUid}, migrating to Database ID: ${bucketKey}`
        );
        // Migrate to new bucket key
        await copyDEKToNewBucketKey(firebaseUid, bucketKey);
        dek = legacyDek;
        dekCache.set(bucketKey, dek);
      } else {
        // No valid DEK found anywhere - regenerate
        console.warn(
          `⚠️ No valid DEK found, regenerating for user ${bucketKey}`
        );
        console.warn(
          `⚠️ WARNING: User data encrypted with old DEK cannot be recovered!`
        );

        // Backup the corrupted DEK if it exists
        const filePath = `keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${bucketKey}.key`;
        const file = storage.bucket(BUCKET_NAME).file(filePath);
        const [exists] = await file.exists();

        if (exists) {
          const backupPath = `keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/corrupted/${bucketKey}_${Date.now()}.key.backup`;
          await file.copy(backupPath);
          console.log(`📦 Backed up corrupted DEK to: ${backupPath}`);
        }

        // Generate new DEK (will overwrite the corrupted one)
        console.log(`🔄 Regenerating DEK for Database ID: ${bucketKey}`);
        dek = await generateAndStoreEncryptedDEK(bucketKey, true);
        console.log(
          `✅ New DEK generated successfully for Database ID: ${bucketKey}`
        );
      }
    } else {
      console.log(
        `✅ [STEP 4] DEK found and valid with Database ID: ${bucketKey}`
      );
      dekCache.set(bucketKey, dek);
    }

    return dek;
  } catch (e) {
    console.error(
      `❌ Error getting DEK for Firebase UID: ${firebaseUid} - ${e.message}`
    );
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
    const bucketKey = databaseId.toString();

    // Check if DEK already exists with the database ID
    let dek = await getDEKFromBucket(bucketKey);

    if (dek) {
      dekCache.set(bucketKey, dek);
      return dek;
    }

    // Check if DEK exists with Firebase UID (legacy/migration case)
    const legacyDek = await getDEKFromBucket(firebaseUid);

    if (legacyDek) {
      const copySuccess = await copyDEKToNewBucketKey(firebaseUid, bucketKey);

      if (copySuccess) {
        dek = legacyDek;
        dekCache.set(bucketKey, dek);
      } else {
        dek = legacyDek;
        dekCache.set(bucketKey, dek);
        dekCache.set(firebaseUid, dek);
      }
      return dek;
    }

    // No existing DEK found, create new one
    dek = await generateAndStoreEncryptedDEK(bucketKey, false);
    return dek;
  } catch (e) {
    console.error(
      `❌ Error getting DEK for signup (Firebase UID: ${firebaseUid}, DB ID: ${databaseId}) - ${e.message}`
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
  backupExistingDEK,
  tryRecoverDEKFromBackup,
};
