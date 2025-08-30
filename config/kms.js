// config/kms.js
import { KeyManagementServiceClient } from "@google-cloud/kms";
import { getBaseConfig, getAppEnv } from "./env.js";
import { getKmsSA, getLegacyCreds } from "./serviceAccounts.js";

let _kms = null;

export function kmsClient() {
  if (_kms) return _kms;

  // Prefer SA JSON (KMS_SERVICE_ACCOUNT). If not available, use email+key.
  const kmsSA = getKmsSA();
  const legacy = getLegacyCreds();

  if (kmsSA?.client_email && legacy?.private_key) {
    _kms = new KeyManagementServiceClient({
      credentials: {
        client_email: kmsSA.client_email,
        private_key: legacy.private_key,
      },
    });
  } else if (legacy?.client_email && legacy?.private_key) {
    _kms = new KeyManagementServiceClient({
      credentials: {
        client_email: legacy.client_email,
        private_key: legacy.private_key,
      },
    });
  } else {
    // ADC/Workload Identity if configured
    _kms = new KeyManagementServiceClient();
  }
  return _kms;
}

export function resolveKmsResource() {
  const { env, PROJECT_ID, KEY_LOCATION, KEY_RING, KEY_NAME } = getBaseConfig();

  // Project: prefer GCP_PROJECT_ID; if missing, use project_id from SA
  const projectId =
    PROJECT_ID ||
    getKmsSA()?.project_id ||
    // last fallback: client_email -> extract project domain
    (getKmsSA()?.client_email || "").split("@")[1]?.split(".")[0];

  if (!projectId) {
    throw new Error("[KMS] Could not infer GCP_PROJECT_ID");
  }

  const name = `projects/${projectId}/locations/${KEY_LOCATION}/keyRings/${KEY_RING}/cryptoKeys/${KEY_NAME}`;

  // Guard-rails without creating new envs: prevent basic crossovers
  if (env === AppEnv.STAGING && /dev|development/i.test(name)) {
    throw new Error(`[KMS] STAGING pointing to DEV key: ${name}`);
  }
  if (env === AppEnv.PRODUCTION && /(dev|stag|uat)/i.test(name)) {
    throw new Error(`[KMS] PRODUCTION pointing to non-prod key: ${name}`);
  }
  return name;
}
