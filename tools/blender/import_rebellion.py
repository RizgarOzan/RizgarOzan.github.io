"""Rebellion (Devil May Cry 5), ScreamingHomie's Sketchfab game asset (CC-BY-NC).

blender -b --factory-startup -P tools/blender/import_rebellion.py [-- <out_id>]
Reads  C:/Users/forev/Downloads/kilic/sf/rebellion-sword-game-asset-devil-may-cry-5/source/rebellion_low.fbx
Writes assets/weapons/<out_id>.glb (default "rebellion").

The download ships only the low-poly FBX (6 parts, 8.2k tris); its material points at
D:/textures/... maps that were never included. Geometry is kept as is (scaled to 1.75 m,
re-centred). The surface the Sketchfab render shows (polished dark steel, grime in the
cavities, bright worn edges, engraved grooves along the guard arms and rings/diamonds on
the grip, brushed blade) is rebuilt as a procedural Cycles material per part and baked
into two texture sets on fresh UVs (smart project): blade 2048 and body (skull, ribs,
arms, grip, pommel) 2048, each base colour + ORM (baked AO, roughness, metallic) + a
tangent-space normal map that carries the engraving, pitting and scratches.
"""
import math
import os
import sys

sys.path.append(os.path.dirname(__file__))
import bpy
import numpy as np
from mathutils import Vector, Matrix
from forge_bl import reset, OUT_DIR
from sf_pbr import save_jpeg, orm, pbr_material

SRC = r'C:\Users\forev\Downloads\kilic\sf\rebellion-sword-game-asset-devil-may-cry-5\source\rebellion_low.fbx'
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT_ID = args[0] if args else 'rebellion'
LENGTH = 1.75  # m, tip to pommel
SIZE = 2048

NAMES = {'blade_low': 'blade', 'final skull_low': 'skull', 'chest_low': 'ribs',
         'arm_low': 'guard', 'handle_low': 'grip', 'flower_low': 'pommel'}

reset()
bpy.ops.import_scene.fbx(filepath=SRC)

parts = {}
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH':
        bpy.data.objects.remove(o, do_unlink=True)
        continue
    key = NAMES[o.name]
    o.name = o.data.name = f'rebellion_{key}'
    o.data.materials.clear()
    parts[key] = o

# ---------- frame: tip at z = 0, grip axis on x = y = 0, metres ----------
lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for o in parts.values():
    for v in o.data.vertices:
        w = o.matrix_world @ v.co
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
g = parts['grip']
gx = [(g.matrix_world @ v.co) for v in g.data.vertices]
axis = Vector(((min(p.x for p in gx) + max(p.x for p in gx)) / 2,
               (min(p.y for p in gx) + max(p.y for p in gx)) / 2, lo.z))
s = LENGTH / (hi.z - lo.z)
for o in parts.values():
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.data.transform(Matrix.Diagonal((s, s, s, 1)) @ Matrix.Translation(-axis))
    o.data.update()


# ---------- fresh UVs for baking ----------
def unwrap(objs):
    for o in objs:
        me = o.data
        while me.uv_layers:
            me.uv_layers.remove(me.uv_layers[0])
        me.uv_layers.new(name='UVMap')
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(rotate=True, margin=0.004)
    bpy.ops.object.mode_set(mode='OBJECT')


BODY_KEYS = ('skull', 'ribs', 'guard', 'grip', 'pommel')
unwrap([parts['blade']])
unwrap([parts[k] for k in BODY_KEYS])


