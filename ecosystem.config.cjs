// ecosystem.config.cjs
const { execSync } = require('child_process');

// 1. Force run version.sh (Since PM2 ignores package.json scripts)
try {
  console.log("🔄 Running version.sh...");
  execSync('./scripts/version.sh', { stdio: 'inherit' });
} catch (err) {
  console.error("⚠️  Failed to run version.sh. Proceeding...");
}

// IMPORTANT: The "name" attribute on each item in "apps" is used to identify the environment in PM2
// and needs to match the DEPLOYMENT_NAME environment variable set in the .github/workflow/zentavos.<environment>.yml
// file for the respective environment (dev, uat, prod).
// "uat" is used for the staging environment.
module.exports = {
  apps: [
    {
      name: "local",
      script: "./index.js",
      node_args: "--import instrument.js --enable-source-maps",
      env: {
        DOTENV_CONFIG_PATH: "./.env",
        PLAID_ENV: "sandbox",
      },
      error_file: "/var/log/zentavos/api-error.log",
      out_file: "/var/log/zentavos/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
    {
      name: "dev",
      script: "./index.js",
      watch: true,
      node_args: "--import ./instrument.js --enable-source-maps",
      env: {
        PLAID_ENV: "development",
      },
      error_file: "/var/log/zentavos/api-error.log",
      out_file: "/var/log/zentavos/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
    {
      name: "staging",
      script: "./index.js",
      watch: false,
      node_args: "--import ./instrument.js --enable-source-maps",
      env: {
        PLAID_ENV: "production",
      },
      error_file: "/var/log/zentavos/api-error.log",
      out_file: "/var/log/zentavos/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
    {
      name: "prod",
      script: "./index.js",
      watch: false,
      node_args: "--import ./instrument.js --enable-source-maps",
      env: {
        PLAID_ENV: "production",
      },
      error_file: "/var/log/zentavos/api-error.log",
      out_file: "/var/log/zentavos/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
  ],
};
