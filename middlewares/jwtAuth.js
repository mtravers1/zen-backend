import jwt from "jsonwebtoken";
import { unless } from "express-unless";

async function jwtAuthentication(req, res, next) {
  const authHeader = req.headers.authorization;
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  console.log(`\n🔐 [JWT AUTH ${requestId}] ====== JWT AUTHENTICATION REQUEST ======`);
  console.log(`[JWT AUTH ${requestId}] Timestamp: ${new Date().toISOString()}`);
  console.log(`[JWT AUTH ${requestId}] Request URL: ${req.url}`);
  console.log(`[JWT AUTH ${requestId}] Request method: ${req.method}`);
  console.log(`[JWT AUTH ${requestId}] Request IP: ${req.ip}`);
  console.log(`[JWT AUTH ${requestId}] User Agent: ${req.headers['user-agent']}`);
  console.log(`[JWT AUTH ${requestId}] Has authorization header: ${!!authHeader}`);
  console.log(`[JWT AUTH ${requestId}] Authorization header: ${authHeader}`);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log(`[JWT AUTH ${requestId}] ❌ No Bearer token found - returning 401`);
    return res.status(401).send("Unauthorized");
  }

  const token = authHeader.split(' ')[1];
  console.log(`[JWT AUTH ${requestId}] Token extracted: ${token ? `${token.substring(0, 20)}...` : 'null'}`);
  console.log(`[JWT AUTH ${requestId}] Token length: ${token ? token.length : 0}`);

  if (!token) {
    console.log(`[JWT AUTH ${requestId}] ❌ No token found - returning 401`);
    return res.status(401).send("Unauthorized");
  }

  try {
    console.log(`[JWT AUTH ${requestId}] 🔍 Verifying JWT token...`);
    const decoded = jwt.verify(token, process.env.SECRET);
    
    console.log(`[JWT AUTH ${requestId}] ✅ JWT token verified successfully:`, {
      userId: decoded.userId,
      email: decoded.email,
      iat: decoded.iat,
      exp: decoded.exp,
      tokenIssuedAt: new Date(decoded.iat * 1000).toISOString(),
      tokenExpiresAt: new Date(decoded.exp * 1000).toISOString(),
      tokenKeys: Object.keys(decoded)
    });
    
    // Set user info in request object (similar to Firebase auth)
    req.user = {
      uid: decoded.userId, // Use userId as uid for compatibility
      email: decoded.email,
      userId: decoded.userId
    };
    req.requestId = requestId;
    
    console.log(`[JWT AUTH ${requestId}] ✅ req.user set successfully:`, {
      uid: req.user.uid,
      email: req.user.email,
      userId: req.user.userId,
      userKeys: Object.keys(req.user)
    });
    
    next();
  } catch (error) {
    console.error(`[JWT AUTH ${requestId}] ❌ JWT token verification failed:`, {
      error: error.message,
      errorName: error.name,
      tokenLength: token ? token.length : 0,
      tokenStart: token ? token.substring(0, 50) : 'null',
      timestamp: new Date().toISOString()
    });
    return res.status(401).send("Unauthorized");
  }
}

jwtAuthentication.unless = unless;

export default jwtAuthentication;
