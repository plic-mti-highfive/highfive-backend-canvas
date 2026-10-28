# Cahier de tests — highfive-backend-canvas (Le Mur)

## Introduction

### Types de tests

| Type | Description | Dépendances |
| --- | --- | --- |
| Unitaire | Fonction ou hook isolé, collaborateurs mockés ou `Y.Doc` en mémoire | aucune |
| Intégration (serveur) | Vrai serveur Hocuspocus + hooks + HTTP + client `@hocuspocus/provider` ; seule la file Redis est mockée | aucune (ports aléatoires) |
| Intégration (MinIO) | Extension S3 et `ensureBucketExists` contre un vrai MinIO | Docker, ou `TEST_S3_ENDPOINT` |
| E2E / charge | Stack complète (core, Redis, Postgres, MinIO, canvas) via `load/` | stack lancée à la main |

### Lancer les tests

| Commande | Effet |
| --- | --- |
| `./node_modules/.bin/vitest run` (ou `pnpm test -- --run`) | Tests unitaires + intégration serveur. **Sans Docker.** |
| `vitest run --coverage` | Idem avec couverture (`coverage/`) |
| `pnpm test:int` | Tests d'intégration MinIO (`vitest.integration.config.ts`, `tests/minio/*.int.ts`) |
| `pnpm e2e` / `pnpm load` | Scénarios de `load/` ; prérequis et variables dans `load/README.md` |

### Stratégie MinIO jetable

`tests/minio/global-setup.ts` démarre `docker run -d --rm --tmpfs /data -p 127.0.0.1::9000 --name hf-canvas-test-<aléatoire> cgr.dev/chainguard/minio:latest server /data`
(port hôte aléatoire, données en tmpfs, image surchargeable par `TEST_MINIO_IMAGE`), attend `/minio/health/live`, puis fournit l'endpoint aux tests
(`inject('s3Endpoint')` -> `MINIO_ENDPOINT` dans `tests/minio/setup-env.ts`). Le teardown du globalSetup fait `docker rm -f` même si des tests échouent ;
le conteneur étant `--rm`, `docker ps -a | grep hf-canvas-test` est vide après. Chaque exécution utilise un bucket aléatoire.
Si `TEST_S3_ENDPOINT` est défini (CI : MinIO déjà lancé), aucun conteneur n'est créé. Identifiants : `minioadmin` par défaut (`TEST_S3_USER`, `TEST_S3_PASSWORD`).

Légende des statuts : ✅ existant · 🆕 ajouté par T10 · 🐞 défaut connu (test `it.fails`, voir « Bugs »).

## Authentification (jeton du core)

