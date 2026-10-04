"""Blade of Chaos (God of War), John Machine's Sketchfab model (CC-BY).

blender -b --factory-startup -P tools/blender/import_chaos.py
Reads  C:/Users/forev/Downloads/kilic/sf/blades-of-chaos-from-god-of-war/
       (source/1.fbx + baked albedo/metallic/roughness/normal sets; uid a914101b147a4d86a440e76acc946bc8)
Writes assets/weapons/chaos.glb (src/weapons/chaos.js stays as the procedural fallback).

The FBX is one blade (no pair, no chain: Sketchfab lists the same 2.7k tris), 8 meshes. Only three
of its materials still carry the baked set's name; the other links were found by laying each
mesh's UVs over the candidate albedos (uvmatch): Plane002 = blade (Plane002_mtl), Plane003 =
Plane008_mtl, Plane004 = Material 130, Plane005 = Material 152, Cylinder004 = the flat gold
213_Material__33. Maps are already metal/rough; there is no AO, so ORM red = 1.
Source: tip at +X, flat in the XY plane. Turned tip down, scaled to LENGTH.
Blade and guard colour/normal maps keep their native size (2048 / 1024); ORM is half size and the
small grip/pommel sets are 512, which keeps the optimized GLB under 4 MB.
The FBX's own (custom) normals are kept; its flat-flagged guard plates are marked smooth so
the baked normal maps sit on the low-poly normals they were baked against.
"""
import os
import sys

sys.path.append(os.path.dirname(__file__))
import bpy
import numpy as np
from mathutils import Matrix
from sf_pbr import reset, coords, read, save_jpeg, orm, pbr_material, export_glb

DIR = r'C:\Users\forev\Downloads\kilic\sf\blades-of-chaos-from-god-of-war'
LENGTH = 0.90   # m, tip to pommel claw

# mesh -> (texture set, map size, part)
MESHES = {
    'Plane002':    ('baked_Plane002_mtl', 2048, 'blade'),
    'Cylinder004': ('213_Material__33', 128, 'guard'),
    'Plane003':    ('baked_Plane008_mtl', 2048, 'guard'),
    'Plane004':    ('baked_Material__130', 768,  'guard'),
    'Plane005':    ('baked_Material__152', 1024, 'guard'),
    'Cylinder005': ('baked_Material__153', 512, 'grip'),
    'Plane006':    ('baked_Material__154', 512, 'pommel'),
    'Plane009':    ('baked_Material__155', 512, 'pommel'),
}


def tex(name, kind):
    for ext in ('.jpg', '.png'):
        p = os.path.join(DIR, 'textures', f'{name}_{kind}{ext}')
        if os.path.exists(p):
            return p
    return None


def material(key, size):
    sz = (size, size)
    if key == '213_Material__33':        # flat gold: base colour + normal only
        base = read(tex(key, 'BaseColor'))[..., :3]
        norm = read(tex(key, 'Normal'))[..., :3]
        rough = np.full(base.shape[:2], 0.35, np.float32)
        metal = np.ones(base.shape[:2], np.float32)
    else:
        base = read(tex(key, 'albedo'), sz)[..., :3]
        norm = read(tex(key, 'normal'), sz)[..., :3]
        half = (max(size // 2, 256),) * 2               # ORM at half size keeps the GLB under 4 MB
        rough = read(tex(key, 'roughness'), half)[..., 0]
        metal = read(tex(key, 'metallic'), half)[..., 0]
    ao = np.ones_like(rough)
    n = key.replace('baked_', '').lower()
    return pbr_material(f'chaos_{n}',
                        save_jpeg('chaos', n + '_albedo', base, data=False),
                        save_jpeg('chaos', n + '_orm', orm(ao, rough, metal)),
                        save_jpeg('chaos', n + '_normal', norm, quality=92))


reset()
bpy.ops.import_scene.fbx(filepath=os.path.join(DIR, 'source', '1.fbx'))
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)
objs = {o.name: o for o in bpy.context.scene.objects}
assert set(objs) == set(MESHES), sorted(objs)

for o in objs.values():          # bake object transforms; Plane002 carries an FBX anim curve that
    o.animation_data_clear()     # would put its old transform back on export
    o.data.transform(o.matrix_world)
    o.matrix_world = Matrix.Identity(4)

# source (x tip, y width, z thickness) -> forge frame (z up, tip at z = 0, flat face on Y);
# the face shown is the one in the Sketchfab thumbnail (notched edge and tip on the same side)
R = Matrix(((0, 1, 0), (0, 0, -1), (-1, 0, 0))).to_4x4()
for o in objs.values():
    o.data.transform(R)
allv = np.concatenate([coords(o) for o in objs.values()])
z0, z1 = allv[:, 2].min(), allv[:, 2].max()
grip = coords(objs['Cylinder005'])
cx = (grip[:, 0].min() + grip[:, 0].max()) / 2
cy = (grip[:, 1].min() + grip[:, 1].max()) / 2
s = LENGTH / (z1 - z0)
M = Matrix.Scale(s, 4) @ Matrix.Translation((-cx, -cy, -z0))
for name, o in objs.items():
    o.data.transform(M)
    o.data.update()
    cn = [tuple(n.vector) for n in o.data.corner_normals]      # keep the FBX normals exactly
    o.data.polygons.foreach_set('use_smooth', [True] * len(o.data.polygons))
    o.data.normals_split_custom_set(cn)
    o.data.materials.clear()
    key, size, _ = MESHES[name]
    o.data.materials.append(material(key, size))

parts = []
for part in ('blade', 'guard', 'grip', 'pommel'):
    ps = [objs[n] for n, v in MESHES.items() if v[2] == part]
    bpy.ops.object.select_all(action='DESELECT')
    for p in ps:
        p.select_set(True)
    bpy.context.view_layer.objects.active = ps[0]
    if len(ps) > 1:
        bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = j.data.name = f'chaos_{part}'
    parts.append(j)

export_glb('chaos', parts)
