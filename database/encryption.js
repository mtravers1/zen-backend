import dotenv from "dotenv";
import { LimitedMap } from "../lib/limitedMap.js";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";

dotenv.config();

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

// DEK cache in memory
const dekCache = new LimitedMap(1000); // Limit to 1000 DEKs

async function generateAndStoreEncryptedDEK(uid) {
  const dek = crypto.randomBytes(32);

  const [encryptResponse] = await kmsClient.encrypt({
    name: KEY_PATH,
    plaintext: dek,
  });

  const encryptedDEK = encryptResponse.ciphertext;
  const file = storage.bucket(BUCKET_NAME).file(`keys/prod/${uid}.key`);
  await file.save(encryptedDEK);

  // Cache the DEK
  dekCache.set(uid, dek);

  return dek;
}

async function getDEKFromBucket(uid) {
  const file = storage.bucket(BUCKET_NAME).file(`keys/prod/${uid}.key`);
  if (!(await file.exists())[0]) {
    return null;
  }
  const [encryptedDEK] = await file.download();

  const [decryptResponse] = await kmsClient.decrypt({
    name: KEY_PATH,
    ciphertext: encryptedDEK,
  });

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
export { encryptValue, decryptValue, getUserDek, hashEmail, hashValue };
