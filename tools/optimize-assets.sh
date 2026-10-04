#!/bin/sh
# Shrinks every GLB in assets/ for the web: meshopt-compressed geometry and
# WebP textures (both decoded by three.js). Files already compressed are skipped,
# so running it again after a new import only touches the new files.
# Usage: sh tools/optimize-assets.sh   (needs Node; fetches @gltf-transform/cli)
set -e
cd "$(dirname "$0")/.."
for f in assets/weapons/*.glb assets/env/*.glb; do
  if grep -q "EXT_meshopt_compression" "$f"; then continue; fi
  before=$(wc -c < "$f")
  tmp="$f.tmp.glb"
  npx --yes @gltf-transform/cli@4.5.1 webp "$f" "$tmp" --quality 95 > /dev/null
  npx --yes @gltf-transform/cli@4.5.1 meshopt "$tmp" "$tmp" > /dev/null
  mv "$tmp" "$f"
  echo "$f: $before -> $(wc -c < "$f") bytes"
done
