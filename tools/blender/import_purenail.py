"""Pure Nail (Hollow Knight) from João Desager's Sketchfab sculpt.

blender -b --factory-startup -P tools/blender/import_purenail.py

Source: "Hollow Knight - Pure Nail" by João Desager (sketchfab 5ff6de0de67d498987a0c8cc534dee03,
CC-BY), C:/Users/forev/Downloads/kilic/sf/hollow-knight-pure-nail/source/DS A3 nail ZtS test 001.fbx:
one ~1M-triangle sculpt, no UVs and no texture files (textures/ only holds Sketchfab's ground
shadow), but the sculpt carries polypaint as a vertex-colour layer: blue-grey steel, darker in
the grooves. Tip toward -Z, twisted grip toward +Z, ~4.5 m in file units.

Pipeline: import (transforms applied) -> copy decimated to TRIS -> smart UV unwrap -> Cycles
bakes from the full sculpt onto the copy: the polypaint (base colour) and a tangent-space
normal map (keeps the engraved line work and the grip's wrap ridges) -> one steel material ->
tip on z = 0, grip axis on x = y = 0, scaled to LENGTH -> GLB.

No AO map: the sculpt's overlapping shells occlude the bake rays, so the AO came out near black
inside most UV islands and the blade went black wherever lighting is mostly ambient (the forge
rack). The source has no AO either. The normal bake hits backfaces of those shells in places
(~4 % of texels point into the surface, blue < 0.5); those texels are set flat.
Half metal: with metallic 1 the 0.53 grey polypaint becomes a dark mirror that only reflects
the night; the Sketchfab view reads as pale, diffusely lit silver with a sharp highlight.
"""
import os
import sys
import tempfile

import bpy
import bmesh
import numpy as np
from mathutils import Matrix

sys.path.append(os.path.dirname(__file__))
from forge_bl import reset, OUT_DIR

FBX = r'C:\Users\forev\Downloads\kilic\sf\hollow-knight-pure-nail\source\DS A3 nail ZtS test 001.fbx'
WID = 'purenail'
LENGTH = 1.4            # m
TRIS = 72000          # with UV seams and 2048 maps this keeps the GLB under 4 MB
TEX = 2048
CAGE = 0.02             # source units (the sculpt is 4.54 long); decimated surface is within 0.001
METALLIC = 0.6
ROUGHNESS = 0.28


def coords(o):
    a = np.empty(len(o.data.vertices) * 3, dtype=np.float32)
    o.data.vertices.foreach_get('co', a)
    return a.reshape(-1, 3).astype(np.float64)


reset()
bpy.ops.import_scene.fbx(filepath=FBX)
hi = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
hi.name = 'sculpt'
bpy.context.view_layer.objects.active = hi
hi.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
# Parts of the sculpt are wound inside out (Sketchfab draws it double-sided); the bakes need
# outward normals, or AO goes black and the normal map inverts there.
bm = bmesh.new()
bm.from_mesh(hi.data)
bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
bm.to_mesh(hi.data)
bm.free()
for p in hi.data.polygons:
    p.use_smooth = True
vc_name = hi.data.color_attributes[0].name

# The sculpt shows its polypaint as emission, so an EMIT bake copies it unchanged.
paint = bpy.data.materials.new('polypaint')
paint.use_nodes = True
nt = paint.node_tree
nt.nodes.remove(nt.nodes['Principled BSDF'])
attr = nt.nodes.new('ShaderNodeVertexColor')
attr.layer_name = vc_name
em = nt.nodes.new('ShaderNodeEmission')
nt.links.new(attr.outputs['Color'], em.inputs['Color'])
nt.links.new(em.outputs['Emission'], nt.nodes['Material Output'].inputs['Surface'])
hi.data.materials.clear()
hi.data.materials.append(paint)

# ---------- low poly ----------
lo = hi.copy()
lo.data = hi.data.copy()
lo.name = lo.data.name = f'{WID}_blade'
bpy.context.scene.collection.objects.link(lo)
m = lo.modifiers.new('dec', 'DECIMATE')
m.decimate_type = 'COLLAPSE'
m.ratio = TRIS / len(hi.data.polygons)
m.use_collapse_triangulate = True
bpy.context.view_layer.objects.active = lo
bpy.ops.object.modifier_apply(modifier=m.name)
lo.data.color_attributes.remove(lo.data.color_attributes[vc_name])
print('DECIMATED', len(lo.data.polygons))