| ID | Scénario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CANVAS-AUTH-01 | Jeton valide : payload complet retourné | Unitaire | `tests/auth/jwt.test.ts` | ✅ |
| CANVAS-AUTH-02 | Rejet si le `canvasId` ne correspond pas au document | Unitaire | `tests/auth/jwt.test.ts` | ✅ |
| CANVAS-AUTH-03 | Rejet d'un jeton signé avec un mauvais secret | Unitaire | `tests/auth/jwt.test.ts` | ✅ |
| CANVAS-AUTH-04 | Rejet d'un jeton expiré | Unitaire | `tests/auth/jwt.test.ts` | ✅ |
| CANVAS-AUTH-05 | Rôle `viewer` accepté | Unitaire | `tests/auth/jwt.test.ts` | ✅ |
| CANVAS-AUTH-06 | `onAuthenticate` : viewer -> connexion en lecture seule | Unitaire | `tests/hooks/onAuthenticate.test.ts` | ✅ |
| CANVAS-AUTH-07 | `onAuthenticate` : editor -> lecture-écriture | Unitaire | `tests/hooks/onAuthenticate.test.ts` | ✅ |
| CANVAS-AUTH-08 | `onAuthenticate` : jeton manquant -> erreur | Unitaire | `tests/hooks/onAuthenticate.test.ts` | ✅ |
| CANVAS-AUTH-09 | `onAuthenticate` : TTL d'1 h écoulé -> connexion désauthentifiée | Unitaire | `tests/hooks/onAuthenticate.test.ts` | ✅ |
| CANVAS-AUTH-10 | WebSocket : jeton signé pour un autre Mur refusé | Intégration | `tests/integration/chat-ws.test.ts` | ✅ |
| CANVAS-AUTH-11 | WebSocket : jeton valide accepté | Intégration | `tests/security/ws-security.test.ts` | 🆕 |
| CANVAS-AUTH-12 | WebSocket : jeton absent refusé | Intégration | `tests/security/ws-security.test.ts` | 🆕 |
| CANVAS-AUTH-13 | WebSocket : jeton vide refusé | Intégration | `tests/security/ws-security.test.ts` | 🆕 |
| CANVAS-AUTH-14 | WebSocket : jeton expiré refusé | Intégration | `tests/security/ws-security.test.ts` | 🆕 |
| CANVAS-AUTH-15 | WebSocket : mauvais secret de signature refusé | Intégration | `tests/security/ws-security.test.ts` | 🆕 |
| CANVAS-AUTH-16 | WebSocket : jeton valide pour un autre document refusé | Intégration | `tests/security/ws-security.test.ts` | 🆕 |
| CANVAS-AUTH-17 | WebSocket : chaîne non JWT refusée | Intégration | `tests/security/ws-security.test.ts` | 🆕 |
| CANVAS-AUTH-18 | `onDisconnect` : libère le minuteur d'expiration | Unitaire | `tests/hooks/onDisconnect.test.ts` | 🆕 |
| CANVAS-AUTH-19 | `onDisconnect` : trace la déconnexion de l'utilisateur | Unitaire | `tests/hooks/onDisconnect.test.ts` | 🆕 |
| CANVAS-AUTH-20 | `onDisconnect` : sans minuteur ni utilisateur, ne fait rien | Unitaire | `tests/hooks/onDisconnect.test.ts` | 🆕 |

## Droits (lecture seule)

| ID | Scénario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CANVAS-ROLE-01 | Une écriture Yjs d'un viewer n'est pas appliquée au document serveur | Intégration | `tests/security/ws-security.test.ts` | 🆕 |
| CANVAS-ROLE-02 | Un viewer ne peut pas poster dans le chat (stateless), ni déclencher l'IA | Intégration + unitaire | `tests/security/ws-security.test.ts`, `tests/hooks/onStateless.test.ts` | 🆕 (bug corrigé T10) |
| CANVAS-ROLE-03 | Un éditeur peut poster dans le chat (stateless) | Intégration | `tests/security/ws-security.test.ts` | 🆕 |

## Chat du Mur (stateless, file, diffusion)

