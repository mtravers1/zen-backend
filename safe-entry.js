console.log("--- DIAGNOSTIC: DUMPING PM2 ENVIRONMENT AND EXITING ---");
console.log(process.env);
process.exit(0);

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
