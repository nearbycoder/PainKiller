#!/usr/bin/env bash
# Builds the static site GitHub Pages serves at https://nearbycoder.github.io/PainKiller/
# into pages/ (git-ignored): index.html at its root, a .nojekyll file, relative URLs only,
# no server code and no headers needed. Check it with tools/check-pages.mjs.
#
#   bash tools/build-pages.sh            # type-check, build and copy to pages/
#   bash tools/build-pages.sh --out DIR  # somewhere else
set -euo pipefail
cd "$(dirname "$0")/.."
out=pages
if [[ "${1:-}" == "--out" ]]; then out=$2; fi

[[ -d node_modules ]] || npm ci
npm run build

rm -rf "$out"
mkdir -p "$out"
# The same files as the web zip: everything in dist/ except the source-texture folders
# tools/fetch-art.py downloads (the GLBs embed them; only the HDR sky is fetched).
(cd dist && find . -type f ! -path './assets/textures/*/*' -print0) |
  while IFS= read -r -d '' file; do
    mkdir -p "$out/$(dirname "$file")"
    cp "dist/$file" "$out/$file"
  done
touch "$out/.nojekyll"

# GitHub refuses files over 100 MB and warns over 50 MB.
largest=$(find "$out" -type f -printf '%s %P\n' | sort -n | tail -1)
bytes=${largest%% *}
echo "$out/: $(find "$out" -type f | wc -l) files, $(du -sh "$out" | cut -f1); largest ${largest#* } ($((bytes / 1048576)) MB)"
if ((bytes >= 100 * 1048576)); then
  echo "error: ${largest#* } is over GitHub's 100 MB limit" >&2
  exit 1
elif ((bytes >= 50 * 1048576)); then
  echo "warning: ${largest#* } is over 50 MB" >&2
fi
