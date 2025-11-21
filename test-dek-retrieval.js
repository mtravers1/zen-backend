/**
 * test-dek-retrieval.js
 *
 * A temporary script to diagnose DEK retrieval issues for a specific user.
 * It attempts to fetch the user's DEK using the main application logic (`getUserDek`)
 * and prints detailed diagnostic information.
 *
 * Usage:
 * NODE_ENV=staging node --env-file=.env test-dek-retrieval.js <FIREBASE_UID>
 */

import mongoose from "mongoose";
import connectDB from "./database/database.js";
import { getUserDek } from "./database/encryption.js";

// Get Firebase UID from command line arguments
const firebaseUid = process.argv[2];

if (!firebaseUid) {
  console.error("CRITICAL: Please provide a Firebase UID as a command-line argument.");
  console.error("Usage: NODE_ENV=staging node --env-file=.env test-dek-retrieval.js <FIREBASE_UID>");
  process.exit(1);
}

async function testDekRetrieval() {
  console.log(`[DIAGNOSTIC_SCRIPT] Starting DEK retrieval test for Firebase UID: ${firebaseUid}`);

  try {
    // 1. Connect to the database
    await connectDB();
    console.log("[DIAGNOSTIC_SCRIPT] Database connected.");

    // 2. Call getUserDek and log the result
    console.log("[DIAGNOSTIC_SCRIPT] Calling getUserDek...");
    const deks = await getUserDek(firebaseUid);

    console.log(`[DIAGNOSTIC_SCRIPT] SUCCESS: Found ${deks.length} DEK(s).`);
    // Note: Don't log the DEK content for security reasons.
    deks.forEach((dek, index) => {
        console.log(`  - DEK #${index + 1} length: ${dek.length} bytes.`);
    });

  } catch (error) {
    console.error("[DIAGNOSTIC_SCRIPT] FAILED: An error occurred during DEK retrieval.");
    console.error(error);
  } finally {
    // 3. Disconnect from the database
    await mongoose.connection.close();
    console.log("[DIAGNOSTIC_SCRIPT] Database disconnected.");
  }
}

testDekRetrieval();
