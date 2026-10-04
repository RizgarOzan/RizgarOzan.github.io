"""Demirhane: the underground forge below the sword field.

blender -b --factory-startup -P tools/blender/forge_room.py            -> assets/env/forge.glb
blender -b --factory-startup -P tools/blender/forge_room.py -- preview [out.png]
    re-imports the GLB, lights it (fire + moon shaft) and renders the site camera view.

Blender space (Z up) == site space with y/z swapped: site (x, y, z) is Blender
(x, -z, y). Everything is modelled in world space; a root empty 'forge_room'
sits at the room origin, site (0, -14, 0), so the GLB can be loaded as is.
Site camera: (0.3, -12.4, 5.3) looking at (0.1, -12.88, -1), vertical FOV 30, 16:9.

Exported empties (site space, +Y up): rack_slot_0..3, anvil_slot, strike_point
(top of the hot blade where the hammer lands), forge_light, board_candle,
log_slot (where the Leviathan axe bites into the chopping log; its rotation is the axe's).
Named meshes the site drives: forge_board (front face = -Blender Y = +site Z),
forge_coals (emissive #ff6a1f, strength 4, mask texture), anvil_blade (u runs
tang 0 -> tip 1, forge.js gives it the heat). Empties holding a <name>_mesh child
(pivots survive meshopt): forge_hammer (grip end, handle along +X, striking face
toward -Z = site -Y; forge.js swings it) and the *_chain hangers sway.js swings.
Soot, ash and grime are vertex colours (COLOR_0) on the walls, floor and hearth.
Textures are CC0 from Poly Haven, cached in %TEMP%/polyhaven, embedded as JPEG.
"""
import json
import math
import os
import random
import struct
import sys
import urllib.request

import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix, Euler, noise

sys.path.append(os.path.dirname(__file__))
from forge_bl import reset, srgb, ROOT  # noqa: E402

OUT = os.path.join(ROOT, 'assets', 'env', 'forge.glb')
CACHE = os.path.join(os.environ.get('TEMP', '.'), 'polyhaven')
FLOOR = -14.0
rng = random.Random(7)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

# key points (Blender space). The back wall is split by two timber posts into
# three bays: rack (left), slate board (middle), hearth (right).
SLOT_X = [-3.45, -2.9, -2.35, -1.85]
SLOT_Y, SLOT_Z = 3.29, -12.2
BOARD = Vector((0.0, 3.40, -12.3))
BOARD_W, BOARD_H = 2.4, 1.45
POSTS_X = (-1.42, 1.54)
LINTEL_Z = -11.45
ANVIL = Vector((-0.8, -0.4, FLOOR))
HEARTH = Vector((2.65, 2.85, FLOOR))
LOG = Vector((1.2, -0.3, FLOOR))
HOLE = Vector((-0.8, -0.4))
HOLE_R = 1.1
CAM_POS = Vector((0.3, -5.3, -12.4))
CAM_AIM = Vector((0.1, 1.0, -12.88))


def ceiling_z(x, y):
    return -8.9 - 0.5 * (x / 5.0) ** 2


def sstep(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- textures

def fetch(asset, kind, res):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f'{asset}_{kind}_{res}.jpg')
    if not os.path.exists(path):
        req = lambda u: urllib.request.Request(u, headers={'User-Agent': 'rizgar-ozan-site forge build'})
        files = json.load(urllib.request.urlopen(req(f'https://api.polyhaven.com/files/{asset}')))
        url = files[kind][res]['jpg']['url']
        with urllib.request.urlopen(req(url)) as r, open(path, 'wb') as f:
            f.write(r.read())
        print('DOWNLOADED', path)
    return path


def compact(asset, kind, size, quality):
    """Downscaled, re-encoded copy (the exporter keeps JPEG bytes as they are)."""
    src = fetch(asset, kind, '2k' if size > 1024 else '1k')
    out = os.path.join(CACHE, f'{asset}_{kind}_{size}_q{quality}.jpg')
    if not os.path.exists(out):
        img = bpy.data.images.load(src)
        if img.size[0] != size:
            img.scale(size, size)
        img.file_format = 'JPEG'
        img.save(filepath=out, quality=quality)
        bpy.data.images.remove(img)
    return out


def image(asset, kind, size, data=False):
    img = bpy.data.images.load(compact(asset, kind, size, 80 if data else 76), check_existing=True)
    if data:
        img.colorspace_settings.name = 'Non-Color'
    return img


