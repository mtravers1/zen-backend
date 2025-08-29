#!/usr/bin/env node

/**
 * Script to fix encryption issues for users with persistent decryption failures
 * This script should be run when users are experiencing encryption loops
 */

import dotenv from 'dotenv';
import { emergencyKeyRegeneration, checkEncryptionKeyHealth } from '../database/encryption.js';

dotenv.config();

const USERS_TO_FIX = [
  'QSukN7ZeqeS32w8cXRwElVPOcpE3' // User from the logs
];

async function fixEncryptionIssues() {
  console.log('🔐 Starting encryption issue fix for staging environment...');
  console.log(`Environment: ${process.env.ENVIRONMENT || 'prod'}`);
  console.log(`Users to fix: ${USERS_TO_FIX.join(', ')}`);
  
  for (const uid of USERS_TO_FIX) {
    try {
      console.log(`\n--- Fixing user: ${uid} ---`);
      
      // Check current key health
      console.log('Checking current key health...');
      const health = await checkEncryptionKeyHealth(uid);
      console.log('Current health status:', health);
      
      if (!health.healthy) {
        console.log('Key health check failed, proceeding with emergency regeneration...');
        
        // Perform emergency key regeneration
        const result = await emergencyKeyRegeneration(uid);
        
        if (result.success) {
          console.log(`✅ Successfully regenerated keys for user ${uid}`);
          console.log(`New key version: ${result.newVersion}`);
          
          // Verify the fix
          console.log('Verifying fix...');
          const newHealth = await checkEncryptionKeyHealth(uid);
          console.log('New health status:', newHealth);
          
          if (newHealth.healthy) {
            console.log(`✅ User ${uid} encryption issues resolved`);
          } else {
            console.log(`⚠️ User ${uid} still has issues:`, newHealth);
          }
        } else {
          console.error(`❌ Failed to regenerate keys for user ${uid}:`, result.error);
        }
      } else {
        console.log(`✅ User ${uid} keys are healthy, no action needed`);
      }
      
    } catch (error) {
      console.error(`❌ Error fixing user ${uid}:`, error.message);
      console.error('Stack trace:', error.stack);
    }
  }
  
  console.log('\n🔐 Encryption issue fix completed');
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  fixEncryptionIssues()
    .then(() => {
      console.log('Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export { fixEncryptionIssues };
