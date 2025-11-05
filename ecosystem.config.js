// IMPORTANT: The "name" attribute on each item in "apps" is used to identify the environment in PM2
// and needs to match the DEPLOYMENT_NAME environment variable set in the .github/workflow/zentavos.<environment>.yml
// file for the respective environment (dev, uat, prod).
// "uat" is used for the staging environment.
module.exports = {
  apps: [
    {
      name: "local",
      script: "./index.js",
      watch: true,
      node_args: "--env-file=.env",
      error_file: "/var/log/zentavos/api-error.log",
      out_file: "/var/log/zentavos/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
    {
      name: "dev",
      script: "./index.js",
      watch: true,
      node_args: "--env-file=.env",
      env: {
        PLAID_ENV: "development",
      },
      error_file: "/var/log/zentavos/api-error.log",
      out_file: "/var/log/zentavos/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
    {
      name: "stg",
      script: "./index.js",
      watch: false,
      node_args: "--env-file=.env",
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
      node_args: "--env-file=.env",
      env: {
        PLAID_ENV: "production",
      },
      error_file: "/var/log/zentavos/api-error.log",
      out_file: "/var/log/zentavos/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
  ],
};
