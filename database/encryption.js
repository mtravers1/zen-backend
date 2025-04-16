import dotenv from "dotenv";
import { LimitedMap } from "../lib/limitedMap.js";
import { KeyManagementServiceClient } from "@google-cloud/kms";
import { Storage } from "@google-cloud/storage";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { dirname } from "path";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

const kmsClient = new KeyManagementServiceClient({
  credentials: {
    type: "service_account",
    project_id: "zentavos-d6c79",
    private_key_id: "5ac3a8fd5bdea5e2d50ab44be7abb202378b6387",
    private_key:
      "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCc6QdM+FsT2ltA\nKovZIjX2qPjgwjr5ucdrNlTKz7/MG7lmR+PNWHqpy8TPwMmx8aD7UV6sUkaQpeRW\nGpxZKtz+ygy3G4/zRbajZLFmTDWUEjkK0Kq4bt+J9Rx7Oqe1SdCLc+Jl+bgsBAOt\nkYBYGhldfhZtegc5TgA6MrTNuKbUvqV3XvN5Wh2tZdWNZxEZV+Nmv9V19HtuTH++\nrzNRZi/UzOCmAHtalLrx+pHFHoywVQILJ/gP+6rJLv8qABVWZI4sqMcVw5XxXJEW\nf+cg5sIhRiRSDFF6eeD+VbonfhPdTixtkTPw0axR0COM2VERnGf+u7jack/H2E3J\nke3rjG3nAgMBAAECggEAAWEK72I/aq1AoA+/qujiEIjrpw4N9qPrXMXdeOrahLC5\nsGxxVByy90sTL8BCBY5aG9tbOah/dkX++8LAHQiDaLnd4r4bRcgXEtiPtpZ04hhG\n6BFtbrGKxWuiFHMvhihf7NnX442OUNS4M45T0nJoRqoVCGFKLvbAicJoVGaLENOY\nmFkhe51dTX0dp8/k8yM2bozCMXaMtRLmS/GyWlUfag/wpm1GSy7mNBsx375ygtpL\nkaWgVTcswsYlEeLfwZuwJMRrljsMRLM9Fk3eRZ0hDM+KRLdC18YR48zV/7bJr9Ef\nYU6ubfpJ8CkjB6JMPmwZDK1Ku7Hh0Qe3/eg1rpL8AQKBgQDXxE1Gi6KN1FYcU3Er\nZsZeX9oSH50hdVoVDolTrhzA4CsQQNyCe3AKKvv4PmxySFNZdKrYCtQKXL+TZO+3\n+Se9EF1DOOVumSjSrUipFFE8HsDyqb1ho0M4MQqZy9Xd4v22nfXBrcSPqgAGWzDF\ndfc+3SsPKYBdavA6HVdZiVZtiQKBgQC6KzDcmOVgW4rFQikdPSm2BXrEIK1/eR8k\nF0MTLi/EprJi5hAYqw69qe24OFSoDPs/uYNbM5iGqyTS3fpNJl+YBO7py7JgWGvW\nnTxR1b06eyWabr1a77JdTdwax8B6J0m0uyKsortfH1XOoRF9ENOeHr8lsnMNg1XY\nSJVt0CMT7wKBgErdBn7qpg0V1obfgM2xTDSkh1Jwe6GHSSkzMPzC1aEqZmauSpRP\nZfFxNpnMdu40IA9SxpBNOYMa6TGn/PDVVy9nRSS00g5Mv/hRPXvE2+bDOOk5ccc1\n0XXmtinkqqDhSGybZBC+TQwXzQhnjYWFx7KdJHqPSMWg/Bb95TfgygcZAoGAYurs\nDWpYBjjdpS4gNl73OLX0ox1R0neC6mRJyXky/GQuSIpBZzoMnQ4bN1UG9jvfi96A\nQwdJNdTdvgUgJ7oJ9PY6E5Od9b9FnUTydfEBmH8yXboVdqoBtb3XA4u7Y6xYZ2U/\naUcWE9bMevvuFOvJ5SwlGFyW8UklZcQ7UZvT55UCgYBxq7U2zq0PrBkp6kfH1ToP\nnvK3zEInE7HqfXWLfDmHQnItGO9CDC+eaQMLV0FojGdrAV5AdOYODG1EG3DJVRpR\n0Qi6c1qY2avq3lB+p+Pv8clor4UKOd5SoYjRCm39KE9gJdFEGbMWItHAb1idBBYo\n+dY5YQwiMINfKHzKPwqZow==\n-----END PRIVATE KEY-----\n",
    client_email: "bucket-key@zentavos-d6c79.iam.gserviceaccount.com",
    client_id: "118279106875179486612",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url:
      "https://www.googleapis.com/robot/v1/metadata/x509/bucket-key%40zentavos-d6c79.iam.gserviceaccount.com",
    universe_domain: "googleapis.com",
  },
});