def height_map(asset, res='1k'):
    img = bpy.data.images.load(fetch(asset, 'Displacement', res), check_existing=True)
    w, h = img.size
    px = np.empty(w * h * 4, np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(h, w, 4)[..., 0].copy()


def sample(hm, u, v):
    """Bilinear, wrapping. u, v arrays in texture units."""
    h, w = hm.shape
    x = (np.asarray(u) % 1.0) * w - 0.5
    y = (np.asarray(v) % 1.0) * h - 0.5
    x0 = np.floor(x).astype(int); y0 = np.floor(y).astype(int)
    fx = x - x0; fy = y - y0
    x0 %= w; y0 %= h; x1 = (x0 + 1) % w; y1 = (y0 + 1) % h
    return (hm[y0, x0] * (1 - fx) * (1 - fy) + hm[y0, x1] * fx * (1 - fy)
            + hm[y1, x0] * (1 - fx) * fy + hm[y1, x1] * fx * fy)


def gltf_output_group():
    g = bpy.data.node_groups.get('glTF Material Output')
    if g is None:
        g = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    return g


def pbr(name, asset, res=(1024, 512, 512), tint=None, normal=1.0, double=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    b = N['Principled BSDF']
    d = N.new('ShaderNodeTexImage'); d.image = image(asset, 'Diffuse', res[0])
    if tint:
        mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        L.new(d.outputs['Color'], mix.inputs[6])
        mix.inputs[7].default_value = (*tint, 1)
        L.new(mix.outputs[2], b.inputs['Base Color'])
    else:
        L.new(d.outputs['Color'], b.inputs['Base Color'])
    a = N.new('ShaderNodeTexImage'); a.image = image(asset, 'arm', res[2], data=True)
    sep = N.new('ShaderNodeSeparateColor')
    L.new(a.outputs['Color'], sep.inputs['Color'])
    L.new(sep.outputs['Green'], b.inputs['Roughness'])
    L.new(sep.outputs['Blue'], b.inputs['Metallic'])
    occ = N.new('ShaderNodeGroup'); occ.node_tree = gltf_output_group()
    L.new(sep.outputs['Red'], occ.inputs['Occlusion'])
    n = N.new('ShaderNodeTexImage'); n.image = image(asset, 'nor_gl', res[1], data=True)
    nm = N.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = normal
    L.new(n.outputs['Color'], nm.inputs['Color'])
    L.new(nm.outputs['Normal'], b.inputs['Normal'])
    m.use_backface_culling = not double
    return m


def plain(name, color, metallic=0.0, roughness=0.6):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = roughness
    m.use_backface_culling = True
    return m


def coal_mask(size=256, cells=34):
    """Glowing-crack mask: Worley F2-F1 edges bright, cell cores mostly dark crust."""
    r = np.random.default_rng(3)
    pts = r.random((cells, 2))
    pts = np.concatenate([pts + (dx, dy) for dx in (-1, 0, 1) for dy in (-1, 0, 1)])
    hot = np.tile(r.random(cells), 9)
    yy, xx = np.mgrid[0:size, 0:size] / size
    d = np.sqrt((xx[..., None] - pts[:, 0]) ** 2 + (yy[..., None] - pts[:, 1]) ** 2)
    idx = np.argsort(d, axis=2)
    f1 = np.take_along_axis(d, idx[..., :1], 2)[..., 0]
    f2 = np.take_along_axis(d, idx[..., 1:2], 2)[..., 0]
    edge = np.clip(1 - (f2 - f1) / 0.035, 0, 1) ** 1.5
    core = hot[idx[..., 0]]
    core = np.where(core > 0.62, (core - 0.62) / 0.38, 0) * np.clip(1 - f1 / 0.12, 0, 1)
    v = np.clip(edge * 0.75 + core * 0.6 + 0.05, 0, 0.8)  # sRGB values
    img = bpy.data.images.new('coal_mask', size, size)
    rgba = np.stack([v, v, v, np.ones_like(v)], -1).astype(np.float32)
    img.pixels.foreach_set(rgba.ravel())
    img.file_format = 'PNG'
    img.filepath_raw = os.path.join(CACHE, 'coal_mask.png')
    img.save()
    return img


def coal_material():
    m = bpy.data.materials.new('forge_coals')
    m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links
    b = N['Principled BSDF']
    t = N.new('ShaderNodeTexImage'); t.image = coal_mask()
    b.inputs['Base Color'].default_value = (0.03, 0.025, 0.022, 1)
    b.inputs['Roughness'].default_value = 0.9
    b.inputs['Emission Strength'].default_value = 4.0
    m.use_backface_culling = True
    mix = N.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    L.new(t.outputs['Color'], mix.inputs[6])
    mix.inputs[7].default_value = (*srgb('#ff6a1f'), 1)
    L.new(mix.outputs[2], b.inputs['Emission Color'])
    return m


# ---------------------------------------------------------------- mesh utils

def mesh_obj(name, verts, faces, mats=(), uvs=None, mat_idx=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    for m in mats:
        me.materials.append(m)
    if uvs is not None:
        uv = me.uv_layers.new(name='UVMap')
        for poly in me.polygons:
            for li in poly.loop_indices:
                uv.data[li].uv = uvs[me.loops[li].vertex_index]
    if mat_idx is not None:
        for p, k in zip(me.polygons, mat_idx):
            p.material_index = k
    return obj


def shade(obj, angle=40):
    for p in obj.data.polygons:
        p.use_smooth = True
    obj.data.set_sharp_from_angle(angle=math.radians(angle))


def box_uv(obj, tile=1.0, off=(0.0, 0.0)):
    bpy.context.view_layer.update()
    me = obj.data
    uv = me.uv_layers[0] if me.uv_layers else me.uv_layers.new(name='UVMap')
    mw = obj.matrix_world
    rot = mw.to_3x3()
    for poly in me.polygons:
        n = rot @ poly.normal
        ax = max(range(3), key=lambda k: abs(n[k]))
        for li in poly.loop_indices:
            co = mw @ me.vertices[me.loops[li].vertex_index].co
            u, v = ((co.y, co.z), (co.x, co.z), (co.x, co.y))[ax]
            uv.data[li].uv = (u / tile + off[0], v / tile + off[1])


def grain_uv(obj, tile=0.9, mats=None):
    """Wood grain along each piece's long axis (rough_wood's grain runs along v).
    Pieces are the mesh islands of the given materials; the axis is their PCA."""
    me = obj.data
    idx = {i for i, m in enumerate(me.materials) if mats is None or m in mats}
    bm = bmesh.new(); bm.from_mesh(me)
    uvl = bm.loops.layers.uv.verify()
    seen = set()
    for f0 in bm.faces:
        if f0 in seen or f0.material_index not in idx:
            continue
        island, stack = [], [f0]
        seen.add(f0)
        while stack:
            f = stack.pop(); island.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g not in seen and g.material_index in idx:
                        seen.add(g); stack.append(g)
        pts = np.array([v.co[:] for f in island for v in f.verts])
        _, _, vt = np.linalg.svd(pts - pts.mean(0), full_matrices=False)
        L = Vector(vt[0])
        off = (rng.random(), rng.random())
        for f in island:
            n = f.normal
            if abs(n.dot(L)) > 0.7:  # end grain
                a = n.orthogonal().normalized(); b = n.cross(a)
            else:
                a = n.cross(L).normalized(); b = L
            for lp in f.loops:
                lp[uvl].uv = (lp.vert.co.dot(a) / tile + off[0], lp.vert.co.dot(b) / tile + off[1])
    bm.to_mesh(me); bm.free()


def pivot(name, obj, at):
    """Empty `name` at `at` holding obj (world-space data) as `<name>_mesh`:
    meshopt moves mesh origins, empties keep the pivot (sway.js, forge.js)."""
    obj.name = obj.data.name = name + '_mesh'
    obj.data.transform(Matrix.Translation(-Vector(at)))
    obj.matrix_world = Matrix.Identity(4)
    e = empty(name, at)
    obj.parent = e
    return e


def bake(obj):
    """Apply modifiers / convert curves; returns a plain mesh object."""
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    new = bpy.data.objects.new(obj.name, me)
    new.matrix_world = obj.matrix_world
    bpy.context.scene.collection.objects.link(new)
    name, old = obj.name, obj.data
    bpy.data.objects.remove(obj, do_unlink=True)
    if old is not None and old.users == 0:
        (bpy.data.meshes if isinstance(old, bpy.types.Mesh) else bpy.data.curves).remove(old)
    new.name = name
    me.name = name
    return new


def join(name, objs):
    objs = [bake(o) for o in objs]
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def bevel(obj, w, seg=2, angle=35):
    m = obj.modifiers.new('bevel', 'BEVEL')
    m.width = w; m.segments = seg
    m.limit_method = 'ANGLE'; m.angle_limit = math.radians(angle)
    m.harden_normals = False
    return m


def cube(name, lo, hi, mat=None, bev=0.0, seg=2):
    lo, hi = Vector(lo), Vector(hi)
    c = (lo + hi) / 2; s = hi - lo
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=s, verts=bm.verts[:])
    bmesh.ops.translate(bm, vec=c, verts=bm.verts[:])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if mat:
        me.materials.append(mat)
    if bev:
        bevel(o, bev, seg)
    return o


def jitter(obj, amp, scale=3.0, seed=0.0):
    off = Vector((seed * 13.1, seed * 7.7, seed * 3.3))
    for v in obj.data.vertices:
        v.co += noise.noise_vector(v.co * scale + off) * amp


def paint(obj, fn):
    """Per-vertex colour (exported as COLOR_0, multiplies the base colour).
    fn(world_co) -> (r, g, b), linear 0..1."""
    bpy.context.view_layer.update()
    me = obj.data
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    mw = obj.matrix_world
    for v, c in zip(me.vertices, ca.data):
        r, g, b = fn(mw @ v.co)
        c.color = (min(max(r, 0), 1), min(max(g, 0), 1), min(max(b, 0), 1), 1.0)
    me.color_attributes.active_color = ca


def wall_soot(co):
    """Smoke-darkened stone above and around the hearth, damp grime at the foot."""
    dx = co.x - HEARTH.x
    s = (0.72 * math.exp(-(dx / 1.0) ** 2) * sstep(FLOOR + 0.55, FLOOR + 1.6, co.z)
         + 0.22 * math.exp(-(dx / 1.9) ** 2) * sstep(FLOOR + 0.3, FLOOR + 2.4, co.z))
    s += 0.18 * sstep(FLOOR + 0.7, FLOOR, co.z) + 0.1 * (0.5 + 0.5 * nz(co, 1.3))
    k = max(0.18, 1 - s)
    return (k, k * 0.97, k * 0.94)


def floor_soot(co):
    """Ash and dust in front of the hearth, scale and grime around the anvil."""
    dh = math.hypot((co.x - HEARTH.x) / 1.3, (co.y - (HEARTH.y - 0.7)) / 0.9)
    da = math.hypot(co.x - ANVIL.x, co.y - ANVIL.y)
    ash = 0.42 * math.exp(-dh * dh)
    scale = 0.38 * math.exp(-(da / 0.75) ** 2)
    mott = 0.14 * (0.5 + 0.5 * nz(co, 0.9))
    k = 1 - mott
    # ash goes grey (less warm), scale goes blue-black
    return (k * (1 - ash * 0.75) * (1 - scale), k * (1 - ash * 0.7) * (1 - scale * 0.97),
            k * (1 - ash * 0.6) * (1 - scale * 0.9))


def curve_tube(name, pts, radii, mat, res=1, sides=4):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 1.0
    cu.bevel_resolution = res
    cu.resolution_u = sides
    cu.use_fill_caps = True
    sp = cu.splines.new('NURBS')
    sp.points.add(len(pts) - 1)
    for p, co, r in zip(sp.points, pts, radii):
        p.co = (*co, 1)
        p.radius = r
    sp.use_endpoint_u = True
    sp.order_u = 3
    o = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    return o


# ---------------------------------------------------------------- the shell

def surface(name, nu, nv, fn, mat, inward, disp=None, keep=None):
    """Grid surface. fn(s, t) -> (pos, uv). Faces are oriented so their normal
    points toward `inward(center)` (a function returning the target point).
    disp(pos, uv, normal) -> offset along the normal. keep(center) -> bool."""
    verts, uvs = [], []
    for j in range(nv + 1):
        for i in range(nu + 1):
            p, uv = fn(i / nu, j / nv)
            verts.append(Vector(p)); uvs.append(uv)
    faces = []
    W = nu + 1
    for j in range(nv):
        for i in range(nu):
            f = [j * W + i, j * W + i + 1, (j + 1) * W + i + 1, (j + 1) * W + i]
            c = sum((verts[k] for k in f), Vector()) / 4
            if keep and not keep(c):
                continue
            n = (verts[f[1]] - verts[f[0]]).cross(verts[f[3]] - verts[f[0]])
            if n.dot(inward(c) - c) < 0:
                f.reverse()
            faces.append(f)
    obj = mesh_obj(name, verts, faces, [mat], uvs)
    me = obj.data
    if disp:
        me.update()
        nrm = [v.normal.copy() for v in me.vertices]
        offs = disp(verts, uvs, nrm)
        for v, n, d in zip(me.vertices, nrm, offs):
            v.co += n * float(d)
    # drop loose verts (hole)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return obj


def nz(p, scale, oct=3):
    return noise.fractal(Vector(p) * scale, 0.5, 2.0, oct)


def build_shell(M):
    room_c = lambda c: Vector((0.0, -0.5, -11.5))
    wall_h = height_map('rock_wall_08')
    floor_h = height_map('monastery_stone_floor')
    rock_h = height_map('rock_face')

    def wall_disp(tile, amp, big, hm):
        def f(verts, uvs, nrm):
            u = np.array([uv[0] for uv in uvs]); v = np.array([uv[1] for uv in uvs])
            h = sample(hm, u, v)
            out = []
            for p, hv in zip(verts, h):
                n = 0.5 + 0.5 * nz(p, 0.45)
                out.append(amp * (hv - 1.0) - big * n)
            return out
        return f

    # back wall: cut stone, faces at y = 3.5, joints recessed
    T = 3.0
    bw = surface('back_wall', 180, 92,
            lambda s, t: ((-5.4 + 10.8 * s, 3.5, -14.3 + 5.6 * t),
                          ((-5.4 + 10.8 * s) / T, (-14.3 + 5.6 * t) / T)),
            M['wall'], room_c, wall_disp(T, 0.07, 0.10, wall_h))
    paint(bw, wall_soot)
    # side walls
    for side in (-1, 1):
        sw = surface(f'side_wall_{"l" if side < 0 else "r"}', 74, 44,
                lambda s, t, side=side: ((5.0 * side, -5.0 + 8.9 * s, -14.3 + 5.4 * t),
                                         ((-5.0 + 8.9 * s) / T + 0.37 * side, (-14.3 + 5.4 * t) / T)),
                M['wall'], room_c, wall_disp(T, 0.07, 0.22, wall_h))
        paint(sw, wall_soot)

    # floor: stone slabs, joints recessed; a little heave
    TF = 2.4

    def floor_disp(verts, uvs, nrm):
        u = np.array([uv[0] for uv in uvs]); v = np.array([uv[1] for uv in uvs])
        h = sample(floor_h, u, v)
        return [0.045 * (hv - 1.0) + 0.02 * nz(p, 0.6) for p, hv in zip(verts, h)]

    fl = surface('floor', 136, 110,
            lambda s, t: ((-5.4 + 10.8 * s, -5.0 + 8.8 * t, FLOOR),
                          ((-5.4 + 10.8 * s) / TF, (-5.0 + 8.8 * t) / TF)),
            M['floor'], room_c, floor_disp)
    paint(fl, floor_soot)

    # ceiling: natural rock vault with the shaft hole above the anvil
    TC = 3.0

    def hole_r(c):
        a = math.atan2(c.y - HOLE.y, c.x - HOLE.x)
        return HOLE_R + 0.12 * math.sin(3 * a + 1) + 0.07 * math.sin(7 * a)

    def ceil_disp(verts, uvs, nrm):
        u = np.array([uv[0] for uv in uvs]); v = np.array([uv[1] for uv in uvs])
        h = sample(rock_h, u, v)
        return [0.18 * (hv - 0.5) + 0.35 * nz(p, 0.35, 4) for p, hv in zip(verts, h)]

    surface('ceiling', 80, 70,
            lambda s, t: ((-5.4 + 10.8 * s, -5.0 + 8.8 * t,
                           ceiling_z(-5.4 + 10.8 * s, 0)),
                          ((-5.4 + 10.8 * s) / TC, (-5.0 + 8.8 * t) / TC)),
            M['rock'], room_c, ceil_disp,
            keep=lambda c: (Vector((c.x, c.y)) - HOLE).length > hole_r(c))

    # shaft: rough rock tube from just under the ceiling up toward the field
    segs, rings = 36, 44
    z0, z1 = ceiling_z(HOLE.x, HOLE.y) - 0.45, -1.0

    def shaft_fn(s, t):
        a = 2 * math.pi * s
        z = z0 + (z1 - z0) * t
        r = 1.0 + 0.08 * math.sin(3 * a + 1) + 0.05 * math.sin(7 * a) + 0.12 * t
        if t == 0:
            z += 0.18 * nz((math.cos(a) * 2, math.sin(a) * 2, 0), 1.0)
        return ((HOLE.x + r * math.cos(a), HOLE.y + r * math.sin(a), z),
                (a * 1.05 / TC * 2, z / TC))

    def shaft_disp(verts, uvs, nrm):
        u = np.array([uv[0] for uv in uvs]); v = np.array([uv[1] for uv in uvs])
        h = sample(rock_h, u, v)
        return [0.12 * (hv - 0.5) + 0.22 * nz(p, 0.6, 4) for p, hv in zip(verts, h)]

    surface('shaft', segs, rings, shaft_fn, M['rock'],
            lambda c: Vector((HOLE.x, HOLE.y, c.z)), shaft_disp)
    # weld the seam of the shaft
    o = bpy.data.objects['shaft']
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.02)
    bm.to_mesh(o.data); bm.free()


def build_roots(M):
    objs = []
    zc = ceiling_z(HOLE.x, HOLE.y)
    for k in range(16):
        a = 2 * math.pi * k / 16 + rng.uniform(-0.15, 0.15)
        r = HOLE_R + rng.uniform(-0.05, 0.25)
        start = Vector((HOLE.x + r * math.cos(a), HOLE.y + r * math.sin(a), zc - 0.15))
        length = rng.uniform(0.35, 1.5) if k % 3 else rng.uniform(1.2, 2.1)
        n = 9
        pts, radii = [], []
        drift = Vector((rng.uniform(-1, 1), rng.uniform(-1, 1), 0)) * 0.08
        p = start.copy()
        thick = rng.uniform(0.012, 0.032)
        for i in range(n):
            t = i / (n - 1)
            pts.append(p.copy())
            radii.append(thick * (1 - 0.85 * t))
            p += Vector((0, 0, -length / (n - 1))) + drift + noise.noise_vector(p * 2.5 + Vector((k, 0, 0))) * 0.07
            drift *= 0.7
        # root comes out of the rock horizontally first
        pts.insert(0, start + Vector((math.cos(a), math.sin(a), 0.05)) * 0.25)
        radii.insert(0, thick * 1.1)
        objs.append(curve_tube(f'root_{k}', pts, radii, M['root'], res=1, sides=3))
        if k % 2 == 0:  # a hair rootlet off the side
            q = pts[len(pts) // 2]
            dx, dy = rng.uniform(-.06, .06), rng.uniform(-.06, .06)
            sub = [q + Vector((dx * i, dy * i, -0.18 * i)) for i in range(4)]
            objs.append(curve_tube(f'rootlet_{k}', sub, [0.006, 0.005, 0.003, 0.0015], M['root'], res=0, sides=2))
    roots = join('roots', objs)
    box_uv(roots, 0.6)
    return roots


# ---------------------------------------------------------------- props

def build_rack(M):
    parts = []
    z = SLOT_Z
    x0, x1 = SLOT_X[0] - 0.38, SLOT_X[-1] + 0.28
    # flat forged bar bolted to the wall, anchors at the ends and middle
    parts.append(cube('rack_bar', (x0, 3.44, z - 0.13), (x1, 3.5, z - 0.05), M['iron'], 0.006))
    for x in (x0 + 0.08, (x0 + x1) / 2, x1 - 0.08):
        parts.append(cube('rack_anchor', (x - 0.035, 3.42, z - 0.12), (x + 0.035, 3.44, z - 0.06), M['iron'], 0.008))
    for i, x in enumerate(SLOT_X):
        # wall plate rising from the bar, arm out, forked cradle
        parts.append(cube(f'plate_{i}', (x - 0.06, 3.445, z - 0.2), (x + 0.06, 3.47, z + 0.1), M['iron'], 0.007))
        arm = curve_tube(f'arm_{i}', [(x, 3.46, z - 0.035), (x, 3.38, z - 0.045), (x, 3.31, z - 0.035),
                                      (x, 3.29, z - 0.01)], [0.022] * 4, M['iron'], res=1, sides=3)
        parts.append(arm)
        for sx in (-1, 1):
            tine = curve_tube(f'tine_{i}_{sx}', [(x, 3.30, z - 0.02), (x + sx * 0.035, 3.29, z + 0.0),
                                                  (x + sx * 0.05, 3.28, z + 0.06), (x + sx * 0.045, 3.26, z + 0.1)],
                              [0.016, 0.015, 0.013, 0.01], M['iron'], res=1, sides=3)
            parts.append(tine)
        for zz in (z - 0.15, z + 0.06):  # rivets
            r = bpy.data.objects.new('rivet', bpy.data.meshes.new('rivet'))
            bm = bmesh.new()
            bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=4, radius=0.012)
            bm.to_mesh(r.data); bm.free()
            bpy.context.scene.collection.objects.link(r)
            r.location = (x, 3.447, zz); r.scale = (1, 0.5, 1)
            r.data.materials.append(M['iron'])
            parts.append(r)
    rack = join('weapon_rack', parts)
    box_uv(rack, 0.5)
    shade(rack, 50)
    return rack


def beam(name, lo, hi, mat, cuts=6, bev=0.018, amp=0.012, seed=0.0):
    """Worn timber: a box cut along its long axis, edges knocked about by noise."""
    lo, hi = Vector(lo), Vector(hi)
    s = hi - lo
    ax = max(range(3), key=lambda k: s[k])
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=s, verts=bm.verts[:])
    bmesh.ops.translate(bm, vec=(lo + hi) / 2, verts=bm.verts[:])
    long_edges = [e for e in bm.edges if abs((e.verts[0].co - e.verts[1].co)[ax]) > 1e-4]
    bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=cuts, use_grid_fill=True)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(mat)
    jitter(o, amp, 2.5, seed)
    bevel(o, bev, 2)
    return o


