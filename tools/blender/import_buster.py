"""Buster Sword (Final Fantasy VII) from a Sketchfab download.

blender -b --factory-startup -P tools/blender/import_buster.py [-- <source> [<out_id>]]
<source>: 'dharvey' (default) or 'jmgamedev'. Writes assets/weapons/<out_id>.glb (default "buster").

  jmgamedev "Final Fantasy 7 Remake Buster Sword" by JMGameDev, uid eab54072e1744a8cbd14e69fa6b03d96,
           CC-BY (sf/buster-sword: nested BusterSword1.zip -> model/model.fbx, 4.4k tris, 1024 px PBR maps)
  dharvey  "Final Fantasy 7: Buster Sword" by dharvey296, uid 9b931e7276c54c25ba919393f23500e4, CC-BY
           (sf/final-fantasy-7-buster-sword: nested Buster_Test.zip.zip -> Buster_Test.obj, 16k tris,
           4k albedo/metal/rough/normal, no AO)

dharvey is the one used: it has the Advent Children / Remake hilt (brass swirl ears, raised
plate with the two holes, engraved panels down the spine) and 4k maps. jmgamedev has a wrapped
grip and round pommel but an I-beam guard with five rivets that the real sword does not have,
and only 1024 px maps.

Geometry is kept as downloaded: oriented tip down, grip axis on x = y = 0, scaled to 1.8 m,
loose parts grouped into buster_blade / buster_guard / buster_grip. Maps are repacked into
albedo + ORM (AO, roughness, metallic) + normal JPEGs.
"""
import math
import os
import sys
import zipfile

sys.path.append(os.path.dirname(__file__))
import numpy as np
from mathutils import Matrix
from sf_pbr import (reset, load_source, orient, fit, split, read, save_jpeg, orm,
                    pbr_material, export_glb)

SF = r'C:\Users\forev\Downloads\kilic\sf'
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
SOURCE = args[0] if args else 'dharvey'
OUT_ID = args[1] if len(args) > 1 else 'buster'
LENGTH = 1.8

SOURCES = {
    'jmgamedev': dict(
        zip=os.path.join(SF, 'buster-sword', 'source', 'BusterSword1.zip'),
        mesh='model/model.fbx',
        tex=os.path.join(SF, 'buster-sword', 'textures', 'BusterSword1_{}.jpeg'),
        maps=dict(albedo='albedo', ao='AO', metal='metallic', rough='roughness', normal='normal'),
        normal_ext='.png',
        rot=Matrix.Rotation(math.radians(-90), 3, 'Y'),     # length +X (tip at -X) -> +Z, tip down
        grip=(0.86, 0.95),
        size=1024),
    'dharvey': dict(
        zip=os.path.join(SF, 'final-fantasy-7-buster-sword', 'source', 'Buster_Test.zip.zip'),
        mesh='Buster_Test.obj',
        tex=os.path.join(SF, 'final-fantasy-7-buster-sword', 'textures', 'Blade_{}.png'),
        maps=dict(albedo='albedo', ao=None, metal='metallic', rough='roughness', normal='normal'),
        normal_ext='.png',
        rot=Matrix.Rotation(math.radians(90), 3, 'X'),      # length -Y (tip at -Y) -> +Z, tip down
        grip=(0.83, 1.0),                                    # grip is one long cylinder: use its end rings
        size=2048),
}
S = SOURCES[SOURCE]

# nested zip -> %TEMP%
xdir = os.path.join(os.environ.get('TEMP', '.'), 'sf_src', f'buster_{SOURCE}')
with zipfile.ZipFile(S['zip']) as z:
    z.extractall(xdir)

reset()
src = load_source(os.path.join(xdir, S['mesh']))
orient(src, S['rot'])
fit(src, LENGTH, grip_band=S['grip'])


def classify(lo, hi, c):
    return 'blade' if c < 0.6 else ('guard' if c < 0.85 else 'grip')


parts = split(src, 'buster', classify)

# ---------- material ----------
N = S['size']
mp = S['maps']
tex = lambda k: S['tex'].format(mp[k])
albedo = read(tex('albedo'), (N, N))[..., :3]
rough = read(tex('rough'), (N, N))[..., 0]
metal = read(tex('metal'), (N, N))[..., 0]
ao = read(tex('ao'), (N, N))[..., 0] if mp['ao'] else np.ones_like(rough)
normal = read(S['tex'].format(mp['normal']).rsplit('.', 1)[0] + S['normal_ext'], (N, N))[..., :3]

m = pbr_material('buster',
                 save_jpeg('buster', 'albedo', albedo, data=False),
                 save_jpeg('buster', 'orm', orm(ao, rough, metal)),
                 save_jpeg('buster', 'normal', normal, quality=92))
for p in parts:
    p.data.materials.clear()
    p.data.materials.append(m)

export_glb('buster', parts, OUT_ID)
