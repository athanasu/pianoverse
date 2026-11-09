#!/usr/bin/env bash
# Runs everything the app needs for local development: the engine's API server and the web app.
# Usage: ./dev.sh            (Ctrl+C stops both)
#        NO_OPEN=1 ./dev.sh  (don't open the browser)
#        PIANOVERSE_PORT=8001 ./dev.sh
# Written for the bash 3.2 that ships with macOS.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENGINE="$ROOT/engine"
APP="$ROOT/app"
ENV_FILE="$APP/.env.local"
API_PORT="${PIANOVERSE_PORT:-8000}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
step() { printf '\033[1;34m▸\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

need() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is missing. Install it with: $2"
}

port_busy() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

# Prefixes every line so the two logs stay readable when interleaved.
label() {
  awk -v tag="$1" '{ print tag " " $0; fflush() }'
}

wait_for() {
  local url="$1" seconds="$2" pid="$3" i
  for ((i = 0; i < seconds * 2; i++)); do
    curl -fsS -o /dev/null "$url" 2>/dev/null && return 0
    kill -0 "$pid" 2>/dev/null || return 1
    sleep 0.5
  done
  return 1
}

# The key lives in app/.env.local so the app and the server always agree on it.
read_key() {
  [ -f "$ENV_FILE" ] || return 0
  sed -n 's/^VITE_API_KEY=//p' "$ENV_FILE" | tail -n 1 | tr -d '[:space:]'
}

new_key() {
  od -An -tx1 -N16 /dev/urandom | tr -d ' \n'
}

step "Checking tools"
need uv "brew install uv"
need pnpm "brew install pnpm"
need node "brew install node"
need ffmpeg "brew install ffmpeg"
need ffprobe "brew install ffmpeg"
need curl "brew install curl"
need lsof "your system package manager"
need pgrep "your system package manager"
node -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 22) ? 0 : 1)' \
  || die "Node 22.22 or newer is needed (you have $(node --version)). Update it with: brew upgrade node"

step "Installing engine dependencies (uv sync)"
(cd "$ENGINE" && uv sync --quiet)

step "Installing app dependencies (pnpm install)"
(cd "$APP" && pnpm install --frozen-lockfile --silent)

KEY="$(read_key)"
if [ -z "$KEY" ]; then
  KEY="$(new_key)"
  if [ -f "$ENV_FILE" ] && grep -q '^VITE_API_KEY=' "$ENV_FILE"; then
    tmp="$(mktemp)"
    sed "s/^VITE_API_KEY=.*/VITE_API_KEY=$KEY/" "$ENV_FILE" >"$tmp" && mv "$tmp" "$ENV_FILE"
  elif [ -f "$ENV_FILE" ]; then
    printf '\nVITE_API_KEY=%s\n' "$KEY" >>"$ENV_FILE"
  else
    sed "s/^VITE_API_KEY=.*/VITE_API_KEY=$KEY/" "$APP/.env.example" >"$ENV_FILE"
  fi
  step "Created an API key in app/.env.local"
fi

port_busy "$API_PORT" \
  && die "Port $API_PORT is already in use (another pianoverse-server?). Stop it, or run: PIANOVERSE_PORT=8001 ./dev.sh"

APP_PORT=5173
while port_busy "$APP_PORT"; do
  APP_PORT=$((APP_PORT + 1))
  [ "$APP_PORT" -le 5199 ] || die "No free port between 5173 and 5199 for the app"
done

API_URL="http://127.0.0.1:$API_PORT"
APP_URL="http://localhost:$APP_PORT"

SERVER_PID=""
APP_PID=""

# Children first, so uvicorn and vite go down with the commands that started them.
kill_tree() {
  local child
  for child in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$child"; done
  kill "$1" 2>/dev/null || true
}

# Stop both on Ctrl+C, on an error, or when one of them exits.
cleanup() {
  trap - INT TERM EXIT
  [ -n "$SERVER_PID$APP_PID" ] || return 0
  echo
  step "Stopping"
  [ -n "$APP_PID" ] && kill_tree "$APP_PID"
  [ -n "$SERVER_PID" ] && kill_tree "$SERVER_PID"
  wait 2>/dev/null || true
}
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM
trap cleanup EXIT

step "Starting the server on $API_URL"
(cd "$ENGINE" && PIANOVERSE_API_KEY="$KEY" PIANOVERSE_PORT="$API_PORT" PIANOVERSE_CORS_ORIGINS="$APP_URL" \
  exec uv run pianoverse-server) > >(label "[server]") 2>&1 &
SERVER_PID=$!
wait_for "$API_URL/api/health" 60 "$SERVER_PID" || die "The server did not start; see the [server] lines above"

step "Starting the app on $APP_URL"
# Variables set here take priority over app/.env.local, so the port and key always match the server.
(cd "$APP" && VITE_API_URL="$API_URL" VITE_API_KEY="$KEY" exec pnpm exec vite --port "$APP_PORT" --strictPort) \
  > >(label "[app]   ") 2>&1 &
APP_PID=$!
wait_for "$APP_URL" 60 "$APP_PID" || die "The app did not start; see the [app] lines above"

echo
bold "Pianoverse is running: $APP_URL   (Ctrl+C to stop)"
echo
if [ -z "${NO_OPEN:-}" ]; then
  if command -v open >/dev/null 2>&1; then open "$APP_URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$APP_URL" >/dev/null 2>&1 || true
  fi
fi

while kill -0 "$SERVER_PID" 2>/dev/null && kill -0 "$APP_PID" 2>/dev/null; do
  sleep 1
done
die "One of the two stopped; see the lines above"
