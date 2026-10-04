"""Rebellion (Devil May Cry 4) from Bot_Force's print-ready STL set.

blender -b --factory-startup -P tools/blender/rebellion_import.py
Reads  C:/Users/forev/Downloads/kilic/rebellion/files/*.stl (thing:7308986,
CC-BY remix of fenixman12's Sketchfab model) and writes assets/weapons/rebellion.glb.

The STLs share one frame (mm, tip at low Z, pommel at high Z) but are exploded
along Z so each part prints on its own; the 3MF is only a Bambu plate layout.
The parts are re-stacked here the way the printed sword goes together (measured
from the sockets in the meshes and the maker's photo): the ribs' spine tip hangs
over the blade shoulders, the neck plug disappears into jaw and skull, the
handle's peg sits in the skull top, and the arm stumps meet the shoulder nubs.

The blade is not used as a mesh: its silhouette and spine thickness are sampled
from the STL and a clean blade is swept from them (smoothed edge line, polished
bevels, a shallow fuller down the spine). The grip is replaced by a wire-wrapped
helical tube; the skull, ribs, neck plug and arms are decimated from the prints.

Pipeline: import -> stack -> decimate -> materials -> join into "rebellion" ->
tip to the origin, grip axis on x = y = 0, scale to LENGTH -> AO bake drops the
fully enclosed faces (dowel channels, mating caps) -> second, tighter AO bake
becomes the vertex colour (bone recesses age toward #6e6454, light mottle) ->
GLB, Y up, face toward +Z.
"""
import math
import os
import sys

sys.path.append(os.path.dirname(__file__))
import bpy
import bmesh
import numpy as np
from mathutils import Vector, noise
from forge_bl import reset, mat, srgb, smooth, from_bmesh, OUT_DIR

SRC = r'C:\Users\forev\Downloads\kilic\rebellion\files'
AXIS = (0.35, -3.05)       # grip axis in the source frame (handle footprint centre), mm
# part: (part it sits on, where this part's floor goes relative to that part's ceiling, mm)
JOINTS = {
    'Jaw_And_Ribs': ('Blade', -40.0),                 # spine tip in front of the blade, hooks at the lowest rib
    'Cranium_And_Jaw_Connector': ('Jaw_And_Ribs', -20.0),  # dowel: 20 mm in the jaw socket, rest in the skull
    'Cranium': ('Jaw_And_Ribs', -19.0),               # upper teeth ~6 mm above the lower ones
    'Handle': ('Cranium', -41.0),                     # peg in the skull, collar on the skull top
}
ARM_SHIFT = (18.0, 14.0)   # crossguard stumps: inward on X and up on Z into the shoulder nubs
LENGTH = 1.45              # m; the printed assembly is 1.31 m, scaled up uniformly for the field
TRI_BUDGET = {'Cranium': 40000, 'Jaw_And_Ribs': 40000, 'Cranium_And_Jaw_Connector': 3000,
              'Crossguard_1': 4500, 'Crossguard_2': 4500}
GRIP_Z = (1503.0, 1652.0)  # the printed shaft, from the collar up to the ferrule under the crown (source mm)
SHAFT_R = 12.5             # the shaft is thinner than this; collar and ferrule reach further out
GRIP = dict(r=10.8, ridge=1.0, turns=24, rings_per_turn=8, around=24)
BLADE = dict(edge=1.5, bevel=4.0, fuller_from=0.25, fuller_w=0.45, fuller_floor=0.36, fuller_d=2.5)
BONE_DARK = srgb('#6e6454')
BONE_BASE = srgb('#c9bda0')

reset()

# ---------- materials ----------
STEEL = mat('rebellion_steel', srgb('#5a6170'), metallic=1.0, roughness=0.3)
STEEL_EDGE = mat('rebellion_steel_edge', srgb('#b6bcc8'), metallic=1.0, roughness=0.2)
BONE = mat('rebellion_bone', BONE_BASE, metallic=0.0, roughness=0.55)
GRIP_MAT = mat('rebellion_grip', srgb('#17161a'), metallic=0.6, roughness=0.55)
FITTING = mat('rebellion_fitting', srgb('#5a5f6b'), metallic=1.0, roughness=0.4)


# ---------- import ----------
def load(name):
    bpy.ops.wm.stl_import(filepath=os.path.join(SRC, name + '.stl'))
    o = bpy.context.selected_objects[0]
    o.name = name
    return o


def coords(o):
    a = np.empty(len(o.data.vertices) * 3, dtype=np.float32)
    o.data.vertices.foreach_get('co', a)
    return a.reshape(-1, 3)


