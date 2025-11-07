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
// Initialize a separate Firebase app for this test
const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, "base64").toString("utf-8")
);
const testAdmin = firebaseAdmin.initializeApp({
  credential: firebaseAdmin.credential.cert(serviceAccount),
}, "integration-test-2");

describe("Auth Controller - Signup (Integration)", () => {
  let createdUserEmail;

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    // Clean up the created user from Firebase and MongoDB
    if (createdUserEmail) {
      try {
        const user = await testAdmin.auth().getUserByEmail(createdUserEmail);
        const dbUser = await User.findOne({ emailHash: hashEmail(createdUserEmail) });
        if (dbUser) {
          const createdUserId = dbUser._id.toString();
          try {
            const storage = new Storage();
            const bucketName = process.env.GCS_BUCKET_NAME;
            const filePath = `keys/${createdUserId}.key`;
            await storage.bucket(bucketName).file(filePath).delete({ ignoreNotFound: true });
          } catch (error) {
            console.error("Error deleting DEK file during cleanup:", error);
          }
        }
        await testAdmin.auth().deleteUser(user.uid);
        await User.deleteOne({ emailHash: hashEmail(createdUserEmail) });
      } catch (error) {
        console.error("Error during cleanup:", error);
      }
    }
    // Close the database connection and Firebase app
    await mongoose.connection.close();
    await testAdmin.delete();
  });

  it("should create a new user in Firebase and MongoDB", async () => {
    const randomString = Math.random().toString(36).substring(7);
    createdUserEmail = `test-user-${randomString}@example.com`;

    const userData = {
      email: createdUserEmail,
      firstName: "Integration",
      lastName: "Test",
      password: "password123",
    };

    const response = await request(app)
      .post("/api/auth/signup")
      .send({ data: userData });

    // Check for a successful response
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.user).toBeDefined();
    expect(response.body.token).toBeDefined();
    expect(response.body.message).toBe("User created successfully");

    // Verify that the user was created in the database
    const dbUser = await User.findOne({ emailHash: hashEmail(createdUserEmail) });
    expect(dbUser).not.toBeNull();

    // Verify that the user was created in Firebase
    const firebaseUser = await testAdmin.auth().getUserByEmail(createdUserEmail);
    expect(firebaseUser).not.toBeNull();
  }, 30000); // Increase timeout for this test
});