| ID | Scénario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CANVAS-CHAT-01 | Enqueue le message et le diffuse à tous les clients | Unitaire | `tests/hooks/onStateless.test.ts` | ✅ |
| CANVAS-CHAT-02 | Le broadcast contient le type `chat` et les données enrichies | Unitaire | `tests/hooks/onStateless.test.ts` | ✅ |
| CANVAS-CHAT-03 | JSON invalide ignoré sans erreur | Unitaire | `tests/hooks/onStateless.test.ts` | ✅ |
| CANVAS-CHAT-04 | Type de message inconnu ignoré | Unitaire | `tests/hooks/onStateless.test.ts` | ✅ |
| CANVAS-CHAT-05 | Texte vide ou espaces ignoré | Unitaire | `tests/hooks/onStateless.test.ts` | ✅ |
| CANVAS-CHAT-06 | Le texte est trimé avant enqueue | Unitaire | `tests/hooks/onStateless.test.ts` | ✅ |
| CANVAS-CHAT-07 | Le message est persisté dans le Y.Doc (reconnexion, export IA) | Unitaire | `tests/hooks/onStateless.test.ts` | ✅ |
| CANVAS-CHAT-08 | Rien n'est persisté quand le message est ignoré | Unitaire | `tests/hooks/onStateless.test.ts` | ✅ |
| CANVAS-CHAT-09 | `injectAssistantMessage` ajoute au chat et diffuse | Unitaire | `tests/canvas/chat.test.ts` | ✅ |
| CANVAS-CHAT-10 | `injectAssistantMessage` idempotent sur `id` | Unitaire | `tests/canvas/chat.test.ts` | ✅ |
| CANVAS-CHAT-11 | `parseAssistantChatInput` refuse un corps invalide | Unitaire | `tests/canvas/chat.test.ts` | ✅ |
| CANVAS-CHAT-12 | `normalizeChatMessage` garde la forme du contrat | Unitaire | `tests/canvas/chat.test.ts` | ✅ |
| CANVAS-CHAT-13 | `normalizeChatMessage` convertit un ancien message (`text`/`timestamp`) | Unitaire | `tests/canvas/chat.test.ts` | ✅ |
| CANVAS-CHAT-14 | `normalizeChatMessage` conserve l'indication assistant d'un ancien message | Unitaire | `tests/canvas/chat.test.ts` | ✅ |
| CANVAS-CHAT-15 | WebSocket : message publié sur la file, diffusé à tous, gardé dans le document | Intégration | `tests/integration/chat-ws.test.ts` | ✅ |
| CANVAS-CHAT-16 | WebSocket : la réponse de l'assistant POSTée arrive aux clients et dans l'export | Intégration | `tests/integration/chat-ws.test.ts` | ✅ |
| CANVAS-CHAT-17 | Un message sans `@ia` est diffusé sans déclencher l'assistant | E2E | `load/e2e.mjs` | ✅ |
| CANVAS-CHAT-18 | `@ia` : la réponse revient aux clients connectés | E2E | `load/e2e.mjs` | ✅ |
| CANVAS-CHAT-19 | Contextualisation : historique transmis au provider (1er tour, puis tour suivant) | E2E | `load/e2e.mjs` | ✅ |
| CANVAS-CHAT-20 | LLM indisponible : message d'erreur français, le worker survit (`E2E_LLM_DOWN=1`) | E2E | `load/e2e.mjs` | ✅ |
| CANVAS-CHAT-21 | Réponse présente dans le Y.Doc et l'export interne | E2E | `load/e2e.mjs` | ✅ |
| CANVAS-CHAT-22 | Persistance en base : messages dans la conversation `wall`, pas de doublon d'id (si `PG_CONTAINER`) | E2E | `load/e2e.mjs` | ✅ |
| CANVAS-CHAT-23 | N Murs en parallèle : p50/p95, débit, erreurs `setup`/`timeout`/`mismatch` | Charge | `load/load.mjs` | ✅ |

## File BullMQ (`src/queue`)

| ID | Scénario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CANVAS-QUEUE-01 | Création de la file `canvas_events` sur la connexion Redis de l'env | Unitaire | `tests/queue/queue.test.ts` | 🆕 |
| CANVAS-QUEUE-02 | `closeQueue` ferme la file | Unitaire | `tests/queue/queue.test.ts` | 🆕 |

## HTTP interne (`/health`, `/chat`, `/export`)