def zrange(o):
    zs = coords(o)[:, 2]
    return float(zs.min()), float(zs.max())


# ---------- blade: sample the print, sweep a clean one ----------
def blade_profile():
    """Half width and spine half thickness per mm of blade height, from the STL."""
    src = load('Blade')
    v = coords(src)
    z0 = v[:, 2].min()
    L = float(v[:, 2].max() - z0)
    h = v[:, 2] - z0
    off = np.abs(v[:, 0] - AXIS[0])
    step = 3.0
    zs = np.arange(0, L, step)
    hw = np.zeros(len(zs)); th = np.zeros(len(zs))
    for i, z in enumerate(zs):
        m = (h >= z) & (h < z + step)
        hw[i] = off[m].max() if m.any() else 0
        c = m & (off < 8)
        th[i] = (v[c, 1].max() - v[c, 1].min()) / 2 if c.sum() > 1 else 0
    bpy.data.objects.remove(src, do_unlink=True)
    # Thin barb plates make alternating bins; a +-1 bin max keeps their envelope.
    hw = np.maximum(hw, np.maximum(np.roll(hw, 1), np.roll(hw, -1)))
    # Main edge 130 mm .. 815 mm: one quartic through the samples straightens the kinks.
    main = (zs >= 130) & (zs <= 815)
    poly = np.polyfit(zs[main], hw[main], 4)
    hw[main] = np.polyval(poly, zs[main])
    # Shoulders: the print has thin hook plates here; keep their outer envelope as a straight flare.
    sh = zs > 815
    hw[sh] = np.interp(zs[sh], [815, L], [np.polyval(poly, 815), 50.5])
    # Spine thickness: the centre band is sparsely sampled on the big flat facets, so the
    # per-bin values jitter; a cubic through them (hooks excluded) gives one smooth spine.
    good = (th > 0.5) & (zs < 815)
    th = np.clip(np.polyval(np.polyfit(zs[good], th[good], 3), zs), 1.0, 11.2)
    return zs, hw, th, L, float(z0)


def build_blade():
    zs, hw, th, L, z0 = blade_profile()
    e, b = BLADE['edge'], BLADE['bevel']
    stations = []
    for z, W, T in zip(zs, hw, th):
        W = max(W, 1.2); T = max(T, e + 0.3)
        f = 0.0
        if z > BLADE['fuller_from'] * L:
            f = min(1.0, (z - BLADE['fuller_from'] * L) / 40.0)       # fade in over 40 mm
        d = f * min(BLADE['fuller_d'], 0.35 * T)
        hb = e + 0.35 * (T - e)                                        # height at the bevel line
        rim, flo = BLADE['fuller_w'] * W, BLADE['fuller_floor'] * W
        ring = [(W, -e), (W - b, -hb), (rim, -T), (flo, -(T - d)), (-flo, -(T - d)), (-rim, -T), (-(W - b), -hb), (-W, -e),
                (-W, e), (-(W - b), hb), (-rim, T), (-flo, T - d), (flo, T - d), (rim, T), (W - b, hb), (W, e)]
        stations.append([(AXIS[0] + x, AXIS[1] + y, z0 + z) for x, y in ring])
    # the very tip: the first ring shrunk almost to a point
    stations.insert(0, [(AXIS[0] + (x - AXIS[0]) * 0.05, AXIS[1] + (y - AXIS[1]) * 0.3, z0) for x, y, _ in stations[0]])

    bm = bmesh.new()
    rings = [[bm.verts.new(p) for p in st] for st in stations]
    n = 16
    faces = {}
    for a, bq in zip(rings, rings[1:]):
        for k in range(n):
            fc = bm.faces.new((a[k], a[(k + 1) % n], bq[(k + 1) % n], bq[k]))
            faces[fc] = k
    bm.faces.new(rings[0][::-1])
    top = bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # Polished strips: the edge (k = 15, 7) and the bevels (k = 0, 6, 8, 14); the rest is blade body.
    for fc, k in faces.items():
        fc.material_index = 1 if k in (15, 7, 0, 6, 8, 14) else 0
        fc.smooth = True
    # Sharp lines along the sweep: edge, bevel and fuller rim vertices.
    sharp_idx = {0, 1, 2, 5, 6, 7, 8, 9, 10, 13, 14, 15}
    for a, bq in zip(rings, rings[1:]):
        for k in sharp_idx:
            ed = bm.edges.get((a[k], bq[k]))
            if ed:
                ed.smooth = False
    for ed in top.edges:
        ed.smooth = False
    obj = from_bmesh('Blade', bm)
    obj.data.materials.append(STEEL)
    obj.data.materials.append(STEEL_EDGE)
    return obj


