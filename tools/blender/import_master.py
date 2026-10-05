"""Master Sword (The Legend of Zelda) from Yogensia's Sketchfab fan art.

blender -b --factory-startup -P tools/blender/import_master.py [-- <out_id>]
Reads  C:/Users/forev/Downloads/kilic/sf/master-sword-legend-of-zelda-fan-art/ (MasterSword.fbx,
       albedo/specular/gloss/ao/normal maps; uid 1e6d1805959b4ed3b7ad92fdee480ef6, CC-BY-NC-SA)
Writes assets/weapons/<out_id>.glb (default "master").

The maps are a specular/glossiness set (the purple, gold and steel colours live in specular.png,
albedo.png is the near-black diffuse of the metals). They are converted with the Khronos
spec/gloss -> metal/rough formula (linear space): base colour and metallic from diffuse +
specular, roughness = 1 - gloss, AO into the ORM red channel. Geometry is kept as downloaded
(5.1k tris), scaled from 0.83 m to 1.0 m, loose parts grouped into master_blade / master_guard /
master_grip.
"""
import os
import sys

sys.path.append(os.path.dirname(__file__))
from sf_pbr import (reset, load_source, fit, split, read, save_jpeg, orm, spec_gloss_to_metal,
                    pbr_material, export_glb)

DIR = r'C:\Users\forev\Downloads\kilic\sf\master-sword-legend-of-zelda-fan-art'
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_ID = args[0] if args else 'master'
LENGTH = 1.0
SIZE = (1024, 2048)   # source maps are 2048 x 4096

reset()
src = load_source(os.path.join(DIR, 'source', 'MasterSword.fbx'))   # already Z up, tip at -Z, flat on Y
fit(src, LENGTH, grip_band=(0.84, 0.92))


def classify(lo, hi, c):
    return 'blade' if c < 0.6 else ('guard' if c < 0.8 else 'grip')


parts = split(src, 'master', classify)

tex = lambda n: read(os.path.join(DIR, 'textures', n + '.png'), SIZE)
diffuse = tex('albedo')[..., :3]
specular = tex('specular')[..., :3]
gloss = tex('gloss')[..., 0]
ao = tex('ao')[..., 0]
normal = tex('normal')[..., :3]

base, metal = spec_gloss_to_metal(diffuse, specular)
m = pbr_material('master',
                 save_jpeg('master', 'albedo', base, data=False),
                 save_jpeg('master', 'orm', orm(ao, 1.0 - gloss, metal)),
                 save_jpeg('master', 'normal', normal, quality=92))
for p in parts:
    p.data.materials.clear()
    p.data.materials.append(m)

export_glb('master', parts, OUT_ID)
