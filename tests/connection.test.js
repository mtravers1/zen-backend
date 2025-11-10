import mongoose from "mongoose";
import connectDB from "../database/database.js";

describe("Database Connection", () => {
  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  it("should be connected to the database", () => {
    expect(mongoose.connection.readyState).toBe(1);
  });
});