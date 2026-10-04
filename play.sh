#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"
if [ -x release/linux-unpacked/purgatory ]; then
  exec release/linux-unpacked/purgatory "$@"
fi
appimage=$(ls release/Purgatory-*.AppImage 2>/dev/null | sort -V | tail -n 1 || true)
if [ -n "$appimage" ] && [ -x "$appimage" ]; then
  exec "$appimage" --appimage-extract-and-run "$@"
fi
if [ ! -d node_modules ]; then
  npm ci
fi
npm run build
exec node_modules/.bin/electron . "$@"
