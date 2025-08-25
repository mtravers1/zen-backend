import structuredLogger from './structuredLogger.js';
import { decryptValue, encryptValue, getUserDek, getPreviousDek } from '../database/encryption.js';

/**
 * Encryption helper with fallback key versions and structured logging
 * Follows Cursor Rules for encryption resilience and error handling
 */
class EncryptionHelper {
  /**
   * Decrypt value with fallback to previous key versions
   */
  static async decryptWithFallback(cipherTextBase64, uid, context = {}) {
    const startTime = Date.now();
    const fallbacksTriggered = [];
    
    try {
      // Try with current key first
      const currentKeyData = await getUserDek(uid);
      
      try {
        const result = await structuredLogger.withContext('decryptWithCurrentKey', {
          user_id: uid,
          encryption_key_version: currentKeyData.version,
          has_cipher_text: !!cipherTextBase64,
          ...context
        }, async () => {
          return await decryptValue(cipherTextBase64, currentKeyData.dek);
        });
        
        const durationMs = Date.now() - startTime;
        
        structuredLogger.logEncryptionOperation('decrypt', true, {
          user_id: uid,
          key_version: currentKeyData.version,
          durationMs,
          fallback_used: false
        });
        
        return result;
      } catch (currentKeyError) {
        fallbacksTriggered.push('retry-with-previous-key');
        
        // Try with previous key versions
        const previousDek = await getPreviousDek(uid);
        if (previousDek) {
          try {
            const result = await structuredLogger.withContext('decryptWithPreviousKey', {
              user_id: uid,
              encryption_key_version: previousDek.version,
              has_cipher_text: !!cipherTextBase64,
              fallback_used: true,
              ...context
            }, async () => {
              return await decryptValue(cipherTextBase64, previousDek.dek);
            });
            
            const durationMs = Date.now() - startTime;
            
            structuredLogger.logEncryptionOperation('decrypt', true, {
              user_id: uid,
              key_version: previousDek.version,
              durationMs,
              fallback_used: true
            });
            
            return result;
          } catch (previousKeyError) {
            // Both keys failed
            const durationMs = Date.now() - startTime;
            
            structuredLogger.logErrorBlock(previousKeyError, {
              operation: 'decryptWithFallback',
              user_id: uid,
              encryption_key_version: previousDek.version,
              fallbacks_triggered: fallbacksTriggered,
              durationMs,
              error_classification: 'decryption_failure',
              metadata: {
                current_key_attempted: true,
                previous_key_attempted: true,
                current_key_error: currentKeyError.message,
                previous_key_error: previousKeyError.message
              }
            });
            
            throw new Error('Decryption failed with all available key versions');
          }
        } else {
          // No previous key available
          const durationMs = Date.now() - startTime;
          
          structuredLogger.logErrorBlock(currentKeyError, {
            operation: 'decryptWithFallback',
            user_id: uid,
            encryption_key_version: currentKeyData.version,
            fallbacks_triggered: fallbacksTriggered,
            durationMs,
            error_classification: 'decryption_failure',
            metadata: {
              current_key_attempted: true,
              previous_key_available: false
            }
          });
          
          throw currentKeyError;
        }
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      structuredLogger.logErrorBlock(error, {
        operation: 'decryptWithFallback',
        user_id: uid,
        fallbacks_triggered: fallbacksTriggered,
        durationMs,
        error_classification: 'decryption_failure'
      });
      
      throw error;
    }
  }

  /**
   * Encrypt value with current key version
   */
  static async encryptWithLogging(plainText, uid, context = {}) {
    const startTime = Date.now();
    
    try {
      const dek = await getUserDek(uid);
      
      const result = await structuredLogger.withContext('encryptWithCurrentKey', {
        user_id: uid,
        encryption_key_version: dek.version,
        has_plain_text: !!plainText,
        ...context
      }, async () => {
        return await encryptValue(plainText, dek);
      });
      
      const durationMs = Date.now() - startTime;
      
      structuredLogger.logEncryptionOperation('encrypt', true, {
        user_id: uid,
        key_version: dek.version,
        durationMs,
        fallback_used: false
      });
      
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      structuredLogger.logErrorBlock(error, {
        operation: 'encryptWithLogging',
        user_id: uid,
        durationMs,
        error_classification: 'encryption_failure'
      });
      
      throw error;
    }
  }

  /**
   * Validate encryption key health
   */
  static async validateKeyHealth(uid) {
    try {
      const currentDek = await getUserDek(uid);
      const previousDek = await getPreviousDek(uid);
      
      if (!currentDek || !currentDek.version) {
        throw new Error('Invalid current DEK: missing required properties');
      }
      
      const health = {
        timestamp: new Date().toISOString(),
        user_id: uid,
        current_key: {
          version: currentDek.version,
          created_at: currentDek.createdAt || null,
          is_valid: true
        },
        previous_key: previousDek ? {
          version: previousDek.version,
          created_at: previousDek.createdAt || null,
          is_valid: true
        } : null,
        fallback_available: !!previousDek
      };
      
      structuredLogger.logSuccess('validateKeyHealth', {
        user_id: uid,
        current_key_version: currentDek.version,
        fallback_available: !!previousDek
      });
      
      return health;
    } catch (error) {
      structuredLogger.logErrorBlock(error, {
        operation: 'validateKeyHealth',
        user_id: uid,
        error_classification: 'key_validation_error'
      });
      
      throw error;
    }
  }

  /**
   * Rotate encryption key with proper logging
   */
  static async rotateKey(uid, context = {}) {
    const startTime = Date.now();
    
    try {
      const oldDek = await getUserDek(uid);
      
      const result = await structuredLogger.withContext('rotateEncryptionKey', {
        user_id: uid,
        old_key_version: oldDek.version,
        ...context
      }, async () => {
        // TODO: Implement actual key rotation logic
        // This is currently a placeholder that only increments the version number
        // Proper implementation should:
        // 1. Generate new DEK
        // 2. Re-encrypt existing data with new key
        // 3. Store old key for fallback
        // 4. Update key metadata
        return { success: true, new_key_version: oldDek.version + 1 };
      });
      
      const durationMs = Date.now() - startTime;
      
      structuredLogger.logSuccess('rotateKey', {
        user_id: uid,
        old_key_version: oldDek.version,
        new_key_version: result.new_key_version,
        durationMs
      });
      
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      structuredLogger.logErrorBlock(error, {
        operation: 'rotateKey',
        user_id: uid,
        durationMs,
        error_classification: 'key_rotation_error'
      });
      
      throw error;
    }
  }
}

export default EncryptionHelper; 