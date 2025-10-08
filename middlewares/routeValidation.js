import createError from "http-errors";

/**
 * Middleware to validate only valid routes and block attacks
 */

// List of known valid routes
const VALID_ROUTES = new Set([
  // Auth routes
  "/api/auth/signup",
  "/api/auth/signin",
  "/api/auth/signin-oauth",
  "/api/auth/check-email",
  "/api/auth/check-email-firebase",
  "/api/auth/check-oauth-validation",
  "/api/auth/recoverypassword",
  "/api/auth/sendCode",
  "/api/auth/verifyCode",
  "/api/auth/resetPassword",
  "/api/auth/test-existing-user",

  // Info routes
  "/api/_info/version",

  // Plaid routes
  "/api/plaid/institutions",
  "/api/plaid/accounts",
  "/api/plaid/link-token",
  "/api/plaid/exchange-public-token",
  "/api/plaid/transactions",
  "/api/plaid/balance",

  // Webhook routes
  "/api/webhook/plaid",
  "/api/webhook/test",

  // Account routes
  "/api/account/add-photo",
  "/api/account/get-photo",
  "/api/account/profile",
  "/api/account/update",
  "/api/account/delete",

  // Business routes
  "/api/business/create",
  "/api/business/list",
  "/api/business/update",
  "/api/business/delete",

  // Assets routes
  "/api/assets/list",
  "/api/assets/create",
  "/api/assets/update",
  "/api/assets/delete",

  // Permissions routes
  "/api/permissions/list",
  "/api/permissions/check",

  // Trips routes
  "/api/trips/list",
  "/api/trips/create",
  "/api/trips/update",
  "/api/trips/delete",

  // Files routes
  "/api/files/upload",
  "/api/files/download",
  "/api/files/list",
  "/api/files/delete",

  // AI routes
  "/api/ai/ping",
  "/api/ai/chat",
  "/api/ai/analyze",

  // Payments routes
  "/api/payments/webhook/android",
  "/api/payments/webhook/apple",
  "/api/payments/available-plans",
  "/api/payments/process",
  "/api/payments/history",

  // Subscriptions routes
  "/api/subscriptions/plans",
  "/api/subscriptions/create",
  "/api/subscriptions/update",
  "/api/subscriptions/cancel",

  // Role routes
  "/api/role/list",
  "/api/role/create",
  "/api/role/update",
  "/api/role/delete",

  // Security routes (admin only)
  "/api/security/stats",
  "/api/security/blacklist",
  "/api/security/emergency-stop",

  // Root routes
  "/",
  "/favicon.ico",
]);

// Valid route patterns (for dynamic routes)
const VALID_ROUTE_PATTERNS = [
  /^\/api\/account\/photo\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/files\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/business\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/trips\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/assets\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/security\/blacklist\/[\d\.]+$/, // For DELETE /api/security/blacklist/:ip
];

// Rate limiting by IP
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100; // 100 requests per minute
const MAX_INVALID_REQUESTS = 10; // Maximum invalid requests per minute

// Temporary blacklist for suspicious IPs
const suspiciousIPs = new Map();
const BLACKLIST_DURATION = 15 * 60 * 1000; // 15 minutes

/**
 * Checks if a route is valid
 */
