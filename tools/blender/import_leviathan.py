"""Leviathan Axe (God of War) from Sky_Hunter's Sketchfab model.

blender -b --factory-startup -P tools/blender/import_leviathan.py [-- <out_id>]
Reads  C:/Users/forev/Downloads/kilic/sf/leviathan-axe/ (axe_low_scetchfab.fbx + Axe.002 PBR maps,
       uid 09974baf271e498f94a92e284217d56e, CC-BY)
Writes assets/weapons/<out_id>.glb (default "leviathan").

Planted head-down: the model is turned 180 degrees in its own plane (the engraved cheek with the
gold boss keeps facing the viewer), so the handle points up and the horn of the cutting edge is
the lowest point, at y = 0. Geometry is kept as downloaded (6.3k tris), scaled from 1.11 m to
0.8 m, grip axis (leather wrap centre) on x = z = 0. The source has no strap or charm, so nothing
hangs; the wrap is a tight separate shell and becomes leviathan_grip, everything else
(head, haft, boss, rivets) is leviathan_axe. Maps: 4096 px albedo/AO/metal/rough/normal ->
2048 px albedo + ORM + normal.
"""
import math
import os
import sys

sys.path.append(os.path.dirname(__file__))
from mathutils import Matrix
from sf_pbr import (reset, load_source, orient, fit, split, read, save_jpeg, orm,
                    pbr_material, export_glb, coords)

DIR = r'C:\Users\forev\Downloads\kilic\sf\leviathan-axe'
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_ID = args[0] if args else 'leviathan'
LENGTH = 0.8
SIZE = (2048, 2048)

reset()
src = load_source(os.path.join(DIR, 'source', 'axe_low_scetchfab.fbx'))   # Z up, head on top
orient(src, Matrix.Rotation(math.pi, 3, 'Y'))                              # head down, same face front
fit(src, LENGTH, grip_band=(0.5, 0.7))
v = coords(src)
low = v[v[:, 2].argmin()]
print('LOWEST POINT', tuple(round(c, 4) for c in low))


def classify(lo, hi, c):
    return 'grip' if lo > 0.4 and hi < 0.8 else 'axe'


parts = split(src, 'leviathan', classify)

tex = lambda n: read(os.path.join(DIR, 'textures', f'Axe.002_{n}'), SIZE)
albedo = tex('albedo.jpg')[..., :3]
ao = tex('AO.jpg')[..., 0]
metal = tex('metallic.jpg')[..., 0]
rough = tex('roughness.jpg')[..., 0]
normal = tex('normal.png')[..., :3]

m = pbr_material('leviathan',
                 save_jpeg('leviathan', 'albedo', albedo, data=False),
                 save_jpeg('leviathan', 'orm', orm(ao, rough, metal)),
                 save_jpeg('leviathan', 'normal', normal, quality=92))
for p in parts:
    p.data.materials.clear()
    p.data.materials.append(m)

export_glb('leviathan', parts, OUT_ID)
