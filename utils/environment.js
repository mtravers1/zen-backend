/**
 * Environment Utilities
 * Provides helpers for normalizing and working with environment variables
 */

/**
 * Normalizes ENVIRONMENT variable to valid PRODUCT_MAPPINGS keys
 *
 * Handles multiple aliases for each environment:
 * - Development: "dev", "development", "local", "test"
 * - Staging: "stg", "uat", "staging"
 * - Production: "prod", "production"
 *
 * @param {string} rawEnv - Raw value from process.env.ENVIRONMENT (optional, defaults to process.env.ENVIRONMENT)
 * @returns {"dev" | "stg" | "prod"} - Normalized environment key
 *
 * @example
 * normalizeEnvironment("development") // returns "dev"
 * normalizeEnvironment("uat")         // returns "stg"
 * normalizeEnvironment("production")  // returns "prod"
 * normalizeEnvironment()              // returns normalized process.env.ENVIRONMENT
 */
export const normalizeEnvironment = (rawEnv = process.env.ENVIRONMENT) => {
  if (!rawEnv) {
    console.warn('⚠️ ENVIRONMENT not set. Defaulting to "dev"');
    return "dev";
  }

  const env = rawEnv.toLowerCase().trim();

  // Development aliases (including "test" for testing environments)
  if (["dev", "development", "local", "test"].includes(env)) {
    return "dev";
  }

  // Staging/UAT aliases
  if (["stg", "uat", "staging"].includes(env)) {
    return "stg";
  }

  // Production aliases
  if (["prod", "production"].includes(env)) {
    return "prod";
  }

  // Unknown value - log warning and default to dev for safety
  console.warn(`⚠️ Unknown ENVIRONMENT value: "${rawEnv}". Defaulting to "dev"`);
  return "dev";
};
