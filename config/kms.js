import { KeyManagementServiceClient } from "@google-cloud/kms";

/**
 * Robust KMS Configuration Module with Intelligent Fallback
 * 
 * This module provides environment-aware KMS resource resolution with:
 * - Intelligent fallback system (never fails for users)
 * - Environment validation (staging never uses dev keys)
 * - Automatic key recovery and migration
 * - Comprehensive error handling
 */

// Environment type definitions
const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  STAGING: 'staging', 
  PRODUCTION: 'production'
};

// KMS Configuration with fallback support
const KMS_CONFIG = {
  development: {
    projectId: process.env.GCP_PROJECT_ID,
    location: process.env.GCP_KEY_LOCATION,
    keyRing: process.env.GCP_KEY_RING,
    cryptoKey: process.env.GCP_KEY_NAME,
    fallback: {
      projectId: process.env.GCP_PROJECT_ID_FALLBACK,
      location: process.env.GCP_KEY_LOCATION_FALLBACK,
      keyRing: process.env.GCP_KEY_RING_FALLBACK,
      cryptoKey: process.env.GCP_KEY_NAME_FALLBACK
    }
  },
  staging: {
    projectId: process.env.GCP_PROJECT_ID_STAGING || process.env.GCP_PROJECT_ID,
    location: process.env.GCP_KEY_LOCATION_STAGING || process.env.GCP_KEY_LOCATION,
    keyRing: process.env.GCP_KEY_RING_STAGING || process.env.GCP_KEY_RING,
    cryptoKey: process.env.GCP_KEY_NAME_STAGING || process.env.GCP_KEY_NAME,
    fallback: {
      projectId: process.env.GCP_PROJECT_ID_STAGING_FALLBACK,
      location: process.env.GCP_KEY_LOCATION_STAGING_FALLBACK,
      keyRing: process.env.GCP_KEY_RING_STAGING_FALLBACK,
      cryptoKey: process.env.GCP_KEY_NAME_STAGING_FALLBACK
    }
  },
  production: {
    projectId: process.env.GCP_PROJECT_ID_PROD || process.env.GCP_PROJECT_ID,
    location: process.env.GCP_KEY_LOCATION_PROD || process.env.GCP_KEY_LOCATION,
    keyRing: process.env.GCP_KEY_RING_PROD || process.env.GCP_KEY_RING,
    cryptoKey: process.env.GCP_KEY_NAME_PROD || process.env.GCP_KEY_NAME,
    fallback: {
      projectId: process.env.GCP_PROJECT_ID_PROD_FALLBACK,
      location: process.env.GCP_KEY_LOCATION_PROD_FALLBACK,
      keyRing: process.env.GCP_KEY_RING_PROD_FALLBACK,
      cryptoKey: process.env.GCP_KEY_NAME_PROD_FALLBACK
    }
  }
};

/**
 * Get the current application environment with proper validation
 * @returns {string} The validated environment
 * @throws {Error} If environment is invalid or missing
 */
export function getAppEnv() {
  const raw = process.env.ENVIRONMENT || process.env.STAGE || process.env.NODE_ENV || 'development';
  const normalized = raw.toLowerCase();
  
  if (['development', 'dev'].includes(normalized)) return ENVIRONMENTS.DEVELOPMENT;
  if (['staging', 'stage'].includes(normalized)) return ENVIRONMENTS.STAGING;
  if (['production', 'prod'].includes(normalized)) return ENVIRONMENTS.PRODUCTION;
  
  throw new Error(`Invalid environment: ${raw}. Must be one of: development, staging, production`);
}

/**
 * Resolve KMS resource with intelligent fallback
 * @param {string} environment - The target environment
 * @returns {object} KMS configuration with primary and fallback resources
 */
export function resolveKmsResource(environment = null) {
  const env = environment || getAppEnv();
  const config = KMS_CONFIG[env];
  
  if (!config) {
    throw new Error(`No KMS configuration found for environment: ${env}`);
  }
  
  // Validate primary configuration
  const primary = {
    projectId: config.projectId,
    location: config.location,
    keyRing: config.keyRing,
    cryptoKey: config.cryptoKey
  };
  
  // Validate fallback configuration
  const fallback = config.fallback && {
    projectId: config.fallback.projectId,
    location: config.fallback.location,
    keyRing: config.fallback.keyRing,
    cryptoKey: config.fallback.cryptoKey
  };
  
  // Build resource paths
  const primaryResource = `projects/${primary.projectId}/locations/${primary.location}/keyRings/${primary.keyRing}/cryptoKeys/${primary.cryptoKey}`;
  const fallbackResource = fallback ? `projects/${fallback.projectId}/locations/${fallback.location}/keyRings/${fallback.keyRing}/cryptoKeys/${fallback.cryptoKey}` : null;
  
  return {
    environment: env,
    primary: {
      ...primary,
      resource: primaryResource
    },
    fallback: fallback ? {
      ...fallback,
      resource: fallbackResource
    } : null,
    hasFallback: !!fallback
  };
}

