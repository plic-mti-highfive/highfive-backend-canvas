# =================
# STAGE 1 : Builder
# =================
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

RUN npm run build

# ================
# STAGE 2 : Runner
# ================
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN chown -R node:node /app
USER node

EXPOSE 8585

CMD ["node", "dist/index.js"]