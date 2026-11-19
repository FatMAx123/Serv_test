# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app

# Build toolchain для нативного C++ SIMD-аддона (project_steam_native.node) и uWebSockets.js
RUN apk add --no-cache python3 make g++ git

COPY package.json package-lock.json binding.gyp ./
COPY native ./native
RUN npm ci --omit=dev && npx node-gyp rebuild

COPY server ./server
COPY shared ./shared
COPY client/js ./client/js
COPY client/data/mesh ./client/data/mesh
COPY client/data/terrain-paint-1.png ./client/data/terrain-paint-1.png
COPY client/data/terrain-paint-2.png ./client/data/terrain-paint-2.png
COPY client/data/editor-overrides.json ./client/data/editor-overrides.json

# Статические игровые БД и карты дорог без пользовательских сохранений/секретов
RUN mkdir -p /app/data
COPY data/*_db.json data/terrain-paint-*.png ./data/

ENV NODE_ENV=production \
    PORT=8080 \
    DB=file \
    ALLOW_FILE_DB_IN_PROD=1 \
    CLUSTER_WORKERS=1 \
    EDITOR_ENABLED=0 \
    NET_ENGINE=uws \
    STRICT_UWS=1

EXPOSE 8080

RUN chown -R node:node /app/data
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1

CMD ["node", "server/cluster-manager.js"]
