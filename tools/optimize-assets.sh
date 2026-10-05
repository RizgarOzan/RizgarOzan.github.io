#!/bin/sh
# Shrinks every GLB in assets/ for the web: meshopt-compressed geometry and
# WebP textures (both decoded by three.js). Files already compressed are skipped,
# so running it again after a new import only touches the new files.
#
# Sizes, chosen so the first view stays light on a slow line:
#   assets/env/forge.glb           textures fit 512 px, the two big wall/floor maps 1024; the room's
#                                  displaced walls, floor and vault at half their triangles
#   assets/weapons/<id>.glb        light copy for the field and the smithy rack: textures fit 512 px
#                                  (from that far 512 and 2048 look the same), and for the field swords
#                                  the heavy parts (guards, chains, cylinders) at a fraction of their
#                                  triangles (PARTS below); a sword opened on the site gets the full one
#   assets/weapons/<id>-hd.glb     full textures (up to 2048 px) and meshes, field swords only
# A new field-sword import dropped in as <id>.glb becomes <id>-hd.glb plus a fresh light copy;
# list the field swords in FIELD (data.js entries[].weapon) and their heavy parts in PARTS.
# The per-part work is tools/parts-lod.mjs; the ruins have their own tools/ruins-lod.mjs.
# Usage: sh tools/optimize-assets.sh   (needs Node; fetches @gltf-transform/cli)
#        GLTF_TRANSFORM=path/to/gltf-transform sh tools/optimize-assets.sh   to skip npx
set -e
cd "$(dirname "$0")/.."
FIELD="buster rebellion revolver master zangetsu"
parts() { # the light copy's simplified parts and texture sizes, per field sword
  case "$1" in
    buster) echo "--tex 512 buster_guard=0.25" ;;
    rebellion) echo "--tex 256 --tex-big 512 --big blade rebellion_ribs=0.5 rebellion_skull=0.5" ;;
    revolver) echo "--tex 512 revolver_cylinder=0.5 revolver_chain_mesh=0.5" ;;
    master) echo "--tex 512 master_grip=0.6 master_guard=0.6" ;;
    zangetsu) echo "--tex 512 zangetsu_chain=0.5" ;;
    *) echo "--tex 512" ;;
  esac
}
gt() { ${GLTF_TRANSFORM:-npx --yes @gltf-transform/cli@4.5.1} "$@" > /dev/null; }
fresh() { ! grep -q "EXT_meshopt_compression" "$1"; }
for f in assets/env/forge.glb; do
  fresh "$f" || continue
  node tools/parts-lod.mjs "$f" "$f.tmp.glb" --tex 512 --tex-big 1024 --big "rock_wall_08_Diffuse|monastery_stone_floor_Diffuse" back_wall=0.5 floor=0.5 ceiling=0.5 side_wall_l=0.5 side_wall_r=0.5 shaft=0.5
  mv "$f.tmp.glb" "$f"
done
for f in assets/env/impact-*.glb; do
  fresh "$f" || continue
  gt webp "$f" "$f.tmp.glb" --quality 95 && gt meshopt "$f.tmp.glb" "$f" && rm "$f.tmp.glb"
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
    node tools/parts-lod.mjs "$hd" "$f.tmp.glb" $(parts "$id")
  else
    node tools/parts-lod.mjs "$f" "$f.tmp.glb" --tex 512
  fi
  mv "$f.tmp.glb" "$f"
done
