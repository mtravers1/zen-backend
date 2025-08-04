import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();
// import initialize from './datainit.js';

const mongoDB = process.env.MONGODB_URI || "mongodb://localhost:27017";

let mongoDBConnection = null;

// Only connect automatically if not in test environment
if (process.env.NODE_ENV !== 'test') {
  mongoose.connect(mongoDB, {
    user: process.env.MONGODB_USER,
    pass: process.env.MONGODB_PASS,
    dbName: process.env.MONGODB_DB,
  });

  mongoDBConnection = mongoose.connection;

  mongoDBConnection.on(
    "error",
    console.error.bind(console, "MongoDB connection error:")
  );
  mongoDBConnection.once("open", async function () {
    console.log("Connected to MongoDB!");

    // await initialize();
  });

  mongoDBConnection.on("disconnected", function () {
    console.log("MongoDB disconnected!");
  });
} else {
  // For test environment, just set the connection
  mongoDBConnection = mongoose;
}

export { mongoDBConnection, mongoose };
