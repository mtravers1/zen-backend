import structuredLogger from '../lib/structuredLogger.js';

// Ensure structuredLogger is available
if (!structuredLogger) {
  throw new Error('structuredLogger not imported correctly');
}

const SENSITIVE_RESPONSE_HEADERS = ['authorization', 'cookie', 'x-api-key'];
const MAX_RESPONSE_BODY_LENGTH = 1000; // make configurable if needed

function sanitizeHeaders(headers) {
  try {
    if (!headers || typeof headers !== 'object') {
      return {};
    }
    
    return Object.entries(headers).reduce((out, [key, value]) => {
      try {
        // Check for circular references
        if (value && typeof value === 'object' && value.constructor) {
          if (value.constructor.name === 'Socket' || value.constructor.name === 'HTTPParser') {
            out[key] = `[${value.constructor.name}_OBJECT]`;
            return out;
          }
        }
        
        out[key] = SENSITIVE_RESPONSE_HEADERS.includes(key.toLowerCase())
          ? '[REDACTED]'
          : value;
      } catch (error) {
        console.warn('[StructuredLogging] Error sanitizing header:', key, error.message);
        out[key] = '[SANITIZATION_ERROR]';
      }
      return out;
    }, {});
  } catch (error) {
    console.warn('[StructuredLogging] Error in sanitizeHeaders:', error.message);
    return { '[ERROR]': 'Failed to sanitize headers' };
  }
}

function truncateBody(body, maxLength) {
  try {
    if (typeof body === 'string') {
      if (body.length <= maxLength) return body;
      return body.slice(0, maxLength) + '... [truncated]';
    }
    
    // For objects, try to stringify safely
    if (typeof body === 'object' && body !== null) {
      try {
        const jsonString = JSON.stringify(body);
        if (jsonString.length <= maxLength) return jsonString;
        return jsonString.slice(0, maxLength) + '... [truncated]';
      } catch (stringifyError) {
        // If JSON.stringify fails, return a safe representation
        return '[OBJECT_STRINGIFY_ERROR]';
      }
    }
    
    // For other types, convert to string
    const stringBody = String(body);
    if (stringBody.length <= maxLength) return stringBody;
    return stringBody.slice(0, maxLength) + '... [truncated]';
  } catch (error) {
    console.warn('[StructuredLogging] Error in truncateBody:', error.message);
    return '[TRUNCATE_ERROR]';
  }
}

/**
 * Middleware to automatically capture request context and log responses
 * Follows Cursor Rules for comprehensive request/response logging
 */
export const structuredLoggingMiddleware = (req, res, next) => {
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
export const errorHandlingMiddleware = (error, req, res, next) => {
  const durationMs = Date.now() - (req.startTime || Date.now());
  
  // Sanitize request data to avoid circular references
  const sanitizedRequest = {
    method: req.method,
    url: req.url,
    headers: req.headers ? Object.keys(req.headers).reduce((acc, key) => {
      // Redact sensitive headers
      if (['authorization', 'cookie', 'x-api-key', 'token'].includes(key.toLowerCase())) {
        acc[key] = '[REDACTED]';
      } else {
        acc[key] = req.headers[key];
      }
      return acc;
    }, {}) : {},
    query: req.query || {},
    params: req.params || {},
    body: req.body ? (typeof req.body === 'object' ? '[BODY_OBJECT]' : String(req.body).substring(0, 200)) : null,
    ip: req.ip,
    userAgent: req.get ? req.get('User-Agent') : undefined
  };
  
  structuredLogger.logErrorBlock(error, {
    operation: req.route?.path || req.path,
    request_id: req.requestId,
    request: sanitizedRequest,
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
export const cleanupMiddleware = (req, res, next) => {
  // Clean up old request contexts periodically
  if (Math.random() < 0.01) { // 1% chance to run cleanup
    structuredLogger.cleanupOldErrors();
  }
  next();
}; 