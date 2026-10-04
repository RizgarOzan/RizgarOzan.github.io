"""Ruined kingdom backdrop for the sword-field scene (v3).

blender -b --factory-startup -P tools/blender/ruins.py
sh tools/optimize-assets.sh      (meshopt-compresses the float GLB this writes)
Writes assets/env/ruins.glb (Y up, identity transform). world.js loadRuins
places it at scale SITE_SCALE, pushed SITE_SHIFT metres away (site z), so
Blender (x, y, z) lands at site (0.6 x, 0.6 z, -(0.6 y + 12)).

Contract (Blender space, before that transform): x in [-6, 6] and y in [-8, 5]
stay empty, nothing within 14 m of the origin, and seen through the real site
camera nothing enters the top-right 30% x 12% of the frame (site nav) or the
top-left 25% x 10% (logo). Ground is not exported - pieces rest on z = 0 and
run a little below it so the site's uneven terrain does not show gaps.

Masonry is individual blocks of mixed sizes and course heights. The ruin line
is a smooth noisy profile with V- and U-shaped slumps; blocks that cross it are
cut along it (slanted, chipped, front and back at different heights), blocks
near it are loose, tilted or half fallen, and the feet of the walls disappear
under rubble mounds with scree. Openings are trimmed block by block, so arches
and lancets keep their curve. Then: dead trees, hanging ivy, a fallen colossal
crowned head as the mid-distance landmark, and a spired castle on the far crag
(material stone_far: world.js fades it into a flat atmospheric layer).
Vertex colour 'Col' carries per-block tint, joint darkening, ground AO and moss;
box-projected UVs (1 unit = UV_M metres) give every block its own patch of the
stone texture.
"""
import math
import os
import random
import sys

import bpy
import bmesh
import numpy as np
from mathutils import Vector, Matrix, Euler, noise

sys.path.append(os.path.dirname(__file__))
from forge_bl import reset, mat, srgb, ROOT  # noqa: E402

OUT = os.path.join(ROOT, 'assets', 'env', 'ruins.glb')
rng = random.Random(11)

SITE_SCALE = 0.6            # = r.scale in world.js loadRuins
SITE_SHIFT = 12.0           # = -r.position.z in world.js loadRuins
# the site camera (site (0, 1, 6.3) -> (0, 1.12, -1.4)) expressed in this file's space
CAM_POS = Vector((0.0, (-6.3 - SITE_SHIFT) / SITE_SCALE, 1.0 / SITE_SCALE))
CAM_AIM = Vector((0.0, (1.4 - SITE_SHIFT) / SITE_SCALE, 1.12 / SITE_SCALE))
FOV_V = math.radians(30.0)
ASPECT = 16 / 9
CLEAR = (-6, 6, -8, 5)      # x0, x1, y0, y1 that must stay empty
MIN_DIST = 14.0             # nothing closer than this to the origin
UV_M = 2.0                  # box-UV tile size in Blender metres (site loads at 0.6 -> 1.2 m)

reset()
STONE = mat('stone', srgb('#4a5368'), metallic=0, roughness=0.92)
DARK = mat('stone_dark', srgb('#2c3346'), metallic=0, roughness=0.95)
MOSS = mat('stone_moss', srgb('#333e3a'), metallic=0, roughness=0.97)
PALE = mat('stone_pale', srgb('#6c7488'), metallic=0, roughness=0.9)
FAR = mat('stone_far', srgb('#2c3346'), metallic=0, roughness=1.0)
WOOD = mat('deadwood', srgb('#3b3833'), metallic=0, roughness=0.95)
IVY = mat('ivy', srgb('#3f5236'), metallic=0, roughness=0.9)
GLOW = mat('cold_glow', srgb('#1a2230'), metallic=0, roughness=0.8,
           emission=srgb('#9fc2ff'), strength=2.5)


def wire_vertex_colour(m):
    """Base Color = material colour x 'Col' attribute, so EEVEE previews show
    the vertex layer and the glTF exporter writes COLOR_0."""
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    base = bsdf.inputs['Base Color'].default_value[:]
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    mix.blend_type = 'MULTIPLY'
    mix.inputs['Factor'].default_value = 1.0
    mix.inputs[6].default_value = base
    nt.links.new(attr.outputs['Color'], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs['Base Color'])


for _m in (STONE, DARK, MOSS, PALE, FAR, WOOD, IVY):
    wire_vertex_colour(_m)
# every shell is closed, so the site can cull back faces; ivy ribbons are two-sided
for _m in (STONE, DARK, MOSS, PALE, FAR, WOOD, GLOW):
    _m.use_backface_culling = True
IVY.use_backface_culling = False

_n = [0]


def uname(tag):
    _n[0] += 1
    return f'{tag}_{_n[0]:03d}'


def in_clear(x, y, margin=0.0):
    return CLEAR[0] - margin < x < CLEAR[1] + margin and CLEAR[2] - margin < y < CLEAR[3] + margin


def allowed(x, y, margin=0.6):
    return not in_clear(x, y, margin) and math.hypot(x, y) >= MIN_DIST + margin


def frame(rz=0.0, loc=(0, 0, 0), tilt=(0.0, 0.0)):
    """World matrix for a structure: yaw about Z (radians), then translation."""
    loc = tuple(loc) + (0.0,) * (3 - len(loc))
    return Matrix.Translation(Vector(loc)) @ Euler((tilt[0], tilt[1], rz)).to_matrix().to_4x4()