function isValidRoute(path) {
  // Check exact routes
  if (VALID_ROUTES.has(path)) {
    return true;
  }

  // Check dynamic route patterns
  return VALID_ROUTE_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Checks rate limiting
 */
function checkRateLimit(ip, isInvalidRoute = false) {
  const now = Date.now();
  const key = ip;

  if (!rateLimitMap.has(key)) {
    rateLimitMap.set(key, {
      requests: 1,
      invalidRequests: isInvalidRoute ? 1 : 0,
      windowStart: now,
    });
    return true;
  }

  const data = rateLimitMap.get(key);

  // Reset window if time has passed
  if (now - data.windowStart > RATE_LIMIT_WINDOW) {
    data.requests = 1;
    data.invalidRequests = isInvalidRoute ? 1 : 0;
    data.windowStart = now;
    return true;
  }

  data.requests++;
  if (isInvalidRoute) {
    data.invalidRequests++;
  }

  // Check limits
  if (data.requests > MAX_REQUESTS_PER_WINDOW) {
    return false;
  }

  if (data.invalidRequests > MAX_INVALID_REQUESTS) {
    // Add IP to temporary blacklist
    suspiciousIPs.set(ip, now + BLACKLIST_DURATION);
    console.warn(`🚨 IP ${ip} added to blacklist for suspicious attempts`);
    return false;
  }

  return true;
}

/**
 * Checks if IP is blacklisted
 */
function isBlacklisted(ip) {
  if (!suspiciousIPs.has(ip)) {
    return false;
  }

  const expiryTime = suspiciousIPs.get(ip);
  if (Date.now() > expiryTime) {
    suspiciousIPs.delete(ip);
    return false;
  }

  return true;
}

/**
 * Main route validation middleware
 */
export default function routeValidationMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const path = req.path;
  const method = req.method;

  // Check if IP is blacklisted
  if (isBlacklisted(ip)) {
    console.warn(
      `🚫 Request blocked - IP blacklisted: ${ip} -> ${method} ${path}`
    );
    return res.status(429).json({
      error: "Too Many Requests",
      message: "IP temporarily blocked due to suspicious activity",
      retryAfter: 900, // 15 minutes
    });
  }

  // Check if route is valid
  const isValid = isValidRoute(path);

  // Check rate limiting
  if (!checkRateLimit(ip, !isValid)) {
    console.warn(`🚫 Rate limit exceeded for IP: ${ip} -> ${method} ${path}`);
    return res.status(429).json({
      error: "Too Many Requests",
      message: "Rate limit exceeded",
      retryAfter: 60,
    });
  }

  // If route is invalid, log and block
  if (!isValid) {
    console.warn(`🚨 Invalid route access attempt: ${ip} -> ${method} ${path}`);
    console.warn(`🚨 User-Agent: ${req.headers["user-agent"]}`);
    console.warn(`🚨 Headers: ${JSON.stringify(req.headers)}`);

    // Return 404 to not reveal information about API structure
    return res.status(404).json({
      error: "Not Found",
      message: "The requested resource was not found",
    });
  }

  // Valid route, continue
  next();
}

/**
 * Periodic cleanup of rate limiting maps
 */
setInterval(() => {
  const now = Date.now();

  // Clean rate limit map
  for (const [key, data] of rateLimitMap.entries()) {
    if (now - data.windowStart > RATE_LIMIT_WINDOW) {
      rateLimitMap.delete(key);
    }
  }

  // Clean expired blacklist
  for (const [ip, expiryTime] of suspiciousIPs.entries()) {
    if (now > expiryTime) {
      suspiciousIPs.delete(ip);
      console.log(`✅ IP ${ip} removed from blacklist`);
    }
  }
}, 60000); // Run every minute

/**
 * Function to manually add an IP to blacklist
 */
export function blacklistIP(ip, duration = BLACKLIST_DURATION) {
  suspiciousIPs.set(ip, Date.now() + duration);
  console.warn(`🚨 IP ${ip} manually added to blacklist`);
}

/**
 * Function to remove an IP from blacklist
 */
export function removeFromBlacklist(ip) {
  if (suspiciousIPs.delete(ip)) {
    console.log(`✅ IP ${ip} removed from blacklist`);
    return true;
  }
  return false;
}

/**
 * Function to get security statistics
 */
export function getSecurityStats() {
  return {
    activeRateLimits: rateLimitMap.size,
    blacklistedIPs: Array.from(suspiciousIPs.keys()),
    rateLimitWindow: RATE_LIMIT_WINDOW,
    maxRequestsPerWindow: MAX_REQUESTS_PER_WINDOW,
    maxInvalidRequests: MAX_INVALID_REQUESTS,
  };
}
