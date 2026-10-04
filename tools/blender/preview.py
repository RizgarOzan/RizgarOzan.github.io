"""Render a weapon GLB from several angles for review.

blender -b --factory-startup -P tools/blender/preview.py -- <weapon_id> [out_dir]
Writes <out_dir>/<id>-front.png, -side.png, -three.png, -detail.png.
"""
import math
import os
import sys
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
wid = args[0]
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
out = args[1] if len(args) > 1 else os.path.join(os.environ.get('TEMP', '.'), 'previews')
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(root, 'assets', 'weapons', f'{wid}.glb'))

objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for o in objs:
    for c in o.bound_box:
        w = o.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
center = (lo + hi) / 2
size = hi - lo
height = max(size.z, size.x)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x, scene.render.resolution_y = 900, 1200
scene.render.film_transparent = False
world = bpy.data.worlds.new('w'); scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.02, 0.025, 0.05, 1)
world.node_tree.nodes['Background'].inputs[1].default_value = 0.6


def light(name, kind, loc, energy, color=(1, 1, 1), size=1.0):
    d = bpy.data.lights.new(name, kind)
    d.energy = energy; d.color = color
    if kind == 'AREA':
        d.size = size
    o = bpy.data.objects.new(name, d)
    scene.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (center - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o


light('key', 'AREA', center + Vector((1.5, -2.5, 1.5)), 400, size=2)
light('rim', 'AREA', center + Vector((-1.5, 2.0, 1.0)), 500, (0.75, 0.82, 1.0), size=1.5)
light('fill', 'AREA', center + Vector((-2.0, -1.5, -0.5)), 120, size=2)

cam_data = bpy.data.cameras.new('cam'); cam_data.lens = 70
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam)
scene.camera = cam

views = {
    'front': (Vector((0, -1, 0)), 1.0),
    'side': (Vector((1, 0, 0)), 1.0),
    'three': (Vector((0.7, -0.7, 0.25)).normalized(), 1.0),
    'detail': (Vector((0.35, -1, 0.1)).normalized(), 0.38),
}
for name, (d, zoom) in views.items():
    target = center if name != 'detail' else Vector((center.x, center.y, lo.z + size.z * 0.82))
    dist = height * zoom / (2 * math.tan(cam_data.angle / 2)) * 1.15
    cam.location = target + d * dist
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = os.path.join(out, f'{wid}-{name}.png')
    bpy.ops.render.render(write_still=True)
print('PREVIEWS', out)
