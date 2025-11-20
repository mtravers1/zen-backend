import admin from "firebase-admin";
import jwt from "jsonwebtoken";
import User from "../database/models/User.js";

async function decodeUserMiddleware(req, res, next) {
  const idToken = req.headers.authorization?.split("Bearer ")[1];

  if (!idToken) {
    return next();
  }

  try {
    // This is a simplified version of the logic in firebaseAuth.js
    // It tries to verify as a JWT, then as a Firebase token.
    // It populates req.user but never sends a 401.

    // Try JWT custom token
    try {
      const decodedJWT = jwt.verify(idToken, process.env.SECRET);
      const user = await User.findById(decodedJWT.userId).lean();
      if (user) {
        req.user = {
          uid: user.authUid,
          email: decodedJWT.email,
          userId: decodedJWT.userId,
        };
        console.log(`[decodeUserMiddleware] Successfully decoded user ${req.user.uid} from JWT.`);
      }
    } catch (jwtError) {
      // If JWT fails, try Firebase ID token
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const user = await User.findOne({ authUid: decodedToken.uid }).lean();
      if (user) {
        req.user = { ...decodedToken, userId: user._id.toString() };
        console.log(`[decodeUserMiddleware] Successfully decoded user ${req.user.uid} from Firebase token.`);
      }
    }
  } catch (error) {
    // If any token verification fails, just ignore it and proceed without a user.
    // The downstream firebaseAuth middleware will catch and handle the invalid token for protected routes.
    console.warn(`[decodeUserMiddleware] Could not decode token: ${error.message}`);
  }

  return next();
}

export default decodeUserMiddleware;
