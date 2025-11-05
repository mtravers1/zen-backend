import mongoose from "mongoose";

const mongoDB = process.env.MONGODB_URI || "mongodb://localhost:27017";

let mongoDBConnection = null;

// Only connect automatically if not in test environment
if (process.env.NODE_ENV !== "test") {
  const requiredEnvVars = ["MONGODB_USER", "MONGODB_PASS", "MONGODB_DB"];
  const missingVars = requiredEnvVars.filter(
    (varName) => !process.env[varName],
  );
  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(", ")}`,
    );
  }

  mongoose.connect(mongoDB, {
    user: process.env.MONGODB_USER,
    pass: process.env.MONGODB_PASS,
    dbName: process.env.MONGODB_DB,
    serverSelectionTimeoutMS: 300000,
  });

  mongoDBConnection = mongoose.connection;

  mongoDBConnection.on(
    "error",
    console.error.bind(console, "MongoDB connection error:"),
  );
  mongoDBConnection.once("open", async function () {
    console.log("Connected to MongoDB!");

    // await initialize();
  });

  mongoDBConnection.on("disconnected", function () {
    console.log("MongoDB disconnected!");
  });
} else {
  // For test environment, use mongoose without connecting
  mongoDBConnection = {
    readyState: 1, // Mock connected state
    on: () => {},
    once: () => {},
    // Add other connection methods as needed for tests
  };
}

export { mongoDBConnection, mongoose };
