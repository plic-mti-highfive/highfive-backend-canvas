# Tests de bout en bout et de charge du chat du Mur

Scripts Node (pas de k6) qui se font passer pour le front : ils créent des
comptes et des projets via l'API du core, ouvrent une session Mur
(`GET /api/projects/:slug/wall/session`), se connectent en WebSocket Hocuspocus
(`@hocuspocus/provider`) et envoient des messages de chat en stateless.
Le LLM doit être **simulé** : core lancé avec `LLM_PROVIDER=fake` (défaut), aucun
appel réseau.

- `e2e.mjs` : parcours fonctionnel (message -> file BullMQ -> core -> LLM fake ->
  réponse -> Y.Doc/broadcast, contextualisation, export, idempotence, lignes en base).
- `load.mjs` : N Murs en parallèle, mesure p50/p95, débit, erreurs.

(`../k6/` contient les tests k6 historiques de connexion/débit WebSocket ; ils ne
passent pas par le core ni le LLM.)

## Prérequis : une stack

Redis, Postgres, MinIO, core, canvas. Soit `docker compose up -d --build --wait`
dans `highfive-infra` (`LLM_PROVIDER=fake`), soit à la main (exemple, ports
décalés pour ne pas gêner une autre stack) :

```bash
docker run -d --name hf_pg -e POSTGRES_USER=hf -e POSTGRES_PASSWORD=hf -e POSTGRES_DB=highfive -p 127.0.0.1:5461:5432 postgres:16-alpine
docker run -d --name hf_redis -p 127.0.0.1:6391:6379 redis:7-alpine
docker run -d --name hf_minio -e MINIO_ROOT_USER=minioadmin -e MINIO_ROOT_PASSWORD=minioadmin -p 127.0.0.1:9071:9000 quay.io/minio/minio server /data

# core (NODE_ENV=development la 1re fois : `synchronize` crée les tables, dont conversations et messages)
cd core_backend && pnpm build
PORT=3471 NODE_ENV=development DB_HOST=127.0.0.1 DB_PORT=5461 DB_USERNAME=hf DB_PASSWORD=hf DB_DATABASE=highfive \
  REDIS_HOST=127.0.0.1 REDIS_PORT=6391 MINIO_ENDPOINT=http://127.0.0.1:9071 \
  CANVAS_URL=http://127.0.0.1:8591 CANVAS_WS_URL=ws://127.0.0.1:8591 \
  CANVAS_JWT_SECRET=s CANVAS_INTERNAL_SECRET=i LLM_PROVIDER=fake AI_URL= node dist/main

# canvas
cd highfive-backend-canvas
ENV=dev PORT=8591 JWT_SECRET=s INTERNAL_SECRET=i BUCKET_NAME=hf-bucket MINIO_ENDPOINT=http://127.0.0.1:9071 \
  AWS_REGION=eu-west-3 REDIS_HOST=127.0.0.1 REDIS_PORT=6391 npx tsx src/index.ts
```

Pour la charge, relancer le core avec `NODE_ENV=production` (pas de log SQL) une
fois les tables créées. Le core limite l'inscription (429) : les scripts patientent.

## Lancer

```bash
export API_URL=http://localhost:3471 CANVAS_URL=http://localhost:8591 CANVAS_INTERNAL_SECRET=i
export PG_CONTAINER=hf_pg PG_USER=hf   # optionnel : vérifie la table et les lignes en base

pnpm e2e                                        # ou : node load/e2e.mjs
E2E_LLM_DOWN=1 pnpm e2e                         # core en LLM_PROVIDER=openai sans clé : scénario d'erreur

pnpm load -- --walls 100 --messages 10          # 100 Murs, 1 client chacun
node load/load.mjs --walls 30 --messages 10 --clients 3 --json out.json
```

Options de `load.mjs` : `--walls` (20), `--messages` par client (5), `--clients` par Mur
(1), `--think` ms entre deux messages (0), `--timeout` ms par réponse (30000),
`--setup-concurrency` (5), `--json` fichier de sortie.

## Ce qui est mesuré

Pour chaque message `@ia` : délai entre l'envoi (stateless) et la réception de la
réponse de l'assistant diffusée sur le WebSocket. Chaque client attend sa réponse
avant d'envoyer le message suivant. Le résumé donne p50/p95/p99/max, le débit
(réponses/s sur la phase de charge, hors préparation) et les erreurs : `setup`
(compte/projet/connexion), `timeout` (pas de réponse), `mismatch` (le Mur final
n'a pas exactement autant de messages et de réponses que prévu, via l'export
interne). Code de sortie non nul si l'un d'eux est > 0.

Limites : le provider `fake` répond instantanément, on mesure donc la plomberie
(canvas, Redis/BullMQ, core, Postgres, retour HTTP au canvas), pas la latence d'un
vrai LLM, qui s'y ajoutera. Avec `--clients > 1` le délai est un minorant (la
réponse destinée à un autre client du même Mur peut débloquer l'attente). Le
débit est borné par `CHAT_CONSUMER_CONCURRENCY` (5 par défaut) : à ~70 ms par
message, environ 70 réponses/s ; le passer à 20 donne ~125 réponses/s.
