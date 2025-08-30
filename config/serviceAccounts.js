// config/serviceAccounts.js

function parseBase64JSON(b64) {
  if (!b64) return null;
  try {
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function getKmsSA() {
  return parseBase64JSON(process.env.KMS_SERVICE_ACCOUNT);
}

export function getStorageSA() {
  return parseBase64JSON(process.env.STORAGE_SERVICE_ACCOUNT);
}

// Fallback (email + private key) if not using JSON in base64
export function getLegacyCreds() {
  const email = process.env.GCP_EMAIL?.trim();
  const key = process.env.GCP_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (email && key) return { client_email: email, private_key: key };
  return null;
}
