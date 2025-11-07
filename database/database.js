import mongoose from "mongoose";

const connectDB = async () => {
  try {
    const mongoDB = process.env.MONGODB_URI || "mongodb://localhost:27017";
    const user = process.env.MONGODB_USER;
    const pass = process.env.MONGODB_PASS;
    const dbName = process.env.MONGODB_DB;

    if (!user || !pass || !dbName) {
      throw new Error("Missing required MONGODB environment variables");
    }

    await mongoose.connect(mongoDB, {
      user,
      pass,
      dbName,
      serverSelectionTimeoutMS: 5000,
    });

    console.log("MongoDB connected!");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1); // Exit the process with an error
  }
};

export default connectDB;
export { mongoose }; // Export mongoose for models