bpy.ops.object.select_all(action='DESELECT')
lo.select_set(True)
bpy.context.view_layer.objects.active = lo
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.002, area_weight=0.0, scale_to_bounds=True)
bpy.ops.object.mode_set(mode='OBJECT')

steel = bpy.data.materials.new(f'{WID}_steel')
steel.use_nodes = True
lo.data.materials.clear()           # drop the sculpt's slot so every face bakes into steel's image
lo.data.materials.append(steel)

# ---------- bake colour, normal and AO from the sculpt ----------
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
bk = scene.render.bake
bk.use_selected_to_active = True
bk.use_cage = False
bk.cage_extrusion = CAGE
bk.max_ray_distance = CAGE * 2
bk.margin = 8
bake_node = steel.node_tree.nodes.new('ShaderNodeTexImage')
steel.node_tree.nodes.active = bake_node
paths = {}
for kind, btype, samples, noncolor, size in (('albedo', 'EMIT', 1, False, TEX), ('normal', 'NORMAL', 1, True, TEX)):
    img = bpy.data.images.new(f'{WID}_{kind}', size, size, alpha=False)
    if noncolor:
        img.colorspace_settings.name = 'Non-Color'
    bake_node.image = img
    scene.cycles.samples = samples
    bpy.ops.object.select_all(action='DESELECT')
    hi.select_set(True)
    lo.select_set(True)
    bpy.context.view_layer.objects.active = lo
    bpy.ops.object.bake(type=btype, normal_space='TANGENT')
    if kind == 'normal':
        px = np.empty(size * size * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(-1, 4)
        bad = px[:, 2] < 0.5
        px[bad, :3] = (0.5, 0.5, 1.0)
        img.pixels.foreach_set(px.ravel())
        print('NORMAL inverted texels set flat:', round(float(bad.mean()), 4))
    paths[kind] = os.path.join(tempfile.gettempdir(), f'{WID}_{kind}.jpg')
    img.filepath_raw = paths[kind]
    img.file_format = 'JPEG'
    img.save(quality=85)            # raw values, no view transform
steel.node_tree.nodes.remove(bake_node)
bpy.data.objects.remove(hi, do_unlink=True)

# ---------- final material ----------
nt = steel.node_tree
b = nt.nodes['Principled BSDF']
b.inputs['Metallic'].default_value = METALLIC
b.inputs['Roughness'].default_value = ROUGHNESS


def tex(kind, noncolor):
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = bpy.data.images.load(paths[kind])
    if noncolor:
        n.image.colorspace_settings.name = 'Non-Color'
    return n


nt.links.new(tex('albedo', False).outputs['Color'], b.inputs['Base Color'])
nm = nt.nodes.new('ShaderNodeNormalMap')
nt.links.new(tex('normal', True).outputs['Color'], nm.inputs['Color'])
nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])

# ---------- place: grip axis on x = y = 0, tip on z = 0, LENGTH tall ----------
V = coords(lo)
top = V[V[:, 2] > V[:, 2].max() - 0.25 * (V[:, 2].max() - V[:, 2].min())]   # the twisted grip
axis_xy = (top[:, :2].min(0) + top[:, :2].max(0)) / 2
s = LENGTH / (V[:, 2].max() - V[:, 2].min())
lo.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation((-axis_xy[0], -axis_xy[1], -V[:, 2].min())))
lo.data.update()
root = bpy.data.objects.new(WID, None)
scene.collection.objects.link(root)
lo.parent = root

os.makedirs(OUT_DIR, exist_ok=True)
path = os.path.join(OUT_DIR, f'{WID}.glb')
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_materials='EXPORT',
                          export_image_format='AUTO', export_tangents=False)
V = coords(lo)
print('STATS', WID, 'tris', sum(len(p.vertices) - 2 for p in lo.data.polygons),
      'size_xyz_m', tuple(np.round(V.max(0) - V.min(0), 3)), 'min', tuple(np.round(V.min(0), 3)),
      'bytes', os.path.getsize(path))
print('EXPORTED', path)
