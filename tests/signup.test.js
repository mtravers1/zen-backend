
import { jest } from "@jest/globals";
import request from "supertest";
import app from "../app.js";
import User from "../database/models/User.js";
import authService from "../services/auth.service.js";



describe("Auth Controller - Signup", () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it("should create a new user successfully", async () => {
    const userData = {
      email: "test@example.com",
      firstName: "Test",
      lastName: "User",
      password: "password123",
    };

    jest.spyOn(User, "findOne").mockResolvedValue(null);
    const firebaseUser = { uid: "fake-uid" };
    const token = "fake-token";
    const user = { id: "user-id", ...userData };

    jest.spyOn(authService, "createFirebaseUserWithEmailPassword").mockResolvedValue(firebaseUser);
    jest.spyOn(authService, "generateFirebaseToken").mockResolvedValue({ success: true, token });
    jest.spyOn(authService, "signUp").mockResolvedValue(user);

    const response = await request(app)
      .post("/api/auth/signup")
      .send({ data: userData });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.user).toEqual(user);
    expect(response.body.token).toBe(token);
    expect(response.body.message).toBe("User created successfully");
  });

  it("should return 400 if required fields are missing", async () => {
    const response = await request(app)
      .post("/api/auth/signup")
      .send({ data: {} });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe(
      "Missing required fields: email, firstName, and lastName are required"
    );
  });

  it("should return 400 if user already exists", async () => {
    const userData = {
      email: "existing@example.com",
      firstName: "Test",
      lastName: "User",
      password: "password123",
    };

    // Mock the User.findOne to return an existing user
    jest.spyOn(User, "findOne").mockResolvedValue({ email: userData.email });

    const response = await request(app)
      .post("/api/auth/signup")
      .send({ data: userData });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("User with this email already exists");
  });
});
