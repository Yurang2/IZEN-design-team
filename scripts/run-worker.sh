#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-deploy}"
BASE_CONFIG="worker/wrangler.toml"
TMP_CONFIG="$(mktemp /tmp/wrangler.worker.XXXXXX.toml)"

cleanup() {
  rm -f "$TMP_CONFIG"
}
trap cleanup EXIT

cp "$BASE_CONFIG" "$TMP_CONFIG"

if [[ -n "${CHECKLIST_DB_ID:-}" ]]; then
  DB_NAME="${CHECKLIST_DB_NAME:-izen-design-checklist}"
  {
    printf "\n[[d1_databases]]\n"
    printf "binding = \"CHECKLIST_DB\"\n"
    printf "database_name = \"%s\"\n" "$DB_NAME"
    printf "database_id = \"%s\"\n" "$CHECKLIST_DB_ID"
  } >> "$TMP_CONFIG"
  echo "[run-worker] D1 binding enabled: CHECKLIST_DB (${DB_NAME})"
else
  echo "[run-worker] CHECKLIST_DB_ID is not set -> cache mode"
fi

if [[ "$MODE" == "dev" ]]; then
  shift || true
  npx wrangler dev --config "$TMP_CONFIG" "$@"
else
  shift || true
  npx wrangler deploy --config "$TMP_CONFIG" "$@"
fi
