import admin from "firebase-admin";
import dotenv from "dotenv";
import { JWT } from "google-auth-library";

dotenv.config();

const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT;
const serviceAccountJsonString = Buffer.from(
  serviceAccountBase64,
  "base64"
).toString("utf8");
const serviceAccount = JSON.parse(serviceAccountJsonString);

// Initialize Firebase Admin with new JWT constructor
const jwtClient = new JWT({
  email: serviceAccount.client_email,
  key: serviceAccount.private_key,
  scopes: ["https://www.googleapis.com/auth/firebase"],
});

admin.initializeApp({
  credential: admin.credential.cert(jwtClient),
  databaseURL: "https://zentavos.firebaseio.com",
});

export default admin;
