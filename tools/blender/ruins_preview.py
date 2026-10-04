"""Render assets/env/ruins.glb through the site camera for review.

blender -b --factory-startup -P tools/blender/ruins_preview.py -- <out_dir>
Writes <out_dir>/ruins-v2-site.png (site-like: fog, cold moon from behind),
ruins-v2-clear.png (same camera, no fog, brighter - to judge the masonry) and
ruins-v2-detail.png (closer camera on the near-left ring).

The GLB is imported as is, so this also proves the identity-transform contract.
"""
import math
import os
import sys
import bpy
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
out = args[0] if args else os.environ.get('TEMP', '.')
root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
os.makedirs(out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(root, 'assets', 'env', 'ruins.glb'))

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x, scene.render.resolution_y = 1600, 900
scene.render.resolution_percentage = 100
scene.eevee.taa_render_samples = 24
try:
    scene.view_settings.view_transform = 'Filmic'
except TypeError:
    scene.view_settings.view_transform = 'AgX'
scene.view_settings.exposure = 0.0

# ---- world: the site's sky-horizon colour ----
world = bpy.data.worlds.new('w')
scene.world = world
world.use_nodes = True
nt = world.node_tree
bg = nt.nodes['Background']
HORIZON = (0x12 / 255, 0x1c / 255, 0x3f / 255)
bg.inputs[0].default_value = (*[c ** 2.2 for c in HORIZON], 1)
bg.inputs[1].default_value = 1.0

# ---- FogExp2(0x0c1330, 0.03) baked into every material: mix toward the fog
# colour by 1 - exp(-(d*k)^2), d = camera distance ----
FOG = [c ** 2.2 for c in (0x0c / 255, 0x13 / 255, 0x30 / 255)]
fog_nodes = []
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    t = m.node_tree
    mo = next(n for n in t.nodes if n.type == 'OUTPUT_MATERIAL')
    src = mo.inputs['Surface'].links[0].from_socket
    cam = t.nodes.new('ShaderNodeCameraData')
    mul = t.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 0.03
    sq = t.nodes.new('ShaderNodeMath'); sq.operation = 'POWER'; sq.inputs[1].default_value = 2.0
    neg = t.nodes.new('ShaderNodeMath'); neg.operation = 'MULTIPLY'; neg.inputs[1].default_value = -1.0
    ex = t.nodes.new('ShaderNodeMath'); ex.operation = 'EXPONENT'
    emi = t.nodes.new('ShaderNodeEmission'); emi.inputs['Color'].default_value = (*FOG, 1); emi.inputs['Strength'].default_value = 1.0
    mix = t.nodes.new('ShaderNodeMixShader')
    t.links.new(cam.outputs['View Distance'], mul.inputs[0])
    t.links.new(mul.outputs[0], sq.inputs[0])
    t.links.new(sq.outputs[0], neg.inputs[0])
    t.links.new(neg.outputs[0], ex.inputs[0])
    t.links.new(ex.outputs[0], mix.inputs['Fac'])   # fac = visibility: 1 -> surface
    t.links.new(emi.outputs[0], mix.inputs[1])
    t.links.new(src, mix.inputs[2])
    t.links.new(mix.outputs[0], mo.inputs['Surface'])
    fog_nodes.append(mul)


def sun(name, direction, energy, color):
    d = bpy.data.lights.new(name, 'SUN')
    d.energy = energy
    d.color = color
    d.angle = math.radians(1.5)
    o = bpy.data.objects.new(name, d)
    scene.collection.objects.link(o)
    o.rotation_euler = Vector(direction).normalized().to_track_quat('-Z', 'Y').to_euler()
    return o


# site MOON_DIR (0.3, 0.15, -1) in three.js -> blender (0.3, 1.0, 0.15); light travels the other way
moon = sun('moon', (-0.3, -1.0, -0.15), 2.4, (0.74, 0.82, 1.0))
fill = sun('fill', (-3, 9, -4), 0.6, (0.62, 0.69, 0.91))

cam_data = bpy.data.cameras.new('cam')
cam_data.sensor_fit = 'VERTICAL'
cam_data.angle_y = math.radians(30)
cam_data.clip_end = 500
cam = bpy.data.objects.new('cam', cam_data)
scene.collection.objects.link(cam)
scene.camera = cam


def aim(pos, target):
    cam.location = pos
    cam.rotation_euler = (Vector(target) - Vector(pos)).to_track_quat('-Z', 'Y').to_euler()


def render(name):
    scene.render.filepath = os.path.join(out, name)
    bpy.ops.render.render(write_still=True)
    print('RENDERED', scene.render.filepath)


aim((0, -6.3, 1.0), (0, 1.4, 1.12))
render('ruins-v2-site.png')

# diagnostic: no fog, more light from the camera side
for n in fog_nodes:
    n.inputs[1].default_value = 0.0
bg.inputs[1].default_value = 0.8
fill.data.energy = 3.0
moon.data.energy = 2.0
render('ruins-v2-clear.png')

aim((-4, 8, 2.5), (-9, 24, 2.5))
render('ruins-v2-detail.png')
aim((4, 14, 4.0), (0, 30, 5.0))
render('ruins-v2-detail2.png')
