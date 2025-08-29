import { attemptDataRecovery, openCircuitBreaker } from '../database/encryption.js';

/**
 * Middleware to monitor encryption issues and automatically attempt recovery
 * This helps prevent the encryption loops we saw in the logs
 */

// Track encryption failures per user
const encryptionFailureTracker = new Map();
const FAILURE_THRESHOLD = 3; // Number of failures before triggering recovery
const FAILURE_WINDOW = 5 * 60 * 1000; // 5 minutes window

function trackEncryptionFailure(uid, context = {}) {
  const now = Date.now();
  
  if (!encryptionFailureTracker.has(uid)) {
    encryptionFailureTracker.set(uid, {
      failures: [],
      lastRecoveryAttempt: 0,
      recoveryAttempts: 0
    });
  }
  
  const tracker = encryptionFailureTracker.get(uid);
  
  // Add new failure
  tracker.failures.push({
    timestamp: now,
    context: context
  });
  
  // Clean up old failures outside the window
  tracker.failures = tracker.failures.filter(f => now - f.timestamp < FAILURE_WINDOW);
  
  // Check if we should trigger recovery
  if (tracker.failures.length >= FAILURE_THRESHOLD) {
    const timeSinceLastRecovery = now - tracker.lastRecoveryAttempt;
    
    // Only attempt recovery if enough time has passed since last attempt
    if (timeSinceLastRecovery > 10 * 60 * 1000) { // 10 minutes
      console.warn(`[ENCRYPTION_MONITORING] User ${uid} has ${tracker.failures.length} encryption failures, triggering recovery...`);
      
      // Open circuit breaker to prevent further failures
      openCircuitBreaker(uid);
      
      // Schedule recovery attempt
      setTimeout(async () => {
        await attemptAutomaticRecovery(uid, tracker);
      }, 5000); // Wait 5 seconds before attempting recovery
      
      tracker.lastRecoveryAttempt = now;
      tracker.recoveryAttempts++;
    }
  }
}

async function attemptAutomaticRecovery(uid, tracker) {
  try {
    console.log(`[ENCRYPTION_MONITORING] Attempting automatic recovery for user: ${uid}`);
    
    // Get sample encrypted data from the user's recent failures
    const recentFailures = tracker.failures.slice(-FAILURE_THRESHOLD);
    
    for (const failure of recentFailures) {
      if (failure.context.encryptedData) {
        console.log(`[ENCRYPTION_MONITORING] Attempting recovery for data: ${failure.context.encryptedData.substring(0, 20)}...`);
        
        const recoveryResult = await attemptDataRecovery(uid, failure.context.encryptedData);
        
        if (recoveryResult.success) {
          console.log(`[ENCRYPTION_MONITORING] ✅ Recovery successful for user ${uid} using method: ${recoveryResult.method}`);
          
          // Clear failure tracker for this user
          encryptionFailureTracker.delete(uid);
          
          // Log successful recovery
          console.log(`[ENCRYPTION_MONITORING] User ${uid} encryption issues resolved automatically`);
          return true;
        }
      }
    }
    
    console.log(`[ENCRYPTION_MONITORING] ❌ Automatic recovery failed for user: ${uid}`);
    return false;
    
  } catch (error) {
    console.error(`[ENCRYPTION_MONITORING] Error during automatic recovery for user ${uid}:`, error);
    return false;
  }
}

// Middleware function
export function encryptionMonitoringMiddleware(req, res, next) {
  // Store original send function
  const originalSend = res.send;
  
  // Override send function to monitor responses
  res.send = function(data) {
    // Check if response contains encryption-related errors
    if (data && typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        
        // Look for encryption errors in the response
        if (parsed.error && (
          parsed.error.includes('decryption') ||
          parsed.error.includes('encryption') ||
          parsed.error.includes('key') ||
          parsed.error.includes('cipher')
        )) {
          const uid = req.user?.uid || req.body?.uid || req.params?.uid;
          if (uid) {
            trackEncryptionFailure(uid, {
              endpoint: req.path,
              method: req.method,
              error: parsed.error,
              timestamp: new Date().toISOString()
            });
          }
        }
      } catch (e) {
        // Not JSON, ignore
      }
    }
    
    // Call original send function
    return originalSend.call(this, data);
  };
  
  next();
}

// Middleware to catch encryption errors in request processing
export function encryptionErrorHandler(error, req, res, next) {
  // Check if this is an encryption-related error
  if (error.message && (
    error.message.includes('decryption') ||
    error.message.includes('encryption') ||
    error.message.includes('key') ||
    error.message.includes('cipher') ||
    error.message.includes('Unsupported state or unable to authenticate data')
  )) {
    const uid = req.user?.uid || req.body?.uid || req.params?.uid;
    
    if (uid) {
      console.error(`[ENCRYPTION_MONITORING] Encryption error detected for user ${uid}:`, error.message);
      
      trackEncryptionFailure(uid, {
        endpoint: req.path,
        method: req.method,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      });
    }
  }
  
  // Continue with normal error handling
  next(error);
}

// Function to get encryption failure statistics
export function getEncryptionFailureStats() {
  const stats = {
    totalUsersWithFailures: encryptionFailureTracker.size,
    users: []
  };
  
  for (const [uid, tracker] of encryptionFailureTracker.entries()) {
    stats.users.push({
      uid,
      failureCount: tracker.failures.length,
      lastFailure: tracker.failures.length > 0 ? tracker.failures[tracker.failures.length - 1].timestamp : null,
      recoveryAttempts: tracker.recoveryAttempts,
      lastRecoveryAttempt: tracker.lastRecoveryAttempt
    });
  }
  
  return stats;
}

// Function to manually trigger recovery for a user
export async function triggerManualRecovery(uid) {
  const tracker = encryptionFailureTracker.get(uid);
  if (tracker) {
    return await attemptAutomaticRecovery(uid, tracker);
  }
  return false;
}
