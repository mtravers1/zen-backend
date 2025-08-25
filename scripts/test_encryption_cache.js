#!/usr/bin/env node

/**
 * Test script for encryption cache system
 * Run with: node scripts/test_encryption_cache.js
 */

import dotenv from 'dotenv';
import { 
  encryptValue, 
  decryptValue, 
  getUserDek,
  getDecryptedCacheStats,
  clearDecryptedCache
} from '../database/encryption.js';

dotenv.config();

const testUid = 'test-user-123';
const testData = {
  accountId: 'acc_123',
  balance: 1000.50,
  accountName: 'Test Account',
  timestamp: new Date().toISOString()
};

async function testEncryptionCache() {
  console.log('🔐 Testing Encryption Cache System\n');
  
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
    
    // Step 3: First decryption (should cache)
    console.log('\n3️⃣ First decryption (should cache)...');
    const startTime1 = Date.now();
    const decrypted1 = await decryptValue(encrypted, keyData.dek, testUid);
    const duration1 = Date.now() - startTime1;
    
    console.log('✅ First decryption result:', {
      success: JSON.stringify(decrypted1) === JSON.stringify(testData),
      duration: `${duration1}ms`,
      decryptedData: decrypted1
    });
    
    // Step 4: Check cache stats
    console.log('\n4️⃣ Checking cache stats...');
    const cacheStats1 = getDecryptedCacheStats();
    console.log('📊 Cache stats after first decryption:', cacheStats1);
    
    // Step 5: Second decryption (should use cache)
    console.log('\n5️⃣ Second decryption (should use cache)...');
    const startTime2 = Date.now();
    const decrypted2 = await decryptValue(encrypted, keyData.dek, testUid);
    const duration2 = Date.now() - startTime2;
    
    console.log('✅ Second decryption result:', {
      success: JSON.stringify(decrypted2) === JSON.stringify(testData),
      duration: `${duration2}ms`,
      decryptedData: decrypted2,
      cacheUsed: duration2 < duration1
    });
    
    // Step 6: Final cache stats
    console.log('\n6️⃣ Final cache stats...');
    const cacheStats2 = getDecryptedCacheStats();
    console.log('📊 Final cache stats:', cacheStats2);
    
    // Step 7: Test cache clearing
    console.log('\n7️⃣ Testing cache clearing...');
    clearDecryptedCache(testUid);
    const cacheStats3 = getDecryptedCacheStats();
    console.log('✅ Cache cleared, new stats:', cacheStats3);
    
    // Step 8: Third decryption (should not use cache)
    console.log('\n8️⃣ Third decryption (should not use cache)...');
    const startTime3 = Date.now();
    const decrypted3 = await decryptValue(encrypted, keyData.dek, testUid);
    const duration3 = Date.now() - startTime3;
    
    console.log('✅ Third decryption result:', {
      success: JSON.stringify(decrypted3) === JSON.stringify(testData),
      duration: `${duration3}ms`,
      decryptedData: decrypted3
    });
    
    console.log('\n🎉 Encryption cache test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testEncryptionCache().catch(console.error);
