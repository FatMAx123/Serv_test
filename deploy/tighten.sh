#!/usr/bin/env bash
# Поэтапно выключает старые способы входа (запускать по одному разу, не чаще указанного срока):
#   1-й запуск (через 2–4 недели после обновления) — старые гостевые токены
#   2-й запуск (через 1–3 месяца)                   — старые хэши ключей
#   3-й запуск (через 2–3 месяца)                   — вход по ключу без логина
#   bash tighten.sh undo  — отменить последний шаг
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
. "$HERE/lib.sh"
DIR="$(cd "$HERE/.." && pwd)"
SEC="$DIR/.env.secrets"
STEP=$(state_get "$DIR" TIGHTEN_STEP); STEP=${STEP:-0}
SINCE=$(state_get "$DIR" INSTALLED_AT)
DAYS=$(( ( $(date +%s) - $(date -d "${SINCE:-today}" +%s) ) / 86400 ))

NAMES=("" "выключить старые гостевые токены" "выключить старые хэши ключей" "выключить вход без логина")
MIN=(0 14 30 60)
apply_step() {
  case "$1" in
    1) secrets_set "$SEC" GUEST_LEGACY_TOKENS "$2"; secrets_set "$SEC" GUEST_TOFU "$2" ;;
    2) secrets_set "$SEC" KEY_ALLOW_OLD_HASHES "$2" ;;
    3) secrets_set "$SEC" KEY_ALLOW_KEYONLY "$2" ;;
  esac
}

if [ "${1:-}" = "undo" ]; then
  [ "$STEP" -gt 0 ] || die "Отменять нечего."
  apply_step "$STEP" 1; state_set "$DIR" TIGHTEN_STEP $((STEP-1))
  say "Отменяю шаг $STEP: ${NAMES[$STEP]}"
else
  [ "$STEP" -lt 3 ] || { ok "Все шаги уже выполнены. Больше ничего делать не нужно."; exit 0; }
  N=$((STEP+1))
  say "Шаг $N из 3: ${NAMES[$N]}"
  echo "    С обновления прошло дней: $DAYS (рекомендуется не меньше ${MIN[$N]})"
  if [ "$DAYS" -lt "${MIN[$N]}" ]; then
    warn "Слишком рано: часть игроков ещё не успела зайти и перейти на новый вход."
    read -r -p "    Всё равно выполнить? (да/нет): " A; [[ "$A" =~ ^(да|д|y|yes)$ ]] || exit 0
  fi
  apply_step "$N" 0; state_set "$DIR" TIGHTEN_STEP "$N"
fi
restart_server "$DIR"
if wait_healthy "$DIR"; then ok "Готово, сервер перезапущен."
  [ "$(state_get "$DIR" TIGHTEN_STEP)" -lt 3 ] && echo "    Следующий шаг — позже, той же командой: bash $DIR/deploy/tighten.sh"
  echo "    Если игроки пожалуются, что не могут войти: bash $DIR/deploy/tighten.sh undo"
else show_last_log "$DIR"; die "Сервер не поднялся. Выполните: bash $DIR/deploy/tighten.sh undo"; fi
