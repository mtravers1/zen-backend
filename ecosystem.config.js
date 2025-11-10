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
      node_args: "-r dotenv/config",
      error_file: "/var/log/zentavos/api-error.log",
      out_file: "/var/log/zentavos/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
    {
      name: "dev",
      script: "./index.js",
      watch: true,
      node_args: "-r dotenv/config",
      env: {
        PLAID_ENV: "development",
        GCP_PROJECT_ID: process.env.GCP_PROJECT_ID_DEV,
        GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME_DEV,
        LEGACY_GCS_BUCKET_NAME: process.env.LEGACY_GCS_BUCKET_NAME_DEV,
        LEGACY_GCS_ENVIRONMENT_FOLDER:
          process.env.LEGACY_GCS_ENVIRONMENT_FOLDER_DEV,
        GCP_KEY_LOCATION: process.env.GCP_KEY_LOCATION_DEV,
        GCP_KEY_RING: process.env.GCP_KEY_RING_DEV,
        GCP_KEY_NAME: process.env.GCP_KEY_NAME_DEV,
        STORAGE_SERVICE_ACCOUNT: process.env.STORAGE_SERVICE_ACCOUNT_DEV,
        KMS_SERVICE_ACCOUNT: process.env.KMS_SERVICE_ACCOUNT_DEV,
        HASH_SALT: process.env.HASH_SALT_DEV,
      },
      error_file: "/var/log/zentavos/api-error.log",
      out_file: "/var/log/zentavos/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
    {
      name: "stg",
      script: "./index.js",
      watch: false,
      node_args: "-r dotenv/config",
      env: {
        PLAID_ENV: "production",
        GCP_PROJECT_ID: process.env.GCP_PROJECT_ID_STG,
        GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME_STG,
        LEGACY_GCS_BUCKET_NAME: process.env.LEGACY_GCS_BUCKET_NAME_STG,
        LEGACY_GCS_ENVIRONMENT_FOLDER:
          process.env.LEGACY_GCS_ENVIRONMENT_FOLDER_STG,
        GCP_KEY_LOCATION: process.env.GCP_KEY_LOCATION_STG,
        GCP_KEY_RING: process.env.GCP_KEY_RING_STG,
        GCP_KEY_NAME: process.env.GCP_KEY_NAME_STG,
        STORAGE_SERVICE_ACCOUNT: process.env.STORAGE_SERVICE_ACCOUNT_STG,
        KMS_SERVICE_ACCOUNT: process.env.KMS_SERVICE_ACCOUNT_STG,
        HASH_SALT: process.env.HASH_SALT_STG,
      },
      error_file: "/var/log/zentavos/api-error.log",
      out_file: "/var/log/zentavos/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
    {
      name: "prod",
      script: "./index.js",
      watch: false,
      node_args: "-r dotenv/config",
      env: {
        PLAID_ENV: "production",
        GCP_PROJECT_ID: process.env.GCP_PROJECT_ID_PROD,
        GCS_BUCKET_NAME: process.env.GCS_BUCKET_NAME_PROD,
        LEGACY_GCS_BUCKET_NAME: process.env.LEGACY_GCS_BUCKET_NAME_PROD,
        LEGACY_GCS_ENVIRONMENT_FOLDER:
          process.env.LEGACY_GCS_ENVIRONMENT_FOLDER_PROD,
        GCP_KEY_LOCATION: process.env.GCP_KEY_LOCATION_PROD,
        GCP_KEY_RING: process.env.GCP_KEY_RING_PROD,
        GCP_KEY_NAME: process.env.GCP_KEY_NAME_PROD,
        STORAGE_SERVICE_ACCOUNT: process.env.STORAGE_SERVICE_ACCOUNT_PROD,
        KMS_SERVICE_ACCOUNT: process.env.KMS_SERVICE_ACCOUNT_PROD,
        HASH_SALT: process.env.HASH_SALT_PROD,
      },
      error_file: "/var/log/zentavos/api-error.log",
      out_file: "/var/log/zentavos/api-out.log",
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
  ],
};
