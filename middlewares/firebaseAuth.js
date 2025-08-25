import { unless } from "express-unless";
import admin from "firebase-admin";

async function firebaseAuthentication(req, res, next) {
  const idToken = req.headers.authorization?.split("Bearer ")[1];

  console.log('[FIREBASE AUTH] ====== DEBUG ======');
  console.log('[FIREBASE AUTH] Request URL:', req.url);
  console.log('[FIREBASE AUTH] Request method:', req.method);
  console.log('[FIREBASE AUTH] Has authorization header:', !!req.headers.authorization);
  console.log('[FIREBASE AUTH] Authorization header:', req.headers.authorization);
  console.log('[FIREBASE AUTH] ID Token extracted:', idToken ? `${idToken.substring(0, 20)}...` : 'null');

  if (!idToken) {
    console.log('[FIREBASE AUTH] No ID token found - returning 401');
    return res.status(401).send("Unauthorized");
  }

  try {
    console.log('[FIREBASE AUTH] Verifying ID token...');
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    console.log('[FIREBASE AUTH] Token verified successfully:', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      tokenKeys: Object.keys(decodedToken)
    });
    
    req.user = decodedToken;
    console.log('[FIREBASE AUTH] req.user set:', {
      uid: req.user.uid,
      email: req.user.email,
      userKeys: Object.keys(req.user)
    });
    
    next();
  } catch (error) {
    console.error('[FIREBASE AUTH] Token verification failed:', error);
    return res.status(401).send("Unauthorized");
  }
}

firebaseAuthentication.unless = unless;

export default firebaseAuthentication;