# ---------- procedural surface ----------
class G:
    """Tiny node-graph helper."""

    def __init__(self, nt):
        self.nt = nt

    def n(self, kind, **props):
        node = self.nt.nodes.new(kind)
        for k, v in props.items():
            setattr(node, k, v)
        return node

    def link(self, a, b):
        self.nt.links.new(a, b)

    def math(self, op, a, b=None, clamp=False):
        m = self.n('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, x in enumerate((a, b)):
            if x is None:
                continue
            if isinstance(x, (int, float)):
                m.inputs[i].default_value = x
            else:
                self.link(x, m.inputs[i])
        return m.outputs[0]

    def ramp(self, x, a, b, smooth=True):
        """0..1 as x goes a -> b."""
        m = self.n('ShaderNodeMapRange', interpolation_type='SMOOTHSTEP' if smooth else 'LINEAR', clamp=True)
        self.link(x, m.inputs['Value'])
        m.inputs['From Min'].default_value = a
        m.inputs['From Max'].default_value = b
        return m.outputs['Result']

    def xyz(self, vec):
        sp = self.n('ShaderNodeSeparateXYZ')
        self.link(vec, sp.inputs[0])
        return sp.outputs

    def vec(self, x, y, z):
        c = self.n('ShaderNodeCombineXYZ')
        for i, v in enumerate((x, y, z)):
            if isinstance(v, (int, float)):
                c.inputs[i].default_value = v
            else:
                self.link(v, c.inputs[i])
        return c.outputs[0]

    def scale(self, vec, sx, sy, sz):
        m = self.n('ShaderNodeVectorMath', operation='MULTIPLY')
        self.link(vec, m.inputs[0])
        m.inputs[1].default_value = (sx, sy, sz)
        return m.outputs[0]

    def noise(self, vec, scale, detail=4.0, rough=0.55):
        t = self.n('ShaderNodeTexNoise')
        self.link(vec, t.inputs['Vector'])
        t.inputs['Scale'].default_value = scale
        t.inputs['Detail'].default_value = detail
        t.inputs['Roughness'].default_value = rough
        return t.outputs['Fac']

    def wave(self, vec, scale, direction='Z', distortion=0.0):
        t = self.n('ShaderNodeTexWave', wave_type='BANDS', bands_direction=direction, wave_profile='SIN')
        self.link(vec, t.inputs['Vector'])
        t.inputs['Scale'].default_value = scale
        t.inputs['Distortion'].default_value = distortion
        t.inputs['Detail'].default_value = 0.0
        return t.outputs['Fac']

    def lines(self, vec, scale, width, direction='Z'):
        """Thin grooves: 1 on the crest of every band."""
        return self.ramp(self.wave(vec, scale, direction), 1 - width, 1 - width * 0.35)

    def scratches(self, vec, stretch, density):
        v = self.n('ShaderNodeTexVoronoi', feature='DISTANCE_TO_EDGE')
        self.link(self.scale(vec, *stretch), v.inputs['Vector'])
        v.inputs['Scale'].default_value = 1.0
        line = self.math('SUBTRACT', 1.0, self.ramp(v.outputs['Distance'], 0.0, 0.035))
        keep = self.ramp(self.noise(vec, density, 2.0), 0.55, 0.7)
        return self.math('MULTIPLY', line, keep)

    def rgb(self, hexv):
        h = hexv.lstrip('#')
        return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))

    def lerp(self, a, b, f):
        """Colour lerp on vectors; a and b may be hex strings."""
        def src(c):
            if isinstance(c, str):
                n = self.n('ShaderNodeCombineXYZ')
                for i, x in enumerate(self.rgb(c)):
                    n.inputs[i].default_value = x
                return n.outputs[0]
            return c
        a, b = src(a), src(b)
        d = self.n('ShaderNodeVectorMath', operation='SUBTRACT'); self.link(b, d.inputs[0]); self.link(a, d.inputs[1])
        sc = self.n('ShaderNodeVectorMath', operation='SCALE'); self.link(d.outputs[0], sc.inputs[0]); self.link(f, sc.inputs['Scale'])
        ad = self.n('ShaderNodeVectorMath', operation='ADD'); self.link(a, ad.inputs[0]); self.link(sc.outputs[0], ad.inputs[1])
        return ad.outputs[0]


# Values read off the Sketchfab render: polished near-black steel with bright worn edges,
# brownish grime in the deep cavities; the blade a duller brushed grey with polished edges.
LOOK = {
    'body': dict(steel='#7b7f87', dark='#26272a', edge='#c3c7cf', r=0.2, r_grime=0.38),
    'blade': dict(steel='#555960', dark='#2e3034', edge='#a9aeb6', r=0.46, r_grime=0.25),
}


