#!/bin/sh
# Shrinks every GLB in assets/ for the web: meshopt-compressed geometry and
# WebP textures (both decoded by three.js). Files already compressed are skipped,
# so running it again after a new import only touches the new files.
#
# Sizes, chosen so the first view stays light on a slow line:
#   assets/env/*.glb               textures fit 1024 px (the smithy is seen across the room)
#   assets/weapons/<id>.glb        light copy, textures fit 512 px: the field and the smithy rack
#                                  (from that far 512 and 2048 look the same)
#   assets/weapons/<id>-hd.glb     full textures (up to 2048 px), field swords only: fetched
#                                  when a sword is opened (field.js sharpen)
# A new field-sword import dropped in as <id>.glb becomes <id>-hd.glb plus a fresh light copy;
# list the field swords in FIELD (data.js entries[].weapon).
# Usage: sh tools/optimize-assets.sh   (needs Node; fetches @gltf-transform/cli)
#        GLTF_TRANSFORM=path/to/gltf-transform sh tools/optimize-assets.sh   to skip npx
set -e
cd "$(dirname "$0")/.."
FIELD="buster rebellion revolver master zangetsu"
gt() { ${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli@4.5.1} "$@" > /dev/null; }
# $1 in, $2 out, $3 max texture size. Textures go through PNG so the WebP is encoded once,
# from the full image; --level medium keeps already quantized geometry as is.
shrink() {
  gt png "$1" "$2" --formats '*'
  gt resize "$2" "$2" --width "$3" --height "$3"
  gt webp "$2" "$2" --quality 90
  gt meshopt "$2" "$2" --level medium
}
fresh() { ! grep -q "EXT_meshopt_compression" "$1"; }
for f in assets/env/*.glb; do
  fresh "$f" || continue
  shrink "$f" "$f.tmp.glb" 1024 && mv "$f.tmp.glb" "$f"
  echo "$f: $(wc -c < "$f") bytes"
done
for f in assets/weapons/*.glb; do
  case "$f" in *-hd.glb) continue ;; esac
  fresh "$f" || continue
  id=$(basename "$f" .glb)
  if echo " $FIELD " | grep -q " $id "; then
    hd="assets/weapons/$id-hd.glb"
    gt webp "$f" "$hd" --quality 95
    gt meshopt "$hd" "$hd"
    shrink "$hd" "$f.tmp.glb" 512
  else
    shrink "$f" "$f.tmp.glb" 512
  fi
  mv "$f.tmp.glb" "$f"
  echo "$f: $(wc -c < "$f") bytes"
done
