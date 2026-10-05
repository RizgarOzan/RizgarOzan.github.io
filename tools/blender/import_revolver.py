"""Revolver, Squall's gunblade (Final Fantasy VIII), from nikexz's Sketchfab model.

blender -b --factory-startup -P tools/blender/import_revolver.py

Source: "Gunblade from FFVIII" by nikexz (sketchfab 66562b7ae1744c7a80f68d67af8f25f0, CC-BY),
C:/Users/forev/Downloads/kilic/sf/gunblade-from-ffviii: source/Gunblade new.fbx (11k triangles,
every part its own object under an empty, ~0.3 m long, blade toward -Y, cylinder up +Z, the
Griever chain hanging toward -Z from the butt) and textures/phong1_* (2048 PNG: base colour,
metallic, roughness, mixed AO, OpenGL normal). The FBX material arrives with nothing linked.

Pipeline: import -> apply transforms -> join into revolver_blade (frame, blade, grip, hammer,
trigger, latch), revolver_cylinder (cylinder, bullets, crane, ejector rod) and revolver_chain
(clasp, links, Griever pendant) -> stand up tip down, the side Sketchfab shows (+X) toward -Y,
blade centred on x = y = 0 -> scale to LENGTH -> turn the chain about its clasp to hang down
(as in the source, where it hangs straight under the grip) -> textures: base colour and normal
to JPEG, AO/roughness/metallic packed to ORM -> GLB (revolver_chain is an empty at the clasp
holding revolver_chain_mesh, see chain_pivot in import_oathkeeper.py).
"""
import os
import sys
import tempfile

import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.append(os.path.dirname(__file__))
from forge_bl import reset, OUT_DIR
from sf_pbr import read, save_jpeg
from import_oathkeeper import attachment, chain_pivot, coords, hang, orm_material, tri_count

SRC = r'C:\Users\forev\Downloads\kilic\sf\gunblade-from-ffviii'
FBX = os.path.join(SRC, 'source', 'Gunblade new.fbx')
TEX = os.path.join(SRC, 'textures', 'phong1_{}.tga.png')
LENGTH = 1.2            # m, tip to the back of the grip
CYLINDER = ('barrel_low', 'clndr_low', 'extractor_rod_a_low', 'extractor_rod_b_low')
WID = 'revolver'
CHAIN_CLEARANCE = 0.004   # m; the chain may lie close along the backstrap
CHAIN_SKIP = 0.05 # m; clasp and first links wrap the butt


def jpeg(src, name, quality=90):
    """Source PNG -> JPEG with the stored values unchanged (full 2048). save_render, used before,
    ran the pixels through the AgX view transform: greyed the grip's red-brown and bent the normals."""
    return save_jpeg(WID, name.replace(f'{WID}_', ''), read(src)[..., :3], quality=quality).filepath


def join(name, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = o.data.name = name
    return o


reset()
bpy.ops.import_scene.fbx(filepath=FBX)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in meshes:
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
for o in [o for o in bpy.context.scene.objects if o.type == 'EMPTY']:
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

chain_parts = [o for o in meshes if o.name.startswith('chain') or o.name.startswith('lion')]
cyl_parts = [o for o in meshes if o.name in CYLINDER or o.name.startswith('bullet')]
body_parts = [o for o in meshes if o not in chain_parts and o not in cyl_parts]
body_parts.sort(key=lambda o: o.name != 'main_low')
blade = join(f'{WID}_blade', body_parts)
cyl = join(f'{WID}_cylinder', cyl_parts)
chain = join(f'{WID}_chain', chain_parts)

# Stand up: source -Y (tip) -> -Z, source +X (shown side) -> -Y, source +Z (cylinder) -> -X.
R = Matrix(((0, 0, -1, 0), (-1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
Vb = coords(blade)
length = Vb[:, 1].max() - Vb[:, 1].min()
# Blade centre line: middle of the blade's width (source Z) over its lower half.
lower = Vb[:, 1] < Vb[:, 1].min() + 0.5 * length
zc = (Vb[lower, 2].max() + Vb[lower, 2].min()) / 2
xc = (Vb[lower, 0].max() + Vb[lower, 0].min()) / 2
s = LENGTH / length
M = Matrix.Scale(s, 4) @ R @ Matrix.Translation((-xc, -Vb[:, 1].min(), -zc))
for o in (blade, cyl, chain):
    o.data.transform(M)
    o.data.update()

# Chain: turn it about the clasp so it hangs straight down, clear of the grip.
body = np.vstack([coords(blade), coords(cyl)])
att = attachment(body, coords(chain))
Rc = hang(coords(chain), body, att, clearance=CHAIN_CLEARANCE, skip=CHAIN_SKIP)
chain.data.transform(Rc.to_4x4() @ Matrix.Translation(-Vector(att)))
chain.data.update()

zmin = min(body[:, 2].min(), coords(chain)[:, 2].min() + att[2])
for o in (blade, cyl):
    o.data.transform(Matrix.Translation((0, 0, -zmin)))
chain.location = Vector(att) - Vector((0, 0, zmin))
root = bpy.data.objects.new(WID, None)
bpy.context.scene.collection.objects.link(root)
for o in (blade, cyl, chain):
    o.parent = root

paths = {'albedo': jpeg(TEX.format('Base_Color'), f'{WID}_albedo', 90),
         'normal': jpeg(TEX.format('Normal_OpenGL'), f'{WID}_normal', 92),
         'AO': TEX.format('Mixed_AO'), 'roughness': TEX.format('Roughness'), 'metallic': TEX.format('Metallic')}
mat = orm_material(paths, WID)
for o in (blade, cyl, chain):
    o.data.materials.clear()
    o.data.materials.append(mat)

pivot = chain_pivot(chain, WID, root)

os.makedirs(OUT_DIR, exist_ok=True)
path = os.path.join(OUT_DIR, f'{WID}.glb')
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_materials='EXPORT',
                          export_image_format='AUTO', export_tangents=False)
allv = np.vstack([coords(blade), coords(cyl), coords(chain) + np.array(pivot.location)])
print('STATS', WID, 'tris', tri_count(blade) + tri_count(cyl) + tri_count(chain), 'chain', tri_count(chain),
      'size_xyz_m', tuple(np.round(allv.max(0) - allv.min(0), 3)), 'min', tuple(np.round(allv.min(0), 3)),
      'chain_origin', tuple(np.round(np.array(pivot.location), 3)), 'bytes', os.path.getsize(path))
print('EXPORTED', path)
