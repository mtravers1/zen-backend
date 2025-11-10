import firebaseAdmin from "firebase-admin";
import structuredLogger from './structuredLogger.js';

if (!firebaseAdmin.apps.length) {
  try {
    const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountBase64) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is not set.");
    }
    const serviceAccount = JSON.parse(Buffer.from(serviceAccountBase64, 'base64').toString('utf-8'));

    firebaseAdmin.initializeApp({
      credential: firebaseAdmin.credential.cert(serviceAccount),
    });
  } catch (error) {
    structuredLogger.logErrorBlock(error, { operation: "firebase-initialization" });
    process.exit(1);
  }
}

export default firebaseAdmin;