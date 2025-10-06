import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

console.log("🔥 Initializing Firebase Admin...");

// Check if service account is available
const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT;
console.log(
  "🔥 FIREBASE_SERVICE_ACCOUNT length:",
  serviceAccountBase64?.length || 0
);

if (!serviceAccountBase64) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is not set");
}

let serviceAccount;
try {
  const serviceAccountJsonString = Buffer.from(
    serviceAccountBase64,
    "base64"
  ).toString("utf8");
  serviceAccount = JSON.parse(serviceAccountJsonString);

  console.log("🔥 Service account parsed successfully");
  console.log("🔥 Project ID:", serviceAccount.project_id);
  console.log("🔥 Client email:", serviceAccount.client_email);
} catch (error) {
  console.error("🔥 Error parsing service account:", error);
  throw new Error(`Failed to parse service account: ${error.message}`);
}

// Initialize Firebase Admin with traditional method
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://zentavos.firebaseio.com",
});

console.log("🔥 Firebase Admin initialized successfully");

export default admin;