def build_timber(M):
    """Two posts and a lintel frame the back wall into bays; knee braces."""
    parts = []
    for i, x in enumerate(POSTS_X):
        parts.append(beam(f'post_{i}', (x - 0.12, 3.12, FLOOR - 0.05), (x + 0.12, 3.46, LINTEL_Z + 0.05),
                          M['timber'], 10, seed=i + 1))
        for sx in (-1, 1):  # knee braces
            c = Vector((x + sx * 0.36, 3.29, LINTEL_Z - 0.3))
            b = beam(f'brace_{i}_{sx}', c - Vector((0.36, 0.08, 0.055)), c + Vector((0.36, 0.08, 0.055)),
                     M['timber'], 3, 0.012, 0.006, seed=i * 3 + sx)
            b.data.transform(Matrix.Translation(c) @ Matrix.Rotation(math.radians(-38 * sx), 4, 'Y')
                             @ Matrix.Translation(-c))
            parts.append(b)
    parts.append(beam('lintel', (-5.2, 3.16, LINTEL_Z), (5.2, 3.48, LINTEL_Z + 0.32), M['timber'], 24, seed=9))
    # iron dogs pinning braces and lintel
    for x in POSTS_X:
        parts.append(cube('dog', (x - 0.02, 3.1, LINTEL_Z - 0.08), (x + 0.02, 3.13, LINTEL_Z + 0.12), M['iron'], 0.004))
    tim = join('timber', parts)
    box_uv(tim, 0.9)
    grain_uv(tim, 0.9, {M['timber']})
    shade(tim, 40)
    return tim


def build_board(M):
    w, h, d = BOARD_W, BOARD_H, 0.05
    board = cube('forge_board', BOARD - Vector((w / 2, d / 2, h / 2)), BOARD + Vector((w / 2, d / 2, h / 2)),
                 M['board'], 0.004, 1)
    board = bake(board)
    # UV: front face spans 0..1 exactly (site overlay); other faces box-mapped
    box_uv(board, 1.0)
    me = board.data; uv = me.uv_layers[0]
    for p in me.polygons:
        if p.normal.y < -0.99:
            for li in p.loop_indices:
                co = me.vertices[me.loops[li].vertex_index].co
                uv.data[li].uv = ((co.x - BOARD.x + w / 2) / w, (co.z - BOARD.z + h / 2) / h)
    shade(board, 50)
    # timber frame around the slate, its lip proud of the face
    t, y0, y1 = 0.08, BOARD.y - d / 2 - 0.03, BOARD.y + d / 2
    L, R, B, T = BOARD.x - w / 2, BOARD.x + w / 2, BOARD.z - h / 2, BOARD.z + h / 2
    fr = [beam('frame_t', (L - t, y0, T), (R + t, y1, T + t), M['timber'], 8, 0.008, 0.004, 1),
          beam('frame_b', (L - t, y0, B - t), (R + t, y1, B), M['timber'], 8, 0.008, 0.004, 2),
          beam('frame_l', (L - t, y0, B), (L, y1, T), M['timber'], 5, 0.008, 0.004, 3),
          beam('frame_r', (R, y0, B), (R + t, y1, T), M['timber'], 5, 0.008, 0.004, 4)]
    # chalk ledge under the board
    fr.append(beam('ledge', (L + 0.1, y0 - 0.07, B - t - 0.03), (R - 0.1, y1, B - t), M['timber'], 6, 0.006, 0.003, 5))
    frame = join('board_frame', fr)
    grain_uv(frame, 0.6)
    shade(frame, 40)
    # chalk stubs on the ledge
    for i, (x, l) in enumerate(((0.55, 0.07), (0.68, 0.045))):
        c = cube(f'chalk_{i}', (x, y0 - 0.055, B - t), (x + l, y0 - 0.04, B - t + 0.014), M['chalk'], 0.004)
        c.rotation_euler = (0, 0, 0.2 * i)
    return board


def build_candle(M):
    """Iron sconce on the right post with a fat candle: the board's own light."""
    x, y, z = POSTS_X[1], 3.12, -11.95
    parts = [cube('sconce_plate', (x - 0.04, y - 0.015, z - 0.16), (x + 0.04, y, z + 0.02), M['iron'], 0.004)]
    parts.append(curve_tube('sconce_arm', [(x, y - 0.01, z - 0.12), (x, y - 0.1, z - 0.1), (x, y - 0.17, z - 0.03)],
                            [0.008, 0.008, 0.007], M['iron'], res=1, sides=3))
    dish = lathe_obj('sconce_dish', [(lambda a: 0.0, -0.012), (lambda a: 0.045, -0.008), (lambda a: 0.05, 0.004)],
                     16, [M['iron']])
    dish.location = (x, y - 0.17, z - 0.03)
    parts.append(dish)
    sc = join('candle_sconce', parts)
    box_uv(sc, 0.3)
    shade(sc, 45)
    wax = lathe_obj('candle', [(lambda a: 0.021, 0.0), (lambda a: 0.021 + 0.002 * math.sin(a * 3), 0.07),
                               (lambda a: 0.019, 0.095), (lambda a: 0.008, 0.1)], 14, [M['wax']])
    wax.location = (x, y - 0.17, z - 0.026)
    shade(wax, 60)
    return Vector((x, y - 0.17, z - 0.026 + 0.135))


