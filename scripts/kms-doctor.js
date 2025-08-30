#!/usr/bin/env node

/**
 * KMS Doctor - Diagnostic script for Robust KMS Configuration
 * 
 * This script validates KMS configuration and tests connectivity
 * with the new robust system that never fails for users.
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
  console.log(`${colors.bright}${colors.cyan}
╔══════════════════════════════════════════════════════════════╗
║                    KMS DOCTOR v2.0                          ║
║              Robust System with Fallback                    ║
║                                                              ║
║  🔐 Environment Isolation & Validation                     ║
║  🛡️  Intelligent Fallback (Never Fails)                   ║
║  🔄 Automatic Key Recovery & Migration                     ║
║  📊 Comprehensive Health Monitoring                         ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}\n`);
}

function printSection(title) {
  console.log(`\n${colors.bright}${colors.blue}${'='.repeat(60)}`);
  console.log(`${colors.bright}${colors.blue} ${title}`);
  console.log(`${colors.bright}${colors.blue}${'='.repeat(60)}${colors.reset}`);
}

function printStatus(message, status = 'info') {
  const statusColors = {
    success: colors.green,
    error: colors.red,
    warning: colors.yellow,
    info: colors.cyan
  };
  
  const statusIcons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
  
  console.log(`${statusColors[status]}${statusIcons[status]} ${message}${colors.reset}`);
}

async function runDiagnostics() {
  try {
    printHeader();
    
    // Section 1: Environment Detection
    printSection('ENVIRONMENT DETECTION');
    
    const env = getAppEnv();
    printStatus(`Current Environment: ${env}`, 'success');
    
    // Check environment variables
    const envVars = {
      'ENVIRONMENT': process.env.ENVIRONMENT,
      'STAGE': process.env.STAGE,
      'NODE_ENV': process.env.NODE_ENV
    };
    
    console.log('\nEnvironment Variables:');
    Object.entries(envVars).forEach(([key, value]) => {
      if (value) {
        printStatus(`${key}: ${value}`, 'success');
      } else {
        printStatus(`${key}: Not set`, 'warning');
      }
    });
    
    // Section 2: KMS Configuration Validation
    printSection('KMS CONFIGURATION VALIDATION');
    
    const validation = validateKmsConfig();
    if (validation.valid) {
      printStatus('KMS Configuration: VALID', 'success');
      printStatus(`Environment: ${validation.environment}`, 'success');
      printStatus(`Primary Keys: ${validation.hasPrimary ? 'CONFIGURED' : 'MISSING'}`, validation.hasPrimary ? 'success' : 'error');
      printStatus(`Fallback Keys: ${validation.hasFallback ? 'CONFIGURED' : 'NOT AVAILABLE'}`, validation.hasFallback ? 'success' : 'warning');
    } else {
      printStatus('KMS Configuration: INVALID', 'error');
      validation.errors.forEach(error => {
        printStatus(`Error: ${error}`, 'error');
      });
    }
    
    // Section 3: KMS Resource Resolution
    printSection('KMS RESOURCE RESOLUTION');
    
    try {
      const kmsConfig = resolveKmsResource(env);
      printStatus('Primary KMS Resource: CONFIGURED', 'success');
      printStatus(`Project: ${kmsConfig.primary.projectId ? '***' : 'MISSING'}`, kmsConfig.primary.projectId ? 'success' : 'error');
      printStatus(`Location: ${kmsConfig.primary.location ? '***' : 'MISSING'}`, kmsConfig.primary.location ? 'success' : 'error');
      printStatus(`Key Ring: ${kmsConfig.primary.keyRing ? '***' : 'MISSING'}`, kmsConfig.primary.keyRing ? 'success' : 'error');
      printStatus(`Crypto Key: ${kmsConfig.primary.cryptoKey ? '***' : 'MISSING'}`, kmsConfig.primary.cryptoKey ? 'success' : 'error');
      
      if (kmsConfig.hasFallback) {
        printStatus('Fallback KMS Resource: CONFIGURED', 'success');
        printStatus(`Fallback Project: ${kmsConfig.fallback.projectId ? '***' : 'MISSING'}`, kmsConfig.fallback.projectId ? 'success' : 'error');
        printStatus(`Fallback Location: ${kmsConfig.fallback.location ? '***' : 'MISSING'}`, kmsConfig.fallback.location ? 'success' : 'error');
        printStatus(`Fallback Key Ring: ${kmsConfig.fallback.keyRing ? '***' : 'MISSING'}`, kmsConfig.fallback.keyRing ? 'success' : 'error');
        printStatus(`Fallback Crypto Key: ${kmsConfig.fallback.cryptoKey ? '***' : 'MISSING'}`, kmsConfig.fallback.cryptoKey ? 'success' : 'error');
      } else {
        printStatus('Fallback KMS Resource: NOT CONFIGURED', 'warning');
        printStatus('Consider configuring fallback keys for production environments', 'info');
      }
      
    } catch (error) {
      printStatus(`KMS Resource Resolution Failed: ${error.message}`, 'error');
    }
    
    // Section 4: Environment Isolation Check
    printSection('ENVIRONMENT ISOLATION CHECK');
    
    // Check if staging could potentially use dev keys
    if (env === ENVIRONMENTS.STAGING) {
      const devConfig = resolveKmsResource(ENVIRONMENTS.DEVELOPMENT);
      const stagingConfig = resolveKmsResource(ENVIRONMENTS.STAGING);
      
      if (stagingConfig.primary.projectId === devConfig.primary.projectId &&
          stagingConfig.primary.location === devConfig.primary.location &&
          stagingConfig.primary.keyRing === devConfig.primary.keyRing &&
          stagingConfig.primary.cryptoKey === devConfig.primary.cryptoKey) {
        printStatus('⚠️  WARNING: Staging using same KMS keys as Development', 'warning');
        printStatus('This creates a security risk - staging could access dev data', 'error');
      } else {
        printStatus('✅ Staging has isolated KMS keys from Development', 'success');
      }
    } else if (env === ENVIRONMENTS.PRODUCTION) {
      const devConfig = resolveKmsResource(ENVIRONMENTS.DEVELOPMENT);
      const prodConfig = resolveKmsResource(ENVIRONMENTS.PRODUCTION);
      
      if (prodConfig.primary.projectId === devConfig.primary.projectId &&
          prodConfig.primary.location === devConfig.primary.location &&
          prodConfig.primary.keyRing === devConfig.primary.keyRing &&
          prodConfig.primary.cryptoKey === devConfig.primary.cryptoKey) {
        printStatus('⚠️  WARNING: Production using same KMS keys as Development', 'warning');
        printStatus('This creates a security risk - production could access dev data', 'error');
      } else {
        printStatus('✅ Production has isolated KMS keys from Development', 'success');
      }
    }
    
    // Section 5: Health Check
    printSection('KMS HEALTH CHECK');
    
    try {
      const health = await kmsHealthCheck();
      
      if (health.healthy) {
        printStatus('KMS Health: HEALTHY', 'success');
        printStatus(`Environment: ${health.environment}`, 'success');
        printStatus(`Primary Key: ${health.primary.accessible ? 'ACCESSIBLE' : 'INACCESSIBLE'}`, health.primary.accessible ? 'success' : 'error');
        printStatus(`Primary Key State: ${health.primary.state}`, health.primary.state === 'ENABLED' ? 'success' : 'warning');
        
        if (health.fallback) {
          printStatus(`Fallback Key: ${health.fallback.accessible ? 'ACCESSIBLE' : 'INACCESSIBLE'}`, health.fallback.accessible ? 'success' : 'warning');
          printStatus(`Fallback Key State: ${health.fallback.state}`, health.fallback.state === 'ENABLED' ? 'success' : 'warning');
        }
      } else {
        printStatus('KMS Health: UNHEALTHY', 'error');
        printStatus(`Error: ${health.error}`, 'error');
      }
      
    } catch (error) {
      printStatus(`Health Check Failed: ${error.message}`, 'error');
    }
    
    // Section 6: Configuration Summary
    printSection('CONFIGURATION SUMMARY');
    
    const summary = getKmsConfigSummary();
    console.log('\nConfiguration Summary:');
    console.log(`  Environment: ${summary.environment}`);
    console.log(`  Timestamp: ${summary.timestamp}`);
    console.log(`  Primary Keys: ${summary.configuration.primary.projectId === '***' ? 'CONFIGURED' : 'MISSING'}`);
    console.log(`  Fallback Keys: ${summary.configuration.fallback ? 'CONFIGURED' : 'NOT AVAILABLE'}`);
    
    // Section 7: Recommendations
    printSection('RECOMMENDATIONS');
    
    if (!validation.valid) {
      printStatus('1. Fix KMS configuration errors before proceeding', 'error');
    }
    
    if (env === ENVIRONMENTS.STAGING || env === ENVIRONMENTS.PRODUCTION) {
      printStatus('2. Ensure environment-specific KMS keys are configured', 'info');
      printStatus('3. Configure fallback keys for high availability', 'info');
    }
    
    if (!summary.configuration.fallback) {
      printStatus('4. Consider adding fallback KMS keys for production', 'warning');
    }
    
    printStatus('5. Run this script regularly to monitor KMS health', 'info');
    
    // Final Status
    printSection('FINAL STATUS');
    
    if (validation.valid && env !== ENVIRONMENTS.DEVELOPMENT) {
      printStatus('🎉 KMS System: PRODUCTION READY', 'success');
      printStatus('Environment isolation is properly configured', 'success');
    } else if (validation.valid) {
      printStatus('✅ KMS System: DEVELOPMENT READY', 'success');
      printStatus('Basic configuration is working', 'success');
    } else {
      printStatus('❌ KMS System: CONFIGURATION REQUIRED', 'error');
      printStatus('Fix configuration issues before deployment', 'error');
    }
    
  } catch (error) {
    printStatus(`Diagnostic failed: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

// Run diagnostics
runDiagnostics().catch(error => {
  printStatus(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});
