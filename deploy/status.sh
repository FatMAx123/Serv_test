#!/usr/bin/env bash
# Проверить, работает ли сервер:  bash status.sh
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lib.sh"
DIR="$(cd "$HERE/.." && pwd)"
PORT=$(server_port "$DIR")
if port_open "$DIR" "$PORT"; then ok "Сервер работает (порт $PORT)"; else warn "Сервер НЕ отвечает на порту $PORT"; fi
echo "    Способ запуска: $(state_get "$DIR" MANAGER)   Обновлён: $(state_get "$DIR" INSTALLED_AT)   Шаг ужесточения: $(state_get "$DIR" TIGHTEN_STEP)/3"
show_last_log "$DIR"