def build_anvil(M):
    K_S = [0.0, 0.1, 0.32, 0.58, 0.8, 0.94, 1.0]
    body_shape = [1.05, 0.86, 0.78, 0.86, 0.98, 1.0, 0.9]

    def zt(x):
        if x > -0.078:
            return 0.33
        if x >= -0.16:
            return 0.315
        return 0.315 - 0.055 * ((-0.16 - x) / 0.31) ** 1.4

    def zb(x):
        if x >= -0.10:
            return 0.06 + 0.16 * sstep(0.10, 0.20, x) + 0.03 * max(0.0, (x - 0.2) / 0.12)
        if x >= -0.20:
            return 0.06 + 0.15 * sstep(-0.10, -0.20, x)
        t = (-0.2 - x) / 0.27
        return max(zt(x) - (0.104 * (1 - t) ** 0.9 + 0.006), 0.06 + 0.15)

    def W(x):
        if x >= -0.16:
            return 0.065
        t = (-0.16 - x) / 0.31
        return 0.06 * (1 - t) ** 0.85 + 0.005

    xs = sorted(set(round(v, 4) for v in
                    list(np.linspace(-0.47, -0.16, 13)) + list(np.linspace(-0.16, 0.32, 17))
                    + [-0.079, -0.077, -0.1, -0.12, 0.1, 0.12, 0.14, 0.16, 0.18]))
    verts, faces = [], []
    n_k = len(K_S)
    for x in xs:
        b, t, w = zb(x), zt(x), W(x)
        hb = sstep(-0.12, -0.21, x)
        ring = []
        for k, s in enumerate(K_S):
            horn = math.sin(math.pi * (0.06 + 0.88 * s)) ** 0.55
            sh = body_shape[k] * (1 - hb) + horn * hb
            ring.append((x, w * sh, b + (t - b) * s))
        ring = ring + [(x, -y, z) for (x, y, z) in reversed(ring)]
        verts.extend(ring)
    R = 2 * n_k
    for i in range(len(xs) - 1):
        for k in range(R):
            a, b_ = i * R + k, i * R + (k + 1) % R
            faces.append((a, b_, b_ + R, a + R))
    faces.append(tuple(range(R)))
    faces.append(tuple((len(xs) - 1) * R + k for k in range(R)))
    body = mesh_obj('anvil_body', verts, faces, [M['iron'], M['iron_face']])
    bm = bmesh.new(); bm.from_mesh(body.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(body.data); bm.free()
    for p in body.data.polygons:
        c = p.center
        if p.normal.z > 0.97 and c.z > 0.325 and c.x > -0.078:
            p.material_index = 1
    # base / feet
    base = cube('anvil_base', (-0.21, -0.125, 0.0), (0.21, 0.125, 0.075), M['iron'], 0.012)
    for v in base.data.vertices:
        if v.co.z > 0.03:
            v.co.x *= 0.62; v.co.y *= 0.62
    # hardy hole (dark inset) on the heel
    hardy = cube('hardy', (0.225, -0.014, 0.326), (0.253, 0.014, 0.3305), M['soot'])
    anvil = join('anvil', [body, base, hardy])
    yaw = math.radians(-7)
    anvil.matrix_world = Matrix.Translation(ANVIL + Vector((0, 0, 0.48))) @ Matrix.Rotation(yaw, 4, 'Z')
    bpy.ops.object.select_all(action='DESELECT')
    anvil.select_set(True); bpy.context.view_layer.objects.active = anvil
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    box_uv(anvil, 0.6)
    shade(anvil, 38)
    return anvil, yaw, ANVIL.z + 0.48 + 0.33


def lathe_obj(name, rings, segs, mats, top_cap=None, uv_tile=0.8):
    """rings: [(fn(a) -> radius, z)] bottom to top around Z through origin."""
    verts, faces, uvs, mi = [], [], [], []
    for r_fn, z in rings:
        for i in range(segs + 1):
            a = 2 * math.pi * i / segs
            r = r_fn(a)
            verts.append((r * math.cos(a), r * math.sin(a), z))
            uvs.append((a * 0.3 / uv_tile, z / uv_tile))
    W = segs + 1
    for j in range(len(rings) - 1):
        for i in range(segs):
            faces.append((j * W + i, j * W + i + 1, (j + 1) * W + i + 1, (j + 1) * W + i))
            mi.append(0)
    if top_cap is not None:
        c = len(verts)
        r_fn, z = rings[-1]
        verts.append((0, 0, z + top_cap[0]))
        uvs.append((0.5, 0.5))
        base = (len(rings) - 1) * W
        # cap uses its own verts so its UVs are planar
        cap = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            r = r_fn(a)
            verts.append((r * math.cos(a), r * math.sin(a), z))
            uvs.append((0.5 + r * math.cos(a) / 0.7, 0.5 + r * math.sin(a) / 0.7))
            cap.append(len(verts) - 1)
        for i in range(segs):
            faces.append((cap[i], cap[(i + 1) % segs], c))
            mi.append(top_cap[1])
    o = mesh_obj(name, verts, faces, mats, uvs, mi)
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(o.data); bm.free()
    return o


def build_stump(M):
    def rf(base):
        return lambda a: base + 0.012 * math.sin(a * 17) + 0.018 * noise.noise((math.cos(a) * 2, math.sin(a) * 2, base * 9))
    rings = [(rf(0.37), -0.05), (rf(0.33), 0.04), (rf(0.305), 0.14), (rf(0.30), 0.3), (rf(0.30), 0.44), (rf(0.295), 0.48)]
    st = lathe_obj('stump', rings, 28, [M['bark'], M['wood_end']], top_cap=(-0.004, 1), uv_tile=0.7)
    st.location = (ANVIL.x, ANVIL.y, FLOOR)
    shade(st, 60)
    return st


def build_log(M):
    """Thick chopping log between the anvil and the trough; the Leviathan axe
    (forge.js) bites into its top at log_slot, leaning a little."""
    def rf(base, k):
        return lambda a: base + 0.014 * math.sin(a * 11 + k) + 0.022 * noise.noise((math.cos(a) * 2, math.sin(a) * 2, base * 7 + k))
    H = 0.46
    rings = [(rf(0.36, 0), -0.04), (rf(0.33, 1), 0.06), (rf(0.315, 2), 0.2), (rf(0.31, 3), 0.36), (rf(0.305, 4), H - 0.012),
             (rf(0.295, 5), H)]
    log = lathe_obj('chopping_log', rings, 30, [M['bark'], M['wood_end']], top_cap=(-0.004, 1), uv_tile=0.7)
    log.location = (LOG.x, LOG.y, FLOOR)
    shade(log, 60)
    # a few chips at its foot
    for i in range(7):
        a = rng.uniform(0, 6.3); r = rng.uniform(0.38, 0.6)
        c = cube(f'chip_{i}', (-0.03, -0.012, 0), (0.03, 0.012, 0.006), M['wood'])
        c.location = (LOG.x + r * math.cos(a), LOG.y + r * math.sin(a), FLOOR + 0.004)
        c.rotation_euler = (0, 0, rng.uniform(0, 3.1))
    # where the blade enters: just off centre on the top face
    return Vector((LOG.x + 0.03, LOG.y - 0.02, FLOOR + H - 0.004))


def anvil_matrix(yaw):
    return Matrix.Translation(ANVIL + Vector((0, 0, 0.48))) @ Matrix.Rotation(yaw, 4, 'Z')


def build_blade(M, yaw):
    """A half-forged blade lying flat on the anvil face (anvil space: face top
    z = 0.33 over x in [-0.078, 0.32]). Tang overhangs the heel, the drawn-out
    tip overhangs the step; the worked middle rests on the face. u: tang 0 -> tip 1."""
    A = anvil_matrix(yaw) @ Matrix.Translation((0.08, 0, 0)) @ Matrix.Rotation(math.radians(9), 4, 'Z') \
        @ Matrix.Translation((-0.08, 0, 0))
    NS, K = 72, 14
    LT, LB = 0.2, 0.56
    L, X0 = LT + LB, 0.47
    st = LT / L

    def section(s):
        if s < st:
            q = s / st
            return 0.011 + 0.005 * q, 0.0078 + 0.0012 * q, 0.0, 0.0
        q = (s - st) / (1 - st)
        w = 0.017 + 0.029 * sstep(0.0, 0.07, q)
        w *= 1 - 0.36 * q ** 1.5
        th = 0.0085 - 0.0042 * q
        if q > 0.86:  # rounded, still blunt tip
            tf = math.sqrt(max(0.0, 1 - ((q - 0.86) / 0.14) ** 2))
            w *= max(tf, 0.04); th *= max(tf ** 0.5, 0.25)
        w *= 1 + 0.04 * noise.noise((q * 7.0, 1.3, 0.2))
        th *= 1 + 0.12 * noise.noise((q * 13.0, 4.2, 0.7)) + 0.05 * math.sin(q * 60)  # hammer facets
        return w, th, sstep(0.0, 0.05, q), 0.0035 * math.sin(q * math.pi)

    verts, uvs, faces = [], [], []
    for i in range(NS + 1):
        s = i / NS
        w, th, lens, yoff = section(s)
        x = X0 - L * s
        zc = 0.33 + th / 2 + 0.0003
        for k in range(K + 1):
            a = 2 * math.pi * k / K
            c, sn = math.cos(a), math.sin(a)
            # tang: boxy superellipse; blade: lens with thin edges
            by, bz = math.copysign(abs(c) ** 0.3, c), math.copysign(abs(sn) ** 0.3, sn)
            ly, lz = c, math.copysign(abs(sn) ** 1.5, sn)
            y = w / 2 * (by + (ly - by) * lens)
            z = th / 2 * (bz + (lz - bz) * lens)
            verts.append(A @ Vector((x, y + yoff, zc + z)))
            uvs.append((s, k / K))
    W = K + 1
    for i in range(NS):
        for k in range(K):
            faces.append((i * W + k, i * W + k + 1, (i + 1) * W + k + 1, (i + 1) * W + k))
    for end, s in ((0, 0.0), (NS, 1.0)):  # caps
        c = len(verts)
        ring = [verts[end * W + k] for k in range(K)]
        verts.append(sum(ring, Vector()) / K); uvs.append((s, 0.5))
        for k in range(K):
            faces.append((end * W + k, end * W + k + 1, c))
    blade = mesh_obj('anvil_blade', verts, faces, [M['blade']], uvs)
    bm = bmesh.new(); bm.from_mesh(blade.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(blade.data); bm.free()
    shade(blade, 50)
    # where the hammer lands: top of the blade in the worked zone
    s = 0.56
    w, th, _, yoff = section(s)
    strike = A @ Vector((X0 - L * s, yoff, 0.33 + th + 0.0003))
    return blade, strike


HAM_X, HAM_FACE = 0.40, -0.074  # head centre along the handle, face below the handle axis


def build_hammer(M):
    """Smith's cross-peen hammer at working scale: head 13 x 5.2 x 5.2 cm on a
    42 cm ash handle. Empty forge_hammer at the grip end (handle along +X, face
    toward -Z = site -Y, head centre at x = HAM_X) holds forge_hammer_mesh."""
    # handle: oval loft (taller in the swing plane), swelling at the grip, slim neck, flared into the eye
    prof = [(0.0, 0.0135, 0.0175), (0.006, 0.0155, 0.0198), (0.08, 0.0158, 0.0205), (0.19, 0.0128, 0.0168),
            (0.31, 0.0115, 0.0152), (0.365, 0.0128, 0.0178), (0.432, 0.0128, 0.0178)]
    S = 14
    verts, faces = [], []
    for x, ry, rz in prof:
        for i in range(S):
            a = 2 * math.pi * i / S
            verts.append((x, ry * math.cos(a), rz * math.sin(a)))
    for j in range(len(prof) - 1):
        for i in range(S):
            faces.append((j * S + i, j * S + (i + 1) % S, (j + 1) * S + (i + 1) % S, (j + 1) * S + i))
    faces.append(tuple(range(S))[::-1])
    faces.append(tuple((len(prof) - 1) * S + i for i in range(S)))
    handle = mesh_obj('hammer_handle', verts, faces, [M['wood']])
    bm = bmesh.new(); bm.from_mesh(handle.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(handle.data); bm.free()
    # head: 5.2 cm square, face end crowned and chamfered, peen end drawn to a wedge across the handle
    z0, z1 = HAM_FACE, HAM_FACE + 0.13
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(0.052, 0.052, z1 - z0), verts=bm.verts[:])
    bmesh.ops.translate(bm, vec=(HAM_X, 0, (z0 + z1) / 2), verts=bm.verts[:])
    tall = [e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.05]
    bmesh.ops.subdivide_edges(bm, edges=tall, cuts=9, use_grid_fill=True)
    for v in bm.verts:
        t = sstep(0.012, z1, v.co.z)
        v.co.x = HAM_X + (v.co.x - HAM_X) * (1 - 0.8 * t)   # peen: thins along the handle
        v.co.y *= 1 + 0.06 * t
        e = sstep(-0.02, 0.012, v.co.z) * (1 - t)          # eye: cheeks bulge a little round the handle
        v.co.y *= 1 + 0.07 * e
        f = sstep(z0 + 0.016, z0, v.co.z)                    # face: chamfered toward the striking end
        v.co.x = HAM_X + (v.co.x - HAM_X) * (1 - 0.13 * f)
        v.co.y *= 1 - 0.13 * f
    me = bpy.data.meshes.new('hammer_head'); bm.to_mesh(me); bm.free()
    head = bpy.data.objects.new('hammer_head', me)
    bpy.context.scene.collection.objects.link(head)
    me.materials.append(M['iron']); me.materials.append(M['iron_face'])
    bevel(head, 0.004, 2, 30)
    head = bake(head)
    for p in head.data.polygons:  # polished face and peen edge
        if p.center.z < z0 + 0.002 or p.center.z > z1 - 0.003:
            p.material_index = 1
    wedge = cube('hammer_wedge', (0.428, -0.011, -0.0025), (0.434, 0.011, 0.0025), M['iron'], 0.001)
    hammer = join('forge_hammer', [handle, head, wedge])
    box_uv(hammer, 0.25)
    grain_uv(hammer, 0.5, {M['wood']})
    shade(hammer, 40)
    # parked beside the stump; forge.js picks it up by the empty
    at = Vector((ANVIL.x + 0.25, ANVIL.y - 0.7, FLOOR + 0.06))
    hammer.data.transform(Matrix.Translation(at))
    return pivot('forge_hammer', hammer, at)


def floor_at(bvh, x, y):
    hit = bvh.ray_cast(Vector((x, y, FLOOR + 0.5)), Vector((0, 0, -1)), 2.0)
    return hit[0].z if hit[0] is not None else FLOOR


def build_floor_debris(M, bvh):
    """Mill scale round the anvil, ash at the hearth's foot, a few dead coals."""
    bm = bmesh.new()
    n = 0
    while n < 420:
        a = rng.uniform(0, 2 * math.pi)
        r = 0.18 + abs(rng.gauss(0, 0.38))
        x, y = ANVIL.x + r * math.cos(a), ANVIL.y + r * math.sin(a) * 0.85
        if r > 1.2:
            continue
        n += 1
        sz = rng.uniform(0.004, 0.013)
        z = floor_at(bvh, x, y) + 0.0015
        rot = rng.uniform(0, 6.3)
        pts = [Vector((math.cos(rot + k * 2.1 + rng.uniform(-.4, .4)), math.sin(rot + k * 2.1 + rng.uniform(-.4, .4)), 0))
               * sz * rng.uniform(0.6, 1.2) for k in range(3)]
        vs = [bm.verts.new((x + p.x, y + p.y, z + rng.uniform(0, 0.002))) for p in pts]
        bm.faces.new(vs)
    me = bpy.data.meshes.new('mill_scale'); bm.to_mesh(me); bm.free()
    sc = bpy.data.objects.new('mill_scale', me)
    bpy.context.scene.collection.objects.link(sc)
    me.materials.append(M['scale'])

    # ash: a low drift spilled from the hearth, displaced disc
    hx, hy = HEARTH.x + 0.1, HEARTH.y - 0.85
    verts, faces = [], []
    R, NR, NA = 0.55, 7, 28
    verts.append((hx, hy, floor_at(bvh, hx, hy) + 0.035))
    for i in range(1, NR + 1):
        for j in range(NA):
            a = 2 * math.pi * j / NA
            rr = R * i / NR * (1 + 0.25 * noise.noise((math.cos(a) * 1.5, math.sin(a) * 1.5, 3.1)))
            x, y = hx + rr * math.cos(a) * 1.4, hy + rr * math.sin(a) * 0.7
            hgt = 0.035 * (1 - (i / NR) ** 1.4) + 0.006 * noise.noise((x * 9, y * 9, 1.0))
            verts.append((x, y, floor_at(bvh, x, y) + max(hgt, 0.0) - (0.004 if i == NR else 0)))
    for j in range(NA):
        faces.append((0, 1 + j, 1 + (j + 1) % NA))
    for i in range(NR - 1):
        for j in range(NA):
            a0, a1 = 1 + i * NA + j, 1 + i * NA + (j + 1) % NA
            faces.append((a0, a0 + NA, a1 + NA, a1))
    ash = mesh_obj('ash_drift', verts, faces, [M['ash']])
    bm = bmesh.new(); bm.from_mesh(ash.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    bm.to_mesh(ash.data); bm.free()
    shade(ash, 80)

    bits = []
    for i in range(14):
        r = rng.uniform(0.018, 0.04)
        o = bpy.data.objects.new('coal_bit', bpy.data.meshes.new('coal_bit'))
        b2 = bmesh.new(); bmesh.ops.create_icosphere(b2, subdivisions=1, radius=r)
        b2.to_mesh(o.data); b2.free()
        bpy.context.scene.collection.objects.link(o)
        x, y = HEARTH.x + rng.uniform(-1.0, 0.7), HEARTH.y - rng.uniform(0.75, 1.5)
        o.location = (x, y, floor_at(bvh, x, y) + r * 0.25)
        o.scale = (rng.uniform(0.8, 1.6), rng.uniform(0.7, 1.3), rng.uniform(0.35, 0.55))
        o.rotation_euler = (0, 0, rng.uniform(0, 3))
        o.data.materials.append(M['soot'])
        bits.append(o)
    join('floor_coals', bits)


def build_trough(M, bvh):
    """Stone quench trough between the anvil and the hearth."""
    x0, x1, y0, y1, H, t = 0.62, 1.78, 0.98, 1.46, 0.5, 0.075
    z0 = FLOOR - 0.04
    parts = [cube('trough_floor', (x0, y0, z0), (x1, y1, z0 + 0.12), M['hearth'], 0.02),
             cube('trough_f', (x0, y0, z0), (x1, y0 + t, z0 + H), M['hearth'], 0.02),
             cube('trough_b', (x0, y1 - t, z0), (x1, y1, z0 + H), M['hearth'], 0.02),
             cube('trough_l', (x0, y0, z0), (x0 + t, y1, z0 + H), M['hearth'], 0.02),
             cube('trough_r', (x1 - t, y0, z0), (x1, y1, z0 + H), M['hearth'], 0.02)]
    tr = join('quench_trough', parts)
    jitter(tr, 0.008, 5.0, 2.0)
    box_uv(tr, 0.8)
    shade(tr, 40)
    paint(tr, lambda co: (0.62 + 0.38 * sstep(z0 + 0.42, z0 + 0.1, co.z) * 0.6,) * 3)
    water = cube('quench_water', (x0 + t, y0 + t, z0 + H - 0.075), (x1 - t, y1 - t, z0 + H - 0.07), M['water'])
    return tr


def build_bucket(M):
    """Iron coal bucket by the hearth, heaped."""
    cx, cy = 2.02, 1.86
    H = 0.3
    prof = lambda z: 0.15 + 0.03 * z / H
    rings = [(lambda a: prof(0), 0.0), (lambda a: prof(H), H), (lambda a: prof(H) + 0.008, H + 0.012),
             (lambda a: prof(H) - 0.006, H + 0.012), (lambda a: prof(H) - 0.01, 0.2)]
    b = lathe_obj('bucket', rings, 28, [M['iron']], uv_tile=0.4)
    parts = [b]
    for z in (0.05, 0.24):
        r = prof(z) + 0.004
        parts.append(lathe_obj('band', [(lambda a, r=r: r, z - 0.015), (lambda a, r=r: r + 0.002, z), (lambda a, r=r: r, z + 0.015)],
                               28, [M['iron']], uv_tile=0.4))
    # bail handle, lying over to one side
    arc = [Vector((math.cos(a) * 0.19, 0, 0)) for a in (math.pi, 0.75 * math.pi, 0.5 * math.pi, 0.25 * math.pi, 0)]
    pts = [(p.x, -0.07 * math.sin(math.acos(max(-1, min(1, p.x / 0.19)))), H - 0.03 + 0.06 * math.sin(math.acos(max(-1, min(1, p.x / 0.19)))))
           for p in arc]
    parts.append(curve_tube('bail', pts, [0.006] * 5, M['iron'], res=1, sides=3))
    bk = join('coal_bucket', parts)
    bk.location = (cx, cy, FLOOR - 0.01)
    box_uv(bk, 0.4)
    shade(bk, 50)
    bm = bmesh.new()
    for i in range(26):
        x, y = rng.uniform(-1, 1), rng.uniform(-1, 1)
        if x * x + y * y > 1:
            continue
        r = rng.uniform(0.025, 0.045)
        g = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        bmesh.ops.translate(bm, vec=(cx + x * 0.13, cy + y * 0.13, FLOOR + H - 0.01 + 0.05 * (1 - x * x - y * y)), verts=g['verts'])
    me = bpy.data.meshes.new('bucket_coal'); bm.to_mesh(me); bm.free()
    co = bpy.data.objects.new('bucket_coal', me)
    bpy.context.scene.collection.objects.link(co)
    me.materials.append(M['soot'])
    return bk


def chain(name, top, n, M, link=0.06, wire=0.0065, hook=True):
    """Hanging chain: n oval links alternating 90 degrees, an S-hook at the end."""
    bm = bmesh.new()
    U, V = 10, 4
    a, b = link / 2, 0.019
    pitch = link - 2.4 * wire
    for li in range(n):
        cz = top.z - a - li * pitch
        rot = (li % 2) * math.pi / 2 + rng.uniform(-0.15, 0.15)
        ring = []
        for i in range(U):
            t = 2 * math.pi * i / U
            p = Vector((b * math.cos(t), 0, a * math.sin(t)))
            tng = Vector((-b * math.sin(t), 0, a * math.cos(t))).normalized()
            nrm = tng.cross(Vector((0, 1, 0))).normalized()
            row = []
            for j in range(V):
                s = 2 * math.pi * j / V
                q = p + (nrm * math.cos(s) + Vector((0, 1, 0)) * math.sin(s)) * wire
                q = Matrix.Rotation(rot, 3, 'Z') @ q
                row.append(bm.verts.new(top + Vector((q.x, q.y, cz - top.z + q.z))))
            ring.append(row)
        for i in range(U):
            for j in range(V):
                bm.faces.new((ring[i][j], ring[(i + 1) % U][j], ring[(i + 1) % U][(j + 1) % V], ring[i][(j + 1) % V]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(M['iron'])
    parts = [o]
    end = top.z - a - (n - 1) * pitch - a
    if hook:
        hk = [(0, 0, end + 0.01), (0, 0, end - 0.06), (0.0, 0.0, end - 0.11), (0.035, 0, end - 0.125),
              (0.05, 0, end - 0.095), (0.045, 0, end - 0.075)]
        parts.append(curve_tube(name + '_hook', [Vector(top.xy.to_3d()) + Vector(p) for p in hk],
                                [0.007, 0.008, 0.008, 0.007, 0.006, 0.004], M['iron'], res=1, sides=3))
    c = join(name, parts)
    box_uv(c, 0.2)
    shade(c, 60)
    return c


def build_chains(M):
    # one off a spike in the left post, one from the hood's corner over the fire
    x = POSTS_X[0]
    # each hangs from a <name>_chain empty so sway.js swings it
    cube('chain_spike', (x - 0.012, 3.0, -11.82), (x + 0.012, 3.13, -11.79), M['iron'], 0.003)
    top = Vector((x, 3.06, -11.8))
    pivot('post_chain', chain('post', top, 14, M), top)
    top = Vector((HEARTH.x - 0.62, HEARTH.y - 0.62, -12.27))
    pivot('hood_chain', chain('hood', top, 7, M), top)


def s_hook(name, at, M):
    """S-hook over a rail at `at`; whatever hangs from it starts 7 cm lower."""
    pts = [(0, 0.011, -0.004), (0, 0.012, 0.009), (0, 0, 0.016), (0, -0.012, 0.007), (0, -0.006, -0.025),
           (0, 0, -0.05), (0, 0.012, -0.062), (0, 0.004, -0.074), (0, -0.006, -0.068)]
    return curve_tube(name, [at + Vector(p) for p in pts], [0.0035] * len(pts), M['iron'], res=1, sides=3)


def horseshoe(name, c, M, tilt=0.0):
    """Open end down, in the x-z plane (faces the room), centre c."""
    pts = []
    for i in range(11):
        a = math.radians(-35 + 290 * i / 10)  # 290 degrees of a slightly tall oval
        pts.append(c + Matrix.Rotation(tilt, 3, 'Y') @ Vector((0.056 * math.cos(a + math.pi / 2), 0, 0.062 * math.sin(a + math.pi / 2))))
    return curve_tube(name, pts, [0.009] * len(pts), M['iron'], res=1, sides=3)


def build_hood_tools(M, cx, cy):
    """A bar across the hood's mouth with tools on S-hooks (the fire stays clear
    in the middle). Each tool hangs from its own <name>_chain empty."""
    y, z = cy - 0.79, -12.36
    bar = [curve_tube('hood_bar', [(cx - 0.66, y, z), (cx, y, z), (cx + 0.66, y, z)], [0.008] * 3, M['iron'], res=1, sides=3)]
    for x in (cx - 0.6, cx + 0.6):
        bar.append(cube('hood_strap', (x - 0.012, y - 0.01, z - 0.012), (x + 0.012, cy - 0.64, z + 0.11), M['iron'], 0.003))
    b = join('hood_bar', bar)
    box_uv(b, 0.3); shade(b, 45)

    def hang(name, x, parts_fn):
        at = Vector((x, y, z))
        parts = [s_hook(name + '_hook', at, M)] + parts_fn(at + Vector((0, 0, -0.072)))
        o = join(name, parts)
        box_uv(o, 0.25); shade(o, 45)
        pivot(name + '_chain', o, at)

    # long tongs
    hang('tongs_hood', cx - 0.5, lambda t: [tongs('tongs_hood_t', t, M, 0.48, 0.024)])
    # flat-bowled ladle for the fire
    def ladle(t):
        rod = curve_tube('ladle_rod', [t + Vector((0, 0.008, 0.006)), t + Vector((0, -0.004, -0.02)), t + Vector((0, 0, -0.15)),
                                       t + Vector((0, 0.0, -0.38)), t + Vector((0, -0.012, -0.43))], [0.006, 0.007, 0.007, 0.007, 0.007], M['iron'], res=1, sides=3)
        bowl = lathe_obj('ladle_bowl', [(lambda a: 0.0, -0.035), (lambda a: 0.045, -0.028), (lambda a: 0.062, -0.006), (lambda a: 0.064, 0.0)], 16, [M['iron']])
        bowl.matrix_world = Matrix.Translation(t + Vector((0, -0.06, -0.455))) @ Matrix.Rotation(math.radians(-70), 4, 'X')
        return [rod, bowl]
    hang('ladle_hood', cx + 0.33, ladle)
    # a pair of horseshoes on one hook
    hang('shoes_hood', cx + 0.5, lambda t: [horseshoe('shoe_a', t + Vector((0, 0, -0.06)), M, 0.0),
                                            horseshoe('shoe_b', t + Vector((0.012, -0.012, -0.072)), M, 0.25)])
    # punch / hot-cut chisel with a wire loop
    def chisel(t):
        loop = curve_tube('chisel_loop', [t + Vector((0, 0.006, 0.004)), t + Vector((0.012, 0, -0.03)), t + Vector((0, 0, -0.05)),
                                          t + Vector((-0.012, 0, -0.03)), t + Vector((0, 0.006, 0.004))], [0.0025] * 5, M['iron'], res=1, sides=3)
        body = lathe_obj('chisel_body', [(lambda a: 0.003, -0.26), (lambda a: 0.012, -0.235), (lambda a: 0.014, -0.12),
                                         (lambda a: 0.015, -0.07), (lambda a: 0.017, -0.058), (lambda a: 0.012, -0.05)], 8, [M['iron']])
        body.location = t
        return [loop, body]
    hang('chisel_hood', cx - 0.33, chisel)


def build_grindstone(M):
    """Sandstone grinding wheel on a timber trestle under the rack, crank to the right,
    a water box under the wheel."""
    c = Vector((-2.45, 1.75, FLOOR))
    R, Wd, AX = 0.31, 0.085, 0.6
    parts = []

    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=44, radius1=R, radius2=R, depth=Wd)
    for v in bm.verts:  # worn a little out of round
        v.co.xy *= 1 + 0.012 * noise.noise((v.co.x * 9, v.co.y * 9, 0.3))
    me = bpy.data.meshes.new('wheel'); bm.to_mesh(me); bm.free()
    wheel = bpy.data.objects.new('wheel', me)
    bpy.context.scene.collection.objects.link(wheel)
    me.materials.append(M['grit'])
    bevel(wheel, 0.012, 2, 40)
    wheel.matrix_world = Matrix.Translation((0, 0, AX)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
    parts.append(wheel)
    parts.append(curve_tube('axle', [(-0.25, 0, AX), (0, 0, AX), (0.25, 0, AX)], [0.016] * 3, M['iron'], res=1, sides=3))
    # crank: arm down from the axle end, handle out
    parts.append(curve_tube('crank', [(0.25, 0, AX), (0.27, 0, AX), (0.28, 0.0, AX - 0.06), (0.28, 0.0, AX - 0.15), (0.3, 0, AX - 0.16)],
                            [0.012, 0.011, 0.01, 0.01, 0.01], M['iron'], res=1, sides=3))
    grip = lathe_obj('crank_grip', [(lambda a: 0.016, 0.0), (lambda a: 0.018, 0.05), (lambda a: 0.016, 0.1)], 10, [M['wood']])
    grip.matrix_world = Matrix.Translation((0.3, 0, AX - 0.16)) @ Matrix.Rotation(math.pi / 2, 4, 'Y')
    parts.append(grip)
    # trestles: a pair of splayed legs each side meeting under the bearing block
    for sx in (-0.17, 0.17):
        for sy in (-1, 1):
            leg = beam('gs_leg', (sx - 0.028, -0.028, 0.0), (sx + 0.028, 0.028, AX - 0.03), M['timber'], 4, 0.006, 0.004, sx + sy)
            leg.data.transform(Matrix.Translation((0, sy * 0.13, 0)) @ Matrix.Rotation(math.radians(13 * sy), 4, 'X'))
            parts.append(leg)
        parts.append(beam('gs_block', (sx - 0.04, -0.06, AX - 0.06), (sx + 0.04, 0.06, AX - 0.018), M['timber'], 2, 0.006, 0.003, sx))
        parts.append(beam('gs_foot', (sx - 0.03, -0.3, 0.0), (sx + 0.03, 0.3, 0.06), M['timber'], 4, 0.006, 0.004, sx * 3))
    for sy in (-0.2, 0.2):
        parts.append(beam('gs_rail', (-0.2, sy - 0.022, 0.16), (0.2, sy + 0.022, 0.2), M['timber'], 4, 0.006, 0.003, sy))
    # water box under the wheel
    t = 0.018
    for lo, hi in (((-0.1, -0.16, 0.0), (0.1, -0.16 + t, 0.22)), ((-0.1, 0.16 - t, 0.0), (0.1, 0.16, 0.22)),
                   ((-0.1, -0.16, 0.0), (-0.1 + t, 0.16, 0.22)), ((0.1 - t, -0.16, 0.0), (0.1, 0.16, 0.22))):
        parts.append(beam('gs_box', lo, hi, M['timber'], 2, 0.004, 0.002, lo[0] + lo[1]))
    water = cube('gs_water', (-0.1 + t, -0.16 + t, 0.17), (0.1 - t, 0.16 - t, 0.175), M['water'])
    parts.append(water)
    gs = join('grindstone', parts)
    gs.data.transform(Matrix.Translation(c) @ Matrix.Rotation(math.radians(245), 4, 'Z'))  # wheel face toward the room, crank nearest
    box_uv(gs, 0.4)
    grain_uv(gs, 0.6, {M['timber']})
    shade(gs, 40)
    return gs


def tongs(name, top, M, length=0.58, spread=0.02, rot=0.0):
    """Hanging tongs: reins hooked over the rail, rivet, short jaws."""
    rv = top + Vector((0, 0, -length))
    parts = []
    for s in (-1, 1):
        pts = [top + Vector((s * 0.006, 0.02, 0.025)), top + Vector((s * 0.008, 0.0, 0.02)), top + Vector((s * spread, -0.008, -0.05)),
               rv + Vector((s * spread * 0.6, -0.004, 0.18)), rv + Vector((s * 0.008, 0, 0.0)),
               rv + Vector((-s * 0.012, 0, -0.06)), rv + Vector((-s * 0.004, 0, -0.11))]
        parts.append(curve_tube(name + '_rein', pts, [0.005, 0.006, 0.006, 0.006, 0.008, 0.008, 0.006], M['iron'], res=1, sides=3))
    parts.append(cube(name + '_rivet', rv - Vector((0.012, 0.012, 0.012)), rv + Vector((0.012, 0.012, 0.012)), M['iron'], 0.005))
    o = join(name, parts)
    if rot:
        o.data.transform(Matrix.Translation(top) @ Matrix.Rotation(rot, 4, 'Y') @ Matrix.Translation(-top))
    return o


def build_tool_rail(M, cx, cy, top):
    """Iron rail along the hearth front with tongs, a poker and a fire rake hanging."""
    y = cy - 0.65 - 0.055
    z = top - 0.07
    parts = [curve_tube('rail', [(cx - 0.62, y, z), (cx, y, z), (cx + 0.62, y, z)], [0.009] * 3, M['iron'], res=1, sides=3)]
    for x in (cx - 0.58, cx + 0.58):
        parts.append(cube('rail_bracket', (x - 0.012, y - 0.012, z - 0.012), (x + 0.012, cy - 0.6, z + 0.012), M['iron'], 0.003))
    parts.append(tongs('tongs_a', Vector((cx - 0.38, y, z)), M, 0.56, 0.02, 0.03))
    parts.append(tongs('tongs_b', Vector((cx - 0.24, y, z)), M, 0.5, 0.026, -0.04))
    # poker: hooked over the rail, straight rod, bent tip
    px = cx + 0.12
    parts.append(curve_tube('poker', [(px - 0.03, y + 0.02, z + 0.02), (px, y, z + 0.025), (px + 0.01, y - 0.01, z - 0.02),
                                      (px + 0.01, y - 0.01, z - 0.5), (px + 0.005, y - 0.03, z - 0.58), (px - 0.02, y - 0.05, z - 0.6)],
                             [0.006, 0.007, 0.007, 0.007, 0.006, 0.005], M['iron'], res=1, sides=3))
    # rake: rod with a short cross blade
    rx = cx + 0.3
    parts.append(curve_tube('rake', [(rx - 0.03, y + 0.02, z + 0.02), (rx, y, z + 0.025), (rx + 0.005, y - 0.01, z - 0.02),
                                     (rx + 0.005, y - 0.012, z - 0.54)], [0.006, 0.007, 0.007, 0.007], M['iron'], res=1, sides=3))
    parts.append(cube('rake_blade', (rx - 0.06, y - 0.03, z - 0.6), (rx + 0.07, y - 0.008, z - 0.54), M['iron'], 0.004))
    rail = join('tool_rail', parts)
    box_uv(rail, 0.3)
    shade(rail, 45)
    return rail


def build_bellows(M, cx, cy):
    """Great bellows on a trestle right of the hearth, nozzle into its side."""
    L, R = 0.95, 0.32
    x0 = cx + 0.95  # narrow end
    yc = cy + 0.05
    zb, zt = FLOOR + 0.72, FLOOR + 0.95
    outline = []
    for i in range(28):
        a = 2 * math.pi * i / 28
        outline.append(Vector((x0 + L * (1 - math.cos(a)) / 2, yc + R * math.sin(a) * abs(math.sin(a / 2)) ** 0.9)))
    cen = sum(outline, Vector((0, 0))) / len(outline)

    def board(z0, z1, nm):
        vs = [(p.x, p.y, z0) for p in outline] + [(p.x, p.y, z1) for p in outline]
        n = len(outline)
        f = [tuple(range(n))[::-1], tuple(range(n, 2 * n))] + [(i, (i + 1) % n, n + (i + 1) % n, n + i) for i in range(n)]
        o = mesh_obj(nm, vs, f, [M['timber']])
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(o.data); bm.free()
        return o
    parts = [board(zb - 0.035, zb, 'bel_bottom'), board(zt, zt + 0.035, 'bel_top')]
    # leather between the boards, three soft pleats bulging out
    verts, faces, n = [], [], len(outline)
    NZ = 13
    for j in range(NZ):
        t = j / (NZ - 1)
        z = zb + (zt - zb) * t
        bulge = 1.0 - 0.06 + 0.1 * abs(math.sin(3 * math.pi * t))
        for p in outline:
            d = p - cen
            k = bulge if (p - outline[0]).length > 0.12 else 1.0  # the throat stays tight
            verts.append((cen.x + d.x * k, cen.y + d.y * k, z))
    for j in range(NZ - 1):
        for i in range(n):
            faces.append((j * n + i, j * n + (i + 1) % n, (j + 1) * n + (i + 1) % n, (j + 1) * n + i))
    lea = mesh_obj('bel_leather', verts, faces, [M['leather']])
    bm = bmesh.new(); bm.from_mesh(lea.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:]); bm.to_mesh(lea.data); bm.free()
    parts.append(lea)
    # nozzle into the hearth's flank
    parts.append(curve_tube('bel_nozzle', [(x0 + 0.02, yc, (zb + zt) / 2), (x0 - 0.1, yc, zb + 0.05), (cx + 0.74, yc, FLOOR + 0.56)],
                            [0.04, 0.03, 0.022], M['iron'], res=2, sides=3))
    # trestle: two legs pairs and a rail
    for lx in (x0 + 0.3, x0 + 0.75):
        for sy in (-1, 1):
            parts.append(beam('bel_leg', (lx - 0.03, yc + sy * 0.2 - 0.03, FLOOR - 0.02), (lx + 0.03, yc + sy * 0.2 + 0.03, zb - 0.035),
                              M['timber'], 3, 0.006, 0.004, lx + sy))
        parts.append(beam('bel_cross', (lx - 0.035, yc - 0.25, zb - 0.1), (lx + 0.035, yc + 0.25, zb - 0.035), M['timber'], 3, 0.006, 0.003))
    # lever chain off the top board's wide end
    parts.append(cube('bel_eye', (x0 + L - 0.12, yc - 0.02, zt + 0.035), (x0 + L - 0.08, yc + 0.02, zt + 0.07), M['iron'], 0.004))
    bel = join('bellows', parts)
    box_uv(bel, 0.5)
    grain_uv(bel, 0.6, {M['timber']})
    shade(bel, 35)
    return bel


def build_hearth(M):
    cx, cy = HEARTH.x, HEARTH.y
    top = FLOOR + 0.72
    parts = []
    body = cube('hearth_body', (cx - 0.75, cy - 0.6, FLOOR - 0.05), (cx + 0.75, cy + 0.6, top), M['hearth'], 0.03, 2)
    parts.append(body)
    # plinth course
    parts.append(cube('hearth_plinth', (cx - 0.8, cy - 0.65, FLOOR - 0.05), (cx + 0.8, cy + 0.65, FLOOR + 0.14), M['hearth'], 0.03, 2))
    # capstones around the fire bed
    caps = [((cx - 0.75, cy - 0.6), (cx - 0.05, cy - 0.33)), ((cx - 0.05, cy - 0.6), (cx + 0.75, cy - 0.33)),
            ((cx - 0.75, cy + 0.33), (cx + 0.15, cy + 0.6)), ((cx + 0.15, cy + 0.33), (cx + 0.75, cy + 0.6)),
            ((cx - 0.75, cy - 0.33), (cx - 0.45, cy + 0.33)), ((cx + 0.45, cy - 0.33), (cx + 0.75, cy + 0.33))]
    for i, ((x0, y0), (x1, y1)) in enumerate(caps):
        h = rng.uniform(0.11, 0.14)
        c = cube(f'cap_{i}', (x0 + 0.008, y0 + 0.008, top - 0.02), (x1 - 0.008, y1 - 0.008, top + h), M['hearth'], 0.025, 2)
        parts.append(c)
    # sooted fire bed
    parts.append(cube('fire_bed', (cx - 0.46, cy - 0.34, top - 0.02), (cx + 0.46, cy + 0.34, top + 0.01), M['soot']))
    # hood: open frustum of smoke-blackened stone, then a chimney into the rock
    hz0, hz1 = -12.25, -11.35
    b = [(cx - 0.72, cy - 0.62), (cx + 0.72, cy - 0.62), (cx + 0.72, cy + 0.6), (cx - 0.72, cy + 0.6)]
    t = [(cx - 0.3, cy - 0.2), (cx + 0.3, cy - 0.2), (cx + 0.3, cy + 0.26), (cx - 0.3, cy + 0.26)]
    hv = [(x, y, hz0) for x, y in b] + [(x, y, hz1) for x, y in t]
    hf = [(i, (i + 1) % 4, 4 + (i + 1) % 4, 4 + i) for i in range(4)]
    hood = mesh_obj('hood', hv, hf, [M['hearth_soot']])
    bm = bmesh.new(); bm.from_mesh(hood.data)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=3, use_grid_fill=True)
    bm.to_mesh(hood.data); bm.free()
    jitter(hood, 0.02, 4.0, 1.0)
    so = hood.modifiers.new('solid', 'SOLIDIFY'); so.thickness = 0.1; so.offset = 0
    parts.append(hood)
    # rim band at the hood mouth
    rim_v = [(x, y, hz0 - 0.03) for x, y in b] + [(x, y, hz0 + 0.06) for x, y in b]
    rim = mesh_obj('hood_rim', rim_v, [(i, (i + 1) % 4, 4 + (i + 1) % 4, 4 + i) for i in range(4)], [M['iron']])
    rs = rim.modifiers.new('solid', 'SOLIDIFY'); rs.thickness = 0.14; rs.offset = 0
    parts.append(rim)
    chim = cube('chimney', (cx - 0.33, cy - 0.23, hz1 - 0.05), (cx + 0.33, cy + 0.29, ceiling_z(cx, cy) + 0.6), M['hearth_soot'], 0.03, 2)
    parts.append(chim)
    hearth = join('forge_hearth', parts)
    box_uv(hearth, 1.1)
    shade(hearth, 40)
    fire_c = Vector((cx, cy, top + 0.08))

    def soot(co):
        d = (co - fire_c).length
        k = 1 - 0.7 * math.exp(-(d / 0.62) ** 2) - 0.12 * sstep(top, top + 0.6, co.z)
        k -= 0.08 * (0.5 + 0.5 * nz(co, 2.0))
        return (k, k * 0.96, k * 0.93)
    paint(hearth, soot)

    # coals: a low heap of chunks in the bed, one mesh
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new('UVMap')
    n = 0
    while n < 85:
        x, y = rng.uniform(-1, 1), rng.uniform(-1, 1)
        rr = x * x + y * y
        if rr > 1:
            continue
        n += 1
        r = rng.uniform(0.03, 0.06)
        h = 0.11 * (1 - rr) + rng.uniform(0, 0.025)
        loc = Vector((cx + x * 0.40, cy + y * 0.29, top + h))
        geom = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=r)
        vs = geom['verts']
        m = (Matrix.Translation(loc) @ Euler((rng.random() * 6, rng.random() * 6, rng.random() * 6)).to_matrix().to_4x4()
             @ Matrix.Diagonal((rng.uniform(0.8, 1.3), rng.uniform(0.8, 1.3), rng.uniform(0.55, 0.9), 1)))
        bmesh.ops.transform(bm, matrix=m, verts=vs)
        for v in vs:
            v.co += noise.noise_vector(v.co * 30) * r * 0.25
        off = (rng.random(), rng.random())
        fs = set(f for v in vs for f in v.link_faces)
        for f in fs:
            for l in f.loops:
                d = (l.vert.co - loc).normalized()
                l[uvl].uv = (off[0] + 0.12 * math.atan2(d.y, d.x), off[1] + 0.12 * d.z)
    me = bpy.data.meshes.new('forge_coals'); bm.to_mesh(me); bm.free()
    coals = bpy.data.objects.new('forge_coals', me)
    bpy.context.scene.collection.objects.link(coals)
    me.materials.append(M['coals'])
    shade(coals, 70)
    build_tool_rail(M, cx, cy, top)
    build_hood_tools(M, cx, cy)
    build_bellows(M, cx, cy)
    return hearth, coals, Vector((cx, cy, top + 0.16))


# ---------------------------------------------------------------- export helpers

def empty(name, loc, yaw=0.0):
    e = bpy.data.objects.new(name, None)
    e.empty_display_type = 'ARROWS'
    e.empty_display_size = 0.2
    e.location = loc
    e.rotation_euler = (0, 0, yaw)
    bpy.context.scene.collection.objects.link(e)
    return e


def postprocess_glb(path, coal_color, coal_strength):
    """Normals -> int8 (KHR_mesh_quantization) and make sure forge_coals carries
    emissiveFactor #ff6a1f + emissive strength, whatever the exporter wrote."""
    raw = open(path, 'rb').read()
    jlen = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20 + jlen])
    boff = 20 + jlen
    blen = struct.unpack_from('<I', raw, boff)[0]
    old = raw[boff + 8: boff + 8 + blen]
    for m in gltf.get('materials', []):
        if m.get('name') == 'forge_coals':
            m['emissiveFactor'] = list(coal_color)
            m.setdefault('extensions', {})['KHR_materials_emissive_strength'] = {'emissiveStrength': coal_strength}
            gltf['extensionsUsed'] = sorted(set(gltf.get('extensionsUsed', [])) | {'KHR_materials_emissive_strength'})
    normal_acc = set()
    for mesh in gltf['meshes']:
        for prim in mesh['primitives']:
            if 'NORMAL' in prim['attributes']:
                normal_acc.add(prim['attributes']['NORMAL'])
    users = {}
    for i, a in enumerate(gltf['accessors']):
        users.setdefault(a.get('bufferView'), []).append(i)
    new = bytearray()
    for vi, view in enumerate(gltf['bufferViews']):
        data = old[view['byteOffset']: view['byteOffset'] + view['byteLength']]
        u = users.get(vi, [])
        if len(u) == 1 and u[0] in normal_acc and 'byteStride' not in view:
            a = gltf['accessors'][u[0]]
            arr = np.frombuffer(data, dtype=np.float32).reshape(a['count'], 3)
            q = np.clip(np.round(arr * 127), -127, 127).astype(np.int8)
            data = np.concatenate([q, np.zeros((a['count'], 1), np.int8)], axis=1).tobytes()
            a.update(componentType=5120, normalized=True)
            a.pop('min', None); a.pop('max', None)
            view['byteStride'] = 4
        view['byteOffset'] = len(new)
        view['byteLength'] = len(data)
        new += data
        new += b'\0' * (-len(new) % 4)
    gltf['buffers'][0]['byteLength'] = len(new)
    gltf['extensionsUsed'] = sorted(set(gltf.get('extensionsUsed', [])) | {'KHR_mesh_quantization'})
    gltf['extensionsRequired'] = sorted(set(gltf.get('extensionsRequired', [])) | {'KHR_mesh_quantization'})
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(new)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(new), 0x004E4942) + bytes(new))


