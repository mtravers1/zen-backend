import structuredLogger from '../lib/structuredLogger.js';

/**
 * Middleware to automatically capture request context and log responses
 * Follows Cursor Rules for comprehensive request/response logging
 */
const structuredLoggingMiddleware = (req, res, next) => {
  const startTime = Date.now();
  const requestId = structuredLogger.startRequestContext(req, req.route?.path || req.path);

  // Capture original response methods
  const originalSend = res.send;
  const originalJson = res.json;
  const originalStatus = res.status;

  // Override response methods to capture response data
  res.send = function(data) {
    const durationMs = Date.now() - startTime;
    const response = {
      statusCode: res.statusCode,
      headers: res.getHeaders(),
      body: typeof data === 'string' ? data : JSON.stringify(data)
    };

    // Log successful response
    if (res.statusCode < 400) {
      structuredLogger.logSuccess(req.route?.path || req.path, {
        request_id: requestId,
        durationMs,
        response
      });
    } else {
      // Log error response
      structuredLogger.logErrorBlock(new Error(`HTTP ${res.statusCode}`), {
        operation: req.route?.path || req.path,
        request_id: requestId,
        request: structuredLogger.requestContext.get(requestId)?.request,
        response,
        durationMs,
        error_classification: 'http_error'
      });
    }

    return originalSend.call(this, data);
  };

  res.json = function(data) {
    const durationMs = Date.now() - startTime;
    const response = {
      statusCode: res.statusCode,
      headers: res.getHeaders(),
      body: JSON.stringify(data)
    };

    // Log successful response
    if (res.statusCode < 400) {
      structuredLogger.logSuccess(req.route?.path || req.path, {
        request_id: requestId,
        durationMs,
        response
      });
    } else {
      // Log error response
      structuredLogger.logErrorBlock(new Error(`HTTP ${res.statusCode}`), {
        operation: req.route?.path || req.path,
        request_id: requestId,
        request: structuredLogger.requestContext.get(requestId)?.request,
        response,
        durationMs,
        error_classification: 'http_error'
      });
    }

    return originalJson.call(this, data);
  };

  // Override status to capture status changes
  res.status = function(code) {
    res.statusCode = code;
    return originalStatus.call(this, code);
  };

  // Handle uncaught errors in the middleware chain
  const originalNext = next;
  next = function(error) {
    if (error) {
      const durationMs = Date.now() - startTime;
      
      structuredLogger.logErrorBlock(error, {
        operation: req.route?.path || req.path,
        request_id: requestId,
        request: structuredLogger.requestContext.get(requestId)?.request,
        durationMs,
        error_classification: 'middleware_error'
      });
    }
    
    return originalNext.call(this, error);
  };

  next();
};

/**
 * Error handling middleware for uncaught exceptions
 */
const errorHandlingMiddleware = (error, req, res, next) => {
  const requestId = structuredLogger.requestContext.get(req.id)?.requestId;
  
  structuredLogger.logErrorBlock(error, {
    operation: req.route?.path || req.path,
    request_id: requestId,
    request: structuredLogger.requestContext.get(requestId)?.request,
    response: { statusCode: 500, body: { error: 'Internal server error' } },
    error_classification: 'uncaught_exception'
  });

  // Don't expose internal errors to client
  res.status(500).json({ 
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
};

/**
 * Cleanup middleware to remove old request contexts
 */
const cleanupMiddleware = (req, res, next) => {
  // Clean up old error blocks periodically
  if (Math.random() < 0.01) { // 1% chance to run cleanup
    structuredLogger.cleanupOldErrors();
  }
  
  next();
};

export {
  structuredLoggingMiddleware,
  errorHandlingMiddleware,
  cleanupMiddleware
}; 