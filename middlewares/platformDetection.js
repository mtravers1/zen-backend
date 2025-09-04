/**
 * Platform Detection Middleware
 *
 * Detects iOS vs Android platform from request headers
 * synchronous operation (~0.01ms)
 *
 * Usage:
 * app.post('/api/endpoint', platformDetection, controllerFunction);
 *
 * Sets req.platform to 'ios' | 'android'
 */

function detectFromUserAgent(userAgent) {
  if (!userAgent) return null;

  const ua = userAgent.toLowerCase();

  if (ua.includes("android")) return "android";
  if (ua.includes("ios") || ua.includes("iphone") || ua.includes("ipad"))
    return "ios";

  return null;
}

function platformDetection(req, res, next) {
  // Priority order:
  // 1. Explicit platform header from frontend
  // 2. User-Agent detection
  // 3. Default to iOS

  const explicitPlatform = req.headers["x-platform"];
  const userAgentPlatform = detectFromUserAgent(req.headers["user-agent"]);

  req.platform = explicitPlatform || userAgentPlatform || "ios";

  // Validate platform value
  if (req.platform !== "ios" && req.platform !== "android") {
    req.platform = "ios"; // Fallback to iOS
  }

  next();
}

export default platformDetection;
