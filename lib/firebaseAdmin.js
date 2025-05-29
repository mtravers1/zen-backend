import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();

const serviceAccountBase64 = process.env.FIREBASE_SERVICE_ACCOUNT;
const serviceAccountJsonString = Buffer.from(
  serviceAccountBase64,
  "base64"
).toString("utf8");
const serviceAccount = JSON.parse(serviceAccountJsonString);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://zentavos.firebaseio.com",
});

export default admin;
