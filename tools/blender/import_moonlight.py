"""Moonlight Greatsword (Dark Souls), Beatriz Frankenstein's Sketchfab model (CC-BY).

blender -b --factory-startup -P tools/blender/import_moonlight.py
Reads  C:/Users/forev/Downloads/kilic/sf/moonlight-dark-souls/{source/moonlight .blend, textures/moonlight.png}
Writes assets/weapons/moonlight.glb (the Elden Ring build that used to live there is kept
as moonlight-er.glb; tools/blender/moonlight_import.py still makes that one).

The .blend is from Blender 2.7x: the image was a legacy texture slot, so on load the
materials are bare. Every face is UV-projected onto the one 231x512 photo of the sword,
so all parts get that texture back. The source has no emission (Sketchfab's glow is
its bloom), so the blade alone gets the same texture as emissive at BLADE_GLOW, which
reads like the thumbnail's glow. Subsurf level 1 (the viewport level, 8.3k tris, the
count Sketchfab lists) is applied; the three loose parts become blade / guard / grip.
"""
import os
import sys

sys.path.append(os.path.dirname(__file__))
import bpy
import numpy as np
from mathutils import Vector, Matrix
from forge_bl import OUT_DIR

SRC = r'C:\Users\forev\Downloads\kilic\sf\moonlight-dark-souls'
LENGTH = 1.70       # m, tip to pommel
BLADE_GLOW = 0.6    # emissive factor on the blade (texture x this)

bpy.ops.wm.open_mainfile(filepath=os.path.join(SRC, 'source', 'moonlight .blend'))
for o in list(bpy.data.objects):
    if o.name != 'Circle':
        bpy.data.objects.remove(o, do_unlink=True)
src = bpy.data.objects['Circle']
bpy.context.view_layer.objects.active = src
src.select_set(True)
bpy.ops.object.modifier_apply(modifier='Subsurf')   # levels = 1

# ---------- frame (mesh-local coords; the object's tilt/scale are dropped) ----------
# Local: long axis +Z with the tip at max Z, blade width on Y, thickness on X.
me = src.data
co = np.empty(len(me.vertices) * 3, dtype=np.float32)
me.vertices.foreach_get('co', co)
co = co.reshape(-1, 3)
zmin, zmax = float(co[:, 2].min()), float(co[:, 2].max())
grip = co[co[:, 2] < zmin + 0.1 * (zmax - zmin)]          # pommel + lower grip
ax, ay = float((grip[:, 0].min() + grip[:, 0].max()) / 2), float((grip[:, 1].min() + grip[:, 1].max()) / 2)
s = LENGTH / (zmax - zmin)
# (x, y, z) -> (y - ay, x - ax, zmax - z): a proper rotation; tip down, width on X, thickness on Y
R = Matrix(((0, 1, 0, -ay), (1, 0, 0, -ax), (0, 0, -1, zmax), (0, 0, 0, 1)))
src.matrix_world = Matrix.Identity(4)
src.parent = None
me.transform(Matrix.Diagonal((s, s, s, 1)) @ R)
me.update()

# ---------- split loose parts ----------
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.separate(type='LOOSE')
bpy.ops.object.mode_set(mode='OBJECT')
parts = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert len(parts) == 3, len(parts)


def ext(o):
    c = np.array([v.co[:] for v in o.data.vertices])
    return c.min(0), c.max(0)


blade = min(parts, key=lambda o: ext(o)[0][2])            # reaches the tip (z = 0)
rest = [o for o in parts if o is not blade]
guard = max(rest, key=lambda o: ext(o)[1][0] - ext(o)[0][0])
grip = [o for o in rest if o is not guard][0]
for o, n in ((blade, 'moonlight_blade'), (guard, 'moonlight_guard'), (grip, 'moonlight_grip')):
    o.name = o.data.name = n

# ---------- materials ----------
img = bpy.data.images.load(os.path.join(SRC, 'textures', 'moonlight.png'))
img.colorspace_settings.name = 'sRGB'


def material(name, glow):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Metallic'].default_value = 0.0      # as in the source material
    b.inputs['Roughness'].default_value = 0.5
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = img
    t.location = (-500, 200)
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    if glow:
        nt.links.new(t.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = glow
    return m


BLADE_MAT = material('moonlight_blade', BLADE_GLOW)
HILT_MAT = material('moonlight_hilt', 0.0)
for o, m in ((blade, BLADE_MAT), (guard, HILT_MAT), (grip, HILT_MAT)):
    o.data.materials.clear()
    o.data.materials.append(m)
    for p in o.data.polygons:
        p.material_index = 0

root = bpy.data.objects.new('moonlight', None)
bpy.context.scene.collection.objects.link(root)
for o in parts:
    o.parent = root

path = os.path.join(OUT_DIR, 'moonlight.glb')
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True, export_yup=True,
                          export_materials='EXPORT', export_image_format='JPEG',
                          export_jpeg_quality=92)
tris = sum(len(p.vertices) - 2 for o in parts for p in o.data.polygons)
lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for o in parts:
    for v in o.data.vertices:
        lo = Vector(map(min, lo, v.co)); hi = Vector(map(max, hi, v.co))
print('STATS tris', tris, 'size_xyz_m', tuple(round(x, 3) for x in (hi - lo)),
      'min', tuple(round(x, 3) for x in lo), 'bytes', os.path.getsize(path))
print('EXPORTED', path)
