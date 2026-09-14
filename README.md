# HighFive! — Service du Mur (Hocuspocus)

Serveur Node.js/TypeScript qui heberge **Le Mur** : le document collaboratif
d'un projet (tldraw sur Yjs), synchronise via Hocuspocus, persiste sur
S3/MinIO, et exportable pour le core.

Ce service **ne connait rien des projets ni des droits**. Il sait verifier un
jeton et servir un document ; c'est le core (`core_backend`) qui decide qui
obtient un jeton, et qui le signe.

L'inventaire complet des fonctions — celles servies au front, et celles
conservees sans ecran (chat, session collaborative, suggestions de taches) —
est tenu dans `core_backend/docs/CANVAS.md`.

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
# Doit valoir exactement le CANVAS_JWT_SECRET du core, qui signe les jetons.
JWT_SECRET=change-me-canvas
# Doit valoir exactement le CANVAS_INTERNAL_SECRET du core, seul appelant de /export.
INTERNAL_SECRET=dev-internal-secret

#REDIS (file du chat du Mur)
REDIS_HOST=localhost
REDIS_PORT=6379
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
├── auth/                 # Verification du jeton emis par le core
├── contract/             # Types partages avec le core (ex-shared-types)
├── canvas/               # Export semantique du document tldraw
├── hooks/                # onAuthenticate / onDisconnect / onStateless
├── http/                 # Surface HTTP : /health et /canvas/:id/export
├── queue/                # File BullMQ (messages du chat du Mur)
└── storage/              # S3/Minio configuration

tests/                    # Tests
```

## Architecture

### Authentication

Server uses JWT to secure connections. Clients must include a valid token when connecting.

### Storage

Documents are persisted to S3/Minio via `@hocuspocus/extension-s3` extension. Configurable via environment variables.

### Hooks

- **onAuthenticate** : verifie le jeton emis par le core contre le nom du
  document demande, applique la lecture seule pour le role `viewer`, et coupe
  la connexion au bout d'une heure.
- **onDisconnect** : libere le minuteur d'expiration.
- **onStateless** : chat du Mur — persiste le message dans le document, le
  rediffuse aux connectes, et le publie sur la file `canvas_events`.

### Surface HTTP

Montee sur le serveur Hocuspocus (meme port, meme cycle de vie) :

| Route | Acces |
| --- | --- |
| `GET /health` | public |
| `GET /canvas/:canvasId/export` | interne, en-tete `X-Internal-Secret` — appelee par le core seul |

### Contrat partage

Les types echanges avec le core sont declares dans `src/contract/`, a
l'identique de `core_backend/src/modules/wall/canvas.types.ts`. Le paquet
`@plic-mti-highfive/shared-types` qui les portait a ete supprime : toute
modification doit desormais etre faite **dans les deux depots**.
