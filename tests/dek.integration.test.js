import dotenv from "dotenv";
dotenv.config({ path: "./.env.test" });

import request from "supertest";
import app from "../app.js";
import User from "../database/models/User.js";
import firebaseAdmin from "firebase-admin";
import mongoose from "mongoose";
import { hashEmail } from "../database/encryption.js";
import connectDB from "../database/database.js";
import { Storage } from "@google-cloud/storage";

// This test requires a separate Firebase app instance
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString("utf-8")
);
const testAdmin = firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
}, "dek-integration-test");

describe("DEK Management - New User Signup (Integration)", () => {
  let createdUserEmail;
  let createdUserPassword;
  let createdUserId;
  let createdUserAuthUid;

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    // Clean up created users from Firebase and MongoDB
    if (createdUserAuthUid) {
      try {
        await testAdmin.auth().deleteUser(createdUserAuthUid);
      } catch (error) {
        console.error("Error deleting Firebase user during cleanup:", error);
      }
    }
    if (createdUserId) {
      try {
        await User.findByIdAndDelete(createdUserId);
      } catch (error) {
        console.error("Error deleting MongoDB user during cleanup:", error);
      }
    }
    
    // Close the database connection and Firebase app
    await mongoose.connection.close();
    await testAdmin.delete();
  });

  it("should create a new DEK in the primary bucket for a new user", async () => {
    const randomString = Math.random().toString(36).substring(7);
    createdUserEmail = `test-user-${randomString}@example.com`;
    createdUserPassword = "password123";

    const userData = {
      email: createdUserEmail,
      firstName: "Integration",
      lastName: "Test",
      password: createdUserPassword,
    };

    // 1. Sign up the new user
    const signupResponse = await request(app)
      .post("/api/auth/signup")
      .send({ data: userData });

    expect(signupResponse.status).toBe(201);
    expect(signupResponse.body.success).toBe(true);
    expect(signupResponse.body.user).toBeDefined();
    createdUserId = signupResponse.body.user.id;
    createdUserAuthUid = signupResponse.body.user.authUid;

    // 2. Verify that the DEK was created in the primary bucket
    const storage = new Storage();
    const bucketName = process.env.GCS_BUCKET_NAME;
    const filePath = `keys/${createdUserId}.key`;
    const file = storage.bucket(bucketName).file(filePath);
    const [exists] = await file.exists();

    expect(exists).toBe(true);

    // 3. Sign in as the new user and verify decryption
    const signinResponse = await request(app)
      .post("/api/auth/signin")
      .send({ email: createdUserEmail, password: createdUserPassword });

    expect(signinResponse.status).toBe(200);
    expect(signinResponse.body.name.firstName).toBe(userData.firstName);
    expect(signinResponse.body.name.lastName).toBe(userData.lastName);
  }, 30000); // Increase timeout for this test
});