| ID | Scénario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CANVAS-HTTP-01 | `GET /health` répond 200 | Unitaire | `tests/http/onRequest.test.ts` | ✅ |
| CANVAS-HTTP-02 | `POST /chat` sans secret : 401, document intact | Unitaire | `tests/http/onRequest.test.ts` | ✅ |
| CANVAS-HTTP-03 | `POST /chat` mauvais secret : 401 | Unitaire | `tests/http/onRequest.test.ts` | ✅ |
| CANVAS-HTTP-04 | `POST /chat` corps invalide (champ manquant, JSON cassé, `isAssistant` faux) : 400 | Unitaire | `tests/http/onRequest.test.ts` | ✅ |
| CANVAS-HTTP-05 | `POST /chat` crée le message (201), diffuse et range dans le Y.Doc | Unitaire | `tests/http/onRequest.test.ts` | ✅ |
| CANVAS-HTTP-06 | `POST /chat` idempotent : rejeu 200 sans doublon ni broadcast | Unitaire | `tests/http/onRequest.test.ts` | ✅ |
| CANVAS-HTTP-07 | `POST /chat` document déjà chargé : pas de connexion directe | Unitaire | `tests/http/onRequest.test.ts` | ✅ |
| CANVAS-HTTP-08 | `POST /chat` décode le `canvasId` de l'URL | Unitaire | `tests/http/onRequest.test.ts` | ✅ |
| CANVAS-HTTP-09 | `POST /chat` document inaccessible : 500 | Unitaire | `tests/http/onRequest.test.ts` | ✅ |
| CANVAS-HTTP-10 | `POST /chat` corps > 64 Kio : 400, document non ouvert | Unitaire | `tests/http/onRequest.test.ts` | 🆕 |
| CANVAS-HTTP-11 | `GET /export` sans secret : 401 | Unitaire | `tests/http/onRequest.test.ts` | ✅ |
| CANVAS-HTTP-12 | `GET /export` avec secret : chat utilisateur + assistant | Unitaire | `tests/http/onRequest.test.ts` | ✅ |
| CANVAS-HTTP-13 | `GET /export` document inaccessible : 500 | Unitaire | `tests/http/onRequest.test.ts` | ✅ |
| CANVAS-HTTP-14 | Autres routes : Hocuspocus répond (le hook résout) | Unitaire | `tests/http/onRequest.test.ts` | ✅ |
| CANVAS-HTTP-15 | Serveur réel : `/export` 401 sans en-tête / mauvais secret / secret vide / secret JWT (4 cas) | Intégration | `tests/security/ws-security.test.ts` | 🆕 |
| CANVAS-HTTP-16 | Serveur réel : `/chat` 401 sans en-tête / mauvais secret, rien d'écrit (2 cas) | Intégration | `tests/security/ws-security.test.ts` | 🆕 |
| CANVAS-HTTP-17 | Serveur réel : `/export` 200 avec le bon secret ; `/health` public | Intégration | `tests/security/ws-security.test.ts` | 🆕 |

## Export sémantique du document (`src/canvas/export.ts`)

| ID | Scénario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CANVAS-EXP-01 | Texte des post-its remonté | Unitaire | `tests/canvas/export.test.ts` | ✅ |
| CANVAS-EXP-02 | Post-its vides ignorés | Unitaire | `tests/canvas/export.test.ts` | ✅ |
| CANVAS-EXP-03 | `richText` ProseMirror aplati en texte brut | Unitaire | `tests/canvas/export.test.ts` | ✅ |
| CANVAS-EXP-04 | Type géométrique des formes conservé | Unitaire | `tests/canvas/export.test.ts` | ✅ |
| CANVAS-EXP-05 | Extrémités de flèche résolues vers le texte des shapes liées | Unitaire | `tests/canvas/export.test.ts` | ✅ |
| CANVAS-EXP-06 | Flèche ne reliant rien de nommé écartée | Unitaire | `tests/canvas/export.test.ts` | ✅ |
| CANVAS-EXP-07 | Records qui ne sont pas des shapes ignorés | Unitaire | `tests/canvas/export.test.ts` | ✅ |
| CANVAS-EXP-08 | Tracés au stylo comptés sans être listés | Unitaire | `tests/canvas/export.test.ts` | ✅ |
| CANVAS-EXP-09 | Chat persisté remonté dans l'export | Unitaire | `tests/canvas/export.test.ts` | ✅ |
| CANVAS-EXP-10 | Ancien message (`text`/`timestamp`) lu | Unitaire | `tests/canvas/export.test.ts` | ✅ |
| CANVAS-EXP-11 | Export vide sur un document vierge | Unitaire | `tests/canvas/export.test.ts` | ✅ |
| CANVAS-EXP-12 | Shape inconnue avec texte remontée comme texte | Unitaire | `tests/canvas/export.test.ts` | 🆕 |
| CANVAS-EXP-13 | Shape inconnue sans texte ignorée | Unitaire | `tests/canvas/export.test.ts` | 🆕 |
| CANVAS-EXP-14 | `draw` -> élément `drawing` sans texte | Unitaire | `tests/canvas/export.test.ts` | 🆕 |
| CANVAS-EXP-15 | Forme sans `geo` : rectangle par défaut | Unitaire | `tests/canvas/export.test.ts` | 🆕 |
| CANVAS-EXP-16 | Texte libre vide ignoré | Unitaire | `tests/canvas/export.test.ts` | 🆕 |
| CANVAS-EXP-17 | Flèche avec texte mais sans liaison conservée | Unitaire | `tests/canvas/export.test.ts` | 🆕 |

