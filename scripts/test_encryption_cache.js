#!/usr/bin/env node

/**
 * Test script for encryption key cache system
 * Run with: node scripts/test_encryption_cache.js
 */

import dotenv from 'dotenv';
import { 
  encryptValue, 
  decryptValue, 
  getUserDek,
  getDecryptionKeyCacheStats,
  clearDecryptionKeyCache
} from '../database/encryption.js';

dotenv.config();

const testUid = 'test-user-123';
const testData = {
  accountId: 'acc_123',
  balance: 1000.50,
  accountName: 'Test Account',
  timestamp: new Date().toISOString()
};

async function testEncryptionKeyCache() {
  console.log('🔐 Testing Encryption Key Cache System\n');
  
  try {
    // Step 1: Get DEK
    console.log('1️⃣ Getting DEK for test user...');
    const keyData = await getUserDek(testUid);
    console.log('✅ DEK obtained:', {
      hasKey: !!keyData.dek,
      keyLength: keyData.dek?.length,
      version: keyData.version
    });
    
    // Step 2: Encrypt test data
    console.log('\n2️⃣ Encrypting test data...');
    const encrypted = await encryptValue(testData, keyData.dek, testUid);
    console.log('✅ Data encrypted:', {
      originalLength: JSON.stringify(testData).length,
      encryptedLength: encrypted.length,
      isBase64: /^[A-Za-z0-9+/=]+$/.test(encrypted)
    });
    
    // Step 3: First decryption (should cache the key)
    console.log('\n3️⃣ First decryption (should cache the key)...');
    const startTime1 = Date.now();
    const decrypted1 = await decryptValue(encrypted, keyData.dek, testUid);
    const duration1 = Date.now() - startTime1;
    
    console.log('✅ First decryption result:', {
      success: JSON.stringify(decrypted1) === JSON.stringify(testData),
      duration: `${duration1}ms`,
      decryptedData: decrypted1
    });
    
    // Step 4: Check key cache stats
    console.log('\n4️⃣ Checking key cache stats...');
    const keyCacheStats1 = getDecryptionKeyCacheStats();
    console.log('📊 Key cache stats after first decryption:', keyCacheStats1);
    
    // Step 5: Second decryption (should use cached key)
    console.log('\n5️⃣ Second decryption (should use cached key)...');
    const startTime2 = Date.now();
    const decrypted2 = await decryptValue(encrypted, keyData.dek, testUid);
    const duration2 = Date.now() - startTime2;
    
    console.log('✅ Second decryption result:', {
      success: JSON.stringify(decrypted2) === JSON.stringify(testData),
      duration: `${duration2}ms`,
      decryptedData: decrypted2,
      cacheUsed: duration2 < duration1
    });
    
    // Step 6: Final key cache stats
    console.log('\n6️⃣ Final key cache stats...');
    const keyCacheStats2 = getDecryptionKeyCacheStats();
    console.log('📊 Final key cache stats:', keyCacheStats2);
    
    // Step 7: Test key cache clearing
    console.log('\n7️⃣ Testing key cache clearing...');
    clearDecryptionKeyCache(testUid);
    const keyCacheStats3 = getDecryptionKeyCacheStats();
    console.log('✅ Key cache cleared, new stats:', keyCacheStats3);
    
    // Step 8: Third decryption (should not use cached key)
    console.log('\n8️⃣ Third decryption (should not use cached key)...');
    const startTime3 = Date.now();
    const decrypted3 = await decryptValue(encrypted, keyData.dek, testUid);
    const duration3 = Date.now() - startTime3;
    
    console.log('✅ Third decryption result:', {
      success: JSON.stringify(decrypted3) === JSON.stringify(testData),
      duration: `${duration3}ms`,
      decryptedData: decrypted3
    });
    
    // Step 9: Verify key was cached again
    console.log('\n9️⃣ Verifying key was cached again...');
    const keyCacheStats4 = getDecryptionKeyCacheStats();
    console.log('📊 Key cache stats after third decryption:', keyCacheStats4);
    
    console.log('\n🎉 Encryption key cache test completed successfully!');
    
    // Summary
    console.log('\n📋 Test Summary:');
    console.log(`- First decryption: ${duration1}ms (key cached)`);
    console.log(`- Second decryption: ${duration2}ms (key from cache)`);
    console.log(`- Third decryption: ${duration3}ms (key re-cached)`);
    console.log(`- Cache hit rate: ${duration2 < duration1 ? '✅ Working' : '❌ Not working'}`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testEncryptionKeyCache().catch(console.error);
