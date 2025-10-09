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
  "/api/auth/own",
  "/api/auth/recoverypassword",
  "/api/auth/sendCode",
  "/api/auth/verifyCode",
  "/api/auth/resetPassword",
  "/api/auth/test",
  "/api/auth/test-existing-user",
  "/api/auth/test-encryption-consistency",

  // Info routes
  "/api/_info/version",

  // Plaid routes
  "/api/plaid/access",
  "/api/plaid/public-token",
  "/api/plaid/access-token",
  "/api/plaid/repair-token",
  "/api/plaid/accounts",
  "/api/plaid/save-token",
  "/api/plaid/check-institution-limit",
  "/api/plaid/institutions-connected",
  "/api/plaid/upfront-institution-status",
  "/api/plaid/institution-update-token",
  "/api/plaid/balance",
  "/api/plaid/institutions",
  "/api/plaid/transactions",
  "/api/plaid/detect-internal",

  // Webhook routes
  "/api/webhook/health",
  "/api/webhook/plaid",

  // Account routes
  "/api/account", // GET - getAllUserAccounts
  "/api/account/", // POST - getAccounts (with trailing slash)
  "/api/account/add-account", // POST
  "/api/account/cash-flows", // POST
  "/api/account/cash-flows-weekly", // POST
  "/api/account/cash-flows-by-plaidaccount", // POST
  "/api/account/transactions", // GET
  "/api/account/add-photo", // POST
  "/api/account/get-photo", // POST

  // Business routes
  "/api/business",
  "/api/business/", // GET/POST - getUserProfiles/addBusiness (with trailing slash)
  "/api/business/assign",
  "/api/business/unlink",
  "/api/business/assign-account",

  // Assets routes
  "/api/assets/addAsset",
  "/api/assets/getAssets",
  "/api/assets/updateAsset",
  "/api/assets/deleteAsset",

  // Permissions routes
  "/api/permissions",
  "/api/permissions/", // GET - permissions list (with trailing slash)
  "/api/permissions/check",

  // Trips routes
  "/api/trips",
  "/api/trips/", // GET/POST - getFilteredTrips/createTrip (with trailing slash)
  "/api/trips/check-limit",
  "/api/trips/lastvehicle",

  // Files routes
  "/api/files/addFile",
  "/api/files/check-limit",
  "/api/files/storage-status",
  "/api/files/add-file",
  "/api/files/get-file",
  "/api/files/add-image",
  "/api/files/delete-file",

  // AI routes
  "/api/ai",
  "/api/ai/", // POST - makeRequest (with trailing slash)
  "/api/ai/stream",
  "/api/ai/test",
  "/api/ai/requests",
  "/api/ai/health",
  "/api/ai/ping",

  // Payments routes
  "/api/payments/webhook/android",
  "/api/payments/webhook/apple",
  "/api/payments/available-plans",
  "/api/payments/process",
  "/api/payments/history",
  "/api/payments/very-receipt",
  "/api/payments/update-user-uuid",

  // Subscriptions routes
  "/api/subscriptions/plans",
  "/api/subscriptions/create",
  "/api/subscriptions/update",
  "/api/subscriptions/cancel",

  // Users routes
  "/api/users", // GET
  "/api/users/", // GET - listUsers (with trailing slash)
  "/api/users/getMyUser", // GET
  "/api/users/checkPermission", // POST

  // Security routes (admin only)
  "/api/security/stats",
  "/api/security/blacklist",
  "/api/security/emergency-stop",
  "/api/security/clear-dev-blacklist",

  // Root routes
  "/",
  "/favicon.ico",
]);

// Valid route patterns (for dynamic routes)
const VALID_ROUTE_PATTERNS = [
  /^\/api\/auth\/[a-zA-Z0-9\-_]+$/, // For DELETE /api/auth/:uid
  /^\/api\/auth\/recover-encryption-keys\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/account\/photo\/[a-zA-Z0-9\-_\.]+$/,
  /^\/api\/account\/profile-transactions\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/account\/transactions\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/account\/details\/[a-zA-Z0-9\-_]+\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/files\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/files\/getFiles\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/files\/getFolders\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/business\/profile\/update\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/business\/profile\/delete\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/trips\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/assets\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/role\/users\/[a-zA-Z0-9\-_]+\/role$/,
  /^\/api\/users\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/users\/[a-zA-Z0-9\-_]+\/method$/,
  /^\/api\/ai\/status\/[a-zA-Z0-9\-_]+$/,
  /^\/api\/ai\/cancel\/[a-zA-Z0-9\-_]+$/,
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
  const userAgent = req.get("User-Agent") || "";

  // Check if route is valid first
  const isValid = isValidRoute(path);

  // If route is invalid, handle separately from valid routes
  if (!isValid) {
    console.warn(`🚨 Invalid route access attempt: ${ip} -> ${method} ${path}`);
    console.warn(`🚨 User-Agent: ${userAgent.substring(0, 100)}`);

    // Apply strict rate limiting only to invalid routes
    if (!checkRateLimit(ip, true)) {
      console.warn(
        `🚫 Rate limit exceeded for invalid routes: ${ip} -> ${method} ${path}`
      );
      return res.status(429).json({
        error: "Too Many Requests",
        message: "IP temporarily blocked due to suspicious activity",
        retryAfter: 900, // 15 minutes
      });
    }

    // Return 404 to not reveal information about API structure
    return res.status(404).json({
      error: "Not Found",
      message: "The requested resource was not found",
    });
  }

  // For valid routes, check blacklist with exceptions for legitimate apps
  if (isBlacklisted(ip)) {
    // Check if this is a legitimate Zentavos app request
    const isLegitimateApp =
      userAgent.includes("Zentavos") ||
      userAgent.includes("CFNetwork") ||
      userAgent.includes("Darwin");

    if (
      isLegitimateApp &&
      (path.startsWith("/api/auth/") ||
        path.startsWith("/api/plaid/") ||
        path.startsWith("/api/user/"))
    ) {
      console.log(
        `✅ Allowing legitimate app request despite blacklist: ${ip} -> ${method} ${path}`
      );
      // Allow legitimate app requests to pass through
      next();
      return;
    }

    console.warn(
      `🚫 Request blocked - IP blacklisted: ${ip} -> ${method} ${path}`
    );
    return res.status(429).json({
      error: "Too Many Requests",
      message: "IP temporarily blocked due to suspicious activity",
      retryAfter: 900, // 15 minutes
    });
  }

  // Apply normal rate limiting for valid routes (more lenient)
  if (!checkRateLimit(ip, false)) {
    console.warn(`🚫 Rate limit exceeded for IP: ${ip} -> ${method} ${path}`);
    return res.status(429).json({
      error: "Too Many Requests",
      message: "Rate limit exceeded",
      retryAfter: 60,
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

/**
 * Function to clear blacklist for localhost/development IPs
 */
export function clearDevelopmentBlacklist() {
  const developmentIPs = ["::ffff:127.0.0.1", "127.0.0.1", "::1"];
  let cleared = 0;

  developmentIPs.forEach((ip) => {
    if (suspiciousIPs.delete(ip)) {
      cleared++;
      console.log(`✅ Cleared development IP from blacklist: ${ip}`);
    }
  });

  return cleared;
}
