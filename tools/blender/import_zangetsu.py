"""Tensa Zangetsu (Bleach), JohnHB's Sketchfab model (CC-BY).

blender -b --factory-startup -P tools/blender/import_zangetsu.py
Reads  C:/Users/forev/Downloads/kilic/sf/tensa-zangetsu/{source,textures}
Writes assets/weapons/zangetsu.glb

The FBX is one mesh lying along +X (tip at -X) in 3D-Coat's frame; its material only
points at the artist's local .tga files, so the PBR set is rebuilt from textures/:
albedo (sRGB), normal (non-colour), roughness + metalness packed into one ORM map.
The exported AO map is empty (all black), so occlusion stays white.

The 14 chain links hanging from the pommel become one node, zangetsu_chain, with its
origin at the top of the first link (where it meets the pommel). The links keep the
pose the artist gave them; the site can swing the node from that point. The grip has
no loose wrap tail, so there is no zangetsu_wrap.
"""
import os
import sys

sys.path.append(os.path.dirname(__file__))
import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix
from forge_bl import reset, OUT_DIR

SRC = r'C:\Users\forev\Downloads\kilic\sf\tensa-zangetsu'
TEX = os.path.join(SRC, 'textures', 'Tensa_Zangetsu_Export_{}.tga.png')
TMP = os.path.join(os.environ.get('TEMP', '.'), 'zangetsu_tex')
LENGTH = 1.30  # m, tip to pommel (chain not counted)

reset()
bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, 'source', 'Tensa_Zangetsu_Export.fbx'))
src = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
bpy.context.view_layer.objects.active = src
src.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# ---------- split loose parts ----------
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE')
bpy.ops.object.mode_set(mode='OBJECT')


def bounds(o):
    co = np.empty(len(o.data.vertices) * 3, dtype=np.float32)
    o.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3)
    return co.min(0), co.max(0)


pieces = [o for o in bpy.context.scene.objects if o.type == 'MESH']
blade = min(pieces, key=lambda o: bounds(o)[0][0])
links = [o for o in pieces if bounds(o)[0][0] > 2.4]
rest = [o for o in pieces if o is not blade and o not in links]
guard = min(rest, key=lambda o: bounds(o)[1][0] - bounds(o)[0][0])     # the thin tsuba
grip = max(rest, key=lambda o: bounds(o)[1][0] - bounds(o)[0][0])      # handle + pommel
assert len(links) == 14 and len(rest) == 2, (len(links), len(rest))


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = o.data.name = name
    return o


blade = join([blade], 'zangetsu_blade')
guard = join([guard], 'zangetsu_guard')
grip = join([grip], 'zangetsu_grip')
chain = join(links, 'zangetsu_chain')

# ---------- frame: tip down at z = 0, grip axis on x = y = 0, metres ----------
glo, ghi = bounds(grip)
axis_y, axis_z = (glo[1] + ghi[1]) / 2, (glo[2] + ghi[2]) / 2
tip_x = bounds(blade)[0][0]
s = LENGTH / (ghi[0] - tip_x)
# source (x, y, z) -> (-(z - axis_z), y - axis_y, x - tip_x): a proper rotation, blade flat stays on Y
R = Matrix(((0, 0, -1, axis_z), (0, 1, 0, -axis_y), (1, 0, 0, -tip_x), (0, 0, 0, 1)))
M = Matrix.Diagonal((s, s, s, 1)) @ R
for o in (blade, guard, grip, chain):
    o.data.transform(M)
    o.data.update()

# chain origin: top of the first link, on its centre line
clo, chi = bounds(chain)
co = np.empty(len(chain.data.vertices) * 3, dtype=np.float32)
chain.data.vertices.foreach_get('co', co)
co = co.reshape(-1, 3)
inner = co[:, 0] < clo[0] + 0.06 * (chi[0] - clo[0])          # the link nearest the grip
attach = Vector((float(clo[0]), float(co[inner, 1].mean()), float(co[inner, 2].mean())))
chain.data.transform(Matrix.Translation(-attach))
chain.location = attach

# ---------- material ----------
os.makedirs(TMP, exist_ok=True)


def load(kind, colorspace):
    im = bpy.data.images.load(TEX.format(kind))
    im.colorspace_settings.name = colorspace
    return im


rough = load('roughness', 'Non-Color')
metal = load('metalness', 'Non-Color')
w, h = rough.size
px_r = np.empty(w * h * 4, dtype=np.float32); rough.pixels.foreach_get(px_r)
px_m = np.empty(w * h * 4, dtype=np.float32); metal.pixels.foreach_get(px_m)
orm = np.ones((w * h, 4), dtype=np.float32)
orm[:, 1] = px_r.reshape(-1, 4)[:, 0]
orm[:, 2] = px_m.reshape(-1, 4)[:, 0]
orm_img = bpy.data.images.new('zangetsu_orm', w, h, alpha=False)
orm_img.colorspace_settings.name = 'Non-Color'
orm_img.pixels.foreach_set(orm.ravel())
orm_img.filepath_raw = os.path.join(TMP, 'zangetsu_orm.png')
orm_img.file_format = 'PNG'
orm_img.save()

m = bpy.data.materials.new('zangetsu')
m.use_nodes = True
nt = m.node_tree
bsdf = nt.nodes['Principled BSDF']


def tex(img, x, y):
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = img
    n.location = (x, y)
    return n


albedo = tex(load('albedo', 'sRGB'), -700, 300)
nt.links.new(albedo.outputs['Color'], bsdf.inputs['Base Color'])
ormn = tex(orm_img, -700, 0)
sep = nt.nodes.new('ShaderNodeSeparateColor')
sep.location = (-400, 0)
nt.links.new(ormn.outputs['Color'], sep.inputs['Color'])
nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
nrm = tex(load('normal', 'Non-Color'), -700, -300)
nm = nt.nodes.new('ShaderNodeNormalMap')
nm.location = (-400, -300)
nt.links.new(nrm.outputs['Color'], nm.inputs['Color'])
nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])

root = bpy.data.objects.new('zangetsu', None)
bpy.context.scene.collection.objects.link(root)
for o in (blade, guard, grip, chain):
    o.data.materials.clear()
    o.data.materials.append(m)
    o.parent = root

path = os.path.join(OUT_DIR, 'zangetsu.glb')
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_image_format='JPEG',
                          export_jpeg_quality=88)
tris = sum(len(p.vertices) - 2 for o in (blade, guard, grip, chain) for p in o.data.polygons)
lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for o in (blade, guard, grip, chain):
    for v in o.data.vertices:
        wv = o.matrix_world @ v.co
        lo = Vector(map(min, lo, wv)); hi = Vector(map(max, hi, wv))
print('STATS tris', tris, 'size_xyz_m', tuple(round(x, 3) for x in (hi - lo)),
      'min', tuple(round(x, 3) for x in lo), 'chain_origin', tuple(round(x, 3) for x in attach),
      'bytes', os.path.getsize(path))
print('EXPORTED', path)
