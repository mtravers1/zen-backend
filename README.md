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
    npm run start
    ```
    or just
    ```sh
    npm start
    ```

3. The server will start on `http://localhost:3000`.