def build():
    reset()
    M = {
        'wall': pbr('stone_wall', 'rock_wall_08', (2048, 1024, 512), tint=(0.62, 0.6, 0.6)),
        'floor': pbr('stone_floor', 'monastery_stone_floor', (2048, 512, 512), tint=(0.7, 0.66, 0.62)),
        'rock': pbr('rock_vault', 'rock_face', (512, 512, 512), tint=(0.5, 0.45, 0.42), double=True),
        'hearth': pbr('hearth_stone', 'rock_wall_13', tint=(0.75, 0.7, 0.66)),
        'hearth_soot': pbr('hearth_soot', 'rock_wall_13', tint=(0.3, 0.28, 0.27)),
        'iron': pbr('iron', 'rusty_metal_04', tint=(0.62, 0.6, 0.58)),
        'bark': pbr('bark', 'bark_brown_02', (512, 512, 512), tint=(0.6, 0.55, 0.5)),
        'wood': pbr('wood', 'rough_wood', tint=(0.72, 0.6, 0.5)),
        'timber': pbr('timber', 'rough_wood', tint=(0.46, 0.37, 0.3), normal=1.4),
        'grit': pbr('grit', 'rock_wall_13', tint=(0.78, 0.68, 0.55)),
        'root': pbr('root', 'bark_brown_02', (512, 512, 512), tint=(0.38, 0.32, 0.28)),
        'iron_face': plain('iron_face', srgb('#6a6c70'), metallic=1.0, roughness=0.42),
        'soot': plain('soot', srgb('#0e0c0b'), roughness=0.95),
        'ash': plain('ash', srgb('#5a5754'), roughness=1.0),
        'scale': plain('mill_scale', srgb('#22252a'), metallic=0.7, roughness=0.42),
        'leather': plain('leather', srgb('#3b2a1f'), roughness=0.62),
        'wax': plain('wax', srgb('#d8cdb4'), roughness=0.55),
        'chalk': plain('chalk', srgb('#e6e0d2'), roughness=0.95),
        'blade': plain('anvil_blade', srgb('#3a3634'), metallic=0.85, roughness=0.55),
        'water': plain('quench_water', srgb('#06080a'), roughness=0.05),
        'coals': coal_material(),
    }
    M['wood_end'] = M['wood']
    M['board'] = pbr('board', 'rough_wood', tint=(0.16, 0.13, 0.11), normal=0.6)

    build_shell(M)
    build_roots(M)
    build_timber(M)
    build_rack(M)
    build_board(M)
    candle = build_candle(M)
    _, yaw, anvil_top = build_anvil(M)
    _, strike = build_blade(M, yaw)
    build_hammer(M)
    build_stump(M)
    log_at = build_log(M)
    bpy.context.view_layer.update()
    from mathutils.bvhtree import BVHTree
    bvh = BVHTree.FromObject(bpy.data.objects['floor'], bpy.context.evaluated_depsgraph_get())
    build_trough(M, bvh)
    build_bucket(M)
    build_floor_debris(M, bvh)
    build_chains(M)
    build_grindstone(M)
    _, _, fire = build_hearth(M)

    for i, x in enumerate(SLOT_X):
        empty(f'rack_slot_{i}', (x, SLOT_Y, SLOT_Z))
    empty('anvil_slot', (ANVIL.x, ANVIL.y, anvil_top), yaw)
    empty('strike_point', strike, yaw)
    empty('forge_light', fire)
    empty('board_candle', candle)
    # axe: handle up, engraved face toward the camera, turned and leaning a little
    lg = empty('log_slot', log_at)
    lg.rotation_euler = Euler((math.radians(-7), math.radians(-11), math.radians(-22)), 'ZYX')

    # pivots the site uses: board at its centre, coals at the heap centre
    for name, piv in (('forge_board', BOARD), ('forge_coals', fire)):
        o = bpy.data.objects[name]
        o.data.transform(Matrix.Translation(-piv))
        o.location = piv

    root = empty('forge_room', (0, 0, FLOOR))
    bpy.context.view_layer.update()
    for o in bpy.context.scene.objects:
        if o is not root and o.parent is None:
            mw = o.matrix_world.copy()
            o.parent = root
            o.matrix_world = mw

    # stats
    dg = bpy.context.evaluated_depsgraph_get()
    tris = 0
    for o in bpy.context.scene.objects:
        if o.type in ('MESH', 'CURVE'):
            me = o.evaluated_get(dg).to_mesh()
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
            o.evaluated_get(dg).to_mesh_clear()
    print('TRIS', tris)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
                              export_materials='EXPORT', export_normals=True, export_tangents=False,
                              export_vertex_color='ACTIVE', export_all_vertex_colors=False,
                              export_image_format='JPEG', export_jpeg_quality=78, export_image_quality=78,
                              export_lights=False, export_cameras=False)
    print('EXPORTED', OUT, os.path.getsize(OUT))
    postprocess_glb(OUT, srgb('#ff6a1f'), 4.0)
    print('FINAL', OUT, os.path.getsize(OUT))
    for o in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        if o.type == 'EMPTY':
            p = o.matrix_world.translation
            print(f'EMPTY {o.name:12s} site ({p.x:.3f}, {p.z:.3f}, {-p.y:.3f})')