const storagePath = path.join(__dirname, "../GcpKey.json");
const storage = new Storage({
  credentials: {
    type: "service_account",
    project_id: "zentavos-d6c79",
    private_key_id: "24978c4e7ffff262c73c88f0a625e74dfa1f8dbd",
    private_key:
      "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCWnQNWbrHeEEwX\nLYRgr8iPwqIIrYoQ446/dR/hMPPetXtt5cJfMmPVLV2PQmpZU016r9txVT4bDtLJ\n0aLc6C0BecyyoFlXak66dloz5LSKogkt1DCwQmRKoeDK5ZB3NcYqemFj+csF86Qw\nVHi1agu/dLyp2kYpC7j4VOzhK/fsoOtNDPOkRn5ozFVID37dSmlfC2LJJ71h26S2\n7hOd0bmMtM1f7q8nNOkHAm/Us1SYd7oqgD0uh5F+re6pQJRDB/pz3xtiOOFqFjPi\n1t6gr4HlBkKZIPtLF916x+Pd7MVyk6xP0zNU63GDhvZCDajftZPNYSOG3p1EVBtA\nRhpsYNd7AgMBAAECggEAAc2BOm89k5JYJ4pxbvanT7an4YSO+LPXIPLm9hJkP2yW\n8vkO5H5qzk9ep3QYtZFGnTaNcHVWZRqq+Cw0dJ1zfQ/1NBVbxpW8LfXRVVcp/f5i\njK5Rxfav5jvhlV8LjF8SBniXWOUi7xtoz692yjtIyq7yV5VV0PRKUIscxutwu8Dc\nF0KeePndfKbDnNk6rGD0FLJkyk6inoXuOtYJJiq0xhzetMYyG1nUoGlwKx9dZAMz\nPa/yCCY3uFu4GGzMQVO54kfms0qdo8q35kIAyG6Nhqu/MrmrEGdIvN12g6mbyPXj\nOGsSFaSDMpsTQWjylr+lCJCFjzu63gVax9UO7ucAgQKBgQDH0+HLD45xDZrNX4Dz\nFjGjOMBTJKKGsxM06xx66Gk9gCEPS7LCGzLTT12AZ+ybxvPizpiXMcLSD2eROnUy\n1VxgyjX6qwbDxKyiGb1fJ5LJwUH1g03h02C3xpPxTpJYpZjszZuuvkTVvncdI2BJ\nFgzbaGAFOceUSY3yfQS4K4CMgQKBgQDA84oxcL6+l5wIJqn3hrhrsoChfnxRRJhM\nBgUONjWeT3nY2M55ohbUgJB3wlUxcaXd5yUjTwA8MYGVIH72G7VwxKJ7vQVwQIxJ\nrOhD9eoncfn5QfHnfQLgzkUcN6Tu91fqbCcbDd6cBJnLiqvuQ3LxrKoINEq/hhyI\neE6ta5CV+wKBgFtbSR1W7V5OQ/mksgVwnhzrMzJPy2YdtKg63PhsDMErNPITP5Ry\nbtggrrSnzoqheJq2rRhijZkPpd/FhBNLbEJr8CW7zwntfqdVcThxlTBcBFXEQ/T8\neHlMdhKaQ1n3y2Rn08ceAcZen4JYzApd5F7i5xM8iTwILLcx5Nh2Ov0BAoGBAKsw\nJ75/miv81OmCbC/5LewXPfqJ/wAXTMu+V4PpYp7nQmK60E2oGntE6WfnWbB5dUCw\nUAnIkJvXDHHjl+EAanT3cHU6GfYivpSrPJL3PlzqyW51LItGJWSQfU5wq/t8JVsN\nw5BEOOnRRyYIDUxiOTvkBiMrSdoswWnu21cPZQM7AoGACLcQoJgRAPQ0RKFYoghq\nEWz0rd+opwsfCzGNdti74GQ9LCdGC+8yPld3UjV+eQhRbgWao+D8yKNvLlKoq+5c\nYGURUsKdSShWy2sTM1rvtGQim90lJHfGel29xxjDY69jvyDS/sZQ4Gbz3QosF/Qj\nmLKxxwRvKbzZCjUO/LU2l9U=\n-----END PRIVATE KEY-----\n",
    client_email: "storage-admin@zentavos-d6c79.iam.gserviceaccount.com",
    client_id: "117489984613438292578",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
    client_x509_cert_url:
      "https://www.googleapis.com/robot/v1/metadata/x509/storage-admin%40zentavos-d6c79.iam.gserviceaccount.com",
    universe_domain: "googleapis.com",
  },
});
const BUCKET_NAME = "zentavos-bucket";
const KEY_PATH = kmsClient.cryptoKeyPath(
  process.env.GCP_PROJECT_ID,
  process.env.GCP_KEY_LOCATION,
  process.env.GCP_KEY_RING,
  process.env.GCP_KEY_NAME
);