def surface(key):
    """Material for one part; returns it plus the four outputs to bake."""
    look = LOOK['blade' if key == 'blade' else 'body']
    m = bpy.data.materials.new(f'bake_{key}')
    m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    g = G(nt)
    p = g.n('ShaderNodeTexCoord').outputs['Object']
    x, y, z = g.xyz(p)

    # cavities and edges
    ao_n = g.n('ShaderNodeAmbientOcclusion', samples=16, only_local=False)
    ao_n.inputs['Distance'].default_value = 0.012
    ao = ao_n.outputs['AO']
    bev = g.n('ShaderNodeBevel', samples=8)
    bev.inputs['Radius'].default_value = 0.0025
    geo = g.n('ShaderNodeNewGeometry')
    dot = g.n('ShaderNodeVectorMath', operation='DOT_PRODUCT')
    g.link(bev.outputs['Normal'], dot.inputs[0]); g.link(geo.outputs['Normal'], dot.inputs[1])
    edge = g.ramp(g.math('SUBTRACT', 1.0, dot.outputs['Value']), 0.004, 0.05)
    edge = g.math('MULTIPLY', edge, g.ramp(g.noise(p, 60, 3), 0.35, 0.6))      # worn in patches

    blotch = g.noise(p, 9, 5)
    grime = g.math('ADD', g.ramp(ao, 0.95, 0.45, smooth=False), g.math('MULTIPLY', g.math('SUBTRACT', blotch, 0.5), 0.5), clamp=True)

    # height detail
    pits = g.math('MULTIPLY', g.noise(p, 900, 2), 0.15)
    if key == 'blade':
        # brushed along the length + a few long scratches
        brush = g.noise(g.scale(p, 260, 260, 4), 1.0, 3)
        groove = g.scratches(p, (90, 90, 6), 14)
        streak = brush
    elif key == 'guard':
        # parallel grooves following the arms, which droop toward their tips
        ax = g.math('ABSOLUTE', x)
        q = g.vec(x, y, g.math('ADD', z, g.math('MULTIPLY', ax, 0.42)))
        groove = g.math('MAXIMUM', g.lines(q, 16, 0.1), g.scratches(p, (40, 120, 120), 10))
        streak = g.noise(g.scale(p, 6, 200, 200), 1.0, 3)
    elif key == 'grip':
        # rings, with a band of crossed diagonals between them
        ang = g.math('ARCTAN2', y, x)
        a = g.math('ADD', g.math('MULTIPLY', z, 190), g.math('MULTIPLY', ang, 4))
        b = g.math('SUBTRACT', g.math('MULTIPLY', z, 190), g.math('MULTIPLY', ang, 4))
        diag = g.math('MAXIMUM', g.ramp(g.math('SINE', a), 0.94, 0.99), g.ramp(g.math('SINE', b), 0.94, 0.99))
        rings = g.lines(p, 6.0, 0.05)
        band = g.ramp(g.math('SINE', g.math('MULTIPLY', z, 38)), 0.1, 0.25)
        groove = g.math('MAXIMUM', rings, g.math('MULTIPLY', diag, band))
        streak = g.noise(g.scale(p, 200, 200, 8), 1.0, 3)
    else:
        groove = g.scratches(p, (70, 70, 70), 12)
        streak = g.noise(p, 120, 3)
    height = g.math('SUBTRACT', pits, g.math('MULTIPLY', groove, 0.6))

    # colour / roughness / ao
    base = g.lerp(look['steel'], look['dark'], g.math('MULTIPLY', grime, 0.85))
    base = g.lerp(base, look['dark'], g.math('MULTIPLY', groove, 0.7))
    base = g.lerp(base, look['edge'], g.math('MULTIPLY', edge, 0.75))
    rough = g.math('ADD', look['r'], g.math('MULTIPLY', grime, look['r_grime']))
    rough = g.math('ADD', rough, g.math('MULTIPLY', g.math('SUBTRACT', streak, 0.5), 0.16))
    rough = g.math('ADD', rough, g.math('MULTIPLY', groove, 0.22))
    rough = g.math('SUBTRACT', rough, g.math('MULTIPLY', edge, 0.1), clamp=True)
    ao_out = g.math('ADD', g.math('MULTIPLY', ao, 0.7), 0.3)

    bump = g.n('ShaderNodeBump')
    bump.inputs['Strength'].default_value = 1.0
    bump.inputs['Distance'].default_value = 0.002
    g.link(height, bump.inputs['Height'])
    bsdf = g.n('ShaderNodeBsdfPrincipled')
    g.link(bump.outputs['Normal'], bsdf.inputs['Normal'])
    emit = g.n('ShaderNodeEmission')
    out = g.n('ShaderNodeOutputMaterial')
    img = g.n('ShaderNodeTexImage')
    nt.nodes.active = img
    return m, dict(color=base, rough=rough, ao=ao_out, bsdf=bsdf.outputs[0], emit=emit, out=out, img=img, g=g)


