# =================
# STAGE 1 : Builder
# =================
FROM node:22-alpine AS builder

# Meme version de pnpm que la CI (pnpm/action-setup version: 9). Sans epingle,
# corepack tire la derniere version, dont la politique minimumReleaseAge rejette
# toute dependance publiee depuis moins de 24h — ce qui cassait le build juste
# apres la publication d'une nouvelle dependance.
RUN corepack enable pnpm && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ================
# STAGE 2 : Runner
# ================
FROM node:22-alpine AS runner

RUN corepack enable pnpm && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist

RUN chown -R node:node /app
USER node

EXPOSE 8585

CMD ["node", "dist/index.js"]