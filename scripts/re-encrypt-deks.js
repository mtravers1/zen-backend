#!/usr/bin/env node

/**
 * Script to re-encrypt all user DEKs with a new KEK.
 * This script should be run after a KEK has been compromised and a new one has been created.
 *
 * Usage:
 *
 * 1. Set the following environment variables for the NEW key:
 *  - NEW_GCP_PROJECT_ID
 *  - NEW_GCP_KEY_LOCATION
 *  - NEW_GCP_KEY_RING
 *  - NEW_GCP_KEY_NAME
 *
 * 2. Run the script for a single user in dry-run mode to test the process:
 *  node scripts/re-encrypt-deks.js --dry-run --uid <user_id>
 *
 * 3. Run the script for a single user in execute mode to test the process:
 *  node scripts/re-encrypt-deks.js --execute --uid <user_id>
 *
 * 4. Run the script for all users in dry-run mode to verify the process:
 *  node scripts/re-encrypt-deks.js --dry-run
 *
 * 5. Run the script for all users in execute mode to perform the re-encryption:
 *  node scripts/re-encrypt-deks.js --execute
 */

import dotenv from 'dotenv';
import { KeyManagementServiceClient } from '@google-cloud/kms';
import { Storage } from '@google-cloud/storage';
import { program } from 'commander';
import crypto from 'crypto';

dotenv.config();

// --- Configuration ---

const serviceAccountBase64 = process.env.STORAGE_SERVICE_ACCOUNT;
const serviceAccountJsonString = Buffer.from(serviceAccountBase64, 'base64').toString('utf8');
const storageServiceAccount = JSON.parse(serviceAccountJsonString);

const kmsServiceAccountBase64 = process.env.KMS_SERVICE_ACCOUNT;
const kmsServiceAccountJsonString = Buffer.from(kmsServiceAccountBase64, 'base64').toString('utf8');
const kmsServiceAccount = JSON.parse(kmsServiceAccountJsonString);

const USER_ENCRYPTION_KEY_BUCKET_NAME = process.env.USER_ENCRYPTION_KEY_BUCKET_NAME;
const BUCKET_NAME = 'zentavos-bucket';

// --- KMS Clients ---

const kmsClient = new KeyManagementServiceClient({
  credentials: kmsServiceAccount,
});

const oldKekPath = kmsClient.cryptoKeyPath(
  process.env.GCP_PROJECT_ID,
  process.env.GCP_KEY_LOCATION,
  process.env.GCP_KEY_RING,
  process.env.GCP_KEY_NAME
);

const newKekPath = kmsClient.cryptoKeyPath(
  process.env.NEW_GCP_PROJECT_ID,
  process.env.NEW_GCP_KEY_LOCATION,
  process.env.NEW_GCP_KEY_RING,
  process.env.NEW_GCP_KEY_NAME
);

// --- Storage Client ---

const storage = new Storage({
  credentials: storageServiceAccount,
});

// --- Helper Functions ---

function getChecksum(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// --- Main Logic ---

async function reEncryptDek(file, dryRun) {
  const uid = file.name.split('/').pop().replace('.key', '');
  console.log(`
Processing DEK for user: ${uid}`);

  try {
    // 1. Download the encrypted DEK
    const [encryptedDek] = await file.download();
    console.log(`  - Downloaded encrypted DEK (checksum: ${getChecksum(encryptedDek)}).`);

    // 2. Backup the original DEK
    if (!dryRun) {
      const backupFile = storage.bucket(BUCKET_NAME).file(`keys/backup/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${uid}.key`);
      await backupFile.save(encryptedDek);
      console.log('  - Backed up original DEK.');
    } else {
      console.log('  - (Dry Run) Skipping backup of original DEK.');
    }

    // 3. Decrypt the DEK with the old KEK
    const [decryptResponse] = await kmsClient.decrypt({
      name: oldKekPath,
      ciphertext: encryptedDek,
    });
    const dek = decryptResponse.plaintext;
    console.log(`  - Decrypted DEK with old KEK (checksum: ${getChecksum(dek)}).`);

    // 4. Encrypt the DEK with the new KEK
    const [encryptResponse] = await kmsClient.encrypt({
      name: newKekPath,
      plaintext: dek,
    });
    const newEncryptedDek = encryptResponse.ciphertext;
    console.log(`  - Encrypted DEK with new KEK (checksum: ${getChecksum(newEncryptedDek)}).`);

    // 5. Verify the new DEK
    const [verifyResponse] = await kmsClient.decrypt({
      name: newKekPath,
      ciphertext: newEncryptedDek,
    });
    const verifiedDek = verifyResponse.plaintext;

    if (Buffer.compare(dek, verifiedDek) !== 0) {
      throw new Error('Verification failed: re-encrypted DEK does not match original DEK.');
    }
    console.log('  - Verified re-encrypted DEK.');

    if (!dryRun) {
      // 6. Upload the re-encrypted DEK back to the bucket
      await file.save(newEncryptedDek);
      console.log('  - Uploaded re-encrypted DEK.');
    } else {
      console.log('  - (Dry Run) Skipping upload of re-encrypted DEK.');
    }

    console.log(`  - Successfully processed DEK for user: ${uid}`);

  } catch (error) {
    console.error(`  - Error processing DEK for user: ${uid}`);
    console.error(error);
    throw error; // Re-throw the error to stop the script
  }
}

async function reEncryptDeks(dryRun, uid) {
  console.log(`--- Starting DEK re-encryption process in ${dryRun ? 'DRY RUN' : 'EXECUTE'} mode ---`);

  try {
    if (uid) {
      // Single-user mode
      const file = storage.bucket(BUCKET_NAME).file(`keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/${uid}.key`);
      if (!(await file.exists())[0]) {
        throw new Error(`DEK not found for user: ${uid}`);
      }
      await reEncryptDek(file, dryRun);
    } else {
      // All-users mode
      const [files] = await storage.bucket(BUCKET_NAME).getFiles({
        prefix: `keys/${USER_ENCRYPTION_KEY_BUCKET_NAME}/`,
      });

      console.log(`Found ${files.length} user DEKs to re-encrypt.`);

      for (const file of files) {
        await reEncryptDek(file, dryRun);
      }
    }

    console.log('\n--- DEK re-encryption process completed successfully! ---');
  } catch (error) {
    console.error('\n--- Error during DEK re-encryption process ---');
    process.exit(1);
  }
}

// --- Command-Line Interface ---

program
  .option('--dry-run', 'Run the script in dry-run mode without modifying any files.')
  .option('--execute', 'Run the script in execute mode to perform the re-encryption.')
  .option('--uid <uid>', 'Run the script for a single user.')
  .action(async (options) => {
    if (options.dryRun || options.execute) {
      await reEncryptDeks(options.dryRun, options.uid);
    } else {
      console.error('Please specify either --dry-run or --execute mode.');
      process.exit(1);
    }
  });

program.parse(process.argv);
