#!/usr/bin/env bash
# Общие функции для install.sh / rollback.sh / tighten.sh / status.sh.
# Ничего не нужно менять руками.

say()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m    ✔ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m    ! %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31m✖ %s\033[0m\n\n' "$*"; exit 1; }

BACKUP_ROOT="${BACKUP_ROOT:-$HOME/steam-backups}"

# Файлы и папки, которые живут на сервере и НИКОГДА не перезаписываются обновлением
PROTECTED=(
  data
  logs
  .env.production
  .env.secrets
  .deploy-state
  shared/editor-overrides.json
  shared/editor-overrides.backup.json
  shared/editor-overrides.backups
  shared/terrain-paint-1.png
  shared/terrain-paint-2.png
  client/data/editor-overrides.json
  client/data/terrain-paint-1.png
  client/data/terrain-paint-2.png
  client/data/youtube-stats.json
  client/shared/editor-overrides.json
)

# Найти запущенный игровой сервер. Печатает PID или ничего.
find_server_pid() {
  local p comm cmd best=""
  for p in $(ls /proc | grep -E '^[0-9]+$'); do
    [ -r "/proc/$p/comm" ] || continue
    comm=$(cat /proc/$p/comm 2>/dev/null)
    cmd=$(tr '\0' ' ' < /proc/$p/cmdline 2>/dev/null)
    case "$comm" in
      mmo-monolith*) best="$p"; break ;;
    esac
    # только процессы node (а не, например, редактор с открытым server.js)
    case "$(basename "$(readlink -f /proc/$p/exe 2>/dev/null)")" in node|nodejs|node[0-9]*) ;; *) continue ;; esac
    if [[ "$cmd" == *cluster-manager.js* || "$cmd" == *server/server.js* || "$cmd" == *" server.js"* ]]; then
      # пропускаем дочерние воркеры кластера
      [[ "$comm" == mmo-zone-worker* ]] && continue
      [ -z "$best" ] && best="$p"
    fi
  done
  echo "$best"
}

# Папка проекта по PID (та, где лежит server/server.js)
project_dir_of_pid() {
  local cwd; cwd=$(readlink -f "/proc/$1/cwd" 2>/dev/null) || return 1
  local d="$cwd"
  for _ in 1 2 3; do
    [ -f "$d/server/server.js" ] && { echo "$d"; return 0; }
    d=$(dirname "$d")
  done
  return 1
}

# Как запущен сервер: pm2 / systemd / manual
manager_of_pid() {
  local env; env=$(tr '\0' '\n' < "/proc/$1/environ" 2>/dev/null)
  if grep -q '^pm_id=' <<<"$env"; then echo pm2; return; fi
  if grep -qE '\.service' "/proc/$1/cgroup" 2>/dev/null && grep -q '^INVOCATION_ID=' <<<"$env"; then echo systemd; return; fi
  echo manual
}

systemd_unit_of_pid() {
  grep -oE '[^/]+\.service' "/proc/$1/cgroup" 2>/dev/null | tail -1
}

