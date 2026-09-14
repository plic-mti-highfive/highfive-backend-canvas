# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Les types partages avec le core vivent desormais dans `src/contract/`, a
  l'identique de `core_backend/src/modules/wall/canvas.types.ts`. Toute
  modification doit etre faite dans les deux depots.
- `CanvasTokenPayload` et la charge des messages de chat ne portent plus de
  `tenantId` : la plateforme est mono-instance depuis la refonte v2.
- README : role du service, surface HTTP et hooks decrits explicitement.

### Removed
- Dependance `@plic-mti-highfive/shared-types`, et avec elle le `.npmrc`, le
  `registry-url` de la CI et le secret `github_token` de la construction
  d'image.
- `src/canvas/postit.types.ts`, vestige inutilise de l'ancien tableau de
  post-its.

### Notes
- Le chat du Mur (hook `onStateless`, file `canvas_events`) n'a pas ete touche :
  la messagerie est le lot suivant. Inventaire complet des fonctions du service
  dans `core_backend/docs/CANVAS.md`.

## [1.0.0] - 2026-03-16

### Added

- Hocuspocus server with WebSocket
- JWT authentication
- Document persistence on S3/Minio
- Custom hooks (onAuthenticate, onDisconnect)
- Unit tests with Vitest
- Code coverage reports
- Docker and Docker Compose configuration
- ESLint linting and Prettier formatting
- Complete backend documentation
- Troubleshooting guide
- Production deployment section
- Detailed environment variables