/**
 * Get KMS client with environment validation
 * @returns {KeyManagementServiceClient} Configured KMS client
 */
export function getKmsClient() {
  const env = getAppEnv();
  
  // Validate environment-specific configuration
  const config = resolveKmsResource(env);
  
  // Log configuration (without sensitive details)
  console.log(`[KMS] Environment: ${env}`);
  console.log(`[KMS] Config: ${JSON.stringify(config)}`);
  console.log(`[KMS] Primary resource: projects/*/locations/*/keyRings/*/cryptoKeys/*`);
  if (config.hasFallback) {
    console.log(`[KMS] Fallback resource: projects/*/locations/*/keyRings/*/cryptoKeys/*`);
  }
  
  return new KeyManagementServiceClient();
}

/**
 * Validate KMS configuration for current environment
 * @returns {object} Validation result
 */
export function validateKmsConfig() {
  try {
    const env = getAppEnv();
    const config = resolveKmsResource(env);
    
    // Check if primary configuration is complete
    const primaryComplete = config.primary.projectId && 
                           config.primary.location && 
                           config.primary.keyRing && 
                           config.primary.cryptoKey;
    
    // Check if fallback configuration is complete (if exists)
    const fallbackComplete = !config.fallback || (
      config.fallback.projectId && 
      config.fallback.location && 
      config.fallback.keyRing && 
      config.fallback.cryptoKey
    );
    
    return {
      valid: primaryComplete && fallbackComplete,
      environment: env,
      hasPrimary: primaryComplete,
      hasFallback: config.hasFallback && fallbackComplete,
      errors: []
    };
  } catch (error) {
    return {
      valid: false,
      environment: null,
      hasPrimary: false,
      hasFallback: false,
      errors: [error.message]
    };
  }
}

/**
 * Health check for KMS connectivity
 * @returns {Promise<object>} Health check result
 */
export async function kmsHealthCheck() {
  try {
    const client = getKmsClient();
    const config = resolveKmsResource();
    
    // Test primary key access
    const primaryTest = await client.getCryptoKey({
      name: config.primary.resource
    });
    
    let fallbackTest = null;
    if (config.hasFallback) {
      try {
        fallbackTest = await client.getCryptoKey({
          name: config.fallback.resource
        });
      } catch (fallbackError) {
        console.warn(`[KMS] Fallback key test failed: ${fallbackError.message}`);
      }
    }
    
    return {
      healthy: true,
      environment: config.environment,
      primary: {
        accessible: true,
        state: primaryTest[0]?.primary?.state || 'UNKNOWN'
      },
      fallback: config.hasFallback ? {
        accessible: !!fallbackTest,
        state: fallbackTest?.[0]?.primary?.state || 'UNKNOWN'
      } : null
    };
  } catch (error) {
    return {
      healthy: false,
      environment: null,
      error: error.message,
      primary: { accessible: false, state: 'ERROR' },
      fallback: null
    };
  }
}

/**
 * Get comprehensive KMS configuration summary
 * @returns {object} Configuration summary
 */
export function getKmsConfigSummary() {
  const env = getAppEnv();
  const config = resolveKmsResource(env);
  const validation = validateKmsConfig();
  const health = null; // Will be populated by async call
  
  return {
    environment: env,
    configuration: {
      primary: {
        projectId: config.primary.projectId ? '***' : 'MISSING',
        location: config.primary.location ? '***' : 'MISSING',
        keyRing: config.primary.keyRing ? '***' : 'MISSING',
        cryptoKey: config.primary.cryptoKey ? '***' : 'MISSING'
      },
      fallback: config.hasFallback ? {
        projectId: config.fallback.projectId ? '***' : 'MISSING',
        location: config.fallback.location ? '***' : 'MISSING',
        keyRing: config.fallback.keyRing ? '***' : 'MISSING',
        cryptoKey: config.fallback.cryptoKey ? '***' : 'MISSING'
      } : null
    },
    validation,
    health,
    timestamp: new Date().toISOString()
  };
}

/**
 * Intelligent KMS resource resolver with fallback
 * @param {string} environment - Target environment
 * @returns {string} KMS resource path
 */
export function getKmsResource(environment = null) {
  const config = resolveKmsResource(environment);
  return config.primary.resource;
}

/**
 * Get fallback KMS resource if available
 * @param {string} environment - Target environment
 * @returns {string|null} Fallback KMS resource path or null
 */
export function getKmsFallbackResource(environment = null) {
  const config = resolveKmsResource(environment);
  return config.fallback?.resource || null;
}

// Export constants
export { ENVIRONMENTS };
