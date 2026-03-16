# Hocuspocus Backend Server

Node.js/TypeScript backend server for Hocuspocus with JWT authentication, distributed storage (S3/Minio), and document persistence.

## Prerequisites

- Node.js >= 18
- npm or yarn
- Docker & Docker Compose (for development with Minio)
- AWS S3 account or Minio instance

## Local Setup

### 1. Clone and install dependencies

```bash
git clone <repository>
cd hocuspocus-backend
npm install
```

### 2. Environment variables

Create a `.env` file at the root:

```env
# SERVER CONFIGURATION
ENV=dev
SERVER_NAME=hocuspocus-server
PORT=8585
BUCKET_NAME=bucket-test

# AWS S3 CONFIGURATION
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-west-3

#MINIO CONFIGURATION
MINIO_ENDPOINT=http://localhost:9000
MINIO_USERNAME=minioadmin
MINIO_PASSWORD=minioadmin

#JWT CONFIGURATION
JWT_SECRET=your-jwt-secret
```

### 3. Start with Docker Compose (development)

```bash
docker-compose up --build
```

This starts:

- Hocuspocus server on `ws://localhost:3000`
- Minio on `http://localhost:9000` (credentials: minioadmin/minioadmin)

## npm Scripts

| Command                 | Description                              |
| ----------------------- | ---------------------------------------- |
| `npm run dev`           | Start server in watch mode (auto-reload) |
| `npm run build`         | Compile TypeScript to JavaScript         |
| `npm start`             | Start compiled server                    |
| `npm test`              | Run tests with Vitest                    |
| `npm run test:ui`       | Tests with graphical interface           |
| `npm run test:coverage` | Tests with coverage report               |
| `npm run lint`          | ESLint check                             |
| `npm run lint:fix`      | Auto-fix ESLint issues                   |
| `npm run format`        | Prettier formatting                      |

## Project Structure

```
src/
├── index.ts              # Entry point
├── server.ts             # Hocuspocus server configuration
├── env.ts                # Environment variables validation
├── auth/                 # Auth config
├── hooks/                # Hooks config
└── storage/              # S3/Minio configuration

tests/                    # Tests
```

## Architecture

### Authentication

Server uses JWT to secure connections. Clients must include a valid token when connecting.

### Storage

Documents are persisted to S3/Minio via `@hocuspocus/extension-s3` extension. Configurable via environment variables.

### Hooks

- **onAuthenticate**: Validates JWT token on connection
- **onDisconnect**: Cleans up resources on disconnection
