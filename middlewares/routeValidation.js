import createError from "http-errors";

/**
 * Middleware to manage IP blacklisting and security stats
 * Refactored to remove manual route whitelisting.
 */

// Rate limiting by IP
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 100; // 100 requests per minute
const MAX_INVALID_REQUESTS = 10; // Maximum invalid requests per minute

// Temporary blacklist for suspicious IPs
const suspiciousIPs = new Map();
const BLACKLIST_DURATION = 15 * 60 * 1000; // 15 minutes

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
 * Main security middleware
 * Checks if IP is blacklisted before allowing request to proceed
 */
export default function routeValidationMiddleware(req, res, next) {
	const ip = req.ip || req.connection.remoteAddress;
	const path = req.path;
	const method = req.method;
	const userAgent = req.get("User-Agent") || "";

	// Check blacklist with exceptions for legitimate apps
	if (isBlacklisted(ip) && !req.user) {
		// Check if this is a legitimate Zentavos app request
		const isLegitimateApp =
			userAgent.includes("Zentavos") ||
			userAgent.includes("CFNetwork") ||
			userAgent.includes("Darwin");

		if (
			isLegitimateApp &&
			(path.startsWith("/api/auth/") ||
				path.startsWith("/api/plaid/") ||
				path.startsWith("/api/users/"))
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

	// IP is clean, continue
	next();
}

/**
 * Record an invalid request (404) to potentially ban the IP
 */
export function recordInvalidRequest(ip) {
	checkRateLimit(ip, true);
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