// DEK cache in memory
const dekCache = new LimitedMap(1000); // Limit to 1000 DEKs

async function generateAndStoreEncryptedDEK(uid) {
  const dek = crypto.randomBytes(32);

  const [encryptResponse] = await kmsClient.encrypt({
    name: KEY_PATH,
    plaintext: dek,
  });

  const encryptedDEK = encryptResponse.ciphertext;
  const file = storage.bucket(BUCKET_NAME).file(`keys/${uid}.key`);
  await file.save(encryptedDEK);

  // Cache the DEK
  dekCache.set(uid, dek);

  return dek;
}

async function getDEKFromBucket(uid) {
  const file = storage.bucket(BUCKET_NAME).file(`keys/${uid}.key`);
  if (!(await file.exists())[0]) {
    return null;
  }
  const [encryptedDEK] = await file.download();

  const [decryptResponse] = await kmsClient.decrypt({
    name: KEY_PATH,
    ciphertext: encryptedDEK,
  });

  return decryptResponse.plaintext;
}

async function getUserDek(uid) {
  try {
    // Check in-memory cache first
    if (dekCache.has(uid)) {
      return dekCache.get(uid);
    }

    let dek = await getDEKFromBucket(uid);

    if (!dek) {
      dek = await generateAndStoreEncryptedDEK(uid);
    } else {
      dekCache.set(uid, dek); // Cache it once retrieved
    }

    return dek;
  } catch (e) {
    console.error("Error getting DEK:", e);
    throw e;
  }
}

// Encrypts a value using AES-256-GCM and a provided data encryption key (DEK)
async function encryptValue(value, dek) {
  if (value === null || value === undefined) return value;

  try {
    // Convert the value to a JSON string to ensure it's properly formatted
    const jsonString = JSON.stringify(value);

    // Generate a random 16-byte initialization vector (IV)
    const iv = crypto.randomBytes(16);

    // Create an AES-256-GCM cipher using the DEK and IV
    const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);

    // Encrypt the JSON string
    const encrypted = Buffer.concat([
      cipher.update(jsonString, "utf8"),
      cipher.final(),
    ]);

    // Get the authentication tag to ensure integrity during decryption
    const tag = cipher.getAuthTag();

    // Combine IV + Auth Tag + Encrypted content, and return as base64 string
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  } catch (e) {
    console.error("Error encrypting value:", e);
    return value;
  }
}

// Decrypts a base64-encoded ciphertext using AES-256-GCM and a provided DEK
async function decryptValue(cipherTextBase64, dek) {
  if (
    cipherTextBase64 === null ||
    cipherTextBase64 === undefined ||
    cipherTextBase64 === ""
  )
    return cipherTextBase64;

  try {
    // Decode the base64-encoded ciphertext
    const cipherBuffer = Buffer.from(cipherTextBase64, "base64");

    // Extract IV (first 16 bytes), authentication tag (next 16), and encrypted content (remaining)
    const iv = cipherBuffer.slice(0, 16);
    const tag = cipherBuffer.slice(16, 32);
    const encrypted = cipherBuffer.slice(32);

    // Create a decipher using AES-256-GCM with the same DEK and IV
    const decipher = crypto.createDecipheriv("aes-256-gcm", dek, iv);

    // Set the authentication tag
    decipher.setAuthTag(tag);

    // Decrypt the content and convert it back to UTF-8 string
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");

    // Parse the decrypted JSON string and return the original value
    return JSON.parse(decrypted);
  } catch (e) {
    console.error("Error decrypting value:", e);
    return cipherTextBase64;
  }
}
export { encryptValue, decryptValue, getUserDek };
