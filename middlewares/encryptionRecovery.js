import { safeDecryptValueWithFallback } from '../database/encryption.js';

/**
 * Middleware for automatic encryption recovery
 * This middleware intercepts responses and attempts to recover encrypted data
 * when normal decryption fails, ensuring users always see meaningful information
 */
export const encryptionRecoveryMiddleware = (req, res, next) => {
  // Store original send method
  const originalSend = res.send;
  
  // Override send method to intercept responses
  res.send = function(data) {
    try {
      // Only process if data is JSON and contains encrypted fields
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch (e) {
          // Not JSON, use original send
          return originalSend.call(this, data);
        }
      }
      
      if (data && typeof data === 'object') {
        // Process the response data for encryption recovery
        const processedData = processResponseForEncryptionRecovery(data, req.user?.uid);
        
        // Use original send with processed data
        return originalSend.call(this, processedData);
      }
      
      // Use original send for non-object data
      return originalSend.call(this, data);
      
    } catch (error) {
      console.error('[ENCRYPTION_RECOVERY] Error in middleware:', error);
      // Fallback to original send
      return originalSend.call(this, data);
    }
  };
  
  next();
};

/**
 * Process response data to recover encrypted fields
 */
function processResponseForEncryptionRecovery(data, uid) {
  if (!uid || !data) {
    return data;
  }
  
  try {
    // Deep clone the data to avoid modifying the original
    const processedData = JSON.parse(JSON.stringify(data));
    
    // Process the data recursively
    processObjectForEncryptionRecovery(processedData, uid);
    
    return processedData;
  } catch (error) {
    console.error('[ENCRYPTION_RECOVERY] Error processing data:', error);
    return data;
  }
}

/**
 * Recursively process object to recover encrypted fields
 */
function processObjectForEncryptionRecovery(obj, uid, path = '') {
  if (!obj || typeof obj !== 'object') {
    return;
  }
  
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    
    if (typeof value === 'string' && isEncryptedData(value)) {
      // This looks like encrypted data, try to recover it
      console.log(`[ENCRYPTION_RECOVERY] Attempting recovery for field: ${currentPath}`);
      
      // Determine data type based on field name and context
      const dataType = inferDataTypeFromField(key, obj);
      
      // Try to recover the data
      safeDecryptValueWithFallback(value, null, uid, dataType)
        .then(recoveredValue => {
          if (recoveredValue !== null) {
            obj[key] = recoveredValue;
            console.log(`[ENCRYPTION_RECOVERY] Successfully recovered data for field: ${currentPath}`);
          }
        })
        .catch(error => {
          console.error(`[ENCRYPTION_RECOVERY] Recovery failed for field ${currentPath}:`, error);
        });
      
    } else if (typeof value === 'object' && value !== null) {
      // Recursively process nested objects
      processObjectForEncryptionRecovery(value, uid, currentPath);
    }
  }
}

/**
 * Check if a string looks like encrypted data
 */
function isEncryptedData(value) {
  if (typeof value !== 'string') {
    return false;
  }
  
  // Check if it looks like base64-encoded encrypted data
  // Encrypted data should be base64 and have a reasonable length
  const base64Regex = /^[A-Za-z0-9+/_-]*={0,2}$/;
  return base64Regex.test(value) && value.length > 32;
}

/**
 * Infer data type from field name and context
 */
function inferDataTypeFromField(fieldName, context) {
  const fieldLower = fieldName.toLowerCase();
  
  // Financial data
  if (fieldLower.includes('net_worth') || fieldLower.includes('networth')) return 'net_worth';
  if (fieldLower.includes('balance')) return 'balance';
  if (fieldLower.includes('income')) return 'income';
  if (fieldLower.includes('spending') || fieldLower.includes('spend')) return 'spending';
  if (fieldLower.includes('amount')) return 'amount';
  
  // Account data
  if (fieldLower.includes('account')) return 'accounts';
  if (fieldLower.includes('accounts')) return 'accounts';
  
  // Transaction data
  if (fieldLower.includes('transaction')) return 'transactions';
  if (fieldLower.includes('transactions')) return 'transactions';
  
  // Business data
  if (fieldLower.includes('business') && fieldLower.includes('logo')) return 'business_logo';
  if (fieldLower.includes('business') && fieldLower.includes('name')) return 'business_name';
  if (fieldLower.includes('business')) return 'business_name';
  
  // User data
  if (fieldLower.includes('user') && fieldLower.includes('name')) return 'user_name';
  if (fieldLower.includes('user') && fieldLower.includes('email')) return 'user_email';
  
  // Default to generic
  return 'generic';
}

export default encryptionRecoveryMiddleware;
