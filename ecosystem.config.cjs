// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "local",
      script: "./index.js",
      env: {
        NODE_OPTIONS: "--import ./instrument.mjs --enable-source-maps",
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
      env: {
        NODE_OPTIONS: "--import ./instrument.mjs --enable-source-maps",
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
        NODE_OPTIONS: "--import ./instrument.mjs --enable-source-maps",
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
        NODE_OPTIONS: "--import ./instrument.mjs --enable-source-maps",
        PLAID_ENV: "production",
      },
      error_file: "/var/log/zentavos/api-error.log",
      out_file: "/var/log/zentavos/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
  ],
};
