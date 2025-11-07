/**
 * recover-dek.js
 *
 * A script to recover an orphaned Data Encryption Key (DEK) for a user.
 *
 * The problem:
 * Due to a bug, some users were created with their DEK stored in GCS under a random, temporary ObjectId,
 * instead of their actual database _id. This script finds the orphaned key and recovers it.
 *
 * How it works:
 * 1. Takes a user's Firebase UID as a command-line argument.
 * 2. Finds the user in the database to get their creation timestamp (`createdAt`) and a sample encrypted field (e.g., `name.firstName`).
 * 3. Searches the LEGACY GCS bucket for key files created around the same time as the user.
 * 4. For each candidate key file, it downloads the key and attempts to decrypt the user's sample data.
 * 5. If decryption is successful, it has found the correct key.
 * 6. It then copies the key from the legacy bucket to the PRIMARY (new) bucket, naming the file correctly with the user's _id.
 *
 * Usage:
 * node --env-file=.env scripts/recover-dek.js <USER_FIREBASE_UID>
 */

import mongoose from "mongoose";
import { Storage } from "@google-cloud/storage";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import User from "../database/models/User.js";
import connectDB from "../database/database.js";

// --- Environment configuration ---
const NODE_ENV = process.env.NODE_ENV;
if (!NODE_ENV) {
  console.error(
    "\tCRITICAL: NODE_ENV environment variable must be set. (e.g., 'development', 'staging', 'production')"
  );
  process.exit(1);
}

const envKeyMap = {
  development: "dev",
  staging: "staging",
  production: "prod",
  test: "test",
};

const keyEnv = envKeyMap[NODE_ENV];
if (!keyEnv) {
  console.error(
    `\tCRITICAL: No key folder mapping found for NODE_ENV='${NODE_ENV}'.`
  );
  process.exit(1);
}

console.log(`\tRunning in environment: ${NODE_ENV} (key folder: ${keyEnv})`);


// We need some functions and constants from encryption.js, but importing it directly can be tricky
// due to top-level initializations. We will redefine the necessary parts here.
// A better solution would be to refactor encryption.js to export functions without side effects.

// --- Redefined constants and clients from encryption.js ---

const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const LEGACY_GCS_BUCKET_NAME = process.env.LEGACY_GCS_BUCKET_NAME;
const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID;
const GCP_KEY_LOCATION = process.env.GCP_KEY_LOCATION;
const GCP_KEY_RING = process.env.GCP_KEY_RING;
const GCP_KEY_NAME = process.env.GCP_KEY_NAME;

if (!LEGACY_GCS_BUCKET_NAME || !GCS_BUCKET_NAME) {
  console.error(
    "\tCRITICAL: LEGACY_GCS_BUCKET_NAME and GCS_BUCKET_NAME environment variables must be set."
  );
  process.exit(1);
}

// Initialize Storage client
let storageCredentials;
try {
  if (!process.env.STORAGE_SERVICE_ACCOUNT) {
    throw new Error("STORAGE_SERVICE_ACCOUNT environment variable not set.");
  }
  storageCredentials = JSON.parse(
    Buffer.from(process.env.STORAGE_SERVICE_ACCOUNT, "base64").toString("utf-8")
  );
} catch (error) {
  console.error(
    "CRITICAL: Failed to parse STORAGE_SERVICE_ACCOUNT. Check if it's a valid base64 encoded JSON.",
    error
  );
  process.exit(1);
}
const storage = new Storage({
  credentials: storageCredentials,
  projectId: GCP_PROJECT_ID,
});

// Initialize KMS client
let kmsCredentials;
try {
  if (!process.env.KMS_SERVICE_ACCOUNT) {
    throw new Error("KMS_SERVICE_ACCOUNT environment variable not set.");
  }
  kmsCredentials = JSON.parse(
    Buffer.from(process.env.KMS_SERVICE_ACCOUNT, "base64").toString("utf-8")
  );
} catch (error) {
  console.error(
    "CRITICAL: Failed to parse KMS_SERVICE_ACCOUNT. Check if it's a valid base64 encoded JSON.",
    error
  );
  process.exit(1);
}
const kmsClient = new KeyManagementServiceClient({
  credentials: kmsCredentials,
  projectId: GCP_PROJECT_ID,
});

const KEY_PATH = kmsClient.cryptoKeyPath(
  GCP_PROJECT_ID,
  GCP_KEY_LOCATION,
  GCP_KEY_RING,
  GCP_KEY_NAME
);

// --- Redefined decryptValue function from encryption.js ---

