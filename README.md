# Zentavos Backend

## Overview

Zentavos Backend is the server-side application that powers the Zentavos platform. It provides APIs and services to support the frontend/mobile application and manage data.

## Features

- User authentication and authorization with firebase auth
- Data management and storage in mongodb
- API endpoints for frontend/mobile integration
- Logging and error handling

## Getting Started

### Prerequisites

- Node.js v20.x
- npm (Node Package Manager)
- MongoDB (or any other database you are using)
- Docker
- Docker-Compose
- At least 4GB of free space on disk for the Docker images

### Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/yourusername/zentavos-backend.git
   ```
2. Navigate to the project directory:
   ```sh
   cd zentavos-backend
   ```
3. Install dependencies:
   ```sh
   npm install
   ```

### Configuration

1. Create a copy of the `.env.sample` file and change the name to `.env` file:
   ```sh
   cp .env.sample .env
   ```

## Environment Variables

The application requires several environment variables to be set. These are stored in a `.env` file in the root of the project. A `.env.sample` file is provided as a template.

### **IMPORTANT**: `USER_ENCRYPTION_KEY_BUCKET_NAME`

This variable specifies the name of the Google Cloud Storage bucket where the user data encryption keys are stored. This is a critical setting.

**WARNING**: Using the wrong bucket name will result in the inability to decrypt user data, which is equivalent to **PERMANENT DATA LOSS**.

Ensure that this variable is set correctly in all environments (`development`, `staging`, and `production`).

### Running the Application

1. Start the mongodb server
   ```sh
   npm run mongodb
   ```
2. Start the development server:

   ```sh
   npm run start:dev
   ```

   or for production-like environments, first build the application:

   ```sh
   npm run build
   ```

   Then run the built application from the `dist` directory:

   ```sh
   npm run run-build
   ```

3. The server will start on the port specified in your `.env` file (default is 3000).

## Testing

To run the test suite, use the following command:

```sh
npm test
```

This will run all tests in the `tests` directory. The test suite uses Jest for testing and `mongodb-memory-server` to run tests against an in-memory database, ensuring that the test environment is isolated from the development and production databases.

## Account Linking

### Apple Account Linking

To handle Apple's anonymized emails, the application implements an account linking flow. When a user signs in with Apple for the first time with an anonymized email, the backend will return a `404 Not Found` error with an `accountLinkingRequired: true` flag and the `appleUserId`. The frontend should then prompt the user to sign in to their existing account. Once the user is signed in, the frontend should make a `POST` request to the `/api/auth/link-apple-account` endpoint with the `appleUserId` to link the Apple ID to the existing account.

## Data Migration

To ensure all sensitive data is encrypted at rest, a migration script is provided. This script will identify unencrypted fields in your database and encrypt them. It's crucial to run this script after deploying changes related to encryption.

**Before running any migration, always back up your database.**

### Usage

The migration script supports several options, including a dry run and targeting specific users.

**1. Dry Run (Recommended First Step):**
Perform a dry run to see what changes the script will make without modifying your database. This helps you verify the script's behavior.

To run a dry run for a specific user (e.g., with a Firebase UID), use the following command:

```bash
DOTENV_CONFIG_PATH=./.env node -r dotenv/config ./scripts/migrate-encryption.js --dry-run --firebase-uid=AOy6WbXIgNTrm37lbcaLTdNNA8g2
```

You can omit `--firebase-uid` to perform a dry run for all users. You can also specify a limit for the dry run (e.g., `--dry-run=5` for 5 users).

**2. Run the Actual Migration:**
After you have reviewed the dry run results and are confident, execute the migration to encrypt your data.

```bash
DOTENV_CONFIG_PATH=./.env node -r dotenv/config ./scripts/migrate-encryption.js
```

**Other Options:**
*   `--manual-verification`: Prompts for confirmation before encrypting each field.
*   `--user-id=<USER_ID>`: Migrates data for a specific MongoDB user ID.
*   `--firebase-uid=<FIREBASE_UID>`: Migrates data for a specific Firebase UID.

## Deployment

Deployment is handled automatically by GitHub Actions. When changes are pushed to the `development`, `staging`, or `production` branches, the corresponding workflow in the `.github/workflows` directory is triggered. The workflow builds the application, deploys it to the server using `rsync`, and restarts the application using `pm2`.
