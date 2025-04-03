import mongoose from "mongoose";
import dotenv from "dotenv";
import { MongoClient, ClientEncryption } from "mongodb";

dotenv.config();
// import initialize from './datainit.js';

const mongoDB = process.env.MONGODB_URI || "mongodb://localhost:27017";

mongoose.connect(mongoDB, {
  user: process.env.MONGODB_USER,
  pass: process.env.MONGODB_PASS,
  dbName: process.env.MONGODB_DB,
});

const mongoDBConnection = mongoose.connection;

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

const kmsProviders = {
  gcp: {
    email: process.env.GCP_EMAIL,
    privateKey: process.env.GCP_PRIVATE_KEY,
  },
};
const client = new MongoClient(mongoDB, {
  monitorCommands: true,
  autoEncryption: {
    keyVaultNamespace: "encryption.__keys",
    kmsProviders,
    bypassAutoEncryption: true,
  },
  auth: {
    username: process.env.MONGODB_USER,
    password: process.env.MONGODB_PASS,
  },
});

let db;
let dataKeyId;
let encryption;

async function connectEncryption() {
  if (!db) {
    try {
      encryption = new ClientEncryption(client, {
        keyVaultNamespace: "encryption.__keys",
        kmsProviders,
      });

      dataKeyId = await encryption.createDataKey("gcp", {
        masterKey: {
          projectId: process.env.GCP_PROJECT_ID,
          location: process.env.GCP_KEY_LOCATION,
          keyRing: process.env.GCP_KEY_RING,
          keyName: process.env.GCP_KEY_NAME,
        },
      });
    } catch (error) {
      console.error("MongoDB connection error:", error);
      throw error;
    }
  }
  return { db, client };
}

client.on("close", () => console.log("MongoDB disconnected!"));

connectEncryption();

export { encryption, dataKeyId, mongoDBConnection };