async function decryptValue(cipherTextBase64, dek) {
  if (
    cipherTextBase64 === null ||
    cipherTextBase64 === undefined ||
    cipherTextBase64 === ""
  )
    return cipherTextBase64;

  try {
    const crypto = await import("crypto");
    const cipherBuffer = Buffer.from(cipherTextBase64, "base64");
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
    // Suppress warnings for this script, we expect failures
    return null;
  }
}

// --- Main Recovery Logic ---

async function recoverDek(firebaseUid, DEBUG_MODE) {
  console.log(`\tStarting DEK recovery for user with Firebase UID: ${firebaseUid}`);

  // 1. Connect to DB and find user
  await connectDB();
  const user = await User.findOne({ authUid: firebaseUid });

  if (!user) {
    console.error(`\tError: User with Firebase UID '${firebaseUid}' not found in the database.`);
    await mongoose.connection.close();
    return;
  }
  const userId = user._id;
  console.log(`\tFound user: ${user.emailHash}`);
  console.log(`\t   - User created at: ${user.createdAt.toISOString()}`);

  const encryptedSample = user?.name?.firstName;
  if (!encryptedSample) {
    console.error("\tError: User does not have an encrypted first name to test against.");
    await mongoose.connection.close();
    return;
  }

  // 2. Construct the path to the specific DEK file
  const legacyBucket = storage.bucket(LEGACY_GCS_BUCKET_NAME);
  const primaryBucket = storage.bucket(GCS_BUCKET_NAME);
  const keyFileName = `${firebaseUid}.key`;
  const keyFilePath = `keys/${keyEnv}/${keyFileName}`;
  const file = legacyBucket.file(keyFilePath);

  console.log(`\n\tAttempting to recover key directly from: gs://${LEGACY_GCS_BUCKET_NAME}/${keyFilePath}`);

  // 3. Test the key
  let foundKey = false;
  try {
    // a. Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      console.error(`\tError: Key file not found at path: ${keyFilePath}`);
      await mongoose.connection.close();
      return;
    }

    // b. Download the encrypted DEK content
    const [downloadedContent] = await file.download(); // This is a Buffer

    // Intentionally avoid logging key material to prevent accidental disclosure.

    let ciphertextToDecrypt = downloadedContent;

    // Attempt to detect and extract ciphertext from multipart format
    const boundaryPrefix = Buffer.from('--', 'ascii');
    const crlf = Buffer.from('\r\n', 'ascii');
    const doubleCrlf = Buffer.from('\r\n\r\n', 'ascii');

    const firstCrlfIndex = downloadedContent.indexOf(crlf);
    if (firstCrlfIndex !== -1 && downloadedContent.slice(0, 2).equals(boundaryPrefix)) {
      // Extract the boundary string from the first line
      const boundary = downloadedContent.slice(0, firstCrlfIndex);
      console.log(`    - Detected multipart boundary: ${boundary.toString('ascii')}`);

      const parts = [];
      let startIndex = 0;
      let boundaryIndex = downloadedContent.indexOf(boundary, startIndex);

      while (boundaryIndex !== -1) {
        const nextBoundaryIndex = downloadedContent.indexOf(boundary, boundaryIndex + boundary.length);
        if (nextBoundaryIndex !== -1) {
          parts.push(downloadedContent.slice(boundaryIndex, nextBoundaryIndex));
        } else {
          // Last part, or closing boundary
          parts.push(downloadedContent.slice(boundaryIndex));
        }
        startIndex = boundaryIndex + boundary.length;
        boundaryIndex = downloadedContent.indexOf(boundary, startIndex);
      }

      for (const partBuffer of parts) {
        const partString = partBuffer.toString('utf8'); // Convert to string to search for headers
        if (partString.includes('Content-Type: application/octet-stream')) {
          const bodyStart = partBuffer.indexOf(doubleCrlf) + doubleCrlf.length;
          if (bodyStart !== -1) {
                          let extractedBody = partBuffer.slice(bodyStart);
                          if (DEBUG_MODE) {
                            console.log(`    - Extracted body (before cleaning): ${extractedBody.toString('base64')}`);
                          }
                          // Remove trailing \r\n if present before the next boundary or closing boundary
                          if (extractedBody.length >= crlf.length && extractedBody.slice(extractedBody.length - crlf.length).equals(crlf)) {
                            extractedBody = extractedBody.slice(0, extractedBody.length - crlf.length);
                            if (DEBUG_MODE) {
                              console.log(`    - Removed trailing CRLF.`);
                            }
                          }
                          if (DEBUG_MODE) {
                            console.log(`    - Extracted body (after cleaning): ${extractedBody.toString('base64')}`);
                          }
                                 // Remove trailing -- if it's the closing boundary
            const closingBoundarySuffix = Buffer.from('--', 'ascii');
            if (extractedBody.length >= closingBoundarySuffix.length && extractedBody.slice(extractedBody.length - closingBoundarySuffix.length).equals(closingBoundarySuffix)) {
              extractedBody = extractedBody.slice(0, extractedBody.length - closingBoundarySuffix.length);
            }

            ciphertextToDecrypt = extractedBody;
            console.log(`    - Successfully extracted ciphertext from multipart file.`);
            break;
          }
        }
      }
    } else {
      console.log(`    - Key file ${file.name} does not appear to be multipart. Treating as raw ciphertext.`);
    }

    let plaintext;
    if (ciphertextToDecrypt.length === 32) {
      console.log('    - Ciphertext is 32 bytes. Assuming it is a raw DEK.');
      plaintext = ciphertextToDecrypt;
    } else {
      const [decryptResponse] = await kmsClient.decrypt({
        name: KEY_PATH,
        ciphertext: ciphertextToDecrypt, // Use the extracted or original ciphertext
      });
      plaintext = Buffer.from(decryptResponse.plaintext);
    }
    console.log(`    - KMS decrypted plaintext (DEK) length: ${plaintext.length}`);

    // Check if the plaintext is an array of DEKs
    if (plaintext.length % 32 === 0) {
      const deks = [];
      for (let i = 0; i < plaintext.length; i += 32) {
        const currentDek = plaintext.slice(i, i + 32);
        if (currentDek.length !== 32) {
          console.error(`    - ERROR: DEK slice from ${file.name} for user ${userId} has invalid length ${currentDek.length}. Skipping decryption attempt.`);
          continue; // Skip to the next DEK slice
        }
        deks.push(currentDek);
      }
      console.log(`    - Detected ${deks.length} DEKs in plaintext array.`);

      for (const dek of deks) {
        const decryptedSample = await decryptValue(encryptedSample, dek);
        console.log(`    - Attempting to decrypt sample with DEK. Result: ${decryptedSample ? 'SUCCESS' : 'FAILURE'}`);
        if (decryptedSample) {
          console.log(`\n\tSUCCESS! Found matching DEK: ${file.name}`);
          console.log(`\t   - Decrypted first name: ${decryptedSample}`);
          foundKey = true;

          // c. Copy the key to the new bucket with the correct name
          const newFileName = `keys/${keyEnv}/${userId}.key`;
          const newFile = primaryBucket.file(newFileName);
          await file.copy(newFile);

          console.log(`\tSuccessfully copied key to primary bucket: gs://${GCS_BUCKET_NAME}/${newFileName}`);
          break; // Exit loop once key is found
        }
      }
    } else {
      const dek = plaintext;
      if (dek.length !== 32) {
        console.error(`    - ERROR: Plaintext DEK from ${file.name} for user ${userId} has invalid length ${dek.length}. Skipping decryption attempt.`);
      } else {
        console.log(`    - Plaintext is a single DEK.`);
        // b. Try to decrypt the sample data
        const decryptedSample = await decryptValue(encryptedSample, dek);
        console.log(`    - Attempting to decrypt sample with DEK. Result: ${decryptedSample ? 'SUCCESS' : 'FAILURE'}`);

        if (decryptedSample) {
          console.log(`\n\tSUCCESS! Found matching DEK: ${file.name}`);
          console.log(`\t   - Decrypted first name: ${decryptedSample}`);
          foundKey = true;

          // c. Copy the key to the new bucket with the correct name
          const newFileName = `keys/${keyEnv}/${userId}.key`;
          const newFile = primaryBucket.file(newFileName);
          await file.copy(newFile);

          console.log(`\tSuccessfully copied key to primary bucket: gs://${GCS_BUCKET_NAME}/${newFileName}`);
        }
      }
    }
  } catch (error) {
    console.warn(`  - Failed to process key ${file.name}: ${error.message}`);
  }

  if (!foundKey) {
    console.error("\n\tRECOVERY FAILED: Could not find a valid DEK for this user.");
  }

  await mongoose.connection.close();
}

// --- Execute Script ---

const args = process.argv.slice(2);
const DEBUG_MODE = args.includes('--debug');
const firebaseUid = args.find(arg => !arg.startsWith('--'));

if (DEBUG_MODE) {
  console.warn('\tWARNING: DEBUG mode is enabled. Sensitive ciphertext may be logged.');
}

if (!firebaseUid) {
  console.error('\tError: Missing Firebase UID argument.');
  console.error('\tUsage: node --env-file=.env scripts/recover-dek.js <USER_FIREBASE_UID> [--debug]');
  process.exit(1);
}

recoverDek(firebaseUid, DEBUG_MODE).catch(console.error);
