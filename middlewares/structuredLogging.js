import structuredLogger from '../lib/structuredLogger.js';

const SENSITIVE_RESPONSE_HEADERS = ['authorization', 'cookie', 'x-api-key'];
const MAX_RESPONSE_BODY_LENGTH = 1000; // make configurable if needed

function sanitizeHeaders(headers) {
  return Object.entries(headers).reduce((out, [key, value]) => {
    out[key] = SENSITIVE_RESPONSE_HEADERS.includes(key.toLowerCase())
      ? '[REDACTED]'
      : value;
    return out;
  }, {});
}

function truncateBody(body, maxLength) {
  if (body.length <= maxLength) return body;
  return body.slice(0, maxLength) + '... [truncated]';
}

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
      headers: sanitizeHeaders(res.getHeaders()),
      body: truncateBody(
        typeof data === 'string' ? data : JSON.stringify(data),
        MAX_RESPONSE_BODY_LENGTH
      )
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
      headers: sanitizeHeaders(res.getHeaders()),
      body: truncateBody(JSON.stringify(data), MAX_RESPONSE_BODY_LENGTH)
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
  // Try to get existing requestId or create a new one
  let requestId = req.requestId;
  if (!requestId) {
    // Search through existing contexts
    for (const [id, context] of structuredLogger.requestContext) {
      if (context.request === req) {
        requestId = id;
        break;
      }
    }
  }
  
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
const CLEANUP_PROBABILITY = process.env.LOG_CLEANUP_PROBABILITY || 0.01;

const cleanupMiddleware = (req, res, next) => {
  // Clean up old error blocks periodically
  if (Math.random() < CLEANUP_PROBABILITY) {
    structuredLogger.cleanupOldErrors();
  }

  next();
};

export {
  structuredLoggingMiddleware,
  errorHandlingMiddleware,
  cleanupMiddleware
}; 