# Сохранить настройки (переменные окружения) работающего сервера в файл,
# чтобы после обновления он запустился с теми же настройками.
capture_env() {
  local pid="$1" out="$2" line k v
  : > "$out"
  echo "# Настройки сервера, снятые с работающего процесса $(date '+%F %T')" >> "$out"
  while IFS= read -r -d '' line; do
    k="${line%%=*}"; v="${line#*=}"
    [[ "$k" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    case "$k" in
      PWD|OLDPWD|SHLVL|_|TERM|SHELL|HOME|USER|LOGNAME|MAIL|PATH|LANG|LC_*|SSH_*|XDG_*|DBUS_*|LS_COLORS|HISTSIZE|HISTFILESIZE|INVOCATION_ID|JOURNAL_STREAM|SYSTEMD_EXEC_PID|NOTIFY_SOCKET|MANAGERPID|pm_*|PM2_*|name|exec_mode|instances|unique_id|status|restart_time|created_at|pm_uptime|axm_*|vizion*|autorestart|watch|merge_logs|km_link|node_args|exec_interpreter|windowsHide|username|treekill|automation|instance_var|version|filter_env|namespace|unstable_restarts|prev_restart_delay|exit_code|env|args|NODE_APP_INSTANCE|SILENT|COLUMNS|LINES|TMUX*|STY|WINDOW|TERMCAP) continue ;;
    esac
    printf '%s=%q\n' "$k" "$v" >> "$out"
  done < "/proc/$pid/environ"
}

# Прочитать значение KEY из env-файла (без source)
env_get() { local f="$1" k="$2"; [ -f "$f" ] || return 0; ( set -a; . "$f" >/dev/null 2>&1; eval "printf '%s' \"\${$k:-}\"" ); }

# Поставить KEY=VALUE в .env.secrets (заменяя прежнее значение)
secrets_set() {
  local f="$1" k="$2" v="$3"
  touch "$f"; chmod 600 "$f"
  if grep -q "^$k=" "$f"; then sed -i "s|^$k=.*|$k=$v|" "$f"; else echo "$k=$v" >> "$f"; fi
}

rand_secret() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

state_get() { [ -f "$1/.deploy-state" ] && grep "^$2=" "$1/.deploy-state" | tail -1 | cut -d= -f2-; }
state_set() {
  local f="$1/.deploy-state"; touch "$f"
  if grep -q "^$2=" "$f"; then sed -i "s|^$2=.*|$2=$3|" "$f"; else echo "$2=$3" >> "$f"; fi
}

# Порт сервера
server_port() {
  local p; p=$(env_get "$1/.env.secrets" PORT); [ -n "$p" ] || p=$(env_get "$1/.env.production" PORT)
  echo "${p:-8080}"
}

port_open() {
  local node; node=$(state_get "$1" NODE_BIN); [ -x "$node" ] || node=$(command -v node)
  "$node" -e "const s=require('net').connect($2,'127.0.0.1');s.on('connect',()=>process.exit(0));s.on('error',()=>process.exit(1));setTimeout(()=>process.exit(1),2000)" 2>/dev/null
}

wait_port_free() { local i; for i in $(seq 1 30); do port_open "$1" "$2" || return 0; sleep 1; done; return 1; }

# Остановить и запустить сервер тем же способом, каким он был запущен
restart_server() {
  local dir="$1" mgr pid unit pmid node
  mgr=$(state_get "$dir" MANAGER)
  case "$mgr" in
    systemd)
      unit=$(state_get "$dir" UNIT)
      mkdir -p "/etc/systemd/system/$unit.d" || { warn "Нужны права root: запустите через sudo"; return 1; }
      printf '[Service]\nEnvironmentFile=-%s/.env.secrets\n' "$dir" > "/etc/systemd/system/$unit.d/steam-secrets.conf"
      systemctl daemon-reload
      systemctl restart "$unit" || return 1
      ;;
    pm2)
      pmid=$(state_get "$dir" PM2_ID)
      ( cd "$dir" && set -a && . ./.env.production && . ./.env.secrets && set +a && pm2 restart "$pmid" --update-env >/dev/null && pm2 save >/dev/null ) || return 1
      ;;
    *)
      pid=$(find_server_pid)
      if [ -n "$pid" ]; then
        kill -TERM "$pid" 2>/dev/null
        for _ in $(seq 1 40); do kill -0 "$pid" 2>/dev/null || break; sleep 1; done
        kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
      fi
      wait_port_free "$dir" "$(server_port "$dir")"
      mkdir -p "$dir/logs"
      if setsid --help 2>&1 | grep -q -- '--fork'; then
        ( cd "$dir" && setsid -f bash deploy/start.sh >> logs/server.log 2>&1 < /dev/null )
      else
        ( cd "$dir" && nohup bash deploy/start.sh >> logs/server.log 2>&1 < /dev/null & disown ) >/dev/null 2>&1
      fi
      ;;
  esac
  return 0
}

# Ждём, что сервер поднялся (порт отвечает и процесс жив 10 секунд)
wait_healthy() {
  local dir="$1" port i; port=$(server_port "$dir")
  for i in $(seq 1 60); do
    if port_open "$dir" "$port"; then
      sleep 10
      port_open "$dir" "$port" && return 0
    fi
    sleep 1
  done
  return 1
}

show_last_log() {
  local dir="$1" mgr; mgr=$(state_get "$dir" MANAGER)
  echo "----- последние строки журнала сервера -----"
  case "$mgr" in
    systemd) journalctl -u "$(state_get "$dir" UNIT)" -n 30 --no-pager 2>/dev/null ;;
    pm2) pm2 logs "$(state_get "$dir" PM2_ID)" --lines 30 --nostream 2>/dev/null ;;
    *) tail -n 30 "$dir/logs/server.log" 2>/dev/null ;;
  esac
  echo "--------------------------------------------"
}