# ---------------------------------------------------------------- preview

def preview(out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=OUT)
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x, sc.render.resolution_y = 1280, 720
    sc.eevee.taa_render_samples = 64
    try:
        sc.eevee.use_raytracing = True
        sc.eevee.ray_tracing_options.resolution_scale = '1'
    except AttributeError:
        pass
    sc.eevee.volumetric_end = 25
    sc.eevee.volumetric_tile_size = '4'
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'None'
    world = bpy.data.worlds.new('w'); sc.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.01, 0.012, 0.02, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.15
    vol = world.node_tree.nodes.new('ShaderNodeVolumePrincipled')
    vol.inputs['Density'].default_value = 0.01
    sc.eevee.use_volumetric_shadows = True
    # dust in the moon shaft only
    bpy.ops.mesh.primitive_cylinder_add(radius=0.85, depth=6.0, location=(HOLE.x, HOLE.y, FLOOR + 3.0))
    shaft = bpy.context.active_object
    vm = bpy.data.materials.new('shaft_dust'); vm.use_nodes = True
    vn = vm.node_tree.nodes; vn.remove(vn['Principled BSDF'])
    pv = vn.new('ShaderNodeVolumePrincipled'); pv.inputs['Density'].default_value = 0.12
    vm.node_tree.links.new(pv.outputs[0], vn['Material Output'].inputs['Volume'])
    shaft.data.materials.append(vm)
    world.node_tree.links.new(vol.outputs[0], world.node_tree.nodes['World Output'].inputs['Volume'])

    def obj(n):
        return bpy.data.objects[n]

    fl = obj('forge_light').matrix_world.translation
    key = bpy.data.lights.new('fire', 'POINT'); key.energy = 220; key.color = (1.0, 0.42, 0.13)
    key.shadow_soft_size = 0.3
    ko = bpy.data.objects.new('fire', key); sc.collection.objects.link(ko); ko.location = fl + Vector((0, -0.3, 0.6))
    try:  # the coals glow on their own; keep the fire lamp off them
        coll = bpy.data.collections.new('fire_receivers'); sc.collection.children.link(coll)
        coll.objects.link(obj('forge_coals'))
        ko.light_linking.receiver_collection = coll
        coll.collection_objects[0].light_linking.link_state = 'EXCLUDE'
    except (AttributeError, KeyError, TypeError, IndexError) as e:
        print('light linking unavailable', e)
    bounce = bpy.data.lights.new('fire_bounce', 'POINT'); bounce.energy = 120; bounce.color = (1.0, 0.5, 0.2)
    bounce.shadow_soft_size = 1.0
    bo = bpy.data.objects.new('fire_bounce', bounce); sc.collection.objects.link(bo)
    bo.location = fl + Vector((-0.6, -1.0, 0.6))
    moon = bpy.data.lights.new('moon', 'SPOT'); moon.energy = 2500; moon.color = (0.55, 0.68, 1.0)
    moon.spot_size = math.radians(34); moon.spot_blend = 0.5; moon.shadow_soft_size = 0.2
    mo = bpy.data.objects.new('moon', moon); sc.collection.objects.link(mo)
    mo.location = (HOLE.x + 0.25, HOLE.y + 0.35, -7.6)
    tgt = Vector((HOLE.x + 0.1, HOLE.y - 0.3, FLOOR))
    mo.rotation_euler = (tgt - mo.location).to_track_quat('-Z', 'Y').to_euler()

    cd = bpy.data.cameras.new('cam'); cd.sensor_fit = 'VERTICAL'; cd.angle_y = math.radians(30)
    cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam)
    cam.location = CAM_POS
    cam.rotation_euler = (CAM_AIM - CAM_POS).to_track_quat('-Z', 'Y').to_euler()
    sc.camera = cam
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print('PREVIEW', out)


if ARGS and ARGS[0] == 'preview':
    preview(ARGS[1] if len(ARGS) > 1 else os.path.join(os.environ.get('TEMP', '.'), 'forge-site.png'))
else:
    build()
