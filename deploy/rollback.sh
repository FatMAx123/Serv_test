#!/usr/bin/env bash
# Вернуть версию игры из последней резервной копии:  bash rollback.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lib.sh"
AUTO=0; [ "${1:-}" = "--auto" ] && { AUTO=1; shift; }
BK="${1:-$(cat "$BACKUP_ROOT/LAST" 2>/dev/null)}"
[ -f "$BK/game.tar.gz" ] || die "Резервная копия не найдена ($BK)."
DIR=$(cat "$BK/path.txt")
if [ $AUTO = 0 ]; then
  echo "Будет восстановлена копия от $(basename "$BK") в папку $DIR."
  read -r -p "Продолжить? (да/нет): " A; [[ "$A" =~ ^(да|д|y|yes)$ ]] || exit 0
fi
# служебные файлы нужны, чтобы знать, как перезапустить сервер
SAVE=$(mktemp -d); cp -a "$DIR/.deploy-state" "$DIR/deploy" "$SAVE/" 2>/dev/null
FAILED="$DIR.failed-$(date +%Y%m%d-%H%M%S)"
mv "$DIR" "$FAILED" || die "Не удалось переименовать папку $DIR"
tar -xzf "$BK/game.tar.gz" -C "$(dirname "$DIR")" || { mv "$FAILED" "$DIR"; die "Не удалось распаковать копию"; }
[ -f "$DIR/.deploy-state" ] || cp -a "$SAVE/.deploy-state" "$DIR/"
[ -d "$DIR/deploy" ] || cp -a "$SAVE/deploy" "$DIR/"
rm -rf "$SAVE"
[ -f "$DIR/.env.secrets" ] || : > "$DIR/.env.secrets"
restart_server "$DIR"
if wait_healthy "$DIR"; then ok "Прежняя версия восстановлена и работает. Неудачная версия лежит в $FAILED"
else show_last_log "$DIR"; die "Прежняя версия тоже не запустилась. Копия файлов: $BK"; fi
if [ -f "$BK/database.dump" ]; then
  echo "    База данных не откатывалась (обычно это не нужно). Её копия: $BK/database.dump"
fi