# ---------- grip: wire-wrapped tube ----------
def build_grip(z_lo, z_hi):
    g = GRIP
    turns, rpt, around = g['turns'], g['rings_per_turn'], g['around']
    nr = turns * rpt + 1
    bm = bmesh.new()
    rings = []
    for i in range(nr):
        t = i / (nr - 1)
        z = z_lo + (z_hi - z_lo) * t
        ring = []
        for j in range(around):
            a = 2 * math.pi * j / around
            r = g['r'] + g['ridge'] * math.cos(a - 2 * math.pi * turns * t)
            ring.append(bm.verts.new((AXIS[0] + r * math.cos(a), AXIS[1] + r * math.sin(a), z)))
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for j in range(around):
            bm.faces.new((a[j], a[(j + 1) % around], b[(j + 1) % around], b[j]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    for f in bm.faces:
        f.smooth = True
    obj = from_bmesh('Grip', bm)
    obj.data.materials.append(GRIP_MAT)
    return obj


parts = {n: load(n) for n in ('Jaw_And_Ribs', 'Cranium_And_Jaw_Connector', 'Cranium',
                              'Handle', 'Crossguard_1', 'Crossguard_2')}
parts['Blade'] = build_blade()

# Handle: drop the printed shaft (one long strip from collar to ferrule), keep collar, ferrule
# and crown; a ridged tube takes the shaft's place, its ends tucked inside collar and ferrule.
hb = bmesh.new()
hb.from_mesh(parts['Handle'].data)


def shaft_face(f):
    c = f.calc_center_median()
    return (GRIP_Z[0] <= c.z <= GRIP_Z[1]
            and all(math.hypot(v.co.x - AXIS[0], v.co.y - AXIS[1]) < SHAFT_R for v in f.verts))


bmesh.ops.delete(hb, geom=[f for f in hb.faces if shaft_face(f)], context='FACES')
hb.to_mesh(parts['Handle'].data)
hb.free()
parts['Grip'] = build_grip(GRIP_Z[0] - 5.0, GRIP_Z[1])

# Stack along the grip axis (object locations only; mesh data stays in source mm).
shift = {'Blade': 0.0}
for n, (base, off) in JOINTS.items():
    lo = zrange(parts[n])[0]
    shift[n] = zrange(parts[base])[1] + shift[base] + off - lo
    parts[n].location.z = shift[n]
parts['Grip'].location.z = shift['Handle']
for n, sx in (('Crossguard_1', ARM_SHIFT[0]), ('Crossguard_2', -ARM_SHIFT[0])):
    parts[n].location.x = sx
    parts[n].location.z = shift['Jaw_And_Ribs'] + ARM_SHIFT[1]

tip_z = zrange(parts['Blade'])[0]
for o in parts.values():
    o.location.x -= AXIS[0]
    o.location.y -= AXIS[1]
    o.location.z -= tip_z


# ---------- decimate ----------
def collapse(o, target):
    n = len(o.data.polygons)
    if n <= target:
        return
    m = o.modifiers.new('dec', 'DECIMATE')
    m.decimate_type = 'COLLAPSE'
    m.ratio = target / n
    m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier=m.name)


for n, target in TRI_BUDGET.items():
    o = parts[n]
    collapse(o, target)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.01)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(o.data)
    bm.free()
    print('DECIMATED', n, len(o.data.polygons))

# Both horns survive? (source has two; the detail camera hides the left one behind the grip)
cv = coords(parts['Cranium'])
horn = cv[:, 2] > 1440
print('HORN_VERTS left', int((horn & (cv[:, 0] < AXIS[0] - 15)).sum()), 'right', int((horn & (cv[:, 0] > AXIS[0] + 15)).sum()))


# ---------- materials per part ----------
def assign(o, m):
    o.data.materials.clear()
    o.data.materials.append(m)
    for p in o.data.polygons:
        p.material_index = 0


for n in ('Jaw_And_Ribs', 'Cranium_And_Jaw_Connector', 'Cranium', 'Crossguard_1', 'Crossguard_2'):
    assign(parts[n], BONE)
    smooth(parts[n], 89)
assign(parts['Handle'], FITTING)
smooth(parts['Handle'], 45)

