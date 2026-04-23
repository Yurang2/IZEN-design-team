#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-deploy}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BASE_CONFIG="$ROOT_DIR/worker/wrangler.toml"
TMP_CONFIG="$ROOT_DIR/worker/.wrangler.generated.$$.toml"

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

echo "[run-worker] D1 binding enabled: NAS_TREE_DB (izen-nas-tree from worker/wrangler.toml)"

if [[ -n "${MEETING_AUDIO_BUCKET_NAME:-}" ]]; then
  {
    printf "\n[[r2_buckets]]\n"
    printf "binding = \"MEETING_AUDIO_BUCKET\"\n"
    printf "bucket_name = \"%s\"\n" "$MEETING_AUDIO_BUCKET_NAME"
    if [[ -n "${MEETING_AUDIO_PREVIEW_BUCKET_NAME:-}" ]]; then
      printf "preview_bucket_name = \"%s\"\n" "$MEETING_AUDIO_PREVIEW_BUCKET_NAME"
    fi
  } >> "$TMP_CONFIG"
  echo "[run-worker] R2 binding enabled: MEETING_AUDIO_BUCKET (${MEETING_AUDIO_BUCKET_NAME})"
else
  echo "[run-worker] MEETING_AUDIO_BUCKET_NAME is not set -> meetings upload disabled"
fi

if [[ "$MODE" == "dev" ]]; then
  shift || true
  npx wrangler dev --config "$TMP_CONFIG" "$@"
else
  shift || true
  npx wrangler deploy --config "$TMP_CONFIG" "$@"
fi
