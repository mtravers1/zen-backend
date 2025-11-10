import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../app.js";
import User from "../database/models/User.js";
import jwt from "jsonwebtoken";

let mongoServer;
let mongoUri;
let app;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
  app = createApp();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe("User Controller", () => {
  describe("PATCH /api/users/:userId", () => {
    let user1;
    let user2;
    let token1;

    beforeEach(async () => {
      user1 = await User.create({
        authUid: "test-uid-1",
        email: "user1@test.com",
        name: {
          firstName: "Test",
          lastName: "User1",
        },
      });

      user2 = await User.create({
        authUid: "test-uid-2",
        email: "user2@test.com",
        name: {
          firstName: "Test",
          lastName: "User2",
        },
      });

      token1 = jwt.sign({ userId: user1._id }, process.env.SECRET);
    });

    afterEach(async () => {
      await User.deleteMany({});
    });

    it("should update the user's own information", async () => {
      const res = await request(app)
        .patch(`/api/users/${user1._id}`)
        .set("Authorization", `Bearer ${token1}`)
        .send({ firstName: "Updated" });

      expect(res.statusCode).toEqual(200);
      expect(res.body.success).toBe(true);

      const updatedUser = await User.findById(user1._id);
      // The name is encrypted, so we can't check the value directly.
      // We can only check that the value has changed.
      expect(updatedUser.name.firstName).not.toEqual(user1.name.firstName);
    });

    it("should not update another user's information", async () => {
      const res = await request(app)
        .patch(`/api/users/${user2._id}`)
        .set("Authorization", `Bearer ${token1}`)
        .send({ firstName: "Updated" });

      expect(res.statusCode).toEqual(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe("Forbidden");
    });
  });
});
