#!/usr/bin/env node

/**
 * Script to restore user data for all users affected by encryption issues
 * This script will attempt to recover data using multiple strategies
 */

import dotenv from 'dotenv';
import { 
  attemptDataRecovery, 
  emergencyKeyRegeneration, 
  checkEncryptionKeyHealth,
  createAutomaticKeyBackup
} from '../database/encryption.js';

dotenv.config();

// Users known to have encryption issues
const AFFECTED_USERS = [
  'QSukN7ZeqeS32w8cXRwElVPOcpE3' // User from the logs
];

// Sample encrypted data that should be recoverable (you'll need to get this from your database)
const SAMPLE_ENCRYPTED_DATA = [
  // Add sample encrypted data here for testing recovery
  // This should be actual encrypted data from your database
];

async function restoreUserData(uid) {
  console.log(`\n🔐 Restoring data for user: ${uid}`);
  
  try {
    // Step 1: Check current key health
    console.log('1. Checking current key health...');
    const health = await checkEncryptionKeyHealth(uid);
    console.log('   Health status:', health);
    
    // Step 2: Create backup of current keys before any changes
    console.log('2. Creating backup of current keys...');
    const backupCreated = await createAutomaticKeyBackup(uid);
    console.log('   Backup created:', backupCreated);
    
    // Step 3: Attempt data recovery with sample data
    if (SAMPLE_ENCRYPTED_DATA.length > 0) {
      console.log('3. Testing data recovery with sample data...');
      
      for (let i = 0; i < SAMPLE_ENCRYPTED_DATA.length; i++) {
        const encryptedData = SAMPLE_ENCRYPTED_DATA[i];
        console.log(`   Testing recovery for data ${i + 1}...`);
        
        const recoveryResult = await attemptDataRecovery(uid, encryptedData);
        
        if (recoveryResult.success) {
          console.log(`   ✅ Recovery successful using method: ${recoveryResult.method}`);
          console.log(`   Recovered data:`, recoveryResult.data);
        } else {
          console.log(`   ❌ Recovery failed:`, recoveryResult.error);
        }
      }
    } else {
      console.log('3. No sample data available for recovery testing');
    }
    
    // Step 4: If keys are unhealthy, regenerate them
    if (!health.healthy) {
      console.log('4. Keys are unhealthy, regenerating...');
      const regenerationResult = await emergencyKeyRegeneration(uid);
      
      if (regenerationResult.success) {
        console.log(`   ✅ Keys regenerated successfully`);
        console.log(`   New key version: ${regenerationResult.newVersion}`);
        
        // Verify the fix
        console.log('5. Verifying fix...');
        const newHealth = await checkEncryptionKeyHealth(uid);
        console.log('   New health status:', newHealth);
        
        if (newHealth.healthy) {
          console.log(`   ✅ User ${uid} encryption issues resolved`);
        } else {
          console.log(`   ⚠️ User ${uid} still has issues:`, newHealth);
        }
      } else {
        console.error(`   ❌ Failed to regenerate keys:`, regenerationResult.error);
      }
    } else {
      console.log('4. Keys are healthy, no regeneration needed');
    }
    
    // Step 6: Create new backup after regeneration
    console.log('6. Creating new backup after regeneration...');
    const newBackupCreated = await createAutomaticKeyBackup(uid);
    console.log('   New backup created:', newBackupCreated);
    
    console.log(`✅ Data restoration completed for user: ${uid}`);
    return { success: true, uid };
    
  } catch (error) {
    console.error(`❌ Error restoring data for user ${uid}:`, error.message);
    console.error('Stack trace:', error.stack);
    return { success: false, uid, error: error.message };
  }
}

async function restoreAllAffectedUsers() {
  console.log('🔐 Starting comprehensive data restoration for all affected users...');
  console.log(`Environment: ${process.env.ENVIRONMENT || 'prod'}`);
  console.log(`Users to restore: ${AFFECTED_USERS.join(', ')}`);
  
  const results = [];
  
  for (const uid of AFFECTED_USERS) {
    const result = await restoreUserData(uid);
    results.push(result);
  }
  
  // Summary
  console.log('\n📊 Restoration Summary:');
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\nFailed users:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.uid}: ${r.error}`);
    });
  }
  
  console.log('\n🔐 Data restoration process completed');
  return results;
}

// Function to get all users from database (implement based on your user model)
async function getAllUsers() {
  // TODO: Implement this based on your user management system
  // This should return an array of user objects with uid property
  console.log('⚠️ getAllUsers function not implemented - using hardcoded list');
  return AFFECTED_USERS.map(uid => ({ uid }));
}

// Function to scan database for users with encryption issues
async function scanForUsersWithEncryptionIssues() {
  try {
    console.log('🔍 Scanning database for users with encryption issues...');
    
    // TODO: Implement database scan to find users with:
    // - Failed decryption attempts
    // - Null/empty data fields that should have data
    // - Recent encryption errors in logs
    
    console.log('⚠️ Database scan not implemented - using hardcoded list');
    return AFFECTED_USERS;
    
  } catch (error) {
    console.error('❌ Database scan failed:', error.message);
    return AFFECTED_USERS; // Fallback to hardcoded list
  }
}

// Run the script
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  switch (command) {
    case 'restore-all':
      restoreAllAffectedUsers()
        .then(() => {
          console.log('Script completed successfully');
          process.exit(0);
        })
        .catch((error) => {
          console.error('Script failed:', error);
          process.exit(1);
        });
      break;
      
    case 'scan':
      scanForUsersWithEncryptionIssues()
        .then((users) => {
          console.log('Scan completed. Users with issues:', users);
          process.exit(0);
        })
        .catch((error) => {
          console.error('Scan failed:', error);
          process.exit(1);
        });
      break;
      
    default:
      console.log('Usage:');
      console.log('  node restore-user-data.js restore-all  # Restore all affected users');
      console.log('  node restore-user-data.js scan         # Scan for users with issues');
      process.exit(1);
  }
}

export { restoreUserData, restoreAllAffectedUsers, scanForUsersWithEncryptionIssues };
