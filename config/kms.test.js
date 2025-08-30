import { jest } from '@jest/globals';
import { 
  getAppEnv, 
  resolveKmsResource, 
  getKmsClient, 
  validateKmsConfig,
  kmsHealthCheck,
  getKmsConfigSummary,
  ENVIRONMENTS 
} from './kms.js';

// Mock @google-cloud/kms
jest.mock('@google-cloud/kms', () => ({
  KeyManagementServiceClient: jest.fn().mockImplementation(() => ({
    getCryptoKey: jest.fn().mockResolvedValue([{
      name: 'projects/test/locations/us/keyRings/test-ring/cryptoKeys/test-key',
      primary: { state: 'ENABLED' }
    }])
  }))
}));

describe('KMS Configuration Module', () => {
  let originalEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Clear all KMS-related environment variables
    delete process.env.ENVIRONMENT;
    delete process.env.STAGE;
    delete process.env.NODE_ENV;
    delete process.env.KMS_RESOURCE_DEVELOPMENT;
    delete process.env.KMS_RESOURCE_STAGING;
    delete process.env.KMS_RESOURCE_PRODUCTION;
    delete process.env.GCP_PROJECT_ID;
    delete process.env.GCP_KEY_LOCATION;
    delete process.env.GCP_KEY_RING;
    delete process.env.GCP_KEY_NAME;
    delete process.env.KMS_SERVICE_ACCOUNT;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    
    // Clear module cache to reset memoized values
    jest.resetModules();
  });

  describe('getAppEnv()', () => {
    test('should return development for dev variations', () => {
      const variations = ['dev', 'development', 'local'];
      
      variations.forEach(variation => {
        process.env.ENVIRONMENT = variation;
        expect(getAppEnv()).toBe(ENVIRONMENTS.DEVELOPMENT);
      });
    });

    test('should return staging for staging variations', () => {
      const variations = ['staging', 'uat', 'stg'];
      
      variations.forEach(variation => {
        process.env.ENVIRONMENT = variation;
        expect(getAppEnv()).toBe(ENVIRONMENTS.STAGING);
      });
    });

    test('should return production for production variations', () => {
      const variations = ['prod', 'production'];
      
      variations.forEach(variation => {
        process.env.ENVIRONMENT = variation;
        expect(getAppEnv()).toBe(ENVIRONMENTS.PRODUCTION);
      });
    });

    test('should use STAGE as fallback', () => {
      process.env.STAGE = 'staging';
      expect(getAppEnv()).toBe(ENVIRONMENTS.STAGING);
    });

    test('should use NODE_ENV as fallback', () => {
      process.env.NODE_ENV = 'production';
      expect(getAppEnv()).toBe(ENVIRONMENTS.PRODUCTION);
    });

    test('should default to development', () => {
      expect(getAppEnv()).toBe(ENVIRONMENTS.DEVELOPMENT);
    });

    test('should throw error for invalid environment', () => {
      process.env.ENVIRONMENT = 'invalid';
      expect(() => getAppEnv()).toThrow('[KMS] Invalid environment: "invalid"');
    });

    test('should handle case-insensitive input', () => {
      process.env.ENVIRONMENT = 'STAGING';
      expect(getAppEnv()).toBe(ENVIRONMENTS.STAGING);
    });
  });

  describe('resolveKmsResource()', () => {
    test('should use direct resource path when available', () => {
      process.env.ENVIRONMENT = 'staging';
      process.env.KMS_RESOURCE_STAGING = 'projects/staging/locations/us/keyRings/staging-ring/cryptoKeys/staging-key';
      
      const resource = resolveKmsResource();
      expect(resource).toBe('projects/staging/locations/us/keyRings/staging-ring/cryptoKeys/staging-key');
    });

    test('should fallback to atomic variables when direct path not available', () => {
      process.env.ENVIRONMENT = 'development';
      process.env.GCP_PROJECT_ID = 'dev-project';
      process.env.GCP_KEY_LOCATION = 'us';
      process.env.GCP_KEY_RING = 'dev-ring';
      process.env.GCP_KEY_NAME = 'dev-key';
      
      const resource = resolveKmsResource();
      expect(resource).toBe('projects/dev-project/locations/us/keyRings/dev-ring/cryptoKeys/dev-key');
    });

    test('should validate direct resource format', () => {
      process.env.ENVIRONMENT = 'production';
      process.env.KMS_RESOURCE_PRODUCTION = 'invalid-format';
      
      expect(() => resolveKmsResource()).toThrow('[KMS] Invalid KMS_RESOURCE_PRODUCTION format');
    });

    test('should throw error when atomic variables are missing', () => {
      process.env.ENVIRONMENT = 'staging';
      process.env.GCP_PROJECT_ID = 'staging-project';
      // Missing GCP_KEY_LOCATION, GCP_KEY_RING, GCP_KEY_NAME
      
      expect(() => resolveKmsResource()).toThrow('[KMS] Missing required environment variables for staging');
    });

    test('should prioritize ENVIRONMENT over other variables', () => {
      process.env.ENVIRONMENT = 'production';
      process.env.STAGE = 'staging';
      process.env.KMS_RESOURCE_PRODUCTION = 'projects/prod/locations/us/keyRings/prod-ring/cryptoKeys/prod-key';
      
      const resource = resolveKmsResource();
      expect(resource).toBe('projects/prod/locations/us/keyRings/prod-ring/cryptoKeys/prod-key');
    });
  });

  describe('getKmsClient()', () => {
    test('should create KMS client with service account', () => {
      process.env.KMS_SERVICE_ACCOUNT = Buffer.from(JSON.stringify({
        type: 'service_account',
        project_id: 'test-project'
      })).toString('base64');
      
      const client = getKmsClient();
      expect(client).toBeDefined();
    });

    test('should throw error when KMS_SERVICE_ACCOUNT is missing', () => {
      expect(() => getKmsClient()).toThrow('[KMS] KMS_SERVICE_ACCOUNT environment variable is required');
    });

    test('should throw error when service account is invalid JSON', () => {
      process.env.KMS_SERVICE_ACCOUNT = 'invalid-base64';
      
      expect(() => getKmsClient()).toThrow('[KMS] Failed to initialize KMS client');
    });

    test('should memoize client instance', () => {
      process.env.KMS_SERVICE_ACCOUNT = Buffer.from(JSON.stringify({
        type: 'service_account',
        project_id: 'test-project'
      })).toString('base64');
      
      const client1 = getKmsClient();
      const client2 = getKmsClient();
      
      expect(client1).toBe(client2);
    });
  });

  describe('validateKmsConfig()', () => {
    test('should return valid config when all requirements met', () => {
      process.env.ENVIRONMENT = 'development';
      process.env.GCP_PROJECT_ID = 'dev-project';
      process.env.GCP_KEY_LOCATION = 'us';
      process.env.GCP_KEY_RING = 'dev-ring';
      process.env.GCP_KEY_NAME = 'dev-key';
      process.env.KMS_SERVICE_ACCOUNT = Buffer.from(JSON.stringify({
        type: 'service_account',
        project_id: 'test-project'
      })).toString('base64');
      
      const config = validateKmsConfig();
      
      expect(config.valid).toBe(true);
      expect(config.environment).toBe(ENVIRONMENTS.DEVELOPMENT);
      expect(config.projectId).toBe('dev-project');
      expect(config.kmsResourceDisplay).toContain('projects/dev-project/');
    });

    test('should return invalid config when validation fails', () => {
      // Missing required variables
      process.env.ENVIRONMENT = 'staging';
      
      const config = validateKmsConfig();
      
      expect(config.valid).toBe(false);
      expect(config.error).toContain('Missing required environment variables');
    });

    test('should truncate resource path in production', () => {
      process.env.ENVIRONMENT = 'production';
      process.env.KMS_RESOURCE_PRODUCTION = 'projects/prod/locations/us/keyRings/prod-ring/cryptoKeys/prod-key';
      process.env.KMS_SERVICE_ACCOUNT = Buffer.from(JSON.stringify({
        type: 'service_account',
        project_id: 'test-project'
      })).toString('base64');
      
      const config = validateKmsConfig();
      
      expect(config.valid).toBe(true);
      expect(config.kmsResourceDisplay).toBe('projects/prod/...');
    });
  });

  describe('kmsHealthCheck()', () => {
    test('should not allow health checks in production', async () => {
      process.env.ENVIRONMENT = 'production';
      
      const health = await kmsHealthCheck();
      
      expect(health.allowed).toBe(false);
      expect(health.reason).toBe('Health checks not allowed in production environment');
    });

    test('should return healthy when KMS is accessible', async () => {
      process.env.ENVIRONMENT = 'development';
      process.env.GCP_PROJECT_ID = 'dev-project';
      process.env.GCP_KEY_LOCATION = 'us';
      process.env.GCP_KEY_RING = 'dev-ring';
      process.env.GCP_KEY_NAME = 'dev-key';
      process.env.KMS_SERVICE_ACCOUNT = Buffer.from(JSON.stringify({
        type: 'service_account',
        project_id: 'test-project'
      })).toString('base64');
      
      const health = await kmsHealthCheck();
      
      expect(health.healthy).toBe(true);
      expect(health.environment).toBe(ENVIRONMENTS.DEVELOPMENT);
      expect(health.keyState).toBe('ENABLED');
    });

    test('should return unhealthy when KMS is not accessible', async () => {
      process.env.ENVIRONMENT = 'staging';
      // Missing required variables
      
      const health = await kmsHealthCheck();
      
      expect(health.healthy).toBe(false);
      expect(health.error).toContain('Missing required environment variables');
    });
  });

  describe('getKmsConfigSummary()', () => {
    test('should return safe configuration summary', () => {
      process.env.ENVIRONMENT = 'development';
      process.env.GCP_PROJECT_ID = 'dev-project';
      process.env.GCP_KEY_LOCATION = 'us';
      process.env.GCP_KEY_RING = 'dev-ring';
      process.env.GCP_KEY_NAME = 'dev-key';
      
      const summary = getKmsConfigSummary();
      
      expect(summary.environment).toBe(ENVIRONMENTS.DEVELOPMENT);
      expect(summary.projectId).toBe('dev-project');
      expect(summary.kmsResourceSafe).toBe('projects/dev-project/...');
      expect(summary.configMethod).toBe('atomic');
    });

    test('should detect direct resource configuration method', () => {
      process.env.ENVIRONMENT = 'staging';
      process.env.KMS_RESOURCE_STAGING = 'projects/staging/locations/us/keyRings/staging-ring/cryptoKeys/staging-key';
      
      const summary = getKmsConfigSummary();
      
      expect(summary.configMethod).toBe('direct');
    });

    test('should handle configuration errors gracefully', () => {
      // Missing required variables
      process.env.ENVIRONMENT = 'production';
      
      const summary = getKmsConfigSummary();
      
      expect(summary.environment).toBe('unknown');
      expect(summary.error).toContain('Missing required environment variables');
    });
  });

  describe('ENVIRONMENTS constant', () => {
    test('should export correct environment values', () => {
      expect(ENVIRONMENTS.DEVELOPMENT).toBe('development');
      expect(ENVIRONMENTS.STAGING).toBe('staging');
      expect(ENVIRONMENTS.PRODUCTION).toBe('production');
    });
  });
});
