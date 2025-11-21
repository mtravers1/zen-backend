
const requiredEnv = [
  'MONGODB_URI',
  'MONGODB_USER',
  'MONGODB_PASS',
  'MONGODB_DB',
  'PLAID_CLIENT_ID',
  'PLAID_SECRET',
];

console.log("--- Checking Required Environment Variables ---");
requiredEnv.forEach(key => {
  if (process.env[key]) {
    console.log(`- ${key}: set (length: ${process.env[key].length})`);
  } else {
    console.log(`- ${key}: NOT SET`);
  }
});
console.log("-------------------------------------------");

const redactEnv = (env) => {
  const sensitiveKeys = [
    'SECRET',
    'MONGODB_URI',
    'MONGODB_USER',
    'MONGODB_PASS',
    'HASH_SALT',
    'PLAID_CLIENT_ID',
    'PLAID_SECRET',
    'GCP_PRIVATE_KEY',
    'STORAGE_SERVICE_ACCOUNT',
    'KMS_SERVICE_ACCOUNT',
    'FIREBASE_API_KEY',
    'FIREBASE_SERVICE_ACCOUNT',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_PLAY_SERVICE_ACCOUNT',
    'IAP_CERTIFICATE',
    'ISSUER_ID',
    'KEY_ID',
    'APPLE_SHARED_SECRET',
    'APPLE_SANDBOX_PASSWORD',
    'GROQ_API_KEY',
    'MAIL_AUTH_PASS',
  ];
  const redactedEnv = {};
  for (const key in env) {
    if (sensitiveKeys.includes(key)) {
      redactedEnv[key] = '[REDACTED]';
    } else {
      redactedEnv[key] = env[key];
    }
  }
  return redactedEnv;
};

console.log("--- PM2 ENVIRONMENT VARIABLES ---");
console.log(redactEnv(process.env));
console.log("---------------------------------");

/**
 * Safe Application Entrypoint
 * This script performs critical pre-flight checks before loading the main application.
 * 1. It verifies that all required environment variables are present.
 * 2. If verification passes, it imports and starts the main server.
 * This prevents the application from crashing during module loading due to misconfiguration.
 */

import dotenv from 'dotenv';
dotenv.config();

import { verifyEnvironmentVariables } from './scripts/verify-env.js';

// 1. Run the environment check.
// The verifyEnvironmentVariables function will call process.exit(1) if checks fail.
verifyEnvironmentVariables();

// 2. If checks pass, start the main application.
console.log('--- Environment verified. Starting application... ---');
import('./bin/www.js');
