#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="${BASH_SOURCE[0]}"
while [[ -L "$SCRIPT_PATH" ]]; do
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
  LINK_TARGET="$(readlink "$SCRIPT_PATH")"
  if [[ "$LINK_TARGET" = /* ]]; then
    SCRIPT_PATH="$LINK_TARGET"
  else
    SCRIPT_PATH="$SCRIPT_DIR/$LINK_TARGET"
  fi
done
ROOT_DIR="$(cd "$(dirname "$SCRIPT_PATH")" && pwd)"
PORT="${PORT:-4173}"
INITIAL_FILE_PATH="${1:-}"
SERVE_FILE_NAME=".lumina-open.md"
LOG_FILE=".lumina-server.log"
PID_FILE=".lumina-server.pid"
MAX_PORT_SCAN=200

find_listener_pid() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | awk 'NR==1 { print; exit }'
}

is_lumina_server_pid() {
  local pid="$1"
  local cmd
  local cwd
  cmd="$(ps -p "$pid" -o command= 2>/dev/null || true)"
  cwd="$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ { sub(/^n/, "", $0); print; exit }')"
  [[ "$cmd" =~ [Pp]ython && "$cmd" == *"http.server"* && "$cwd" == "$ROOT_DIR" ]]
}

kill_lumina_server_on_port() {
  local port="$1"
  local pid
  pid="$(find_listener_pid "$port")"
  if [[ -z "$pid" ]]; then
    return 1
  fi

  if is_lumina_server_pid "$pid"; then
    echo "Stopping stale Lumina server on port ${port} (pid ${pid})." >&2
    kill "$pid" 2>/dev/null || true
    local waited=0
    while kill -0 "$pid" 2>/dev/null; do
      sleep 0.1
      waited=$((waited + 1))
      if [[ "$waited" -ge 20 ]]; then
        kill -9 "$pid" 2>/dev/null || true
        break
      fi
    done
    return 0
  fi

  return 1
}

is_port_in_use() {
  python3 - "$1" <<'PY'
import socket
import sys

port = int(sys.argv[1])
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.settimeout(0.2)
result = sock.connect_ex(("127.0.0.1", port))
sock.close()
sys.exit(0 if result == 0 else 1)
PY
}

resolve_port() {
  local start_port="$1"
  local candidate="$start_port"
  local checked=0

  while is_port_in_use "$candidate"; do
    if kill_lumina_server_on_port "$candidate"; then
      continue
    fi
    candidate=$((candidate + 1))
    checked=$((checked + 1))
    if [[ "$checked" -ge "$MAX_PORT_SCAN" ]]; then
      echo "Could not find a free port in range ${start_port}-$((start_port + MAX_PORT_SCAN))" >&2
      exit 1
    fi
  done

  echo "$candidate"
}

if [[ "$INITIAL_FILE_PATH" == "--stop" ]]; then
  if kill_lumina_server_on_port "$PORT"; then
    echo "Lumina stopped on port ${PORT}."
    exit 0
  fi
  echo "No Lumina server found on port ${PORT}."
  exit 0
fi

if [[ -n "$INITIAL_FILE_PATH" ]]; then
  if [[ "$INITIAL_FILE_PATH" = /* ]]; then
    SOURCE_FILE="$INITIAL_FILE_PATH"
  else
    SOURCE_FILE="$(pwd)/$INITIAL_FILE_PATH"
  fi

  if [[ ! -f "$SOURCE_FILE" ]]; then
    echo "File not found: $INITIAL_FILE_PATH" >&2
    exit 1
  fi

  cp "$SOURCE_FILE" "$ROOT_DIR/$SERVE_FILE_NAME"
  SOURCE_BASENAME="$(basename "$SOURCE_FILE")"
  URL_NAME_PARAM="$(python3 - "$SOURCE_BASENAME" <<'PY'
import sys
import urllib.parse
print(urllib.parse.quote(sys.argv[1]))
PY
)"
fi

cd "$ROOT_DIR"

RESOLVED_PORT="$(resolve_port "$PORT")"
if [[ "$RESOLVED_PORT" != "$PORT" ]]; then
  echo "Port ${PORT} is busy, using ${RESOLVED_PORT} instead."
fi
PORT="$RESOLVED_PORT"

URL="http://localhost:${PORT}"
if [[ -n "$INITIAL_FILE_PATH" ]]; then
  URL="${URL}/?file=${SERVE_FILE_NAME}&name=${URL_NAME_PARAM}"
fi

echo "Starting Lumina at ${URL}"
nohup python3 -m http.server "$PORT" >"$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" >"$PID_FILE"

sleep 0.15
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "Failed to start Lumina server. Check ${ROOT_DIR}/${LOG_FILE}" >&2
  exit 1
fi

if command -v open >/dev/null 2>&1; then
  open "$URL" >/dev/null 2>&1 || true
fi

echo "Lumina server running in background (pid ${SERVER_PID})."
echo "Logs: ${ROOT_DIR}/${LOG_FILE}"
