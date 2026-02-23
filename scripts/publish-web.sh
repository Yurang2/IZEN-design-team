#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"

cd "$ROOT_DIR"
npm run build

if [[ ! -d "$DIST_DIR" ]]; then
  echo "Error: dist directory not found"
  exit 1
fi

rm -rf "$ROOT_DIR/assets"
cp -f "$DIST_DIR/index.html" "$ROOT_DIR/index.html"
cp -R "$DIST_DIR/assets" "$ROOT_DIR/assets"

if [[ -f "$ROOT_DIR/public/_redirects" ]]; then
  cp -f "$ROOT_DIR/public/_redirects" "$ROOT_DIR/_redirects"
fi

if [[ -f "$ROOT_DIR/public/_headers" ]]; then
  cp -f "$ROOT_DIR/public/_headers" "$ROOT_DIR/_headers"
fi

if [[ -f "$ROOT_DIR/public/app-config.js" ]]; then
  cp -f "$ROOT_DIR/public/app-config.js" "$ROOT_DIR/app-config.js"
fi

echo "Web static bundle published to repository root"