# ---------- join, scale to meters ----------
height_mm = zrange(parts['Handle'])[1] + shift['Handle'] - tip_z
for o in bpy.context.scene.objects:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts['Blade']
bpy.ops.object.join()
sword = bpy.context.view_layer.objects.active
sword.name = 'rebellion'
sword.data.name = 'rebellion'
s = LENGTH / height_mm
sword.scale = (s, s, s)
sword.location *= s
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# ---------- AO -> vertex colour ----------
me = sword.data
attr = me.color_attributes.new('Color', 'BYTE_COLOR', 'CORNER')
me.color_attributes.active_color = attr
me.color_attributes.render_color_index = 0

scene = bpy.context.scene
scene.world = bpy.data.worlds.new('w')
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.render.bake.use_selected_to_active = False
bpy.ops.object.select_all(action='DESELECT')
sword.select_set(True)
bpy.context.view_layer.objects.active = sword


def bake(distance, samples):
    scene.world.light_settings.distance = distance
    scene.cycles.samples = samples
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    buf = np.empty(len(me.loops) * 4, dtype=np.float32)
    me.color_attributes['Color'].data.foreach_get('color', buf)
    return buf.reshape(-1, 4)


def per_face(values, reduce):
    ls = np.empty(len(me.polygons), dtype=np.int32); lt = np.empty(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get('loop_start', ls); me.polygons.foreach_get('loop_total', lt)
    return np.array([reduce(values[a:a + t]) for a, t in zip(ls, lt)]), ls, lt


# Pass 1, long reach: anything that never sees light is inside the assembly.
ao = bake(0.08, 24)[:, 0]
face_max, _, _ = per_face(ao, np.max)
hidden = np.nonzero(face_max < 0.03)[0]
bm = bmesh.new()
bm.from_mesh(me)
bm.faces.ensure_lookup_table()
bmesh.ops.delete(bm, geom=[bm.faces[i] for i in hidden], context='FACES')
bm.to_mesh(me)
bm.free()
print('HIDDEN_FACES_REMOVED', len(hidden))

# Pass 2, short reach: shading. Bone ages toward BONE_DARK in the recesses, metal just dims a little.
c = bake(0.025, 48)
ao = np.clip(c[:, 0], 0, 1)
mat_idx = np.empty(len(me.polygons), dtype=np.int32)
me.polygons.foreach_get('material_index', mat_idx)
_, ls, lt = per_face(ao, np.max)
loop_mat = np.repeat(mat_idx, lt)
bone_slots = [i for i, m in enumerate(me.materials) if m.name == 'rebellion_bone']
is_bone = np.isin(loop_mat, bone_slots)

dark = np.array(BONE_DARK) / np.array(BONE_BASE)       # multiplier that turns the base into the aged tone
k = (ao ** 2.8)[:, None]
bone_col = dark + (1 - dark) * k
metal_col = np.repeat((0.6 + 0.4 * ao)[:, None], 3, axis=1)
col = np.where(is_bone[:, None], bone_col, metal_col)

# Faint warm/grey mottle on the bone, +-6%, from 3D noise over the vertex positions.
vi = np.empty(len(me.loops), dtype=np.int32)
me.loops.foreach_get('vertex_index', vi)
vco = np.empty(len(me.vertices) * 3, dtype=np.float32)
me.vertices.foreach_get('co', vco)
vco = vco.reshape(-1, 3)
vn = np.array([noise.noise(Vector(p) * 90.0) for p in vco], dtype=np.float32)
n = vn[vi][:, None]
mottle = 1 + n * np.array([0.06, 0.04, 0.0]) - (n < 0) * n * np.array([0.0, 0.0, 0.03])
col = np.where(is_bone[:, None], col * mottle, col)

c[:, :3] = np.clip(col, 0, 1)
c[:, 3] = 1.0
me.color_attributes['Color'].data.foreach_set('color', c.ravel())
me.update()

# ---------- export ----------
os.makedirs(OUT_DIR, exist_ok=True)
path = os.path.join(OUT_DIR, 'rebellion.glb')
bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True,
                          export_yup=True, export_materials='EXPORT',
                          export_vertex_color='ACTIVE')
tris = sum(len(p.vertices) - 2 for p in me.polygons)
lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
for vtx in me.vertices:
    lo = Vector(map(min, lo, vtx.co)); hi = Vector(map(max, hi, vtx.co))
print('STATS tris', tris, 'size_xyz_m', tuple(round(x, 3) for x in (hi - lo)),
      'min', tuple(round(x, 3) for x in lo), 'bytes', os.path.getsize(path))
print('EXPORTED', path)
