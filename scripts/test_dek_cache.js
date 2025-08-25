#!/usr/bin/env node

/**
 * Script para testar o sistema de cache do DEK
 * Executar: node scripts/test_dek_cache.js
 */

import { getCachedDek, clearDekCache, getDekCacheStats } from '../services/accounts.service.js';

const testDekCache = async () => {
  console.log('🧪 [TEST] Testing DEK Cache System');
  console.log('=====================================\n');
  
  const testUid = 'test-user-123';
  
  try {
    // Test 1: Primeira chamada - deve buscar do banco
    console.log('📋 Test 1: First call - should fetch from database');
    console.log('----------------------------------------');
    
    const startTime = Date.now();
    const dek1 = await getCachedDek(testUid);
    const time1 = Date.now() - startTime;
    
    console.log(`✅ DEK obtained in ${time1}ms`);
    console.log(`   Type: ${typeof dek1}`);
    console.log(`   Length: ${dek1 ? dek1.length : 0}`);
    console.log(`   Cache stats:`, getDekCacheStats());
    console.log('');
    
    // Test 2: Segunda chamada - deve usar cache
    console.log('📋 Test 2: Second call - should use cache');
    console.log('----------------------------------------');
    
    const startTime2 = Date.now();
    const dek2 = await getCachedDek(testUid);
    const time2 = Date.now() - startTime2;
    
    console.log(`✅ DEK obtained in ${time2}ms`);
    console.log(`   Type: ${typeof dek2}`);
    console.log(`   Length: ${dek2 ? dek2.length : 0}`);
    console.log(`   Cache stats:`, getDekCacheStats());
    console.log('');
    
    // Test 3: Verificar se é o mesmo DEK
    console.log('📋 Test 3: Verify same DEK');
    console.log('----------------------------------------');
    
    if (dek1 === dek2) {
      console.log('✅ Same DEK returned (cache working)');
    } else {
      console.log('❌ Different DEK returned (cache not working)');
    }
    console.log('');
    
    // Test 4: Limpar cache
    console.log('📋 Test 4: Clear cache');
    console.log('----------------------------------------');
    
    clearDekCache(testUid);
    console.log('✅ Cache cleared');
    console.log(`   Cache stats:`, getDekCacheStats());
    console.log('');
    
    // Test 5: Terceira chamada - deve buscar do banco novamente
    console.log('📋 Test 5: Third call - should fetch from database again');
    console.log('----------------------------------------');
    
    const startTime3 = Date.now();
    const dek3 = await getCachedDek(testUid);
    const time3 = Date.now() - startTime3;
    
    console.log(`✅ DEK obtained in ${time3}ms`);
    console.log(`   Type: ${typeof dek3}`);
    console.log(`   Length: ${dek3 ? dek3.length : 0}`);
    console.log(`   Cache stats:`, getDekCacheStats());
    console.log('');
    
    // Test 6: Verificar se é o mesmo DEK após limpeza
    console.log('📋 Test 6: Verify DEK after cache clear');
    console.log('----------------------------------------');
    
    if (dek1 === dek3) {
      console.log('✅ Same DEK returned after cache clear');
    } else {
      console.log('❌ Different DEK returned after cache clear');
    }
    console.log('');
    
    // Test 7: Testar com UID inválido
    console.log('📋 Test 7: Test with invalid UID');
    console.log('----------------------------------------');
    
    try {
      await getCachedDek(null);
      console.log('❌ Should have thrown error for null UID');
    } catch (error) {
      console.log('✅ Error thrown for null UID:', error.message);
    }
    
    try {
      await getCachedDek('');
      console.log('❌ Should have thrown error for empty UID');
    } catch (error) {
      console.log('✅ Error thrown for empty UID:', error.message);
    }
    console.log('');
    
    // Test 8: Estatísticas finais
    console.log('📋 Test 8: Final cache statistics');
    console.log('----------------------------------------');
    
    const finalStats = getDekCacheStats();
    console.log('📊 Final Cache Stats:', finalStats);
    
    console.log('\n🎉 All tests completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
};

// Executar testes
testDekCache().catch(console.error);
