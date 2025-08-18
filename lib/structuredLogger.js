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
        code: error.code
      },
      durationMs: context.durationMs,
      retry_attempt: context.retry_attempt,
      error_classification: this.classifyError(error, context)
    };

    this.errorBlocks.push(errorBlock);
    this.incrementErrorCount(context.operation || 'unknown');
    
    // Format and log the error block
    const formattedError = this.formatErrorBlock(errorBlock);
    console.error('=== ERROR BLOCK START ===');
    console.error('-- Error');
    console.error(`HTTP ${context.response?.statusCode || 'Unknown'}`);
    console.error('-- Stack');
    console.error(formattedError);
    console.error('-- Request');
    console.error(JSON.stringify(context.request || {}, null, 2));
    console.error('-- Response');
    console.error(JSON.stringify(context.response || {}, null, 2));
    console.error('=== ERROR BLOCK END ===');
    console.error('');
    console.error('');
  }

  /**
   * Classify errors for better tracking and alerting
   */
  classifyError(error, context) {
    const errorMessage = error.message?.toLowerCase() || '';
    const errorName = error.name?.toLowerCase() || '';
    
    // Database errors
    if (errorMessage.includes('duplicate key') || errorMessage.includes('e11000')) {
      return 'duplicate_data_error';
    }
    if (errorMessage.includes('validation failed') || errorMessage.includes('cast error')) {
      return 'validation_error';
    }
    if (errorMessage.includes('connection') || errorMessage.includes('timeout')) {
      return 'database_connection_error';
    }
    
    // Authentication errors
    if (errorMessage.includes('unauthorized') || errorMessage.includes('invalid token')) {
      return 'authentication_error';
    }
    if (errorMessage.includes('permission') || errorMessage.includes('forbidden')) {
      return 'authorization_error';
    }
    
    // External API errors
    if (errorMessage.includes('plaid') || errorMessage.includes('api')) {
      return 'external_api_error';
    }
    if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
      return 'network_error';
    }
    
    // Encryption errors
    if (errorMessage.includes('encryption') || errorMessage.includes('decrypt')) {
      return 'encryption_error';
    }
    
    // Default classification
    return 'general_error';
  }

  /**
   * Log successful operations
   */
  logSuccess(operation, context = {}) {
    const logData = {
      timestamp: new Date().toISOString(),
      operation,
      status: 'success',
      durationMs: context.durationMs,
      ...context
    };
    
    console.log('✅ Success:', JSON.stringify(logData, null, 2));
  }

  /**
   * Log operation start
   */
  logOperationStart(operation, context = {}) {
    const logData = {
      timestamp: new Date().toISOString(),
      operation,
      status: 'started',
      ...context
    };
    
    console.log('🚀 Operation started:', JSON.stringify(logData, null, 2));
  }

  /**
   * Log webhook events
   */
  logWebhook(webhookType, webhookCode, context = {}) {
    const logData = {
      timestamp: new Date().toISOString(),
      operation: 'webhook',
      webhook_type: webhookType,
      webhook_code: webhookCode,
      ...context
    };
    
    console.log('🔗 Webhook:', JSON.stringify(logData, null, 2));
  }

  /**
   * Log encryption operations
   */
  logEncryptionOperation(operation, success, context = {}) {
    const logData = {
      timestamp: new Date().toISOString(),
      operation: `encryption_${operation}`,
      status: success ? 'success' : 'failed',
      ...context
    };
    
    console.log(success ? '🔐 Encryption success:' : '❌ Encryption failed:', JSON.stringify(logData, null, 2));
  }

  /**
   * Log Plaid API operations
   */
  logPlaidApi(operation, success, context = {}) {
    const logData = {
      timestamp: new Date().toISOString(),
      operation: `plaid_${operation}`,
      status: success ? 'success' : 'failed',
      ...context
    };
    
    console.log(success ? '🏦 Plaid API success:' : '❌ Plaid API failed:', JSON.stringify(logData, null, 2));
  }

  /**
   * Format error block for logging
   */
  formatErrorBlock(errorBlock) {
    return `${errorBlock.error.name}: ${errorBlock.error.message}`;
  }

  /**
   * Get error count for an operation
   */
  getErrorCount(operation) {
    return this.operationCounts.get(operation) || 0;
  }

  /**
   * Increment error count for an operation
   */
  incrementErrorCount(operation) {
    const currentCount = this.operationCounts.get(operation) || 0;
    this.operationCounts.set(operation, currentCount + 1);
  }

  /**
   * Generate error report
   */
  generateErrorReport() {
    const report = {
      timestamp: new Date().toISOString(),
      total_errors: this.errorBlocks.length,
      operations_with_errors: Object.fromEntries(this.operationCounts),
      recent_errors: this.errorBlocks.slice(-10).map(block => ({
        operation: block.operation,
        error_classification: block.error_classification,
        timestamp: block.timestamp,
        message: block.error.message
      })),
      error_classifications: this.getErrorClassifications()
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