## Stockage S3 / MinIO (`src/storage`)

| ID | Scénario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CANVAS-STO-01 | `ensureBucketExists` : bucket présent, pas de recréation | Unitaire (S3 mocké) | `tests/storage/bucket.test.ts` | 🆕 |
| CANVAS-STO-02 | Bucket absent (`NotFound`) : créé | Unitaire (S3 mocké) | `tests/storage/bucket.test.ts` | 🆕 |
| CANVAS-STO-03 | Bucket absent (HTTP 404) : créé | Unitaire (S3 mocké) | `tests/storage/bucket.test.ts` | 🆕 |
| CANVAS-STO-04 | Autre erreur S3 (403) : `process.exit(1)` | Unitaire (S3 mocké) | `tests/storage/bucket.test.ts` | 🆕 |
| CANVAS-STO-05 | `buildS3Config` en dev : endpoint, identifiants, path-style | Unitaire | `tests/storage/bucket.test.ts` | 🆕 |
| CANVAS-STO-06 | Bucket créé sur un vrai MinIO, puis appel idempotent | Intégration MinIO | `tests/minio/storage.int.ts` | 🆕 |
| CANVAS-STO-07 | Identifiants refusés par MinIO : `process.exit(1)` | Intégration MinIO | `tests/minio/storage.int.ts` | 🆕 |
| CANVAS-STO-08 | Document Yjs stocké à la déconnexion, rechargé après redémarrage du serveur | Intégration MinIO | `tests/minio/storage.int.ts` | 🆕 |
| CANVAS-STO-09 | Objet rangé sous `hocuspocus-documents/<nom>.bin` | Intégration MinIO | `tests/minio/storage.int.ts` | 🆕 |
| CANVAS-STO-10 | Document absent : chargé vide, sans erreur | Intégration MinIO | `tests/minio/storage.int.ts` | 🆕 |
| CANVAS-STO-11 | Erreur S3 (identifiants invalides) au chargement : le chargement échoue (pas de Mur vide servi) | Intégration MinIO | `tests/minio/storage.int.ts` | 🆕 |

## Bugs / défauts connus

| ID | Description | Statut |
| --- | --- | --- |
| CANVAS-ROLE-02 | Un `viewer` pouvait envoyer un message de chat (et déclencher `@ia`) : la lecture seule d'Hocuspocus ne filtre pas les messages stateless. Corrigé : `onStateless` ignore les messages d'un `viewer` (décision produit : un lecteur n'écrit pas dans le chat). | ✅ corrigé T10 |

## Couverture

Mesurée avec `vitest run --coverage --coverage.include='src/**'` (tout `src/`).

| | Tests | Lignes | Branches | Fonctions |
| --- | --- | --- | --- | --- |
| Avant T10 | 50 | 82,6 % | 76,7 % | 81,8 % |
| Après T10 (`vitest run`) | 86 | 93,0 % | 89,5 % | 88,2 % |
| + `test:int` | +6 | `storage/bucket.ts` couvert aussi par le MinIO réel | | |

Hors rapport mais exercé : les 6 tests d'intégration MinIO exécutent l'extension S3 réelle de Hocuspocus.

## Non couvert / à faire

- `src/index.ts` et `src/server.ts` (bootstrap, `process.on('SIGTERM')`, assemblage des extensions) : non importés par les tests ; couvert seulement par `load/e2e.mjs`.
- Comparaison du secret interne avec `!==` (non constant-time) : aucun test de timing.
- Expiration de la connexion au bout d'1 h : testée au niveau du hook (faux timers), pas de fermeture effective de la socket.
- Débit/charge : `load/` uniquement, non rejoué en CI (pas de job e2e).
