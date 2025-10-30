import admin from "firebase-admin";
import fs from "fs";

console.log("🔥 Initializing Firebase Admin...");

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
    console.log("🔥 Loading Firebase service account from file path...");
    try {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    const serviceAccountJson = fs.readFileSync(serviceAccountPath, "utf8");
    serviceAccount = JSON.parse(serviceAccountJson);
    console.log("🔥 Service account loaded successfully from file.");
    console.log("🔥 Project ID:", serviceAccount.project_id);
    console.log("🔥 Client email:", serviceAccount.client_email);
    } catch (error) {
    console.error("🔥 Error loading service account from file:", error);
    throw new Error(`Failed to load service account from file: ${error.message}`);
    }
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log("🔥 Loading Firebase service account from environment variable...");
    try {
        const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT;
        const serviceAccountJsonString = Buffer.from(
          serviceAccountBase64,
          "base64"
        ).toString("utf8");
        serviceAccount = JSON.parse(serviceAccountJsonString);

        console.log("🔥 Service account parsed successfully from environment variable.");
        console.log("🔥 Project ID:", serviceAccount.project_id);
        console.log("🔥 Client email:", serviceAccount.client_email);
      } catch (error) {
        console.error("🔥 Error parsing service account from environment variable:", error);
        throw new Error(`Failed to parse service account from environment variable: ${error.message}`);
      }
  } else {
    throw new Error(
      "Firebase service account not found. Please set either FIREBASE_SERVICE_ACCOUNT or FIREBASE_SERVICE_ACCOUNT_PATH environment variables."
    );
  }

// Initialize Firebase Admin with traditional method
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://zentavos.firebaseio.com",
});

console.log("🔥 Firebase Admin initialized successfully");

export default admin;
