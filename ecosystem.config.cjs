// IMPORTANT: The "name" attribute on each item in "apps" is used to identify the environment in PM2
// and needs to match the DEPLOYMENT_NAME environment variable set in the .github/workflow/zentavos.<environment>.yml
// file for the respective environment (dev, uat, prod).
// "uat" is used for the staging environment.
module.exports = {
  apps: [
    {
      name: "local",
      script: "./bin/www.js",
      env: {
        NODE_OPTIONS: "--import ./instrument.js",
        DOTENV_CONFIG_PATH: "/Users/chris.stevens/development/zentavos-backend/.env",
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
      env: {
        NODE_OPTIONS: "--import ./instrument.js",
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
      env: {
        NODE_OPTIONS: "--import ./instrument.js",
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
      env: {
        NODE_OPTIONS: "--import ./instrument.js",
        PLAID_ENV: "production",
      },
      error_file: "/var/log/zentavos/api-error.log",
      out_file: "/var/log/zentavos/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
  ],
};
