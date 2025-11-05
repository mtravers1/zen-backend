#!/usr/bin/env node

/**
 * Script to recover encryption keys for users experiencing decryption issues
 * Usage: node scripts/recover-encryption-keys.js <uid>
 */

import {
  checkEncryptionKeyHealth,
  recoverUserEncryptionKeys,
} from "../database/encryption.js";

async function main() {
  const uid = process.argv[2];

  if (!uid) {
    console.error("❌ Usage: node scripts/recover-encryption-keys.js <uid>");
    process.exit(1);
  }

  console.log(`🔐 Starting encryption key recovery for user: ${uid}`);
  console.log("=".repeat(60));

  try {
    // Check current key health
    console.log("📊 Checking current encryption key health...");
    const health = await checkEncryptionKeyHealth(uid);

    console.log("Health Check Results:");
    console.log(`  - Healthy: ${health.healthy ? "✅ Yes" : "❌ No"}`);
    console.log(`  - Issue: ${health.issue || "None"}`);
    console.log(`  - Recommendation: ${health.recommendation || "None"}`);

    if (health.healthy) {
      console.log("\n✅ Encryption keys are healthy. No recovery needed.");
      return;
    }

    console.log("\n🔧 Starting key recovery process...");
    const recoveryResult = await recoverUserEncryptionKeys(uid);

    console.log("\nRecovery Results:");
    console.log(
      `  - Recovered: ${recoveryResult.recovered ? "✅ Yes" : "❌ No"}`,
    );
    console.log(`  - New Version: ${recoveryResult.newVersion || "N/A"}`);
    console.log(
      `  - Has Previous Key: ${recoveryResult.hasPreviousKey ? "✅ Yes" : "❌ No"}`,
    );
    console.log(
      `  - Recommendation: ${recoveryResult.recommendation || "None"}`,
    );

    if (recoveryResult.recovered) {
      console.log("\n✅ Key recovery completed successfully!");

      // Check health again
      console.log("\n📊 Verifying recovery...");
      const newHealth = await checkEncryptionKeyHealth(uid);
      console.log(
        `  - New Health Status: ${newHealth.healthy ? "✅ Healthy" : "❌ Unhealthy"}`,
      );
    } else {
      console.log("\nℹ️ Key recovery not needed.");
    }
  } catch (error) {
    console.error("\n❌ Error during key recovery:", error.message);
    console.error("Stack trace:", error.stack);
    process.exit(1);
  }
}

main().catch(console.error);
