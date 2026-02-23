#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTIONS_DIR="$ROOT_DIR/functions"
ENV_FILE="$FUNCTIONS_DIR/.env"

PROJECT_ID="${FIREBASE_PROJECT_ID:-demo-test}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: required command not found: $1"
    exit 1
  fi
}

require_env_key() {
  local key="$1"
  awk -F= -v k="$key" '
    $1==k {
      v=$2
      gsub(/^[ \t"]+|[ \t"]+$/, "", v)
      if (length(v) > 0) ok=1
    }
    END { exit(ok ? 0 : 1) }
  ' "$ENV_FILE"
}

env_value() {
  local key="$1"
  awk -F= -v k="$key" '
    $1==k {
      v=$2
      gsub(/^[ \t"]+|[ \t"]+$/, "", v)
      print v
      exit
    }
  ' "$ENV_FILE"
}

migrate_reserved_region_key() {
  if ! grep -q '^FUNCTION_REGION=' "$ENV_FILE"; then
    return
  fi

  if grep -q '^APP_FUNCTION_REGION=' "$ENV_FILE"; then
    awk '!/^FUNCTION_REGION=/' "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
    echo "Removed reserved key FUNCTION_REGION from functions/.env"
    return
  fi

  awk '
    /^FUNCTION_REGION=/ {
      sub(/^FUNCTION_REGION=/, "APP_FUNCTION_REGION=")
      print
      next
    }
    { print }
  ' "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
  echo "Migrated functions/.env: FUNCTION_REGION -> APP_FUNCTION_REGION"
}

require_cmd npm
require_cmd firebase

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE is missing."
  echo "Run: npm run setup:functions-env"
  exit 1
fi

migrate_reserved_region_key

missing=0
for key in NOTION_TOKEN NOTION_PROJECT_DB_ID NOTION_CHECKLIST_DB_ID NOTION_TASK_DB_ID; do
  if ! require_env_key "$key"; then
    echo "Error: missing value in functions/.env -> $key"
    missing=1
  fi
done
if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

FUNCTION_REGION="${APP_FUNCTION_REGION:-$(env_value APP_FUNCTION_REGION)}"
if [[ -z "${FUNCTION_REGION:-}" ]]; then
  FUNCTION_REGION="asia-northeast3"
fi
API_BASE_URL="http://127.0.0.1:5001/${PROJECT_ID}/${FUNCTION_REGION}"

echo "[1/3] Build functions"
(cd "$FUNCTIONS_DIR" && npm run build)

echo "[2/3] Start emulators"
(
  cd "$ROOT_DIR"
  firebase emulators:start --only firestore,functions --project "$PROJECT_ID"
) &
EMU_PID=$!

cleanup() {
  if kill -0 "$EMU_PID" >/dev/null 2>&1; then
    echo
    echo "Stopping emulators..."
    kill "$EMU_PID" >/dev/null 2>&1 || true
    wait "$EMU_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

sleep 3
if ! kill -0 "$EMU_PID" >/dev/null 2>&1; then
  echo "Error: emulator failed to start."
  exit 1
fi

echo "[3/3] Start frontend"
echo "Functions Base URL: $API_BASE_URL"
cd "$ROOT_DIR"
VITE_FUNCTIONS_BASE_URL="$API_BASE_URL" npm run dev
