#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FUNCTIONS_DIR="$ROOT_DIR/functions"
ENV_FILE="$FUNCTIONS_DIR/.env"

echo "Functions .env setup"
echo "Values are saved to: $ENV_FILE"
echo
echo "Paste is supported in this prompt."
echo "If your terminal blocks paste, set NOTION_TOKEN as env var before running."
echo

if [[ -n "${NOTION_TOKEN:-}" ]]; then
  echo "NOTION_TOKEN: using existing environment variable"
else
  read -r -p "NOTION_TOKEN: " NOTION_TOKEN
fi
read -r -p "NOTION_PROJECT_DB_ID: " NOTION_PROJECT_DB_ID
read -r -p "NOTION_CHECKLIST_DB_ID: " NOTION_CHECKLIST_DB_ID
read -r -p "NOTION_TASK_DB_ID: " NOTION_TASK_DB_ID

if [[ -z "$NOTION_TOKEN" || -z "$NOTION_PROJECT_DB_ID" || -z "$NOTION_CHECKLIST_DB_ID" || -z "$NOTION_TASK_DB_ID" ]]; then
  echo "Error: all required values must be provided."
  exit 1
fi

cat > "$ENV_FILE" <<EOF
NOTION_TOKEN=$NOTION_TOKEN
NOTION_PROJECT_DB_ID=$NOTION_PROJECT_DB_ID
NOTION_CHECKLIST_DB_ID=$NOTION_CHECKLIST_DB_ID
NOTION_TASK_DB_ID=$NOTION_TASK_DB_ID
APP_FUNCTION_REGION=asia-northeast3
SYNC_DOC_ID=notion_project_sync
TASK_API_CACHE_MS=15000
EOF

echo
echo "Done: functions/.env created."
