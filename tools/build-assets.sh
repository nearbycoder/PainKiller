#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")/.."
# Requires Blender 4.5 and the downloaded CC0 source files in art/source.
for script in build-art refine-weapons refine-cemetery build-zombie build-skeleton build-actor-lods build-supplies build-levels build-environment-lods build-enemy-wardrobe; do
  blender -b --factory-startup --python-exit-code 1 --python "tools/$script.py"
done
if [ ! -x .art-venv/bin/python ]; then
  python3 -m venv .art-venv
  .art-venv/bin/pip install Pillow
fi
.art-venv/bin/python tools/optimize-glb.py
