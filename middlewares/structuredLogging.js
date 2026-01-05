import structuredLogger from "../lib/structuredLogger.js";

// Ensure structuredLogger is available
if (!structuredLogger) {
  throw new Error("structuredLogger not imported correctly");
}

const SENSITIVE_RESPONSE_HEADERS = ["authorization", "cookie", "x-api-key"];
const MAX_RESPONSE_BODY_LENGTH = 1000; // make configurable if needed

const maskAuthorizationHeader = (authorization) => {
  const authorizationString = (() => {
    if (typeof authorization === "string") {
      return authorization;
    }

    if (Array.isArray(authorization)) {
      const firstString = authorization.find(
        (value) => typeof value === "string" && value.trim().length > 0,
      );
      return firstString ?? "";
    }

    if (authorization && typeof authorization === "object") {
      const possibleValue =
        authorization.value ??
        authorization.token ??
        authorization.authorization;
      return typeof possibleValue === "string" ? possibleValue : "";
    }

    return "";
  })();

  if (authorizationString.trim().length === 0) {
    return "[MASKED]";
  }

  const segments = authorizationString.trim().split(/\s+/u);
  if (segments.length === 1) {
    const token = segments[0];
    const lastFour = token.slice(-4);
    return `***${lastFour}`;
  }

  const [scheme, ...rest] = segments;
  const token = rest.join(" ");
  const lastFour = token.slice(-4);
  return `${scheme} ***${lastFour}`;
};

const sanitizeRequestHeaders = (headers) => {
  if (!headers) {
    return {};
  }
  if (typeof headers !== "object") {
    return headers;
  }

  return Object.entries(headers).reduce((acc, [key, value]) => {
    acc[key] =
      key.toLowerCase() === "authorization"
        ? maskAuthorizationHeader(value)
        : value;
    return acc;
  }, {});
};

function sanitizeHeaders(headers) {
  try {
    if (!headers || typeof headers !== "object") {
      return {};
    }

    return Object.entries(headers).reduce((out, [key, value]) => {
      try {
        // Check for circular references
        if (value && typeof value === "object" && value.constructor) {
          if (
            value.constructor.name === "Socket" ||
            value.constructor.name === "HTTPParser"
          ) {
            out[key] = `[${value.constructor.name}_OBJECT]`;
            return out;
          }
        }

        out[key] = SENSITIVE_RESPONSE_HEADERS.includes(key.toLowerCase())
          ? "[REDACTED]"
          : value;
      } catch (error) {
        console.warn(
          "[StructuredLogging] Error sanitizing header:",
          key,
          error.message,
        );
        out[key] = "[SANITIZATION_ERROR]";
      }
      return out;
    }, {});
  } catch (error) {
    console.warn(
      "[StructuredLogging] Error in sanitizeHeaders:",
      error.message,
    );
    return { "[ERROR]": "Failed to sanitize headers" };
  }
}

function truncateBody(body, maxLength) {
  try {
    if (typeof body === "string") {
      if (body.length <= maxLength) return body;
      return body.slice(0, maxLength) + "... [truncated]";
    }

    // For objects, try to stringify safely
    if (typeof body === "object" && body !== null) {
      try {
        const jsonString = JSON.stringify(body);
        if (jsonString.length <= maxLength) return jsonString;
        return jsonString.slice(0, maxLength) + "... [truncated]";
      } catch (stringifyError) {
        // If JSON.stringify fails, return a safe representation
        return "[OBJECT_STRINGIFY_ERROR]";
      }
    }

    // For other types, convert to string
    const stringBody = String(body);
    if (stringBody.length <= maxLength) return stringBody;
    return stringBody.slice(0, maxLength) + "... [truncated]";
  } catch (error) {
    console.warn("[StructuredLogging] Error in truncateBody:", error.message);
    return "[TRUNCATE_ERROR]";
  }
}

// Middleware para logging estruturado
export const structuredLoggingMiddleware = (req, res, next) => {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  req.requestId = requestId;

  // console.log(`\n📝 [REQUEST ${requestId}] ====== NEW REQUEST ======`);
  // console.log(`[REQUEST ${requestId}] Timestamp: ${new Date().toISOString()}`);
  // console.log(`[REQUEST ${requestId}] Method: ${req.method}`);
  // console.log(`[REQUEST ${requestId}] URL: ${req.url}`);
  // console.log(`[REQUEST ${requestId}] IP: ${req.ip}`);
  // console.log(
  //   `[REQUEST ${requestId}] User Agent: ${req.headers["user-agent"]}`,
  // );



  // Log query parameters if present
  if (req.query && Object.keys(req.query).length > 0) {
    console.log(`[REQUEST ${requestId}] Query Parameters:`, req.query);
  }

  // Log route parameters if present
  if (req.params && Object.keys(req.params).length > 0) {
    console.log(`[REQUEST ${requestId}] Route Parameters:`, req.params);
  }

  // Capture response details
  const originalSend = res.send;
  res.send = function (data) {
    // console.log(`[REQUEST ${requestId}] ====== RESPONSE ======`);
    // console.log(`[REQUEST ${requestId}] Status Code: ${res.statusCode}`);
    // console.log(`[REQUEST ${requestId}] Response Type: ${typeof data}`);
    // console.log(
    //   `[REQUEST ${requestId}] Response Length: ${typeof data === "string" ? data.length : data ? JSON.stringify(data).length : 0}`,
    // );

    // if (typeof data === "string" && data.length < 200) {
    //   console.log(`[REQUEST ${requestId}] Response Preview:`, data);
    // } else if (typeof data === "object" && data !== null) {
    //   console.log(`[REQUEST ${requestId}] Response Keys:`, Object.keys(data));
    // }

    // console.log(`[REQUEST ${requestId}] ====== REQUEST COMPLETE ======\n`);

    return originalSend.call(this, data);
  };

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
    headers: req.headers
      ? Object.keys(req.headers).reduce((acc, key) => {
          // Redact sensitive headers
          if (
            ["authorization", "cookie", "x-api-key", "token"].includes(
              key.toLowerCase(),
            )
          ) {
            acc[key] = "[REDACTED]";
          } else {
            acc[key] = req.headers[key];
          }
          return acc;
        }, {})
      : {},
    query: req.query || {},
    params: req.params || {},
    body: req.body
      ? typeof req.body === "object"
        ? "[BODY_OBJECT]"
        : String(req.body).substring(0, 200)
      : null,
    ip: req.ip,
    userAgent: req.get ? req.get("User-Agent") : undefined,
  };

  structuredLogger.logErrorBlock(error, {
    operation: req.route?.path || req.path,
    request_id: req.requestId,
    request: sanitizedRequest,
    response: {
      statusCode: res.statusCode || 500,
      headers: res.getHeaders ? res.getHeaders() : {},
      body: error.message,
    },
    durationMs,
    error_classification: "unhandled_error",
  });

  // Send error response
  res.status(500).json({
    message: "Internal server error",
    error:
      process.env.NODE_ENV === "development"
        ? error.message
        : "Something went wrong",
  });
};

/**
 * Cleanup middleware to remove old request contexts
 */
export const cleanupMiddleware = (req, res, next) => {
  // Clean up old request contexts periodically
  if (Math.random() < 0.01) {
    // 1% chance to run cleanup
    structuredLogger.cleanupOldErrors();
  }
  next();
};
