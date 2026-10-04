"""Small 3/4 renders of the field swords (and the anvil) for the list page.

blender -b --factory-startup -P tools/blender/render_thumbs.py -- <glb_dir> <out_dir> <id>[=<prefix>,...] ...
  <glb_dir>  folder with uncompressed copies of the site GLBs (Blender's importer cannot read
             meshopt; decode them first, e.g. with gltf-transform)
  <id>       a weapon id (whole file), or forge=anvil to keep only objects whose name starts
             with "anvil" (the hot blade on it glows)
Writes <out_dir>/<id>.webp: transparent background, 600 px on the long side, Cycles,
moonlight key + cold rim so the steel reads like it does in the scene.
"""
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
GLB_DIR, OUT_DIR, jobs = args[0], args[1], args[2:]
LONG = 600
HOT = (0.45, 1.0)   # generated-x range over which the anvil blade heats up toward its tip
os.makedirs(OUT_DIR, exist_ok=True)


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    try:
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == 'OPTIX'
        sc.cycles.device = 'GPU'
    except Exception:
        pass
    sc.cycles.samples = 96
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    w = bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.03, 0.04, 0.09, 1)
    bg.inputs[1].default_value = 1.0
    return sc


def light(sc, name, loc, target, energy, color, size):
    d = bpy.data.lights.new(name, 'AREA')
    d.energy, d.color, d.size = energy, color, size
    o = bpy.data.objects.new(name, d)
    sc.collection.objects.link(o)
    o.location = loc
    o.rotation_euler = (target - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


def render(job):
    wid, _, prefix = job.partition('=')
    sc = setup_scene()
    bpy.ops.import_scene.gltf(filepath=os.path.join(GLB_DIR, f'{wid}.glb'))
    meshes = [o for o in sc.objects if o.type == 'MESH']
    if prefix:
        for o in meshes:
            if not o.name.startswith(prefix):
                bpy.data.objects.remove(o, do_unlink=True)
        meshes = [o for o in sc.objects if o.type == 'MESH']
        for o in meshes:
            if 'blade' in o.name:   # the half-forged blade: hot at its tip, as in the smithy
                for m in o.data.materials:
                    nt = m.node_tree
                    b = nt.nodes.get('Principled BSDF')
                    if not b:
                        continue
                    b.inputs['Base Color'].default_value = (0.03, 0.03, 0.035, 1)
                    for l in list(b.inputs['Base Color'].links):
                        nt.links.remove(l)
                    b.inputs['Emission Color'].default_value = (1.0, 0.28, 0.05, 1)
                    tc = nt.nodes.new('ShaderNodeTexCoord')
                    sp = nt.nodes.new('ShaderNodeSeparateXYZ')
                    mr = nt.nodes.new('ShaderNodeMapRange')
                    nt.links.new(tc.outputs['Generated'], sp.inputs[0])
                    nt.links.new(sp.outputs[0], mr.inputs['Value'])
                    mr.inputs['From Min'].default_value = HOT[0]
                    mr.inputs['From Max'].default_value = HOT[1]
                    mr.inputs['To Max'].default_value = 6.0
                    nt.links.new(mr.outputs['Result'], b.inputs['Emission Strength'])
        sc.view_settings.exposure = -1.6
    pts = np.vstack([np.array([o.matrix_world @ v.co for v in o.data.vertices]) for o in meshes])
    lo, hi = pts.min(0), pts.max(0)
    centre = Vector((lo + hi) / 2)
    size = float(np.linalg.norm(hi - lo))

    # three-quarter view, a little from above
    d = Vector((0.62, -0.78, 0.22 if not prefix else 0.45)).normalized()
    cam_d = bpy.data.cameras.new('cam')
    cam_d.type = 'ORTHO'
    cam = bpy.data.objects.new('cam', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.location = centre + d * size * 2
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()
    inv = cam.matrix_world.inverted()
    loc = np.array([inv @ Vector(p) for p in pts])
    x0, x1 = loc[:, 0].min(), loc[:, 0].max()
    y0, y1 = loc[:, 1].min(), loc[:, 1].max()
    pad = 1.04
    w, h = (x1 - x0) * pad, (y1 - y0) * pad
    cam.location = cam.matrix_world @ Vector(((x0 + x1) / 2, (y0 + y1) / 2, 0))
    cam_d.ortho_scale = max(w, h)
    cam_d.clip_end = size * 6
    if h >= w:
        sc.render.resolution_y, sc.render.resolution_x = LONG, max(2, round(LONG * w / h))
    else:
        sc.render.resolution_x, sc.render.resolution_y = LONG, max(2, round(LONG * h / w))

    r = size
    # swords: moonlight key; the anvil: forge glow from the side, the cold shaft from above
    key = (1.0, 0.55, 0.25) if prefix else (1.0, 0.96, 0.9)
    light(sc, 'key', centre + Vector((-0.9, -1.4, 1.2)) * r, centre, 260 * r * r, key, 0.8 * r)
    light(sc, 'rim', centre + Vector((1.2, 1.3, 0.6)) * r, centre, 420 * r * r, (0.62, 0.72, 1.0), 0.5 * r)
    light(sc, 'fill', centre + Vector((1.5, -0.6, -0.2)) * r, centre, 60 * r * r, (0.55, 0.62, 0.9), 1.2 * r)

    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.quality = 82
    sc.render.filepath = os.path.join(OUT_DIR, f'{wid}.webp')
    bpy.ops.render.render(write_still=True)
    print('THUMB', sc.render.filepath, sc.render.resolution_x, sc.render.resolution_y,
          os.path.getsize(sc.render.filepath))


for j in jobs:
    render(j)
