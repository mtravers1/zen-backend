import { unless } from "express-unless";
import admin from "firebase-admin";
import jwt from "jsonwebtoken";

async function firebaseAuthentication(req, res, next) {
  const idToken = req.headers.authorization?.split("Bearer ")[1];
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  console.log(`\n🔐 [FIREBASE AUTH ${requestId}] ====== AUTHENTICATION REQUEST ======`);
  console.log(`[FIREBASE AUTH ${requestId}] Timestamp: ${new Date().toISOString()}`);
  console.log(`[FIREBASE AUTH ${requestId}] Request URL: ${req.url}`);
  console.log(`[FIREBASE AUTH ${requestId}] Request method: ${req.method}`);
  console.log(`[FIREBASE AUTH ${requestId}] Request IP: ${req.ip}`);
  console.log(`[FIREBASE AUTH ${requestId}] User Agent: ${req.headers['user-agent']}`);
  console.log(`[FIREBASE AUTH ${requestId}] Has authorization header: ${!!req.headers.authorization}`);
  console.log(`[FIREBASE AUTH ${requestId}] Authorization header: ${req.headers.authorization}`);
  console.log(`[FIREBASE AUTH ${requestId}] ID Token extracted: ${idToken ? `${idToken.substring(0, 20)}...` : 'null'}`);
  console.log(`[FIREBASE AUTH ${requestId}] Token length: ${idToken ? idToken.length : 0}`);

  if (!idToken) {
    console.log(`[FIREBASE AUTH ${requestId}] ❌ No ID token found - returning 401`);
    console.log(`[FIREBASE AUTH ${requestId}] Headers received:`, Object.keys(req.headers));
    return res.status(401).send("Unauthorized");
  }

  try {
    // First, try to verify as JWT custom token
    console.log(`[FIREBASE AUTH ${requestId}] 🔍 Trying JWT custom token verification...`);
    try {
      const decodedJWT = jwt.verify(idToken, process.env.SECRET);
      
      console.log(`[FIREBASE AUTH ${requestId}] ✅ JWT custom token verified successfully:`, {
        userId: decodedJWT.userId,
        email: decodedJWT.email,
        tokenIssuedAt: new Date(decodedJWT.iat * 1000).toISOString(),
        tokenExpiresAt: new Date(decodedJWT.exp * 1000).toISOString(),
        tokenKeys: Object.keys(decodedJWT)
      });
      
      // Set user info in request object (compatible with Firebase format)
      req.user = {
        uid: decodedJWT.userId, // Use userId as uid for compatibility
        email: decodedJWT.email,
        userId: decodedJWT.userId
      };
      req.requestId = requestId;
      
      console.log(`[FIREBASE AUTH ${requestId}] ✅ JWT req.user set successfully:`, {
        uid: req.user.uid,
        email: req.user.email,
        userId: req.user.userId,
        userKeys: Object.keys(req.user)
      });
      
      return next();
    } catch (jwtError) {
      console.log(`[FIREBASE AUTH ${requestId}] JWT verification failed, trying Firebase:`, {
        jwtError: jwtError.message,
        jwtErrorName: jwtError.name
      });
      
      // If JWT fails, try Firebase token verification
      console.log(`[FIREBASE AUTH ${requestId}] 🔍 Verifying Firebase ID token...`);
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      
      console.log(`[FIREBASE AUTH ${requestId}] ✅ Firebase token verified successfully:`, {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        tokenIssuedAt: new Date(decodedToken.iat * 1000).toISOString(),
        tokenExpiresAt: new Date(decodedToken.exp * 1000).toISOString(),
        tokenIssuer: decodedToken.iss,
        tokenAudience: decodedToken.aud,
        tokenKeys: Object.keys(decodedToken)
      });
      
      req.user = decodedToken;
      req.requestId = requestId; // Add request ID for tracking
      
      console.log(`[FIREBASE AUTH ${requestId}] ✅ Firebase req.user set successfully:`, {
        uid: req.user.uid,
        email: req.user.email,
        userKeys: Object.keys(req.user),
        hasUid: !!req.user.uid,
        uidType: typeof req.user.uid,
        uidLength: req.user.uid ? req.user.uid.length : 0
      });
      
      return next();
    }
  } catch (error) {
    console.error(`[FIREBASE AUTH ${requestId}] ❌ Both JWT and Firebase token verification failed:`, {
      error: error.message,
      errorCode: error.code,
      errorStack: error.stack,
      tokenLength: idToken ? idToken.length : 0,
      tokenStart: idToken ? idToken.substring(0, 50) : 'null',
      timestamp: new Date().toISOString()
    });
    return res.status(401).send("Unauthorized");
  }
}

firebaseAuthentication.unless = unless;

export default firebaseAuthentication;
