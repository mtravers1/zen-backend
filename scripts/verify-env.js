import fs from 'fs';
import path from 'path';

/**
 * Checks that all environment variables listed in .env.sample are present in the current process.env.
 * If any variables are missing, it logs a fatal error and exits the process.
 */
export function verifyEnvironmentVariables() {
  console.log('--- Verifying environment variables ---');
  const sampleEnvPath = path.join(process.cwd(), '.env.sample');

  if (!fs.existsSync(sampleEnvPath)) {
    console.error('FATAL: .env.sample file not found. Cannot verify environment.');
    process.exit(1);
  }

  const sampleContent = fs.readFileSync(sampleEnvPath, 'utf-8');
  const lines = sampleContent.split('\n');
  const missingVariables = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const variableName = trimmedLine.split('=')[0];
      if (variableName && !process.env[variableName]) {
        missingVariables.push(variableName);
      }
    }
  }

  if (missingVariables.length > 0) {
    console.error('FATAL: The following required environment variables are not set:');
    for (const v of missingVariables) {
      console.error(`- ${v}`);
    }
    console.error('Please check your environment configuration and restart.');
    process.exit(1);
  }

  console.log('--- Environment variables verified successfully ---');
}
