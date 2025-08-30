#!/usr/bin/env node

/**
 * KMS Doctor - Diagnostic script for KMS configuration
 * 
 * This script validates KMS configuration and tests connectivity
 * without exposing sensitive information like keys or plaintexts.
 * 
 * Usage: node scripts/kms-doctor.js
 */

import { 
  getAppEnv, 
  resolveKmsResource, 
  validateKmsConfig, 
  kmsHealthCheck,
  getKmsConfigSummary,
  ENVIRONMENTS 
} from '../config/kms.js';

import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function printHeader() {
  console.log(`${colors.bright}${colors.cyan}🔍 KMS Doctor - Configuration Diagnostic${colors.reset}`);
  console.log(`${colors.cyan}==========================================${colors.reset}\n`);
}

function printSection(title) {
  console.log(`${colors.bright}${colors.blue}${title}${colors.reset}`);
  console.log(`${colors.blue}${'─'.repeat(title.length)}${colors.reset}`);
}

function printSuccess(message) {
  console.log(`${colors.green}✅ ${message}${colors.reset}`);
}

function printWarning(message) {
  console.log(`${colors.yellow}⚠️  ${message}${colors.reset}`);
}

function printError(message) {
  console.log(`${colors.red}❌ ${message}${colors.reset}`);
}

function printInfo(message) {
  console.log(`${colors.blue}ℹ️  ${message}${colors.reset}`);
}

async function runDiagnostics() {
  printHeader();
  
  try {
    // 1. Environment Detection
    printSection('Environment Detection');
    const env = getAppEnv();
    printSuccess(`Detected environment: ${env}`);
    
    if (env === ENVIRONMENTS.PRODUCTION) {
      printWarning('Running in production environment - limited diagnostics available');
    }
    
    // 2. Configuration Validation
    printSection('Configuration Validation');
    const config = validateKmsConfig();
    
    if (config.valid) {
      printSuccess('KMS configuration is valid');
      printInfo(`Environment: ${config.environment}`);
      printInfo(`Project ID: ${config.projectId}`);
      printInfo(`Resource: ${config.kmsResourceDisplay}`);
    } else {
      printError(`Configuration validation failed: ${config.error}`);
      return;
    }
    
    // 3. Resource Resolution
    printSection('Resource Resolution');
    try {
      const resource = resolveKmsResource();
      printSuccess('KMS resource resolved successfully');
      
      // Extract and display safe parts
      const parts = resource.split('/');
      if (parts.length >= 6) {
        printInfo(`Project: ${parts[1]}`);
        printInfo(`Location: ${parts[3]}`);
        printInfo(`Key Ring: ${parts[5]}`);
        printInfo(`Crypto Key: ${parts[7]}`);
      }
    } catch (error) {
      printError(`Resource resolution failed: ${error.message}`);
      return;
    }
    
    // 4. KMS Health Check
    printSection('KMS Connectivity Test');
    const health = await kmsHealthCheck();
    
    if (health.allowed === false) {
      printWarning(`Health check not allowed: ${health.reason}`);
    } else if (health.healthy) {
      printSuccess('KMS connectivity test passed');
      printInfo(`Key State: ${health.keyState}`);
      printInfo(`Key Name: ${health.keyName}`);
    } else {
      printError(`KMS connectivity test failed: ${health.error}`);
    }
    
    // 5. Environment Variable Analysis
    printSection('Environment Variable Analysis');
    const summary = getKmsConfigSummary();
    
    if (summary.error) {
      printError(`Failed to get config summary: ${summary.error}`);
    } else {
      printInfo(`Configuration method: ${summary.configMethod}`);
      
      // Check for direct resource variables
      const directVars = [];
      Object.values(ENVIRONMENTS).forEach(env => {
        const varName = `KMS_RESOURCE_${env.toUpperCase()}`;
        if (process.env[varName]) {
          directVars.push(varName);
        }
      });
      
      if (directVars.length > 0) {
        printSuccess(`Direct resource variables found: ${directVars.join(', ')}`);
      } else {
        printInfo('Using atomic environment variables (GCP_PROJECT_ID, GCP_KEY_LOCATION, etc.)');
      }
      
      // Check atomic variables
      const atomicVars = ['GCP_PROJECT_ID', 'GCP_KEY_LOCATION', 'GCP_KEY_RING', 'GCP_KEY_NAME'];
      const missingAtomic = atomicVars.filter(varName => !process.env[varName]);
      
      if (missingAtomic.length === 0) {
        printSuccess('All atomic KMS variables are set');
      } else {
        printWarning(`Missing atomic variables: ${missingAtomic.join(', ')}`);
      }
    }
    
    // 6. Security Recommendations
    printSection('Security Recommendations');
    
    if (env === ENVIRONMENTS.PRODUCTION) {
      printInfo('For production environments:');
      printInfo('  • Use KMS_RESOURCE_PRODUCTION for explicit resource definition');
      printInfo('  • Avoid logging full resource paths');
      printInfo('  • Regularly rotate KMS keys');
    } else {
      printInfo('For development/staging environments:');
      printInfo('  • Consider using KMS_RESOURCE_DEVELOPMENT/KMS_RESOURCE_STAGING');
      printInfo('  • Ensure environment isolation');
      printInfo('  • Use separate KMS projects or key rings per environment');
    }
    
    console.log('\n');
    printSuccess('Diagnostic completed successfully!');
    
  } catch (error) {
    console.log('\n');
    printError(`Diagnostic failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run diagnostics if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDiagnostics().catch(error => {
    printError(`Fatal error: ${error.message}`);
    process.exit(1);
  });
}

export { runDiagnostics };
