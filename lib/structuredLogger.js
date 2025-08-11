/**
 * Structured, Context-Rich Error Logging System
 * Follows Cursor Rules for comprehensive error tracking and observability
 */

import crypto from 'crypto';

class StructuredLogger {
  constructor() {
    this.requestContext = new Map();
    this.errorBlocks = [];
    this.operationCounts = new Map();
  }

  /**
   * Start tracking request context
   */
  startRequestContext(req, operation) {
    const requestId = crypto.randomUUID();
    const context = {
      requestId,
      operation,
      timestamp: new Date().toISOString(),
      request: this.sanitizeRequest(req),
      startTime: Date.now()
    };
    
    this.requestContext.set(requestId, context);
    return requestId;
  }

  /**
   * Sanitize request data for logging (remove sensitive information)
   */
  sanitizeRequest(req) {
    const sanitizedHeaders = { ...req.headers };
    
    // Redact sensitive headers
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'token'];
    sensitiveHeaders.forEach(header => {
      if (sanitizedHeaders[header]) {
        sanitizedHeaders[header] = '[REDACTED]';
      }
    });

    return {
      method: req.method,
      url: req.url,
      headers: sanitizedHeaders,
      query: req.query || {},
      params: req.params || {},
      body: this.sanitizeBody(req.body),
      ip: req.ip,
      userAgent: req.get('User-Agent')
    };
  }

  /**
   * Sanitize request body (remove sensitive fields)
   */
  sanitizeBody(body) {
    if (!body) return null;
    
    const deepSanitize = (obj) => {
      if (typeof obj !== 'object' || obj === null) return obj;
      
      const sanitized = Array.isArray(obj) ? [...obj] : { ...obj };
      const sensitiveFields = ['password', 'token', 'access_token', 'secret', 'key'];
      
      for (const [key, value] of Object.entries(sanitized)) {
        if (sensitiveFields.includes(key.toLowerCase())) {
          sanitized[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null) {
          sanitized[key] = deepSanitize(value);
        }
      }
      
      return sanitized;
    };
    
    return deepSanitize(body);
  }

  /**
   * Log structured error block following Cursor Rules
   */
  logErrorBlock(error, context = {}) {
    const errorBlock = {
      timestamp: new Date().toISOString(),
      operation: context.operation || 'unknown',
      item_id: context.item_id,
      plaid_request_id: context.plaid_request_id,
      encryption_key_version: context.encryption_key_version,
      user_id: context.user_id,
      request: context.request,
      response: context.response,
      error: {
        name: error.name || 'Error',
        message: error.message,
        stack: error.stack,
        code: error.code,
        details: error.details || {}
      },
      fallbacks_triggered: context.fallbacks_triggered || [],
      error_classification: this.classifyError(error, context),
      durationMs: context.durationMs,
      metadata: {
        ...context.metadata,
        error_count: this.getErrorCount(context.operation),
        retry_attempt: context.retry_attempt || 0
      }
    };

    // Store for monitoring
    this.errorBlocks.push(errorBlock);
    
    // Track error count
    this.incrementErrorCount(context.operation);
    
    // Log to console with ideal format
    console.error('\n=== ERROR BLOCK START ===');
    console.error('-- Error');
    console.error(error.message);
    console.error('-- Stack');
    console.error(error.stack);
    if (error.details && Object.keys(error.details).length > 0) {
      console.error('-- Details');
      console.error(JSON.stringify(error.details, null, 2));
    }
    if (context.request) {
      console.error('-- Request');
      console.error(JSON.stringify(context.request, null, 2));
    }
    if (context.response) {
      console.error('-- Response');
      console.error(JSON.stringify(context.response, null, 2));
    }
    console.error('=== ERROR BLOCK END ===\n');
    
    return errorBlock;
  }

  /**
   * Classify error type for better handling
   */
  classifyError(error, context) {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code || '';
    
    // Authentication errors
    if (errorMessage.includes('user not found') || 
        errorCode === 'auth/user-not-found' ||
        errorCode === 'auth/invalid-email' ||
        errorCode === 'auth/invalid-credential') {
      return 'authentication_error';
    }
    
    // Firebase authentication errors
    if (errorCode === 'auth/invalid-email') {
      return 'invalid_email';
    }
    
    if (errorCode === 'auth/invalid-credential' || 
        errorCode === 'auth/wrong-password') {
      return 'invalid_credentials';
    }
    
    if (errorCode === 'auth/user-disabled') {
      return 'user_disabled';
    }
    
    if (errorCode === 'auth/too-many-requests') {
      return 'rate_limit_exceeded';
    }
    
    // Encryption/Decryption errors
    if (errorCode === 'ERR_CRYPTO_INVALID_AUTH_TAG' || 
        errorCode === 'ERR_CRYPTO_INVALID_IV' ||
        errorMessage.includes('unsupported state') ||
        errorMessage.includes('unable to authenticate data')) {
      return 'decryption_failure';
    }
    
    // Plaid API errors
    if (errorMessage.includes('products_not_supported')) {
      return 'non_fatal_api_error';
    }
    
    if (errorMessage.includes('item_login_required') ||
        errorMessage.includes('invalid_access_token')) {
      return 'authentication_required';
    }
    
    if (errorMessage.includes('institution_down') ||
        errorMessage.includes('rate_limit')) {
      return 'retryable_error';
    }
    
    // Network errors
    if (error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND') {
      return 'network_error';
    }
    
    // Database errors
    if (error.name === 'ValidationError' || 
        error.name === 'CastError' ||
        error.code === 11000) {
      return 'database_error';
    }
    
    return 'unknown_error';
  }

  /**
   * Log successful operation with context
   */
  logSuccess(operation, context = {}) {
    const successLog = {
      timestamp: new Date().toISOString(),
      operation,
      status: 'success',
      item_id: context.item_id,
      plaid_request_id: context.plaid_request_id,
      user_id: context.user_id,
      durationMs: context.durationMs,
      metadata: context.metadata || {}
    };

    console.log(`[SUCCESS] ${operation}:`, JSON.stringify(successLog, null, 2));
    return successLog;
  }

  /**
   * Log operation start with context
   */
  logOperationStart(operation, context = {}) {
    const startLog = {
      timestamp: new Date().toISOString(),
      operation,
      status: 'started',
      item_id: context.item_id,
      user_id: context.user_id,
      metadata: context.metadata || {}
    };

    console.log(`[START] ${operation}:`, JSON.stringify(startLog, null, 2));
    return startLog;
  }

  /**
   * Log webhook processing with full context
   */
  logWebhook(webhookType, webhookCode, context = {}) {
    const webhookLog = {
      timestamp: new Date().toISOString(),
      operation: 'webhook_processing',
      webhook_type: webhookType,
      webhook_code: webhookCode,
      item_id: context.item_id,
      plaid_request_id: context.plaid_request_id,
      signature_valid: context.signature_valid,
      processing_result: context.result,
      durationMs: context.durationMs,
      metadata: context.metadata || {}
    };

    console.log(`[WEBHOOK] ${webhookType}/${webhookCode}:`, JSON.stringify(webhookLog, null, 2));
    return webhookLog;
  }

  /**
   * Log encryption operation with key version tracking
   */
  logEncryptionOperation(operation, success, context = {}) {
    const encryptionLog = {
      timestamp: new Date().toISOString(),
      operation: `encryption_${operation}`,
      success,
      encryption_key_version: context.key_version,
      user_id: context.user_id,
      item_id: context.item_id,
      error: success ? null : context.error,
      fallback_used: context.fallback_used || false,
      durationMs: context.durationMs,
      metadata: context.metadata || {}
    };

    const logLevel = success ? 'log' : 'error';
    console[logLevel](`[ENCRYPTION] ${operation}:`, JSON.stringify(encryptionLog, null, 2));
    return encryptionLog;
  }

  /**
   * Log Plaid API interaction with full context
   */
  logPlaidApi(operation, success, context = {}) {
    const plaidLog = {
      timestamp: new Date().toISOString(),
      operation: `plaid_${operation}`,
      success,
      item_id: context.item_id,
      plaid_request_id: context.plaid_request_id,
      institution_id: context.institution_id,
      user_id: context.user_id,
      request: context.request,
      response: context.response,
      error: success ? null : context.error,
      retry_attempt: context.retry_attempt || 0,
      durationMs: context.durationMs,
      metadata: context.metadata || {}
    };

    const logLevel = success ? 'log' : 'error';
    console[logLevel](`[PLAID] ${operation}:`, JSON.stringify(plaidLog, null, 2));
    return plaidLog;
  }

  /**
   * Format error block for consistent output
   */
  formatErrorBlock(errorBlock) {
    return JSON.stringify(errorBlock, null, 2);
  }

  /**
   * Get error count for operation
   */
  getErrorCount(operation) {
    return this.operationCounts.get(operation) || 0;
  }

  /**
   * Increment error count for operation
   */
  incrementErrorCount(operation) {
    const current = this.operationCounts.get(operation) || 0;
    this.operationCounts.set(operation, current + 1);
  }

  /**
   * Generate error report
   */
  generateErrorReport() {
    const now = new Date();
    const report = {
      timestamp: now.toISOString(),
      summary: {
        total_errors: this.errorBlocks.length,
        operations_with_errors: this.operationCounts.size,
        error_classifications: this.getErrorClassifications(),
        recent_errors: this.errorBlocks.slice(-10) // Last 10 errors
      },
      error_counts: Object.fromEntries(this.operationCounts),
      error_blocks: this.errorBlocks
    };

    return report;
  }

  /**
   * Get error classifications summary
   */
  getErrorClassifications() {
    const classifications = {};
    this.errorBlocks.forEach(block => {
      const classification = block.error_classification;
      classifications[classification] = (classifications[classification] || 0) + 1;
    });
    return classifications;
  }

  /**
   * Clear old error blocks (older than 24 hours)
   */
  cleanupOldErrors() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    this.errorBlocks = this.errorBlocks.filter(block => 
      new Date(block.timestamp) > cutoff
    );
  }

  /**
   * Create context wrapper for async operations
   */
  async withContext(operation, context, fn) {
    const startTime = Date.now();
    const operationContext = {
      ...context,
      operation,
      startTime
    };

    try {
      this.logOperationStart(operation, operationContext);
      const result = await fn();
      const durationMs = Date.now() - startTime;
      
      this.logSuccess(operation, {
        ...operationContext,
        durationMs
      });
      
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      this.logErrorBlock(error, {
        ...operationContext,
        durationMs
      });
      
      throw error;
    }
  }

  /**
   * Create retry wrapper with logging
   */
  async withRetry(operation, context, fn, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const retryContext = {
          ...context,
          retry_attempt: attempt
        };
        
        return await this.withContext(operation, retryContext, fn);
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          this.logErrorBlock(error, {
            ...context,
            operation,
            retry_attempt: attempt,
            error_classification: 'max_retries_exceeded'
          });
          throw error;
        }
        
        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
}

// Create singleton instance
const structuredLogger = new StructuredLogger();

export default structuredLogger; 