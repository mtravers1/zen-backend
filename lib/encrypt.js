import { encryption } from "../database/database.js";

const kmsEncrypt = async ({ value, dataKeyId }) => {
  if (!value) return value;
  if (!dataKeyId) throw new Error("Missing dataKeyId");
  let method = "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic";
  if (
    typeof value === Number ||
    typeof value === "number" ||
    typeof value === Object ||
    typeof value === "object" ||
    typeof value === Array ||
    typeof value === "array" ||
    typeof value === "boolean" ||
    typeof value === Boolean ||
    typeof value === "bson"
  ) {
    method = "AEAD_AES_256_CBC_HMAC_SHA_512-Random";
  }
  try {
    return await encryption.encrypt(value, {
      algorithm: method,
      keyId: dataKeyId,
    });
  } catch (error) {
    return value;
  }
};

const kmsDecrypt = async ({ value, dataKeyId }) => {
  if (!value) return value;
  if (!dataKeyId) throw new Error("Missing dataKeyId");
  let method = "AEAD_AES_256_CBC_HMAC_SHA_512-Deterministic";

  if (
    typeof value === Number ||
    typeof value === "number" ||
    typeof value === Object ||
    typeof value === "object" ||
    typeof value === Array ||
    typeof value === "array" ||
    typeof value === "boolean" ||
    typeof value === Boolean ||
    typeof value === "bson"
  ) {
    method = "AEAD_AES_256_CBC_HMAC_SHA_512-Random";
  }
  try {
    return await encryption.decrypt(value, {
      algorithm: method,
      keyId: dataKeyId,
    });
  } catch (error) {
    return value;
  }
};

export { kmsEncrypt, kmsDecrypt };
