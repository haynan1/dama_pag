# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------------------------
# 1. Dependências completas (para o build do front-end)
# ---------------------------------------------------------------------------------------------
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY packages/engine/package.json packages/engine/
COPY packages/protocol/package.json packages/protocol/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --ignore-scripts

# ---------------------------------------------------------------------------------------------
# 2. Build do front-end (Vite)
# ---------------------------------------------------------------------------------------------
FROM deps AS build
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm run build -w @dama/web

# ---------------------------------------------------------------------------------------------
# 3. Só dependências de produção do servidor
# ---------------------------------------------------------------------------------------------
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY packages/engine/package.json packages/engine/
COPY packages/protocol/package.json packages/protocol/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --ignore-scripts --workspace @dama/server

# ---------------------------------------------------------------------------------------------
# 4. Imagem final: Node puro executando TypeScript nativo (type stripping), sem toolchain.
# ---------------------------------------------------------------------------------------------
FROM node:24-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5810 \
    DATA_DIR=/data
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/engine/package.json ./packages/engine/
COPY packages/engine/src ./packages/engine/src
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/protocol/src ./packages/protocol/src
COPY apps/server/package.json ./apps/server/
COPY apps/server/src ./apps/server/src
COPY --from=build /app/apps/web/dist ./apps/web/dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 5810
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:5810/api/health > /dev/null || exit 1
CMD ["node", "apps/server/src/main.ts"]
