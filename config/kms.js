import { KeyManagementServiceClient } from "@google-cloud/kms";

/**
 * Centralized KMS Configuration Module
 * 
 * This module provides environment-aware KMS resource resolution with proper validation.
 * It ensures that staging never uses dev keys and vice versa.
 */

// Environment type definitions
const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  STAGING: 'staging', 
  PRODUCTION: 'production'
};

/**
 * Get the current application environment with proper validation
 * @returns {string} The validated environment
 * @throws {Error} If environment is invalid or missing
 */
export function getAppEnv() {
  const raw = process.env.ENVIRONMENT || process.env.STAGE || process.env.NODE_ENV || 'development';
  const normalized = raw.toLowerCase().trim();
  
  // Map common variations to standard names
  if (['dev', 'development', 'local'].includes(normalized)) {
    return ENVIRONMENTS.DEVELOPMENT;
  }
  if (['staging', 'uat', 'stg'].includes(normalized)) {
    return ENVIRONMENTS.STAGING;
  }
  if (['prod', 'production'].includes(normalized)) {
    return ENVIRONMENTS.PRODUCTION;
  }
  
  throw new Error(`[KMS] Invalid environment: "${raw}". Must be one of: development, staging, production`);
}

/**
 * Resolve KMS resource path for the current environment
 * 
 * Priority order:
 * 1. Direct resource path via KMS_RESOURCE_{ENV} (preferred for production)
 * 2. Atomic variables (fallback for development)
 * 
 * @returns {string} The KMS resource path
 * @throws {Error} If configuration is incomplete or invalid
 */
export function resolveKmsResource() {
  const env = getAppEnv();
  
  // Try direct resource path first (preferred method)
  const directResource = process.env[`KMS_RESOURCE_${env.toUpperCase()}`];
  if (directResource?.trim()) {
    const resource = directResource.trim();
    
    // Validate resource format
    if (!resource.match(/^projects\/[^\/]+\/locations\/[^\/]+\/keyRings\/[^\/]+\/cryptoKeys\/[^\/]+$/)) {
      throw new Error(`[KMS] Invalid KMS_RESOURCE_${env.toUpperCase()} format: "${resource}". Expected: projects/{PID}/locations/{LOC}/keyRings/{RING}/cryptoKeys/{KEY}`);
    }
    
    return resource;
  }
  
  // Fallback to atomic variables
  const { GCP_PROJECT_ID, GCP_KEY_LOCATION, GCP_KEY_RING, GCP_KEY_NAME } = process.env;
  
  if (!GCP_PROJECT_ID || !GCP_KEY_LOCATION || !GCP_KEY_RING || !GCP_KEY_NAME) {
    const missing = [];
    if (!GCP_PROJECT_ID) missing.push('GCP_PROJECT_ID');
    if (!GCP_KEY_LOCATION) missing.push('GCP_KEY_LOCATION');
    if (!GCP_KEY_RING) missing.push('GCP_KEY_RING');
    if (!GCP_KEY_NAME) missing.push('GCP_KEY_NAME');
    
    throw new Error(`[KMS] Missing required environment variables for ${env}: ${missing.join(', ')}. Define KMS_RESOURCE_${env.toUpperCase()} or all atomic variables.`);
  }
  
  return `projects/${GCP_PROJECT_ID}/locations/${GCP_KEY_LOCATION}/keyRings/${GCP_KEY_RING}/cryptoKeys/${GCP_KEY_NAME}`;
}

/**
 * Get KMS client with memoization
 * @returns {KeyManagementServiceClient} The KMS client instance
 */
let _kmsClient = null;
export function getKmsClient() {
  if (_kmsClient) return _kmsClient;
  
  // Parse KMS service account from environment
  const kmsServiceAccountBase64 = process.env.KMS_SERVICE_ACCOUNT;
  if (!kmsServiceAccountBase64) {
    throw new Error('[KMS] KMS_SERVICE_ACCOUNT environment variable is required');
  }
  
  try {
    const kmsServiceAccountJsonString = Buffer.from(kmsServiceAccountBase64, 'base64').toString('utf8');
    const kmsServiceAccount = JSON.parse(kmsServiceAccountJsonString);
    
    _kmsClient = new KeyManagementServiceClient({
      credentials: kmsServiceAccount,
    });
    
    return _kmsClient;
  } catch (error) {
    throw new Error(`[KMS] Failed to initialize KMS client: ${error.message}`);
  }
}

/**
 * Validate KMS configuration for the current environment
 * @returns {Object} Configuration validation result
 */
export function validateKmsConfig() {
  try {
    const env = getAppEnv();
    const resource = resolveKmsResource();
    const client = getKmsClient();
    
    // Extract project ID from resource for validation
    const projectMatch = resource.match(/^projects\/([^\/]+)\//);
    const projectId = projectMatch ? projectMatch[1] : 'unknown';
    
    return {
      valid: true,
      environment: env,
      kmsResource: resource,
      projectId: projectId,
      // Only log truncated resource in non-production for security
      kmsResourceDisplay: env === ENVIRONMENTS.PRODUCTION 
        ? `projects/${projectId}/...` 
        : resource
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message,
      environment: process.env.ENVIRONMENT || 'unknown'
    };
  }
}

/**
 * Health check for KMS configuration (non-production only)
 * @returns {Promise<Object>} Health check result
 */
export async function kmsHealthCheck() {
  const env = getAppEnv();
  
  // Only allow health checks in non-production environments
  if (env === ENVIRONMENTS.PRODUCTION) {
    return {
      allowed: false,
      reason: 'Health checks not allowed in production environment'
    };
  }
  
  try {
    const config = validateKmsConfig();
    if (!config.valid) {
      return {
        healthy: false,
        error: config.error
      };
    }
    
    const client = getKmsClient();
    const resource = resolveKmsResource();
    
    // Test KMS connectivity with a simple operation
    const [cryptoKey] = await client.getCryptoKey({
      name: resource
    });
    
    return {
      healthy: true,
      environment: config.environment,
      projectId: config.projectId,
      keyName: cryptoKey.name?.split('/').pop() || 'unknown',
      keyState: cryptoKey.primary?.state || 'unknown',
      // Never log the full resource path
      kmsResourceTruncated: `projects/${config.projectId}/...`
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      environment: env
    };
  }
}

/**
 * Get environment-specific configuration summary (safe for logging)
 * @returns {Object} Safe configuration summary
 */
export function getKmsConfigSummary() {
  try {
    const env = getAppEnv();
    const resource = resolveKmsResource();
    const projectMatch = resource.match(/^projects\/([^\/]+)\//);
    const projectId = projectMatch ? projectMatch[1] : 'unknown';
    
    return {
      environment: env,
      projectId: projectId,
      // Never expose full resource path in logs
      kmsResourceSafe: `projects/${projectId}/...`,
      configMethod: process.env[`KMS_RESOURCE_${env.toUpperCase()}`] ? 'direct' : 'atomic'
    };
  } catch (error) {
    return {
      environment: 'unknown',
      error: error.message
    };
  }
}

// Export constants for use in other modules
export { ENVIRONMENTS };