scene = bpy.context.scene
scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
try:
    prefs.compute_device_type = 'OPTIX'
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type == 'OPTIX'
    scene.cycles.device = 'GPU'
except Exception:
    scene.cycles.device = 'CPU'
scene.cycles.samples = 32
scene.render.bake.margin = 12


def bake_set(name, keys):
    objs = [parts[k] for k in keys]
    graphs = []
    for k in keys:
        mat_, h = surface(k)
        parts[k].data.materials.clear()
        parts[k].data.materials.append(mat_)
        graphs.append(h)
    out = {}
    for pass_name in ('color', 'rough', 'ao', 'normal'):
        img = bpy.data.images.new(f'{name}_{pass_name}', SIZE, SIZE, float_buffer=True, alpha=False)
        img.colorspace_settings.name = 'Non-Color'
        for h in graphs:
            h['img'].image = img
            g = h['g']
            for l in list(h['out'].inputs['Surface'].links):
                g.nt.links.remove(l)
            if pass_name == 'normal':
                g.link(h['bsdf'], h['out'].inputs['Surface'])
            else:
                for l in list(h['emit'].inputs['Color'].links):
                    g.nt.links.remove(l)
                src = h[pass_name]
                if pass_name != 'color':
                    c = g.n('ShaderNodeCombineXYZ')
                    for i in range(3):
                        g.link(src, c.inputs[i])
                    src = c.outputs[0]
                g.link(src, h['emit'].inputs['Color'])
                g.link(h['emit'].outputs[0], h['out'].inputs['Surface'])
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if pass_name == 'normal':
            bpy.ops.object.bake(type='NORMAL', normal_space='TANGENT', use_clear=True)
        else:
            bpy.ops.object.bake(type='EMIT', use_clear=True)
        a = np.empty(SIZE * SIZE * 4, dtype=np.float32)
        img.pixels.foreach_get(a)
        out[pass_name] = a.reshape(SIZE, SIZE, 4)[..., :3]
        print('BAKED', name, pass_name, out[pass_name].mean((0, 1)).round(3))
    # the colour graph works in display (sRGB) values, stored as they are
    m = pbr_material(f'rebellion_{name}',
                     save_jpeg(f'rebellion_{name}', 'albedo', out['color'], quality=90, data=False),
                     save_jpeg(f'rebellion_{name}', 'orm', orm(out['ao'][..., 0], out['rough'][..., 0],
                                                               np.ones((SIZE, SIZE), np.float32))),
                     save_jpeg(f'rebellion_{name}', 'normal', out['normal'], quality=94))
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(m)


bake_set('blade', ('blade',))
bake_set('body', BODY_KEYS)

root = bpy.data.objects.new('rebellion', None)
bpy.context.scene.collection.objects.link(root)
for o in parts.values():
    o.parent = root

os.makedirs(OUT_DIR, exist_ok=True)
path = os.path.join(OUT_DIR, f'{OUT_ID}.glb')
bpy.ops.object.select_all(action='DESELECT')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True,
                          export_yup=True, export_materials='EXPORT', export_image_format='AUTO',
                          export_tangents=True)
tris = sum(len(p.vertices) - 2 for o in parts.values() for p in o.data.polygons)
lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for o in parts.values():
    for v in o.data.vertices:
        lo = Vector(map(min, lo, v.co)); hi = Vector(map(max, hi, v.co))
print('STATS tris', tris, 'size_xyz_m', tuple(round(x, 3) for x in (hi - lo)),
      'min', tuple(round(x, 3) for x in lo), 'bytes', os.path.getsize(path))
print('EXPORTED', path)
