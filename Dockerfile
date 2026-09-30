# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /app

# Зависимости отдельным слоем: пересобираются только при изменении манифестов.
# package-lock.json обязателен для npm ci (раньше не копировался вовсе).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Сервер раздаёт статику из ../client (server.js: SERVE_CLIENT, ALLOWED_ROOTS).
# Без этого COPY в контейнере отдавался 404 на любой файл игры.
COPY server ./server
COPY shared ./shared
COPY client ./client

ENV NODE_ENV=production \
    PORT=8080 \
    DB=file \
    EDITOR_ENABLED=0

EXPOSE 8080

# Профили игроков. На Render каталог должен быть смонтирован как disk,
# иначе редеплой стирает прогресс (см. render.yaml).
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1

CMD ["node", "server/server.js"]
