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

## Deployment
Deployment is handled automatically by GitHub Actions. When changes are pushed to the `development`, `staging`, or `production` branches, the corresponding workflow in the `.github/workflows` directory is triggered. The workflow builds the application, deploys it to the server using `rsync`, and restarts the application using `pm2`.
