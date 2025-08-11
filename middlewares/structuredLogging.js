const structuredLogger = require('../lib/structuredLogger.js');

// Ensure structuredLogger is available
if (!structuredLogger) {
  throw new Error('structuredLogger not imported correctly');
}

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

  res.status = function(code) {
    res.statusCode = code;
    return originalStatus.call(this, code);
  };

  // Add cleanup on request end
  req.on('end', () => {
    const durationMs = Date.now() - startTime;
    if (durationMs > 5000) { // Log slow requests
      structuredLogger.logErrorBlock(new Error('Slow request detected'), {
        operation: req.route?.path || req.path,
        request_id: requestId,
        durationMs,
        error_classification: 'performance_warning'
      });
    }
  });

  next();
};

/**
 * Error handling middleware for structured logging
 */
const errorHandlingMiddleware = (error, req, res, next) => {
  const durationMs = Date.now() - (req.startTime || Date.now());
  
  structuredLogger.logErrorBlock(error, {
    operation: req.route?.path || req.path,
    request_id: req.requestId,
    request: req,
    response: {
      statusCode: res.statusCode || 500,
      headers: res.getHeaders ? res.getHeaders() : {},
      body: error.message
    },
    durationMs,
    error_classification: 'unhandled_error'
  });

  // Send error response
  res.status(500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
};

/**
 * Cleanup middleware to remove old request contexts
 */
const cleanupMiddleware = (req, res, next) => {
  // Clean up old request contexts periodically
  if (Math.random() < 0.01) { // 1% chance to run cleanup
    structuredLogger.cleanupOldErrors();
  }
  next();
};

module.exports = {
  structuredLoggingMiddleware,
  errorHandlingMiddleware,
  cleanupMiddleware
}; 