def T(x, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


def sstep(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


IVY_PTS = []    # (world point on a wall top, along-wall direction, outward normal, scale)


# ---------- the masonry builder ----------

class Masonry:
    """One mesh per structure. Blocks are added as closed shells, then the
    whole thing is bevelled, the exposed faces inset (so the joints get a
    darker rim), noised and coloured."""

    def __init__(self, tag, material=STONE, bevel=0.035, inset=0.0, noise_amp=0.012,
                 moss=1.0, tint=(0.72, 1.05)):
        self.bm = bmesh.new()
        self.tag, self.material = tag, material
        self.bevel, self.inset, self.noise_amp = bevel, inset, noise_amp
        self.moss, self.tint_range = moss, tint
        self.blk = self.bm.verts.layers.int.new('blk')
        self.exp = self.bm.faces.layers.int.new('exp')
        self.tints = []
        self.smooth_faces = []

    def _new_block(self, tint=None):
        self.tints.append(tint if tint is not None else rng.uniform(*self.tint_range))
        return len(self.tints) - 1

    def hexa(self, corners, exposed=(0, 1), mat_world=Matrix.Identity(4)):
        """Closed hexahedron from 8 corners: 0-3 one quad, 4-7 the opposite
        quad (same winding). Face order: 0=(0123) 1=(4567) 2=(0154) 3=(1265)
        4=(2376) 5=(3047). `exposed` indexes faces that get the inset rim."""
        bm = self.bm
        bid = self._new_block()
        vs = [bm.verts.new(mat_world @ Vector(c)) for c in corners]
        for v in vs:
            v[self.blk] = bid
        quads = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        for i, q in enumerate(quads):
            try:
                f = bm.faces.new([vs[k] for k in q])
            except ValueError:
                continue
            f[self.exp] = 1 if i in exposed else 0
        return bid

    def hexa_c(self, corners, exposed, mat_world, extra=None, jitter=0.015, tilt=0.025):
        """hexa() about the corners' centre, with per-block wobble and an
        optional extra local transform (loose / half-fallen blocks)."""
        c = Vector((0, 0, 0))
        for p in corners:
            c += Vector(p)
        c /= 8
        wob = Euler((rng.uniform(-tilt, tilt), rng.uniform(-tilt, tilt), rng.uniform(-tilt, tilt))).to_matrix().to_4x4()
        off = T(rng.uniform(-jitter, jitter), rng.uniform(-jitter, jitter) * 2.5, rng.uniform(-jitter, jitter) * 0.5)
        m = mat_world @ Matrix.Translation(c) @ (extra or Matrix.Identity(4)) @ off @ wob
        return self.hexa([tuple(Vector(p) - c) for p in corners], exposed, m)

    def block(self, size, mat_world, exposed=(2, 4), jitter=0.015, tilt=0.025):
        """Block of `size` (x along the run, y through the wall, z up) centred
        at the frame's origin, with per-block wobble. Faces: 2 = -y (front),
        4 = +y (back), 1 = top, 0 = bottom, 3 = +x end, 5 = -x end."""
        sx, sy, sz = size
        hx, hy, hz = sx / 2, sy / 2, sz / 2
        c = [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
             (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)]
        return self.hexa_c(c, exposed, mat_world, jitter=jitter, tilt=tilt)

    def stone(self, size, mat_world):
        """Rubble stone: a block with its corners knocked about, so loose
        stones read as broken pieces rather than fresh cubes."""
        sx, sy, sz = size
        c = []
        for (a, b, d) in ((-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
                          (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)):
            k = rng.uniform(0.6, 1.0)
            c.append((a * sx / 2 * rng.uniform(0.75, 1.0), b * sy / 2 * rng.uniform(0.75, 1.0),
                      d * sz / 2 * (k if d > 0 else 1.0)))
        return self.hexa_c(c, (0, 1, 2, 3, 4, 5), mat_world, jitter=0, tilt=0)

    def lathe(self, profile, segs, mat_world, top_jitter=0.0, slant=0.0, cap=True):
        """Revolved [(r, z)] shell (drums, capitals, cones). Smooth-shaded. The
        top ring can be broken (`top_jitter`, `slant`)."""
        bm = self.bm
        bid = self._new_block()
        rings = []
        for i in range(segs):
            a = 2 * math.pi * i / segs
            ring = []
            for k, (r, z) in enumerate(profile):
                zz = z
                if k == len(profile) - 1 and top_jitter:
                    zz += rng.uniform(-top_jitter, top_jitter * 0.3) + slant * math.cos(a)
                v = bm.verts.new(mat_world @ Vector((r * math.cos(a), r * math.sin(a), zz)))
                v[self.blk] = bid
                ring.append(v)
            rings.append(ring)
        faces = []
        for i in range(segs):
            A, B = rings[i], rings[(i + 1) % segs]
            for k in range(len(profile) - 1):
                try:
                    faces.append(bm.faces.new((A[k], B[k], B[k + 1], A[k + 1])))
                except ValueError:
                    pass
        if cap:
            for idx in (0, -1):
                if profile[idx][0] < 1e-4:
                    continue
                try:
                    f = bm.faces.new([r[idx] for r in rings])
                    if idx == 0:
                        f.normal_flip()
                    faces.append(f)
                except ValueError:
                    pass
        self.smooth_faces += faces
        return bid

    def mound(self, mat_world, a, b, h, rings=4, segs=14):
        """Rubble heap: a lumpy dome a x b (half-axes) and h high whose rim runs
        below the ground. Smooth-shaded, darker than the blocks."""
        bm = self.bm
        bid = self._new_block(rng.uniform(0.55, 0.75))
        seed = Vector((rng.uniform(0, 50), rng.uniform(0, 50), 0))
        top = bm.verts.new(mat_world @ Vector((0, 0, h)))
        top[self.blk] = bid
        grid = []
        for k in range(1, rings + 1):
            rho = 1.15 * k / rings
            ring = []
            for i in range(segs):
                t = 2 * math.pi * i / segs
                p = Vector((a * rho * math.cos(t), b * rho * math.sin(t), 0))
                lump = noise.noise(p * 0.9 + seed)
                z = h * max(0.0, 1 - rho * rho) ** 0.75 * (1 + 0.35 * lump) if rho < 1 else -0.3
                p.x *= 1 + 0.12 * lump
                p.z = z
                v = bm.verts.new(mat_world @ p)
                v[self.blk] = bid
                ring.append(v)
            grid.append(ring)
        faces = []
        for i in range(segs):
            faces.append(bm.faces.new((top, grid[0][i], grid[0][(i + 1) % segs])))
        for k in range(rings - 1):
            A, B = grid[k], grid[k + 1]
            for i in range(segs):
                faces.append(bm.faces.new((A[i], B[i], B[(i + 1) % segs], A[(i + 1) % segs])))
        self.smooth_faces += faces

    def scree(self, mat_world, a, b, h, count, scale):
        """Loose stones strewn over a mound(a, b, h) placed with the same frame."""
        for _ in range(count):
            t = rng.uniform(0, 2 * math.pi)
            rho = rng.random() ** 0.6 * 1.05
            x, y = a * rho * math.cos(t), b * rho * math.sin(t)
            z = h * max(0.0, 1 - rho * rho) ** 0.75
            s = scale * rng.uniform(0.25, 1.0) ** 1.4
            size = (s * rng.uniform(0.9, 1.8), s * rng.uniform(0.7, 1.2), s * rng.uniform(0.5, 0.9))
            w = mat_world @ Vector((x, y, 0))
            if not allowed(w.x, w.y):
                continue
            rot = Euler((rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6), rng.uniform(0, 6.28))).to_matrix().to_4x4()
            self.stone(size, mat_world @ T(x, y, z + size[2] * 0.15) @ rot)

    def add_bmesh(self, src, mat_world, tint=None):
        """Copy another bmesh in as one smooth-shaded block (sculpted pieces)."""
        bid = self._new_block(tint)
        vmap = {}
        for v in src.verts:
            nv = self.bm.verts.new(mat_world @ v.co)
            nv[self.blk] = bid
            vmap[v] = nv
        for f in src.faces:
            try:
                nf = self.bm.faces.new([vmap[v] for v in f.verts])
            except ValueError:
                continue
            nf[self.exp] = 0
            if f.smooth:
                self.smooth_faces.append(nf)
        return bid

    def finish(self, matrix=Matrix.Identity(4)):
        bm = self.bm
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        if self.bevel > 0:
            ss = set(self.smooth_faces)
            flat_edges = [e for e in bm.edges if not any(f in ss for f in e.link_faces)]
            if flat_edges:
                bmesh.ops.bevel(bm, geom=flat_edges, offset=self.bevel, offset_type='OFFSET',
                                segments=1, profile=0.7, affect='EDGES', clamp_overlap=True)
        cav = bm.verts.layers.float.new('cav')
        for v in bm.verts:
            v[cav] = 1.0
        if self.inset > 0:
            # slivers left by the cuts would explode under an even-offset inset
            exposed = [f for f in bm.faces if f.is_valid and f[self.exp] == 1 and f.calc_area() > 0.03
                       and min(e.calc_length() for e in f.edges) > 3 * self.inset]
            if exposed:
                bmesh.ops.inset_individual(bm, faces=exposed, thickness=self.inset, depth=0.0, use_even_offset=True)
                for f in exposed:
                    for v in f.verts:
                        v[cav] = 0.0
        else:
            for v in bm.verts:
                v[cav] = 0.0
        for f in self.smooth_faces:
            if not f.is_valid:
                continue
            for v in f.verts:
                v[cav] = 0.0
        # surface noise: fine grain everywhere, plus chipped, rounded tops
        amp = self.noise_amp
        if amp > 0:
            for v in bm.verts:
                p = v.co
                v.co = p + noise.noise_vector(p * 2.3 + Vector((7.1, 3.3, 1.7))) * amp \
                    + noise.noise_vector(p * 0.6) * amp * 1.5
        bm.normal_update()
        uv = bm.loops.layers.uv.new('UVMap')
        centre = {}
        for v in bm.verts:
            c = centre.setdefault(v[self.blk], [Vector(), 0])
            c[0] += v.co
            c[1] += 1
        for f in bm.faces:
            bid = f.verts[0][self.blk]
            ctr = centre[bid][0] / centre[bid][1]
            ox = (math.sin(bid * 12.9898) * 43758.5453) % 1.0 * 4.0
            oy = (math.sin(bid * 78.233) * 12345.678) % 1.0 * 4.0
            n = f.normal
            ax = max(range(3), key=lambda i: abs(n[i]))
            for lp in f.loops:
                p = lp.vert.co - ctr
                a, b = ((p.y, p.z), (p.x, p.z), (p.x, p.y))[ax]
                lp[uv].uv = (a / UV_M + ox, b / UV_M + oy)
        bm.verts.index_update()
        cols = np.empty((len(bm.verts), 4), dtype=np.float32)
        for v in bm.verts:
            p = v.co
            t = self.tints[v[self.blk]]
            t *= 0.86 + 0.28 * (0.5 + 0.5 * noise.noise(p * 0.21 + Vector((3.0, 9.0, 0.0))))
            t *= 0.93 + 0.14 * rng.random()
            t *= 1.0 - 0.45 * v[cav]
            g = 0.55 + 0.45 * noise.noise(p * 0.9 + Vector((1.0, 5.0, 2.0)))
            m = self.moss * sstep(2.4, 0.1, p.z) * max(0.0, min(1.0, g * 1.3))
            ao = 0.55 + 0.45 * sstep(-0.2, 0.9, p.z)
            r = t * (1 - m) + t * 0.5 * m
            gg = t * (1 - m) + t * 0.62 * m
            b = t * (1 - m) + t * 0.44 * m
            cols[v.index] = (r * ao, gg * ao, b * ao, 1.0)
        bm.faces.index_update()
        smooth_idx = [f.index for f in self.smooth_faces if f.is_valid]
        me = bpy.data.meshes.new(uname(self.tag))
        bm.to_mesh(me)
        bm.free()
        if smooth_idx:
            flags = np.zeros(len(me.polygons), dtype=bool)
            flags[smooth_idx] = True
            me.polygons.foreach_set('use_smooth', flags)
            try:
                me.set_sharp_from_angle(angle=math.radians(40))
            except AttributeError:
                pass
        attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        attr.data.foreach_set('color', cols.ravel())
        me.materials.append(self.material)
        obj = bpy.data.objects.new(me.name, me)
        obj.matrix_world = matrix
        bpy.context.scene.collection.objects.link(obj)
        return obj


# ---------- profiles ----------

def profile(points, jag=0.25, bite=0.12, bite_depth=(1.0, 2.5)):
    """Ruin line along x: piecewise-linear control points, smooth noise of
    amplitude `jag`, and slumps (V/U notches with uneven flanks, so breaks run
    diagonally) of depth `bite_depth`, about `bite` per metre x 0.55."""
    xs = [p[0] for p in points]
    seed = rng.uniform(0, 1000)
    lo, hi = max(xs[0], -30.0), min(xs[-1], 30.0)
    nb = (hi - lo) * bite * 0.55
    count = int(nb) + (1 if rng.random() < nb - int(nb) else 0)
    bites = []
    for _ in range(count):
        d = rng.uniform(*bite_depth)
        bites.append((rng.uniform(lo, hi), d, rng.uniform(0.5, 1.6) * (0.7 + 0.3 * d),
                      rng.uniform(0.5, 1.6) * (0.7 + 0.3 * d), rng.uniform(1.0, 2.2)))

    def h(x):
        if x <= xs[0]:
            base = points[0][1]
        elif x >= xs[-1]:
            base = points[-1][1]
        else:
            for (x0, h0), (x1, h1) in zip(points, points[1:]):
                if x0 <= x <= x1:
                    t = (x - x0) / (x1 - x0) if x1 > x0 else 0
                    base = h0 + (h1 - h0) * sstep(0, 1, t) * 0.5 + (h1 - h0) * t * 0.5
                    break
        base += jag * (1.3 * noise.noise(Vector((x * 0.42, seed, 0.5)))
                       + 0.5 * noise.noise(Vector((x * 1.9, seed + 3.1, 0.5))))
        for c, d, wl, wr, sh in bites:
            t = abs(x - c) / (wl if x < c else wr)
            if t < 1:
                base -= d * (1 - t) ** sh
        return base
    return h


def flat(h, jag=0.3, **kw):
    return profile([(-1e3, h), (1e3, h)], jag=jag, **kw)


# ---------- structures ----------

def _runs(mask_row, xs):
    runs, start = [], None
    for x, ok in zip(xs, mask_row):
        if ok and start is None:
            start = x
        if not ok and start is not None:
            runs.append((start, x))
            start = None
    if start is not None:
        runs.append((start, xs[-1]))
    return runs


def _clear_segments(opening, xa, xb, z0, z1):
    """Parts of [xa, xb] outside `opening`, as ((x_left, x_right) at z0, at z1)."""
    n = max(6, int((xb - xa) / 0.04))
    xs = np.linspace(xa, xb, n)
    zm = (z0 + z1) / 2
    mid = _runs([not opening(x, zm) for x in xs], xs)
    if len(mid) == 1 and mid[0] == (xs[0], xs[-1]):
        return [((xa, xb), (xa, xb))]
    rb = _runs([not opening(x, z0 + 0.02) for x in xs], xs)
    rt = _runs([not opening(x, z1 - 0.02) for x in xs], xs)

    def pick(rs, l, r):
        c = (l + r) / 2
        for a, b in rs:
            if a - 0.05 <= c <= b + 0.05:
                return max(a, l - 0.6), min(b, r + 0.6)
        return l, r
    out = []
    for l, r in mid:
        if r - l < 0.22:
            continue
        bl, br = pick(rb, l, r)
        tl, tr = pick(rt, l, r)
        bl, br, tl, tr = max(bl, xa), min(br, xb), max(tl, xa), min(tr, xb)
        if br - bl < 0.12 or tr - tl < 0.12:
            continue
        out.append(((bl, br), (tl, tr)))
    return out


def _standing(prof, l, r, zmin):
    """Longest stretch of [l, r] where prof > zmin, or None if under 0.2."""
    xs = np.linspace(l, r, 9)
    runs = _runs([prof(x) > zmin for x in xs], xs)
    if not runs:
        return None
    best = max(runs, key=lambda q: q[1] - q[0])
    return best if best[1] - best[0] >= 0.2 * (1 if r - l > 0.5 else (r - l)) else None


def _loose(h, depth):
    """Extra transform for a block sitting at the ruin line: most stay put,
    some are shifted and tilted, a few hang half off the wall face."""
    r = rng.random()
    if r < 0.08:
        return T(0, rng.uniform(-0.2, 0.06) * depth, 0) @ Euler(
            (rng.uniform(-0.1, 0.1), rng.uniform(-0.1, 0.1), rng.uniform(-0.14, 0.14))).to_matrix().to_4x4()
    if r < 0.105:
        return T(rng.uniform(-0.1, 0.1), -depth * rng.uniform(0.35, 0.55), -h * 0.12) @ Matrix.Rotation(
            rng.uniform(0.25, 0.55), 4, 'X') @ Matrix.Rotation(rng.uniform(-0.2, 0.2), 4, 'Z')
    return None


def _cut_tops(z0, z1, zl, zr, h, cut):
    """Top heights (front left, front right), (back left, back right) of a
    block cut by the ruin line: slanted, chipped, front and back differing."""
    floor = z0 + 0.05
    if not cut:
        return (z1, z1), (z1, z1)
    s = rng.uniform(-0.12, 0.12) * h
    f = [min(z1, zl + s), min(z1, zr + s * rng.uniform(0.3, 1.2))]
    b = [min(z1, zl - s * rng.uniform(0.3, 1.2)), min(z1, zr - s)]
    if rng.random() < 0.3:
        k = rng.randrange(4)
        (f if k < 2 else b)[k % 2] -= rng.uniform(0.1, 0.3) * h
    f = [max(floor, z) for z in f]
    b = [max(floor, z) for z in b]
    return tuple(f), tuple(b)


def wall(B, length, prof, block=(0.9, 0.5, 0.6), gap=0.035, foot=1.5, mat_world=Matrix.Identity(4),
         opening=None, keep=1.0, exposed_ends=True, merlons=False, string=(), mixed=1.0,
         ivy=0.12, rubble=0.0, loose=True):
    """Wall along local x, centred, front face at -y. Courses of varying
    height, blocks of varying length; blocks above the ruin line go, blocks
    crossing it are cut along it. `merlons` drops alternate blocks of the top
    course where the wall still stands full height, `string` lists heights of
    courses that project from the front face, `rubble` heaps the foot."""
    L, H, D = block
    xs_s = np.linspace(-length / 2, length / 2, 60)
    hmax = max(prof(x) for x in xs_s)
    z, k = -foot, 0
    y0, y1 = -D / 2, D / 2
    g = gap / 2
    while z < hmax - 0.05:
        h = H * rng.uniform(1 - 0.25 * mixed, 1 + 0.3 * mixed)
        z0, z1 = z, z + h
        z += h
        x, bi = -length / 2, 0
        while x < length / 2 - 0.05:
            ln = L * rng.uniform(1 - 0.4 * mixed, 1 + 0.6 * mixed)
            if bi == 0 and k % 2:
                ln *= 0.5
            if length / 2 - (x + ln) < 0.3 * L:
                ln = length / 2 - x
            xa, xb = x, x + ln
            x = xb
            bi += 1
            ta, tb, tm = prof(xa), prof(xb), prof((xa + xb) / 2)
            line = min(ta, tb, tm)
            if z0 >= max(ta, tb, tm) - 0.08:
                continue
            cut = z1 > line
            if cut and rng.random() > keep:
                continue
            near_top = z1 > line - 0.7 * h
            if merlons and near_top and not cut and bi % 2 == 0 and line > hmax - 2.5 * H:
                continue
            segs = _clear_segments(opening, xa + g, xb - g, z0 + g, z1 - g) if opening else \
                [((xa + g, xb - g), (xa + g, xb - g))]
            for (bl, br), (tl, tr) in segs:
                if cut:
                    # keep only the stretch where the line stands well above the
                    # block's foot (no long sliver wedges); the break end leans
                    run = _standing(prof, tl, tr, z0 + g + 0.3 * h)
                    if not run:
                        continue
                    dl, dr = run[0] - tl, tr - run[1]
                    tl, tr = run
                    bl, br = bl + dl * rng.uniform(0.4, 0.9), br - dr * rng.uniform(0.4, 0.9)
                zl, zr = min(z1 - g, prof(tl)), min(z1 - g, prof(tr))
                if max(zl, zr) < z0 + g + 0.12 * h:
                    continue
                # a steep break steps down block by block instead of slicing slivers
                zl, zr = max(zl, max(zl, zr) - 0.45 * h), max(zr, max(zl, zr) - 0.45 * h)
                ft, bt = _cut_tops(z0 + g, z1 - g, zl, zr, h, cut)
                dy = rng.uniform(-0.01, 0.06) if rng.random() < 0.25 else 0.0
                ex = [2, 4]
                if near_top:
                    ex.append(1)
                if exposed_ends and (abs(xa + length / 2) < 0.1 or abs(xb - length / 2) < 0.1):
                    ex += [3, 5]
                if any(abs((z0 + z1) / 2 - s) < H * 0.6 for s in string):
                    dy -= D * 0.12
                    ex += [0, 1]
                # the back face closes the vertical joint, so no sky shows through
                # the wall; from the front the joint reads as a V groove
                e = g * 0.9
                c = [(bl, y0 + dy, z0 + g), (br, y0 + dy, z0 + g), (br + e, y1 + dy, z0 + g), (bl - e, y1 + dy, z0 + g),
                     (tl, y0 + dy, ft[0]), (tr, y0 + dy, ft[1]), (tr + e, y1 + dy, bt[1]), (tl - e, y1 + dy, bt[0])]
                extra = _loose(h, D) if (loose and near_top) else None
                B.hexa_c(c, ex, mat_world, extra)
                if near_top and B.moss > 0 and rng.random() < ivy:
                    p = mat_world @ Vector(((tl + tr) / 2, y0 + dy - 0.02, min(ft) - 0.02))
                    IVY_PTS.append((p, (mat_world.to_3x3() @ Vector((1, 0, 0))).normalized(),
                                    (mat_world.to_3x3() @ Vector((0, -1, 0))).normalized(), H / 0.5))
        k += 1
    if rubble > 0:
        foot_rubble(B, mat_world, length, D, prof, H, rubble)
    return B


def foot_rubble(B, M, length, D, prof, H, amount=1.0):
    """Heaps of fallen stone along the front foot of a wall; the collapsed
    stretches get the bigger heaps."""
    xs = np.linspace(-length / 2, length / 2, 24)
    hs = np.array([prof(x) for x in xs])
    w = (hs.max() - hs) + 0.4 * max(0.5, hs.max())
    n = max(1, round(length / 5.0 * amount))
    for _ in range(n):
        x = float(rng.choices(list(xs), weights=list(w))[0]) + rng.uniform(-0.8, 0.8)
        drop = hs.max() - prof(x)
        a = rng.uniform(1.0, 2.2) * (0.7 + 0.3 * amount) * (H / 0.5) ** 0.5
        b = rng.uniform(0.8, 1.5) * (H / 0.5) ** 0.5
        hh = rng.uniform(0.3, 0.6) * min(1.8, 0.6 + drop * 0.18) * (H / 0.5) ** 0.5
        Mm = M @ T(x, -(D / 2 + b * 0.35), 0) @ Matrix.Rotation(rng.uniform(-0.25, 0.25), 4, 'Z')
        w0 = Mm @ Vector((0, 0, 0))
        if not allowed(w0.x, w0.y, margin=a):
            continue
        B.mound(Mm, a, b, hh)
        B.scree(Mm, a, b, hh, int(4 + a * b * 3), H * 0.9)


def debris(B, count, mat_world, spread=(3.0, 2.0), size=(0.9, 0.5, 0.6), bias=(0.0, 0.0), sink=0.35):
    """Fallen blocks of mixed size scattered on the ground around a frame origin."""
    L, H, D = size
    for _ in range(count):
        lx = bias[0] + rng.gauss(0, spread[0] / 2)
        ly = bias[1] + rng.gauss(0, spread[1] / 2)
        w = mat_world @ Vector((lx, ly, 0))
        if not allowed(w.x, w.y):
            continue
        s = rng.uniform(0.35, 1.15)
        sz = (L * s * rng.uniform(0.6, 1.4), D * s * rng.uniform(0.7, 1.1), H * s * rng.uniform(0.7, 1.2))
        rot = Euler((rng.uniform(-0.6, 0.6), rng.uniform(-0.5, 0.5), rng.uniform(0, 6.28))).to_matrix().to_4x4()
        m = mat_world @ T(lx, ly, sz[2] * (0.5 - sink * rng.uniform(0.4, 1.2))) @ rot
        if rng.random() < 0.5:
            B.stone(sz, m)
        else:
            B.block(sz, m, exposed=(0, 1, 2, 3, 4, 5), jitter=0, tilt=0)


def arch(B, r_in, thick, depth, spring, n=15, keep=(0.0, 1.0), gap=0.03, mat_world=Matrix.Identity(4)):
    """Voussoir arch in the local xz plane centred on x = 0, springing at z =
    `spring`. `keep` = fraction range of the arc (0 = left spring, 1 = right).
    The last voussoir at a broken end hangs a little loose."""
    lo_i = min(i for i in range(n) if (i + 1) / n > keep[0])
    hi_i = max(i for i in range(n) if i / n < keep[1])
    for i in range(n):
        f0, f1 = i / n, (i + 1) / n
        if f1 <= keep[0] or f0 >= keep[1]:
            continue
        a0 = math.pi - f0 * math.pi
        a1 = math.pi - f1 * math.pi
        g = gap / r_in
        a0 -= g
        a1 += g
        ro = r_in + thick + rng.uniform(-0.06, 0.06)

        def P(a, r, y):
            return (r * math.cos(a), y, spring + r * math.sin(a))
        c = [P(a0, r_in, -depth / 2), P(a1, r_in, -depth / 2), P(a1, ro, -depth / 2), P(a0, ro, -depth / 2),
             P(a0, r_in, depth / 2), P(a1, r_in, depth / 2), P(a1, ro, depth / 2), P(a0, ro, depth / 2)]
        broken_end = (i == hi_i and keep[1] < 1) or (i == lo_i and keep[0] > 0)
        extra = None
        if broken_end:
            extra = T(0, 0, -0.12) @ Euler((rng.uniform(-0.1, 0.1), rng.uniform(-0.25, 0.25), 0)).to_matrix().to_4x4()
        B.hexa_c(c, (0, 1, 2), mat_world, extra, jitter=0.01, tilt=0.015)


def tower(B, r, prof_theta, block=(1.4, 0.8, 1.2), gap=0.04, foot=2.0, mat_world=Matrix.Identity(4),
          opening=None, taper=0.01, merlons=False, string=(), mixed=1.0, ivy=0.05, loose=True):
    """Round tower of wedge blocks of mixed width and course height.
    prof_theta(theta) is the ruin line; blocks crossing it are cut along it."""
    L, H, Tk = block
    tau = 2 * math.pi
    hmax = max(prof_theta(t) for t in np.linspace(0, tau, 96))
    z, k = -foot, 0
    while z < hmax - 0.05:
        h = H * rng.uniform(1 - 0.22 * mixed, 1 + 0.25 * mixed)
        z0, z1 = z, z + h
        z += h
        rr = r - taper * max(0.0, z0 + h / 2)
        n = max(8, int(tau * rr / L))
        step = tau / n
        a = rng.uniform(0, step)
        a_end = a + tau
        i = 0
        while a < a_end - 1e-3:
            w = step * rng.uniform(1 - 0.35 * mixed, 1 + 0.45 * mixed)
            if a_end - (a + w) < 0.35 * step:
                w = a_end - a
            a0, a1 = a, a + w
            a = a1
            i += 1
            ac = ((a0 + a1) / 2) % tau
            ta, tb, tm = prof_theta(a0 % tau), prof_theta(a1 % tau), prof_theta(ac)
            line = min(ta, tb, tm)
            if z0 >= max(ta, tb, tm) - 0.08:
                continue
            if opening and opening(ac, (z0 + z1) / 2):
                continue
            cut = z1 > line
            near_top = z1 > line - 0.7 * h
            if merlons and near_top and not cut and i % 2 == 0 and line > hmax - 1.6 * H:
                continue
            gz = gap / 2
            if cut:
                run = _standing(lambda t: prof_theta(t % tau), a0, a1, z0 + gz + 0.3 * h)
                if not run:
                    continue
                a0, a1 = run
                ta, tb = prof_theta(a0 % tau), prof_theta(a1 % tau)
            zl, zr = min(z1 - gz, ta), min(z1 - gz, tb)
            if max(zl, zr) < z0 + gz + 0.12 * h:
                continue
            zl, zr = max(zl, max(zl, zr) - 0.45 * h), max(zr, max(zl, zr) - 0.45 * h)
            ft, bt = _cut_tops(z0 + gz, z1 - gz, zl, zr, h, cut)    # front = outer face
            g = gap / rr
            ri, ro = rr - Tk, rr + rng.uniform(-0.01, 0.03)
            if any(abs((z0 + z1) / 2 - s) < H * 0.6 for s in string):
                ro += Tk * 0.15

            def P(an, rad, zz):
                return (rad * math.cos(an), rad * math.sin(an), zz)
            zb = z0 + gz
            gi = g * 0.1      # inner face closes the joint
            c = [P(a0 + gi, ri, zb), P(a1 - gi, ri, zb), P(a1 - g, ro, zb), P(a0 + g, ro, zb),
                 P(a0 + gi, ri, bt[0]), P(a1 - gi, ri, bt[1]), P(a1 - g, ro, ft[1]), P(a0 + g, ro, ft[0])]
            extra = None
            if loose and near_top:
                rq = rng.random()
                tang = Vector((-math.sin(ac), math.cos(ac), 0))
                radial = Vector((math.cos(ac), math.sin(ac), 0))
                if rq < 0.12:
                    extra = Matrix.Rotation(rng.uniform(-0.15, 0.15), 4, tang) @ Matrix.Rotation(rng.uniform(-0.12, 0.12), 4, 'Z')
                elif rq < 0.16:
                    extra = Matrix.Translation(radial * Tk * rng.uniform(0.35, 0.55) + Vector((0, 0, -h * 0.12))) \
                        @ Matrix.Rotation(rng.uniform(0.25, 0.5), 4, tang)
            B.hexa_c(c, (4, 1) if near_top else (4,), mat_world, extra)
            if near_top and B.moss > 0 and rng.random() < ivy:
                p = mat_world @ Vector(P(ac, ro + 0.02, min(ft) - 0.02))
                IVY_PTS.append((p, (mat_world.to_3x3() @ Vector((-math.sin(ac), math.cos(ac), 0))).normalized(),
                                (mat_world.to_3x3() @ Vector((math.cos(ac), math.sin(ac), 0))).normalized(), H / 0.5))
        k += 1


def column(B, h, r, mat_world, broken=False, drum_h=0.95, segs=16, capital=True):
    """Column standing at the frame origin: plinth, torus, drums, capital."""
    B.block((r * 2.9, r * 2.9, 0.32), mat_world @ T(0, 0, 0.16), exposed=(1, 2, 3, 4, 5))
    B.lathe([(r * 1.05, 0.32), (r * 1.3, 0.38), (r * 1.3, 0.5), (r * 1.08, 0.58)], segs, mat_world)
    z = 0.58
    top = h - (0.65 if capital and not broken else 0.0)
    while z < top - 0.05:
        dh = min(drum_h * rng.uniform(0.7, 1.25), top - z)
        last = z + dh >= top - 0.05
        rr = r * (1 - 0.12 * z / h)
        m = mat_world @ T(rng.uniform(-0.02, 0.02), rng.uniform(-0.02, 0.02), z) @ Euler(
            (rng.uniform(-0.012, 0.012), rng.uniform(-0.012, 0.012), 0)).to_matrix().to_4x4()
        prof = [(rr - 0.04, 0.0), (rr, 0.04), (rr, dh - 0.04), (rr - 0.04, dh)]
        if last and broken:
            prof = [(rr - 0.04, 0.0), (rr, 0.04), (rr, dh)]
            B.lathe(prof, segs, m, top_jitter=0.3, slant=rng.uniform(0.2, 0.45) * rng.choice((-1, 1)))
        else:
            B.lathe(prof, segs, m)
        z += dh
    if capital and not broken:
        rr = r * 0.88
        B.lathe([(rr - 0.03, 0.0), (rr, 0.03), (rr * 1.25, 0.3), (rr * 1.3, 0.38)], segs, mat_world @ T(0, 0, h - 0.65))
        B.block((r * 2.5, r * 2.5, 0.27), mat_world @ T(0, 0, h - 0.135), exposed=(1, 2, 3, 4, 5))


def fallen_drum(B, r, length, mat_world, segs=16):
    """Column drum lying on the ground, axis along local x, partly sunk."""
    m = mat_world @ T(0, 0, r * 0.82) @ Matrix.Rotation(math.radians(90), 4, 'Y') @ Matrix.Rotation(rng.uniform(-0.15, 0.15), 4, 'X')
    B.lathe([(r - 0.04, -length / 2), (r, -length / 2 + 0.04), (r, length / 2 - 0.04), (r - 0.04, length / 2)], segs, m)


# ---------- openings ----------

def lancet(cx, w, z0, z1):
    """Pointed window mask in wall-local (x, z)."""
    def f(x, z):
        if abs(x - cx) > w / 2 or z < z0 or z > z1:
            return False
        if z > z1 - w / 2:
            d = abs(x - cx)
            return (z - (z1 - w / 2)) < math.sqrt(max(0.0, (w / 2) ** 2 - d * d)) * 1.2
        return True
    return f


def union(*fs):
    return lambda x, z: any(f(x, z) for f in fs)


# ---------- organic pieces ----------

def break_plane(bm, co, no, rough=0.12):
    """Cut the bmesh by a plane (drop the side `no` points to) and close the
    hole with a rough, poked fracture face."""
    co, no = Vector(co), Vector(no).normalized()
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no, clear_outer=True)
    edges = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge) and e.is_valid and e.is_boundary]
    filled = bmesh.ops.holes_fill(bm, edges=edges, sides=0)['faces'] if edges else []
    for f in filled:
        poked = bmesh.ops.poke(bm, faces=[f])
        for v in poked['verts']:
            v.co -= no * rng.uniform(0.5, 1.5) * rough
        for pf in poked['faces']:
            pf.smooth = False
    for v in bm.verts:
        if abs((v.co - co).dot(no)) < 0.01:
            v.co += noise.noise_vector(v.co * 3.0) * rough * 0.5


