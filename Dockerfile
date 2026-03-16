# =================
# STAGE 1 : Builder
# =================
FROM node:22-alpine AS builder

RUN corepack enable pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build

# ================
# STAGE 2 : Runner
# ================
FROM node:22-alpine AS runner

RUN corepack enable pnpm

WORKDIR /app
ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist

RUN chown -R node:node /app
USER node

EXPOSE 8585

CMD ["node", "dist/index.js"]