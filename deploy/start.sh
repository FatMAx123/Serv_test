#!/usr/bin/env bash
# Запуск игрового сервера с настройками из .env.production и .env.secrets
cd "$(dirname "$0")/.." || exit 1
set -a
[ -f .env.production ] && . ./.env.production
[ -f .env.secrets ] && . ./.env.secrets
set +a
NODE_BIN=$(grep '^NODE_BIN=' .deploy-state 2>/dev/null | cut -d= -f2-)
[ -x "$NODE_BIN" ] || NODE_BIN=$(command -v node)
ENTRY=$(grep '^ENTRY=' .deploy-state 2>/dev/null | cut -d= -f2-)
exec "$NODE_BIN" "${ENTRY:-server/server.js}"
