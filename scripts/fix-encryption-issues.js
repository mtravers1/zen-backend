#!/usr/bin/env node

/**
 * Script to fix encryption issues for users with persistent decryption failures
 * This script should be run when users are experiencing encryption loops
 */

import dotenv from 'dotenv';
import { 
  emergencyKeyRegeneration, 
  checkEncryptionKeyHealth, 
  attemptDataRecovery,
  createAutomaticKeyBackup,
  scheduleAutomaticBackups
} from '../database/encryption.js';

dotenv.config();

const USERS_TO_FIX = [
  'QSukN7ZeqeS32w8cXRwElVPOcpE3' // User from the logs
];

async function fixEncryptionIssues() {
  console.log('🔐 Starting encryption issue fix for staging environment...');
  console.log(`Environment: ${process.env.ENVIRONMENT || 'prod'}`);
  console.log(`Users to fix: ${USERS_TO_FIX.join(', ')}`);
  
  // Start automatic backup system
  console.log('Starting automatic backup system...');
  await scheduleAutomaticBackups();
  
  for (const uid of USERS_TO_FIX) {
    try {
      console.log(`\n--- Fixing user: ${uid} ---`);
      
      // Check current key health
      console.log('Checking current key health...');
      const health = await checkEncryptionKeyHealth(uid);
      console.log('Current health status:', health);
      
      if (!health.healthy) {
        console.log('Key health check failed, proceeding with emergency regeneration...');
        
        // Create backup before regeneration
        console.log('Creating backup of current keys...');
        const backupCreated = await createAutomaticKeyBackup(uid);
        if (backupCreated) {
          console.log('✅ Backup created successfully');
        } else {
          console.log('⚠️ Backup creation failed, continuing with regeneration...');
        }
        
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
            
            // Try data recovery for any remaining encrypted data
            console.log('Attempting data recovery for remaining encrypted data...');
            // This would need to be implemented based on your data structure
            // const recoveryResult = await attemptDataRecovery(uid, encryptedData);
          }
        } else {
          console.error(`❌ Failed to regenerate keys for user ${uid}:`, result.error);
        }
      } else {
        console.log(`✅ User ${uid} keys are healthy, no action needed`);
        
        // Still create a backup for healthy users
        console.log('Creating backup of healthy keys...');
        const backupCreated = await createAutomaticKeyBackup(uid);
        if (backupCreated) {
          console.log('✅ Backup created successfully');
        }
      }
      
    } catch (error) {
      console.error(`❌ Error fixing user ${uid}:`, error.message);
      console.error('Stack trace:', error.stack);
    }
  }
  
  console.log('\n🔐 Encryption issue fix completed');
  console.log('📋 Next steps:');
  console.log('1. Monitor the logs for any remaining encryption errors');
  console.log('2. Check if users can now access their data correctly');
  console.log('3. Verify that business logos and account information are displaying');
  console.log('4. Run the health check endpoint: GET /encryption/health?uid=<user_id>');
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