def _g(x, w):
    return math.exp(-(x / w) ** 2)


def colossal_head(loc, S=3.4):
    """The fallen king: a colossal crowned stone head sunk to the lips in the
    valley floor, rolled onto one cheek and turned three-quarters to the
    camera. The crown's points carry the silhouette; brow, sockets and nose
    take the moon rim. Sculpted from a sphere (features are bumps in the unit
    sphere's coordinates), smooth-shaded, one side of the crown broken away."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=48, radius=1.0)
    front = [e for e in bm.edges if all(v.co.y < -0.3 for v in e.verts)]
    bmesh.ops.subdivide_edges(bm, edges=front, cuts=1, use_grid_fill=True)
    for v in bm.verts:
        v.co.normalize()
    for v in bm.verts:
        u, yy, w = v.co
        jaw = sstep(0.1, -0.9, w)
        fr = sstep(-0.05, -0.55, yy)
        au = abs(u)
        d = (0.06 + 0.26 * sstep(0.3, -0.22, w)) * sstep(-0.4, -0.25, w) * sstep(0.36, 0.28, w) * _g(u, 0.07 + 0.07 * sstep(0.1, -0.3, w))
        d += 0.1 * _g(w - 0.3, 0.07) * sstep(0.62, 0.42, au)                  # brow
        d -= 0.16 * math.exp(-((au - 0.3) / 0.12) ** 2 - ((w - 0.14) / 0.09) ** 2)   # sockets
        d += 0.045 * math.exp(-((au - 0.43) / 0.15) ** 2 - ((w + 0.05) / 0.15) ** 2)  # cheekbones
        d += 0.06 * _g(u, 0.22) * _g(w + 0.5, 0.06)                              # lips
        d -= 0.04 * _g(u, 0.2) * _g(w + 0.53, 0.016)                             # lip line
        d += 0.08 * _g(u, 0.2) * _g(w + 0.75, 0.09)                              # chin
        x = u * 0.78 * (1 - 0.22 * jaw)
        y = yy * 0.92 * (1 - 0.08 * jaw) * (1.05 if yy > 0 else 1.0) - d * fr
        z = w * 1.12
        ear = 0.13 * _g(yy - 0.06, 0.13) * _g(w - 0.05, 0.22) * sstep(0.82, 0.97, au)
        x += math.copysign(ear, u)
        v.co = Vector((x, y, z))
    for v in bm.verts:
        v.co += noise.noise_vector(v.co * 2.2 + Vector((4, 1, 7))) * 0.018
    for f in bm.faces:
        f.smooth = True
    # a slab of the crowned temple sheared off
    break_plane(bm, (0.5, 0.15, 0.62), (0.8, 0.25, 0.55), rough=0.03)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    crown = Masonry('crown_tmp')        # only used as a bmesh builder
    ell = Matrix.Diagonal((0.71, 0.84, 1.0, 1.0)) @ T(0, 0, 0.12)
    crown.lathe([(1.0, 0.42), (1.02, 0.44), (1.03, 0.68), (1.09, 0.76), (1.05, 0.8)], 40, ell, cap=False)
    for i in range(10):
        a = 2 * math.pi * i / 10 + 0.15
        if i in (1, 2):         # on the sheared side
            continue
        hgt = (0.42 if i % 2 else 0.3) * (0.5 if i == 7 else 1.0)
        def P(da, rr, zz):
            return (rr * math.cos(a + da), rr * math.sin(a + da), zz)
        c = [P(-0.13, 1.0, 0.76), P(0.13, 1.0, 0.76), P(0.13, 1.07, 0.76), P(-0.13, 1.07, 0.76),
             P(-0.025, 1.0, 0.76 + hgt), P(0.025, 1.0, 0.76 + hgt), P(0.025, 1.05, 0.76 + hgt), P(-0.025, 1.05, 0.76 + hgt)]
        crown.hexa(c, (), ell)
        crown.lathe([(0.0, -0.05), (0.05, -0.03), (0.06, 0.0), (0.05, 0.03), (0.0, 0.05)], 8,
                    ell @ T(*P(0, 1.03, 0.79 + hgt)))
    for f in crown.bm.faces:
        f.smooth = f in set(crown.smooth_faces)

    # pose: face three-quarters to the camera, rolled onto the left cheek,
    # tipped back a little; sunk to the lips
    to_cam = CAM_POS - Vector(loc)
    yaw = math.atan2(to_cam.y, to_cam.x) + math.pi / 2 - math.radians(28)
    R = Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Rotation(math.radians(-17), 4, 'Y') @ Matrix.Rotation(math.radians(-9), 4, 'X')
    M = Matrix.Translation(Vector(loc) + Vector((0, 0, 0.68 * S))) @ R @ Matrix.Diagonal((S, S, S, 1.0))
    B = Masonry('colossus', PALE, bevel=0.0, inset=0.0, noise_amp=0.0, moss=1.3, tint=(0.85, 0.95))
    B.add_bmesh(bm, M, tint=0.92)
    B.add_bmesh(crown.bm, M, tint=0.8)
    bm.free()
    crown.bm.free()
    G = frame(yaw, loc)
    for dx, dy, a, b, h, n in ((0.0, -0.3, 1.25, 0.8, 0.5, 30), (1.3, 0.4, 0.9, 0.6, 0.32, 14), (-1.2, 0.2, 0.8, 0.6, 0.28, 12)):
        Mm = G @ T(dx * S, dy * S, 0)
        B.mound(Mm, a * S, b * S, h * S)
        B.scree(Mm, a * S, b * S, h * S, n, 0.17 * S)
    # the sheared slab and a crown point lie in front
    B.stone((0.55 * S, 0.4 * S, 0.22 * S), G @ T(1.25 * S, -1.05 * S, 0.06 * S) @ Euler((0.25, 0.4, 0.8)).to_matrix().to_4x4())
    B.stone((0.12 * S, 0.1 * S, 0.4 * S), G @ T(-0.9 * S, -1.2 * S, 0.04 * S) @ Euler((1.4, 0.2, 0.5)).to_matrix().to_4x4())
    B.finish()


def dead_trees(spots):
    """Bare, twisted trees: tapered 5-sided tubes branching three times."""
    bm = bmesh.new()
    cols = []

    def ring(c, d, r, twist):
        a = d.orthogonal().normalized()
        b = d.cross(a).normalized()
        out = []
        for i in range(5):
            t = 2 * math.pi * i / 5 + twist
            v = bm.verts.new(c + (a * math.cos(t) + b * math.sin(t)) * r * rng.uniform(0.85, 1.1))
            out.append(v)
        return out

    def branch(p, d, length, r, depth, shade):
        segs = 3
        prev = ring(p, d, r, 0.0)
        cols.extend([shade] * 5)
        c = p.copy()
        for k in range(1, segs + 1):
            d = (d + Vector((rng.uniform(-0.35, 0.35), rng.uniform(-0.35, 0.35), rng.uniform(-0.1, 0.25)))).normalized()
            c = c + d * length / segs
            rr = r * (1 - 0.45 * k / segs)
            cur = ring(c, d, rr, k * 0.4)
            cols.extend([shade * (1 + 0.08 * k)] * 5)
            for i in range(5):
                bm.faces.new((prev[i], prev[(i + 1) % 5], cur[(i + 1) % 5], cur[i]))
            prev = cur
        tip = bm.verts.new(c + d * r * 1.2)
        cols.append(shade)
        for i in range(5):
            bm.faces.new((prev[i], prev[(i + 1) % 5], tip))
        if depth > 0:
            for _ in range(rng.choice((2, 2, 3))):
                axis = d.orthogonal().normalized()
                axis.rotate(Matrix.Rotation(rng.uniform(0, 6.28), 3, d))
                nd = (Matrix.Rotation(rng.uniform(0.45, 0.95), 3, axis) @ d)
                nd = (nd + Vector((0, 0, 0.15))).normalized()
                branch(c - d * length * rng.uniform(0.0, 0.3), nd, length * rng.uniform(0.55, 0.75), r * 0.55, depth - 1, shade)

    for (x, y, hgt, lean) in spots:
        d = Vector((math.sin(lean), -0.1, 1)).normalized()
        base = Vector((x, y, -0.4))
        branch(base, d, hgt * 0.5, hgt * 0.045, 3, rng.uniform(0.75, 1.0))
    # bmesh face winding is outward by construction order on most rings; fix the rest
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.verts.index_update()
    me = bpy.data.meshes.new(uname('deadtrees'))
    arr = np.empty((len(bm.verts), 4), dtype=np.float32)
    for v in bm.verts:
        t = cols[v.index] * (0.8 + 0.25 * rng.random())
        ao = 0.55 + 0.45 * sstep(-0.2, 1.5, v.co.z)
        arr[v.index] = (t * ao, t * ao * 0.97, t * ao * 0.92, 1.0)
    bm.to_mesh(me)
    bm.free()
    me.polygons.foreach_set('use_smooth', np.ones(len(me.polygons), dtype=bool))
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    attr.data.foreach_set('color', arr.ravel())
    me.materials.append(WOOD)
    obj = bpy.data.objects.new(me.name, me)
    bpy.context.scene.collection.objects.link(obj)


def build_ivy():
    """Hanging ivy / moss strands from the wall tops registered in IVY_PTS;
    only the faces turned toward the camera get any."""
    bm = bmesh.new()
    cols = []
    for p, along, out, sc in IVY_PTS:
        if out.dot((CAM_POS - p).normalized()) < 0.15:
            continue
        for _ in range(rng.randint(8, 16)):
            base = p + along * rng.uniform(-0.9, 0.9) * sc + out * 0.03
            length = sc * rng.uniform(0.5, 3.2) * rng.random() ** 0.4
            w = rng.uniform(0.1, 0.24) * sc
            ph = rng.uniform(0, 6.28)
            prev = None
            n = 4
            for k in range(n + 1):
                t = k / n
                c = base + Vector((0, 0, -length * t)) + out * (0.05 * t + 0.03 * math.sin(t * 3 + ph)) \
                    + along * (0.06 * math.sin(t * 4 + ph))
                ww = w * (1 - 0.65 * t)
                v1, v2 = bm.verts.new(c - along * ww / 2), bm.verts.new(c + along * ww / 2)
                shade = (0.75 + 0.35 * t) * rng.uniform(0.85, 1.1)
                cols += [shade, shade]
                if prev:
                    bm.faces.new((prev[0], prev[1], v2, v1))
                prev = (v1, v2)
    bm.verts.index_update()
    arr = np.empty((len(bm.verts), 4), dtype=np.float32)
    for v in bm.verts:
        s = cols[v.index]
        arr[v.index] = (s * 0.95, s, s * 0.85, 1.0)
    me = bpy.data.meshes.new(uname('ivy'))
    bm.to_mesh(me)
    bm.free()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    attr.data.foreach_set('color', arr.ravel())
    me.materials.append(IVY)
    obj = bpy.data.objects.new(me.name, me)
    bpy.context.scene.collection.objects.link(obj)


# ---------- layout ----------

def near_ring():
    """14-24 m: low things only. Rubble, stumps, two short walls, dead trees."""
    # left: a short wall stub leaning away, rubble at its foot
    M = frame(math.radians(18), (-12.5, 20.0))
    B = Masonry('wall_nl', STONE, inset=0.06, bevel=0.05, noise_amp=0.02)
    wall(B, 4.5, profile([(-2.2, 1.6), (-0.8, 2.1), (0.6, 0.7), (2.2, 1.0)], jag=0.25, bite=0.2, bite_depth=(0.4, 1.0)),
         mat_world=M, rubble=1.2, ivy=0.35)
    debris(B, 8, M, spread=(4, 3), bias=(0.5, -0.8))
    B.finish()
    # left: toppled column, drums in a broken line toward the camera
    B = Masonry('drums_nl', STONE, bevel=0.0, inset=0.0, noise_amp=0.02)
    M = frame(math.radians(-70), (-9.0, 22.0))
    for dx, dy, rz in ((0.0, 0.0, 0.05), (1.7, 0.3, -0.25), (3.9, -0.4, 0.4), (5.4, 0.9, 0.9)):
        fallen_drum(B, 0.5 * rng.uniform(0.92, 1.0), rng.uniform(0.9, 1.6), M @ T(dx, dy, 0) @ Matrix.Rotation(rz, 4, 'Z'))
    B.block((1.4, 1.4, 0.3), M @ T(-1.6, 0.4, 0.15), exposed=(1, 2, 3, 4, 5))  # its plinth
    B.mound(M @ T(2.5, 0.2, 0), 3.0, 1.4, 0.35)
    B.finish()
    # right: a short wall stub with a collapsed middle, rubble in front
    M = frame(math.radians(-28), (13.5, 20.5))
    B = Masonry('wall_nr', STONE, inset=0.06, bevel=0.05, noise_amp=0.02)
    wall(B, 4.5, profile([(-2.2, 1.4), (-1.0, 2.0), (0.2, 0.6), (1.2, 1.6), (2.2, 1.9)], jag=0.25, bite=0.2, bite_depth=(0.4, 1.0)),
         mat_world=M, rubble=1.4, ivy=0.35)
    debris(B, 10, M, spread=(5, 3.5), bias=(0, -1.2))
    B.finish()
    # right: a broken column stump + capital on the ground
    B = Masonry('stump_nr', MOSS, inset=0.05)
    M = frame(0.3, (8.0, 21.0))
    column(B, 2.3, 0.5, M, broken=True)
    B.block((1.3, 1.3, 0.28), M @ T(1.8, -0.9, 0.14) @ Matrix.Rotation(0.4, 4, 'Z'), exposed=(0, 1, 2, 3, 4, 5))
    B.lathe([(0.47, 0), (0.5, 0.03), (0.6, 0.3), (0.62, 0.38)], 16, M @ T(2.0, -0.9, 0.28) @ Matrix.Rotation(0.5, 4, 'X'))
    B.mound(M @ T(0.4, 0.5, 0), 1.6, 1.2, 0.3)
    B.finish()
    # lonely stones lying in the grass behind the field
    B = Masonry('debris_c', DARK, inset=0.05, moss=1.4)
    debris(B, 3, frame(0, (-6, 20)), spread=(2, 2), size=(1.0, 0.55, 0.65))
    debris(B, 5, frame(0, (-15, 14)), spread=(4, 4))
    debris(B, 5, frame(0, (15, 13)), spread=(4, 4))
    B.finish()


def mid_near():
    """24-34 m: the big broken arch (centre-left), the colonnade (left), and
    the fallen colossal head (right) as the landmark."""
    M = frame(math.radians(12), (-1.2, 25.5))
    B = Masonry('arch_c', STONE, inset=0.07, bevel=0.045, noise_amp=0.018)
    r_in, thick, pier, spring, depth = 2.5, 1.15, 1.7, 4.0, 2.0
    xl = -(r_in + pier / 2)
    xr = r_in + pier / 2
    wall(B, pier, profile([(-1, spring + thick + 0.3), (1, spring + thick - 0.6)], jag=0.2, bite=0.0),
         block=(0.85, 0.5, depth), mat_world=M @ T(xl, 0, 0), ivy=0.35)
    # spandrel above the left haunch, broken on a slant
    wall(B, 1.6, profile([(-1, spring + 1.0), (1, spring - 0.1)], jag=0.2, bite=0.0),
         block=(0.8, 0.5, depth), mat_world=M @ T(xl + pier / 2 + 0.8, 0, 0), exposed_ends=True)
    arch(B, r_in, thick, depth, spring, n=15, keep=(0.0, 0.62), mat_world=M)
    wall(B, pier, profile([(-1, 2.3), (0, 3.1), (1, 1.4)], jag=0.25, bite=0.0),
         block=(0.85, 0.5, depth), mat_world=M @ T(xr, 0, 0))
    # the fallen part of the arc lies where it fell
    debris(B, 10, M, spread=(4, 3), bias=(xr + 1.0, 0.6), size=(1.0, 0.55, 0.8), sink=0.3)
    B.mound(M @ T(xr + 0.8, -0.4, 0), 2.6, 2.0, 0.8)
    B.scree(M @ T(xr + 0.8, -0.4, 0), 2.6, 2.0, 0.8, 16, 0.45)
    B.mound(M @ T(xl - 0.6, -1.2, 0), 1.8, 1.3, 0.4)
    debris(B, 4, M, spread=(3, 2), bias=(xl - 1.0, -0.5))
    B.finish()

    # colonnade: a ruined row of columns, one bay still carries its architrave
    base = frame(math.radians(28), (-9.0, 30.0))
    B = Masonry('colonnade', STONE, inset=0.05, bevel=0.03)
    xs = [-7.5, -4.5, -1.5, 1.5, 4.5, 7.5]
    hs = [5.2, 7.4, 7.4, 3.1, 7.6, 6.2]
    broken = [True, False, False, True, False, True]
    for x, h, br in zip(xs, hs, broken):
        Mc = base @ T(x, 0, 0) @ Matrix.Rotation(rng.uniform(0, 6.28), 4, 'Z')
        column(B, h, 0.52, Mc, broken=br)
    B.block((3.5, 1.05, 0.75), base @ T(-3.0, 0, 7.4 + 0.375) @ Matrix.Rotation(0.03, 4, 'Y'), exposed=(0, 1, 2, 3, 4, 5))
    # its neighbour slid off and leans against the column foot
    B.block((3.3, 1.0, 0.7), base @ T(3.2, -1.2, 1.3) @ Matrix.Rotation(0.42, 4, 'Y') @ Matrix.Rotation(0.2, 4, 'Z'), exposed=(0, 1, 2, 3, 4, 5))
    for i in range(3):
        fallen_drum(B, 0.48, rng.uniform(0.9, 1.6), base @ T(-3.5 + i * 1.6, -2.4 - i * 0.4, 0) @ Matrix.Rotation(0.3 + i * 0.25, 4, 'Z'))
    debris(B, 8, base, spread=(10, 3), bias=(1.0, 2.0), size=(0.8, 0.5, 0.6))
    for x in (-6.0, 1.5, 6.0):
        B.mound(base @ T(x, -0.6, 0), 1.8, 1.2, 0.35)
    B.finish()
    # the cella wall behind the colonnade (low, long, ragged)
    M = frame(math.radians(28), (-10.0, 34.0))
    B = Masonry('cella', DARK, inset=0.0)
    wall(B, 15.0, profile([(-7.5, 2.2), (-4.0, 2.9), (-2.5, 0.6), (0.0, 0.5), (2.0, 2.4), (4.5, 1.2), (7.5, 2.0)], jag=0.3),
         mat_world=M, rubble=1.0)
    B.finish()

    # right mid: the landmark
    colossal_head((12.8, 29.0, 0.0), S=3.4)


def bridge():
    """36-50 m, right: the collapsed bridge coming out of the keep's right
    tower and leaving the frame on the right. Middle span gone."""
    p0 = Vector((9.5, 50.0, 0))
    p1 = Vector((31.0, 37.5, 0))
    d = p1 - p0
    rz = math.atan2(d.y, d.x)
    length = d.length
    base = frame(rz, ((p0 + p1) / 2).to_tuple())
    B = Masonry('bridge', STONE, inset=0.0, bevel=0.04, noise_amp=0.015)
    pier_w, bay, deck, width = 1.5, 6.8, 8.4, 3.0
    n_bays = int((length - pier_w) / (bay + pier_w))
    total = n_bays * bay + (n_bays + 1) * pier_w
    x0 = -total / 2
    gone = {1}          # collapsed bay
    half = {2}          # bay whose arch survives but the deck is gone
    for i in range(n_bays + 1):
        xc = x0 + pier_w / 2 + i * (bay + pier_w)
        if i not in gone and i - 1 not in gone:
            pr = flat(deck + 0.9, jag=0.18, bite=0.0)
        else:
            top = rng.uniform(2.5, 4.5)
            pr = profile([(-1, top + 1.2), (1, top - 0.6)], jag=0.2, bite=0.0)
        wall(B, pier_w, pr, block=(0.9, 0.55, width), foot=3.0, mat_world=base @ T(xc, 0, 0))
    for i in range(n_bays):
        if i in gone:
            continue
        xs = x0 + pier_w + i * (bay + pier_w)
        xc = xs + bay / 2
        r = bay / 2
        spring = deck - r - 1.1
        arch(B, r, 0.9, width, spring, n=13, mat_world=base @ T(xc, 0, 0),
             keep=(0.0, 1.0) if i not in half else (0.0, 0.55))
        if i in half:
            continue

        def mask(x, z, _xc=xc, _r=r, _s=spring):
            return math.hypot(x - _xc, z - _s) < _r + 0.95 and z > _s - 0.2
        wall(B, bay + pier_w, flat(deck + 0.9, jag=0.35, bite=0.12, bite_depth=(0.6, 1.5)), block=(0.9, 0.55, width),
             foot=-(spring - 1.5), mat_world=base @ T(xc, 0, 0),
             opening=lambda x, z, _m=mask, _xc=xc: _m(x + _xc, z), exposed_ends=False)
    # fallen span: a heap of voussoirs under the gone bay
    gx = x0 + pier_w + 1 * (bay + pier_w) + bay / 2
    B.mound(base @ T(gx, 0.5, 0), 4.2, 3.0, 1.4)
    B.scree(base @ T(gx, 0.5, 0), 4.2, 3.0, 1.4, 22, 0.8)
    debris(B, 12, base, spread=(6, 5), bias=(gx, 0.5), size=(1.1, 0.6, 0.9), sink=0.3)
    debris(B, 6, base, spread=(10, 4), bias=(x0 + total * 0.75, 1.5), size=(0.9, 0.55, 0.7))
    B.finish()


def keep():
    """46-60 m, centre: the royal keep. Facade with three lancets and a broken
    gable, a great round tower on the left, a lower tower on the right where
    the bridge arrives (the moon sits in its broken crown), nave walls behind,
    curtain walls out to both sides."""
    rz = math.radians(-6)
    M = frame(rz, (-2.0, 50.0))
    B = Masonry('keep', DARK, inset=0.0, bevel=0.0, noise_amp=0.025, moss=0.8)
    w = 18.0
    gable = profile([(-9, 10.5), (-6.5, 11.8), (-4.0, 14.0), (-2.2, 16.0), (-1.0, 17.2), (0.5, 16.3),
                     (2.5, 13.2), (4.5, 10.6), (6.0, 8.0), (9, 9.6)], jag=0.5, bite=0.1, bite_depth=(1.2, 3.0))
    lan = union(lancet(-4.2, 2.2, 4.5, 11.0), lancet(0.0, 2.6, 5.0, 13.5), lancet(4.2, 2.2, 4.5, 10.0),
                lancet(0.0, 3.6, 0.0, 6.2))
    wall(B, w, gable, block=(0.9, 0.5, 2.2), gap=0.04, foot=2.5, mat_world=M, opening=lan, keep=0.85,
         string=(4.2, 9.0), ivy=0.08, rubble=1.2)
    for px, ph in ((-6.4, 9.5), (-2.1, 12.0), (2.1, 11.0), (6.4, 7.5)):
        wall(B, 1.3, profile([(-1, ph + rng.uniform(-0.6, 0.6)), (1, ph + rng.uniform(-0.6, 0.6))], jag=0.3, bite=0.0),
             block=(0.75, 0.5, 1.0), gap=0.04, foot=2.5, mat_world=M @ T(px, -1.5, 0))
    for sx, h in ((-7.9, 8.0), (6.3, 6.5)):
        Mn = M @ T(sx, 8.0, 0) @ Matrix.Rotation(math.radians(90), 4, 'Z')
        wall(B, 14.0, profile([(-7, h - 1.5), (-3, h + 1.2), (0, h - 2.5), (3, h + 0.5), (7, h - 3)], jag=0.5),
             block=(0.9, 0.5, 1.6), gap=0.04, foot=2.5, mat_world=Mn, exposed_ends=False, ivy=0.0)
    Mt = M @ T(-8.0, 1.5, 0)
    tower(B, 3.2, lambda t: 18.5 - 6.5 * sstep(3.2, 4.2, t) * sstep(6.0, 5.2, t) + 0.5 * math.sin(t * 5 + 1)
          + 0.35 * noise.noise(Vector((math.cos(t) * 2, math.sin(t) * 2, 3.3))),
          block=(0.95, 0.52, 1.5), gap=0.04, foot=2.5, mat_world=Mt, merlons=True, string=(6.0, 12.0),
          opening=lambda t, z: (abs(((t - 4.7 + math.pi) % (2 * math.pi)) - math.pi) < 0.3 and 8.5 < z < 11.5))
    Mr = M @ T(8.2, 2.5, 0)
    tower(B, 2.5, lambda t: 13.5 - 4.0 * sstep(0.2, 1.4, t) * sstep(3.0, 2.0, t) + 0.4 * math.sin(t * 6)
          + 0.3 * noise.noise(Vector((math.cos(t) * 2, math.sin(t) * 2, 7.7))),
          block=(0.85, 0.5, 1.3), gap=0.04, foot=2.5, mat_world=Mr, merlons=True, string=(5.0,))
    Ml = frame(math.radians(10), (-22.0, 51.0))
    wall(B, 16.0, profile([(-8, 7), (-4, 9.5), (-1, 5.5), (2, 10.0), (8, 6.5)], jag=0.6), block=(0.9, 0.5, 1.8),
         gap=0.04, foot=2.5, mat_world=Ml, merlons=True, rubble=1.0)
    Mc = frame(math.radians(16), (18.5, 55.5))
    wall(B, 16.0, profile([(-8, 8.0), (-3, 6.0), (0, 3.5), (3, 7.5), (8, 5.0)], jag=0.6), block=(0.9, 0.5, 1.8),
         gap=0.04, foot=2.5, mat_world=Mc, merlons=True, rubble=1.0)
    debris(B, 12, M, spread=(16, 5), bias=(0, -3), size=(1.1, 0.6, 0.8), sink=0.3)
    B.finish()
    # two lit windows deep in the keep: tiny panes behind the lancets / tower slits
    G = Masonry('glow', GLOW, bevel=0.0, inset=0.0, noise_amp=0.0)
    G.block((0.45, 0.05, 1.3), M @ T(4.2, 0.9, 7.0), exposed=(), jitter=0, tilt=0)
    G.block((0.35, 0.05, 1.1), Mt @ T(3.2 * math.cos(4.7) * 0.55, 3.2 * math.sin(4.7) * 0.55, 10.0), exposed=(), jitter=0, tilt=0)
    G.finish()


def aqueduct():
    """40-46 m, far left: three arches of an aqueduct, one span fallen."""
    base = frame(math.radians(-14), (-19.0, 43.0))
    B = Masonry('aqueduct', DARK, inset=0.0, bevel=0.0, noise_amp=0.02)
    pier_w, bay, deck, width = 1.6, 5.4, 9.0, 2.4
    n = 3
    total = n * bay + (n + 1) * pier_w
    x0 = -total / 2
    for i in range(n + 1):
        xc = x0 + pier_w / 2 + i * (bay + pier_w)
        pr = flat(deck + 0.6, jag=0.2, bite=0.0) if i != 3 else profile([(-1, 5.4), (1, 3.4)], jag=0.2, bite=0.0)
        wall(B, pier_w, pr, block=(0.8, 0.5, width), foot=3.0, mat_world=base @ T(xc, 0, 0), ivy=0.0)
    for i in range(n):
        xs = x0 + pier_w + i * (bay + pier_w)
        xc = xs + bay / 2
        r = bay / 2
        spring = deck - r - 1.2
        keep_ = (0.0, 1.0) if i < 2 else (0.0, 0.4)
        arch(B, r, 0.9, width, spring, n=11, keep=keep_, mat_world=base @ T(xc, 0, 0))
        if i < 2:
            def mask(x, z, _xc=xc, _r=r, _s=spring):
                return math.hypot(x - _xc, z - _s) < _r + 0.85 and z > _s - 0.2
            wall(B, bay + pier_w, flat(deck + 0.6, jag=0.35, bite=0.14, bite_depth=(0.5, 1.4)), block=(0.8, 0.5, width),
                 foot=-(spring - 1.2), mat_world=base @ T(xc, 0, 0),
                 opening=lambda x, z, _m=mask, _xc=xc: _m(x + _xc, z), exposed_ends=False, ivy=0.0)
    B.mound(base @ T(total / 2 - 3, 1, 0), 3.5, 2.5, 1.1)
    debris(B, 8, base, spread=(8, 4), bias=(total / 2 - 3, 1), size=(1.0, 0.55, 0.8))
    B.finish()


def far_ring():
    """70-110 m: silhouettes only. stone_far: the site fades these into flat
    atmospheric layers, so they carry shape, not masonry."""
    B = Masonry('far', FAR, inset=0.0, bevel=0.0, noise_amp=0.06, moss=0.0, tint=(0.6, 0.8))
    for x, y, r, h, bite in ((-14, 80, 4.0, 22, 1.0), (-28, 95, 5.0, 20, 3.5), (12, 96, 4.5, 24, 2.0),
                             (36, 84, 3.2, 18, 1.5), (-50, 70, 3.0, 14, 0.8), (26, 72, 3.0, 16, 0.0)):
        tower(B, r, lambda t, h=h, bite=bite: h - 6 * bite * sstep(bite, bite + 1.4, t) * sstep(bite + 3, bite + 1.8, t)
              + 0.8 * math.sin(t * 4) + 0.8 * noise.noise(Vector((math.cos(t) * 1.5, math.sin(t) * 1.5, h))),
              block=(1.5, 0.95, 2.5), gap=0.06, foot=4.0, mat_world=frame(0, (x, y)), taper=0.02, merlons=True,
              ivy=0.0, loose=False)
    for x, y, rz, L, h in ((-8, 86, -8, 30, 16), (30, 80, 20, 24, 12), (-44, 82, 25, 22, 13), (0, 110, 0, 46, 20)):
        wall(B, L, profile([(-L / 2, h * 0.6), (-L / 4, h), (0, h * 0.5), (L / 4, h * 0.9), (L / 2, h * 0.4)], jag=1.0,
                           bite=0.15, bite_depth=(2, 5)),
             block=(1.5, 0.95, 3.0), gap=0.06, foot=4.0, mat_world=frame(math.radians(rz), (x, y)), merlons=True,
             ivy=0.0, loose=False)
    B.finish()


def far_castle():
    """The kingdom's castle on a crag across the valley, far left: curtain
    wall, drum towers with conical spires, a tall keep with one great spire,
    one tower broken. Low-poly - it only has to hold its silhouette."""
    cx, cy = -47.0, 121.0
    B = Masonry('castle', FAR, bevel=0.0, inset=0.0, noise_amp=0.03, moss=0.0, tint=(0.6, 0.75))
    G = frame(math.radians(8), (cx, cy))
    # the crag: a long lumpy hill with a steeper face toward the valley
    B.mound(G @ T(0, 0, -1.0), 30.0, 16.0, 10.0, rings=6, segs=20)
    B.mound(G @ T(-14, 4, -1.0), 16.0, 10.0, 8.0, rings=4, segs=14)
    top = 8.0

    def drum(x, y, r, h, roof, broken=False):
        m = G @ T(x, y, top - 2.0)
        B.lathe([(r, 0.0), (r * 0.97, h)], 12, m, top_jitter=0.8 if broken else 0.0, slant=0.6 if broken else 0.0)
        if broken:
            return
        B.lathe([(r * 1.12, 0.0), (r * 1.12, 0.6)], 12, m @ T(0, 0, h))
        B.lathe([(r * 1.15, 0.0), (0.0, roof)], 12, m @ T(0, 0, h + 0.6))
    # curtain wall between the towers
    for (xa, ya), (xb, yb), hh in (((-9, -3), (9, -3), 5.0), ((9, -3), (8, 5), 4.5), ((-9, -3), (-10, 5), 5.0)):
        L = math.hypot(xb - xa, yb - ya)
        mm = G @ T((xa + xb) / 2, (ya + yb) / 2, top - 2.0) @ Matrix.Rotation(math.atan2(yb - ya, xb - xa), 4, 'Z')
        wall(B, L, profile([(-L / 2, hh + 2), (0, hh + 1.6), (L / 2, hh + 2)], jag=0.3, bite=0.06, bite_depth=(1.5, 3)),
             block=(1.6, 1.0, 1.4), gap=0.05, foot=2.0, mat_world=mm, merlons=True, mixed=0.5, ivy=0.0, loose=False)
    drum(-9, -3, 1.8, 9.0, 6.0)
    drum(9, -3, 1.6, 7.5, 5.0)
    drum(8, 5, 1.4, 6.5, 0, broken=True)
    drum(-10, 5, 1.5, 8.0, 5.5)
    # the keep: a block with a tall slender spire and two lesser ones
    B.block((7.0, 6.0, 12.0), G @ T(0, 1.5, top - 2.0 + 6.0), exposed=(), jitter=0, tilt=0)
    B.block((7.6, 6.6, 0.8), G @ T(0, 1.5, top + 10.4), exposed=(), jitter=0, tilt=0)
    B.lathe([(1.5, 0.0), (1.4, 4.0)], 10, G @ T(0.5, 1.5, top + 10.8))
    B.lathe([(1.7, 0.0), (0.0, 10.0)], 10, G @ T(0.5, 1.5, top + 14.8))
    for x, y, r, h, roof in ((-3.0, -1.0, 0.8, 13.5, 4.5), (3.2, 3.6, 0.7, 12.5, 4.0)):
        B.lathe([(r, 0.0), (r * 0.95, h)], 8, G @ T(x, y, top - 2.0))
        B.lathe([(r * 1.15, 0.0), (0.0, roof)], 8, G @ T(x, y, top - 2.0 + h))
    B.finish()


near_ring()
mid_near()
bridge()
keep()
aqueduct()
far_ring()
far_castle()
dead_trees([(-15.5, 23.5, 7.0, -0.15), (22.5, 22.5, 5.5, 0.25), (-21.0, 31.0, 8.5, 0.1), (21.5, 33.0, 6.5, -0.2)])
build_ivy()

# ---------- checks ----------

fwd = (CAM_AIM - CAM_POS).normalized()
right = fwd.cross(Vector((0, 0, 1))).normalized()
up = right.cross(fwd)
tan_v = math.tan(FOV_V / 2)
tan_h = tan_v * ASPECT


def project(P):
    """P: (n,3) world -> (sx, sy from top, depth) arrays."""
    d = P - np.array(CAM_POS)
    z = d @ np.array(fwd)
    x = d @ np.array(right)
    y = d @ np.array(up)
    zz = np.where(z > 1e-3, z, 1e-3)
    sx = (x / zz / tan_h + 1) / 2
    sy = (1 - y / zz / tan_v) / 2
    return sx, sy, z


tris = verts = 0
nav = logo = 0
nav_objs, logo_objs, clear_objs, near_objs = set(), set(), set(), set()
lo = np.full(3, 1e9)
hi = np.full(3, -1e9)
for o in bpy.context.scene.objects:
    if o.type != 'MESH':
        continue
    me = o.data
    t_o = sum(len(p.vertices) - 2 for p in me.polygons)
    print(f'  {o.name:14s} tris {t_o:7d} verts {len(me.vertices):7d}')
    tris += t_o
    verts += len(me.vertices)
    P = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', P)
    P = P.reshape(-1, 3)
    if o.matrix_world != Matrix.Identity(4):
        P = P @ np.array(o.matrix_world.to_3x3()).T + np.array(o.matrix_world.translation)
    E = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get('vertices', E)
    E = E.reshape(-1, 2)
    S = np.concatenate([P] + [P[E[:, 0]] * (1 - t) + P[E[:, 1]] * t for t in (0.25, 0.5, 0.75)])
    lo = np.minimum(lo, P.min(0))
    hi = np.maximum(hi, P.max(0))
    sx, sy, z = project(S)
    vis = (z > 0) & (sx >= 0) & (sx <= 1) & (sy >= 0) & (sy <= 1)
    m_nav = vis & (sx > 0.7) & (sy < 0.12)
    m_logo = vis & (sx < 0.25) & (sy < 0.10)
    n_nav, n_logo = int(m_nav.sum()), int(m_logo.sum())
    for label, mask in (('nav', m_nav), ('logo', m_logo)):
        if mask.any():
            print(f'    {o.name} {label}: x[{S[mask, 0].min():.1f},{S[mask, 0].max():.1f}] '
                  f'y[{S[mask, 1].min():.1f},{S[mask, 1].max():.1f}] z[{S[mask, 2].min():.1f},{S[mask, 2].max():.1f}]')
    nav += n_nav
    logo += n_logo
    if n_nav:
        nav_objs.add(o.name)
    if n_logo:
        logo_objs.add(o.name)
    inclear = (P[:, 0] > CLEAR[0]) & (P[:, 0] < CLEAR[1]) & (P[:, 1] > CLEAR[2]) & (P[:, 1] < CLEAR[3])
    if inclear.any():
        clear_objs.add(o.name)
    dist = np.hypot(P[:, 0], P[:, 1])
    if (dist < MIN_DIST).any():
        near_objs.add(o.name)
print(f'TRIS {tris} VERTS {verts}')
print(f'NAV-ZONE samples {nav} {sorted(nav_objs) or ""}')
print(f'LOGO-ZONE samples {logo} {sorted(logo_objs) or ""}')
print('CLEAR-ZONE INTRUDERS', sorted(clear_objs) or 'none')
print(f'WITHIN-{MIN_DIST:.0f}M INTRUDERS', sorted(near_objs) or 'none')
print(f'BBOX blender x[{lo[0]:.1f},{hi[0]:.1f}] y[{lo[1]:.1f},{hi[1]:.1f}] z[{lo[2]:.1f},{hi[2]:.1f}]')
print(f'OBJECTS {len([o for o in bpy.context.scene.objects if o.type == "MESH"])}')

if '--no-export' not in sys.argv:
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
              export_materials='EXPORT', export_normals=True)
    try:
        bpy.ops.export_scene.gltf(**kw, export_vertex_color='ACTIVE')
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    print('EXPORTED', OUT, os.path.getsize(OUT), 'bytes (float; run tools/optimize-assets.sh)')
