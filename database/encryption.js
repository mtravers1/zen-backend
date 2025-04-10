import dotenv from "dotenv";
import { MongoClient, ClientEncryption } from "mongodb";
import { LimitedMap } from "../lib/limitedMap.js";

dotenv.config();

const mongoDB = process.env.MONGODB_URI || "mongodb://localhost:27017";

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

let encryption;
let cacheDataKeys = new LimitedMap(100);

export async function connectEncryption(uid) {
  if (cacheDataKeys.has(uid)) {
    return cacheDataKeys.get(uid);
  }

  try {
    if (!encryption) {
      encryption = new ClientEncryption(client, {
        keyVaultNamespace: "encryption.__keys",
        kmsProviders,
      });
    }

    if (!uid) {
      return null;
    }

    const existingKey = await client
      .db("encryption")
      .collection("__keys")
      .findOne({ keyAltNames: [uid] });

    if (existingKey) {
      cacheDataKeys.set(uid, existingKey._id);
      return existingKey._id;
    }
    const dataKeyId = await encryption.createDataKey("gcp", {
      masterKey: {
        projectId: process.env.GCP_PROJECT_ID,
        location: process.env.GCP_KEY_LOCATION,
        keyRing: process.env.GCP_KEY_RING,
        keyName: process.env.GCP_KEY_NAME,
      },
      keyAltNames: [uid],
    });

    cacheDataKeys.set(uid, dataKeyId);
    return dataKeyId;
  } catch (error) {
    console.error("MongoDB encryption setup error:", error);
    throw error;
  }
}

client.on("close", () => console.log("MongoDB disconnected!"));

export { encryption };
