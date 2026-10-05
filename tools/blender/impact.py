"""Ground where a sword was driven in: three variants of cracked, heaved earth.

blender -b --factory-startup -P tools/blender/impact.py [-- preview] [-- only a]
Writes assets/env/impact-a.glb, impact-b.glb, impact-c.glb (Y up).
With `preview` it also re-imports each GLB and renders %TEMP%/impact-<v>.png
(3/4 view, hard cold light) and impact-<v>-top.png.

Blender space (Z up): origin = blade entry point, flat ground is z = 0, blade
along +Z with its width on X and thickness on Y (same as the weapons). A slot
0.06 x 0.012 at its floor (z = -0.08) opens to ~0.09 x 0.04 at the surface so
a blade leaning up to 16 deg clears the walls.

Build: one heightfield disc (polar grid, feathered to z = 0 at the rim) with
radial fissure grooves; on top of it a Voronoi crust of flat plates separated
by cracks, the inner ones heaved up by the blade; clods and stones thrown
mostly in one direction. One material + vertex colours.
"""
import math
import os
import random
import sys

sys.path.append(os.path.dirname(__file__))
import bpy
import bmesh
from mathutils import Vector, noise
from forge_bl import reset, mat, srgb, from_bmesh, ROOT

OUT_DIR = os.path.join(ROOT, 'assets', 'env')
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

R_OUT = 0.55          # footprint radius -> 1.10 m diameter
R_PLATES = 0.42       # crust plates live inside this
R_INNER = 0.062       # no plates closer to the blade than this (loose dirt)
T_CRUST = 0.012       # crack depth: base sits this far under the plate tops
SLOT_FLOOR = (0.030, 0.006, -0.08)   # half sizes x, y and depth
SLOT_OPEN = (0.045, 0.020)           # half sizes at the surface

EARTH = srgb('#3b3429')
STONE = srgb('#4b4a46')

VARIANTS = {
    'a': dict(seed=11, scatter=math.radians(200), fissures=(10, 95, 175, 250, 320)),
    'b': dict(seed=23, scatter=math.radians(60), fissures=(30, 120, 210, 300)),
    'c': dict(seed=37, scatter=math.radians(-70), fissures=(0, 70, 150, 220, 290, 345)),
}


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def smoothstep(e0, e1, x):
    t = clamp((x - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)


def fbm(x, y, z=0.0, octaves=3, scale=1.0):
    v, amp, f = 0.0, 1.0, scale
    for _ in range(octaves):
        v += amp * noise.noise(Vector((x * f, y * f, z * f)))
        amp *= 0.5
        f *= 2.1
    return v  # roughly -1.2 .. 1.2


class Ground:
    """Heightfield of the crust top surface for one variant."""

    def __init__(self, cfg):
        self.rng = random.Random(cfg['seed'])
        self.off = self.rng.uniform(0, 100)   # noise offset so variants differ
        self.sdir = cfg['scatter']
        self.fiss = [(math.radians(a) + self.rng.uniform(-0.08, 0.08),
                      self.rng.uniform(0.7, 1.0)) for a in cfg['fissures']]

    def feather(self, r):
        return smoothstep(R_OUT, R_OUT - 0.14, r)

    def fissure_terms(self, x, y):
        """List of (u along fissure, lateral distance to its wobbly line, strength)."""
        out = []
        for ang, strength in self.fiss:
            c, s = math.cos(ang), math.sin(ang)
            u = x * c + y * s
            v = -x * s + y * c
            if u < 0:
                continue
            wob = 0.004 * fbm(u * 6 + self.off, ang * 3, 0, 2)
            out.append((u, v - wob, strength))
        return out

    def h(self, x, y):
        r = math.hypot(x, y)
        a = math.atan2(y, x)
        f = self.feather(r)
        # heap is lopsided toward the scatter side and lumpy around the ring
        bias = 1 + 0.35 * math.cos(a - self.sdir) + 0.22 * fbm(math.cos(a) * 1.3, math.sin(a) * 1.3, self.off, 2)
        rr = r * (1 + 0.12 * fbm(math.cos(a) * 2, math.sin(a) * 2, 3 + self.off, 2))
        mound = 0.040 * bias * math.exp(-((rr - 0.10) / 0.11) ** 2)
        dip = -0.08 * math.exp(-(r / 0.06) ** 2)
        skirt = 0.012 * bias * math.exp(-((rr - 0.25) / 0.15) ** 2)
        n = 0.008 * fbm(x + self.off, y, 0, 3, scale=7.0) * (0.35 + 0.65 * f)
        n += 0.0015 * fbm(x, y + self.off, 0, 2, scale=40.0)
        groove = 0.0
        for u, d, strength in self.fissure_terms(x, y):
            w = 0.007 + 0.014 * (1 - smoothstep(0.05, 0.6, u))
            depth = 0.016 * strength * (1 - smoothstep(0.2, 0.52, u)) * smoothstep(0.03, 0.09, u)
            groove = max(groove, depth * math.exp(-(d / w) ** 2))
        return (mound + dip + skirt + n - groove) * f

    def grad(self, x, y, e=0.004):
        return ((self.h(x + e, y) - self.h(x - e, y)) / (2 * e),
                (self.h(x, y + e) - self.h(x, y - e)) / (2 * e))

    def crack_width(self, mx, my, ex, ey):
        """Gap between plates for an edge with midpoint m and direction e."""
        r = math.hypot(mx, my)
        g = 0.002 + 0.005 * (1 - smoothstep(0.1, 0.36, r))
        el = math.hypot(ex, ey) or 1.0
        radial = abs((ex * mx + ey * my) / (el * (r or 1.0)))
        for u, d, strength in self.fissure_terms(mx, my):
            prox = math.exp(-(d / 0.035) ** 2)
            g += 0.030 * strength * radial * prox * (1 - smoothstep(0.12, 0.45, u))
        return g

    def groove_dark(self, x, y):
        """0..1 how much a point sits in a fissure groove (for colour)."""
        k = 0.0
        for u, d, strength in self.fissure_terms(x, y):
            w = 0.006 + 0.02 * (1 - smoothstep(0.05, 0.6, u))
            k = max(k, strength * math.exp(-(d / w) ** 2) * (1 - smoothstep(0.2, 0.52, u)))
        return k


# ---------- 2D polygon helpers (Vectors with z = 0) ----------

def clip_half(poly, p, n):
    """Keep the part of convex `poly` where (q - p) . n <= 0."""
    out = []
    m = len(poly)
    for i in range(m):
        a, b = poly[i], poly[(i + 1) % m]
        da, db = (a - p).dot(n), (b - p).dot(n)
        if da <= 0:
            out.append(a)
        if (da < 0 < db) or (db < 0 < da):
            out.append(a + (b - a) * (da / (da - db)))
    return out


def dedupe(poly, eps=1e-5):
    out = []
    for q in poly:
        if not out or (q - out[-1]).length > eps:
            out.append(q)
    if len(out) > 1 and (out[0] - out[-1]).length <= eps:
        out.pop()
    return out


def area2(poly):
    return sum(poly[i].x * poly[(i + 1) % len(poly)].y - poly[(i + 1) % len(poly)].x * poly[i].y
               for i in range(len(poly))) / 2


def inset(poly, dists):
    """Move every edge k inward by dists[k]; polygon must be CCW and convex."""
    m = len(poly)
    lines = []
    for k in range(m):
        a, b = poly[k], poly[(k + 1) % m]
        e = (b - a)
        n = Vector((-e.y, e.x, 0)).normalized()
        lines.append((a + n * dists[k], e))
    out = []
    for k in range(m):
        (p1, d1), (p2, d2) = lines[k - 1], lines[k]
        den = d1.x * d2.y - d1.y * d2.x
        if abs(den) < 1e-12:
            return None
        t = ((p2.x - p1.x) * d2.y - (p2.y - p1.y) * d2.x) / den
        out.append(p1 + d1 * t)
    # still convex and not flipped?
    for k in range(m):
        a, b, c = out[k - 1], out[k], out[(k + 1) % m]
        if (b - a).cross(c - b).z <= 0:
            return None
    return out if area2(out) > 3e-4 else None


# ---------- builders ----------

class Builder:
    def __init__(self, cfg):
        self.g = Ground(cfg)
        self.rng = self.g.rng
        self.bm = bmesh.new()
        self.col = self.bm.loops.layers.float_color.new('Color')

    def face(self, verts, color):
        try:
            f = self.bm.faces.new(verts)
        except ValueError:
            return None
        for l in f.loops:
            l[self.col] = (*color, 1.0)
        return f

    def shade(self, base, k):
        return tuple(c * k for c in base)

    # -- base heightfield disc with the blade slot --
    def base(self):
        g = self.g
        SEG, N = 120, 60
        rings = []
        ring_cols = []

        def slot_pt(j, hx, hy, p=0.55):
            t = 2 * math.pi * j / SEG
            c, s = math.cos(t), math.sin(t)
            return (hx * math.copysign(abs(c) ** p, c), hy * math.copysign(abs(s) ** p, s))

        # slot floor centre + floor ring + wall ring (dark)
        vc = self.bm.verts.new((0, 0, SLOT_FLOOR[2]))
        floor = [self.bm.verts.new((*slot_pt(j, SLOT_FLOOR[0], SLOT_FLOOR[1]), SLOT_FLOOR[2])) for j in range(SEG)]
        rings.append(floor)
        ring_cols.append([self.shade(EARTH, 0.25)] * SEG)
        for j in range(SEG):
            self.face((vc, floor[j], floor[(j + 1) % SEG]), self.shade(EARTH, 0.25))
        wall = []
        for j in range(SEG):
            x, y = slot_pt(j, (SLOT_FLOOR[0] + SLOT_OPEN[0]) / 2, (SLOT_FLOOR[1] + SLOT_OPEN[1]) / 2)
            wall.append(self.bm.verts.new((x, y, SLOT_FLOOR[2] * 0.55)))
        rings.append(wall)
        ring_cols.append([self.shade(EARTH, 0.3)] * SEG)

        for i in range(N + 1):
            t = i / N
            r = R_INNER * 0.75 + (R_OUT - R_INNER * 0.75) * t ** 1.5
            w = smoothstep(0, 7, i)
            ring, cols = [], []
            for j in range(SEG):
                a = 2 * math.pi * j / SEG
                sx, sy = slot_pt(j, SLOT_OPEN[0], SLOT_OPEN[1])
                x = (1 - w) * sx + w * r * math.cos(a)
                y = (1 - w) * sy + w * r * math.sin(a)
                if i == N:
                    z = 0.0
                else:
                    if i > 0:
                        x += 0.004 * fbm(x * 30, y * 30, 1 + g.off, 1) * w
                        y += 0.004 * fbm(x * 30, y * 30, 2 + g.off, 1) * w
                    under = self.under_plate(x, y)
                    z = g.h(x, y) - T_CRUST * under
                ring.append(self.bm.verts.new((x, y, z)))
                rr = math.hypot(x, y)
                k = 0.95 + 0.07 * fbm(x * 1.5, y * 1.5, 5 + g.off, 2, scale=28)
                k *= 1 - 0.55 * under                                  # under the crust: dark
                k *= 1 - 0.5 * g.groove_dark(x, y)                     # fissure floors
                k *= 1 - 0.35 * (1 - smoothstep(0.03, 0.09, rr))       # AO against the blade
                cols.append(self.shade(EARTH, k))
            rings.append(ring)
            ring_cols.append(cols)

        for i in range(len(rings) - 1):
            A, B = rings[i], rings[i + 1]
            ca, cb = ring_cols[i], ring_cols[i + 1]
            for j in range(SEG):
                j2 = (j + 1) % SEG
                f = self.bm.faces.new((A[j], A[j2], B[j2], B[j]))
                for l, c in zip(f.loops, (ca[j], ca[j2], cb[j2], cb[j])):
                    l[self.col] = (*c, 1.0)

    # -- Voronoi crust plates --
    def plates(self):
        g, rng = self.g, self.rng
        seeds = []

        def min_dist(r):
            return 0.085 if r < 0.14 else 0.058 + 0.15 * (r - 0.14)

        tries = 0
        while tries < 6000 and len(seeds) < 140:
            tries += 1
            a = rng.uniform(0, 2 * math.pi)
            r = math.sqrt(rng.uniform(0.09 ** 2, 0.47 ** 2))
            p = Vector((r * math.cos(a), r * math.sin(a), 0))
            md = min_dist(r)
            if all((p - q).length > (md + min_dist(q.length)) / 2 for q in seeds):
                seeds.append(p)
        # mirror the seeds that sit near a fissure across it, so a Voronoi edge
        # runs exactly along the fissure and the crack there becomes continuous
        mirrored = []
        for ang, _ in g.fiss:
            c, sn = math.cos(ang), math.sin(ang)
            for p in seeds:
                u = p.x * c + p.y * sn
                v = -p.x * sn + p.y * c
                if u > 0.04 and 0.004 < abs(v) < 0.07:
                    q = Vector((u * c + v * sn, u * sn - v * c, 0))
                    if all((q - o).length > 0.02 for o in seeds + mirrored):
                        mirrored.append(q)
        seeds += mirrored
        # the slabs the blade heaved: 2-3 of the innermost seeds, spread apart
        inner = sorted((s for s in seeds if s.length < 0.16), key=lambda s: s.length)
        self.lifted = []
        for s in inner:
            if len(self.lifted) >= 3:
                break
            if all(abs((math.atan2(s.y, s.x) - math.atan2(l.y, l.x) + math.pi) % (2 * math.pi) - math.pi) > 1.0
                   for l in self.lifted):
                self.lifted.append(s)
        disc = [Vector((R_PLATES * math.cos(2 * math.pi * k / 48), R_PLATES * math.sin(2 * math.pi * k / 48), 0))
                for k in range(48)]
        self.max_top = -1
        for s in seeds:
            if s.length > 0.38:
                continue
            poly = disc
            for s2 in seeds:
                if s2 is s:
                    continue
                poly = clip_half(poly, (s + s2) / 2, (s2 - s).normalized())
                if len(poly) < 3:
                    break
            if s.length < 0.16:
                d = s.normalized()
                poly = clip_half(poly, d * R_INNER, -d)
            poly = dedupe(poly)
            if len(poly) < 3:
                continue
            if area2(poly) < 0:
                poly.reverse()
            dists = []
            for k in range(len(poly)):
                a, b = poly[k], poly[(k + 1) % len(poly)]
                mid = (a + b) / 2
                dists.append(g.crack_width(mid.x, mid.y, b.x - a.x, b.y - a.y) / 2)
            cell = poly
            poly = inset(poly, dists)
            if not poly:
                continue
            self.cells.append(cell)
            # rough up the outline a little so edges are not razor straight
            poly = [p + Vector((0.002 * fbm(p.x * 40, p.y * 40, 9 + g.off, 1),
                                0.002 * fbm(p.x * 40, p.y * 40, 10 + g.off, 1), 0)) for p in poly]
            self.plate(poly, s, s in self.lifted)

    def under_plate(self, x, y):
        """1 if (x, y) lies under one of the crust cells (crack included), else 0."""
        if math.hypot(x, y) > R_PLATES:
            return 0.0
        p = Vector((x, y, 0))
        for cell in self.cells:
            m = len(cell)
            if all((cell[(k + 1) % m] - cell[k]).cross(p - cell[k]).z >= 0 for k in range(m)):
                return 1.0
        return 0.0

    def plate(self, poly, s, lifted):
        g, rng = self.g, self.rng
        c = sum(poly, Vector()) / len(poly)
        hc = g.h(c.x, c.y)
        gx, gy = g.grad(c.x, c.y)
        d = s.normalized()
        hinge = max(p.dot(d) for p in poly)
        lift = 0.0
        size = math.sqrt(area2(poly))
        outer = smoothstep(0.26, 0.37, c.length)          # outer plates sink flush into the dirt
        curl = rng.uniform(0.002, 0.006) * (1 + lifted) * (1 - outer)
        if lifted:
            lift = math.radians(rng.uniform(18, 32))
            span = hinge - min(p.dot(d) for p in poly)
            plane_top = max(hc + gx * (p.x - c.x) + gy * (p.y - c.y) for p in poly)
            room = 0.082 - plane_top - curl
            lift = min(lift, math.atan(room / span)) if room > 0.008 else 0.0
        tilt = (math.radians(rng.uniform(-2, 2)) * 0.08 / max(size, 0.04) * (1 - outer),
                math.radians(rng.uniform(-2, 2)) * 0.08 / max(size, 0.04) * (1 - outer))
        thick = rng.uniform(0.010, 0.016)
        tone = 1.0 + (0.22 if lifted else 0.05 * (1 - outer)) + 0.08 * fbm(c.x * 3, c.y * 3, 20 + g.off, 2, scale=10)

        def top_z(p, edge=True):
            z = hc + gx * (p.x - c.x) + gy * (p.y - c.y)
            z += math.tan(tilt[0]) * (p.x - c.x) + math.tan(tilt[1]) * (p.y - c.y)
            if lift:
                z += math.tan(lift) * (hinge - p.dot(d))
            return z + (curl if edge else 0.0) + 0.001 - 0.004 * outer

        top = [self.bm.verts.new((p.x, p.y, top_z(p))) for p in poly]
        mid = self.bm.verts.new((c.x, c.y, top_z(c, False)))
        # flat plates are buried deep so no gap shows; heaved ones keep a real thickness
        depth = thick if lifted else 0.03
        bot = [self.bm.verts.new((p.x, p.y, top_z(p) - depth)) for p in poly]
        self.max_top = max(self.max_top, max(v.co.z for v in top))
        m = len(poly)
        for k in range(m):
            k2 = (k + 1) % m
            kk = 1 + 0.05 * fbm(poly[k].x * 50, poly[k].y * 50, 30 + g.off, 1)
            self.face((mid, top[k], top[k2]), self.shade(EARTH, tone * kk))
            self.face((top[k2], top[k], bot[k], bot[k2]), self.shade(EARTH, 0.6 * tone))
        self.face(list(reversed(bot)), self.shade(EARTH, 0.35))

    # -- clods and stones --
    def clod(self, x, y, size, color, detail, squash, rough):
        g, rng = self.g, self.rng
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=detail, radius=1.0)
        off = Vector((rng.uniform(0, 50), rng.uniform(0, 50), rng.uniform(0, 50)))
        sc = Vector((rng.uniform(0.75, 1.3), rng.uniform(0.75, 1.3), squash))
        for v in tmp.verts:
            n = noise.noise(v.co * 1.6 + off)
            v.co = v.co * (1 + rough * n)
            v.co = Vector((v.co.x * sc.x, v.co.y * sc.y, v.co.z * sc.z)) * size
        rot = Vector((rng.uniform(0, 6.3), rng.uniform(0, 6.3), rng.uniform(0, 6.3)))
        bmesh.ops.rotate(tmp, cent=(0, 0, 0), matrix=rot.to_track_quat('Z', 'Y').to_matrix(), verts=tmp.verts[:])
        zmin = min(v.co.z for v in tmp.verts)
        base_z = g.h(x, y) - 0.45 * size
        bmesh.ops.translate(tmp, vec=(x, y, base_z - zmin), verts=tmp.verts[:])
        over = max(v.co.z for v in tmp.verts) - 0.088
        if over > 0:
            bmesh.ops.translate(tmp, vec=(0, 0, -over), verts=tmp.verts[:])
        self.max_top = max(self.max_top, max(v.co.z for v in tmp.verts))
        vmap = {v: self.bm.verts.new(v.co) for v in tmp.verts}
        for f in tmp.faces:
            k = 1 + 0.12 * noise.noise(f.calc_center_median() * 60 + off)
            self.face([vmap[v] for v in f.verts], self.shade(color, k))
        tmp.free()

    def debris(self):
        g, rng = self.g, self.rng

        def scatter_pos(lo, hi, cone, any_dir=0.25):
            if rng.random() < any_dir:
                a = rng.uniform(0, 6.28)
            else:
                a = g.sdir + rng.gauss(0, cone)
            r = lo + abs(rng.gauss(0, 1)) * (hi - lo) / 2.2
            r = min(r, hi)
            return r * math.cos(a), r * math.sin(a)

        for _ in range(30):   # clods
            x, y = scatter_pos(0.11, 0.50, 0.5)
            size = clamp(rng.lognormvariate(math.log(0.017), 0.4), 0.009, 0.032)
            self.clod(x, y, size, EARTH, 2 if size > 0.02 else 1, rng.uniform(0.5, 0.8), 0.42)
        for _ in range(44):   # fine crumbs near the blade
            x, y = scatter_pos(0.06, 0.26, 0.7, 0.4)
            size = rng.uniform(0.006, 0.012)
            self.clod(x, y, size, EARTH, 1, rng.uniform(0.6, 0.9), 0.3)
        for _ in range(7):    # stones
            x, y = scatter_pos(0.09, 0.45, 0.6, 0.35)
            size = rng.uniform(0.014, 0.03)
            self.clod(x, y, size, STONE, 1, rng.uniform(0.6, 0.85), 0.45)

    def finish(self, name, material):
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        obj = from_bmesh(name, self.bm, material)
        me = obj.data
        for p in me.polygons:
            p.use_smooth = True
        # safety: nothing may stand above 0.09 m
        for v in me.vertices:
            if v.co.z > 0.084:
                v.co.z = 0.084 + (v.co.z - 0.084) * 0.3
        me.set_sharp_from_angle(angle=math.radians(38))
        me.color_attributes.active_color = me.color_attributes['Color']
        me.color_attributes.render_color_index = 0
        return obj


def earth_material():
    m = mat('impact_earth', (1, 1, 1), metallic=0, roughness=0.95)
    nt = m.node_tree
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'Color'
    nt.links.new(ca.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    return m


def build(vid):
    reset()
    b = Builder(VARIANTS[vid])
    b.max_top = -1
    b.cells = []
    b.plates()
    b.base()
    b.debris()
    obj = b.finish(f'impact_{vid}', earth_material())
    me = obj.data
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    lo = Vector((min(v.co.x for v in me.vertices), min(v.co.y for v in me.vertices), min(v.co.z for v in me.vertices)))
    hi = Vector((max(v.co.x for v in me.vertices), max(v.co.y for v in me.vertices), max(v.co.z for v in me.vertices)))
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f'impact-{vid}.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True,
                              export_yup=True, export_materials='EXPORT',
                              export_vertex_color='ACTIVE')
    print(f'VARIANT {vid} TRIS {tris} VERTS {len(me.vertices)} '
          f'BBOX x[{lo.x:.3f},{hi.x:.3f}] y[{lo.y:.3f},{hi.y:.3f}] z[{lo.z:.3f},{hi.z:.3f}] '
          f'(glTF: x width, z up->y) FILE {path} {os.path.getsize(path)} bytes')
    return path


def preview(vid, path):
    """Re-import the exported GLB and render it under a hard cold light."""
    reset()
    bpy.ops.import_scene.gltf(filepath=path)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x, scene.render.resolution_y = 1400, 1000
    world = bpy.data.worlds.new('w')
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.06, 0.09, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = 0.6

    ground_mat = mat('ground', EARTH, metallic=0, roughness=0.95)
    bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
    bpy.context.active_object.data.materials.append(ground_mat)
    # stand-in blade so the slot can be judged
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.35))
    blade = bpy.context.active_object
    blade.scale = (0.055, 0.008, 0.9)
    blade.rotation_euler = (math.radians(8), 0, 0)
    blade.data.materials.append(mat('blade', (0.6, 0.62, 0.68), metallic=1, roughness=0.3))

    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 6.0
    sun.color = (0.78, 0.84, 1.0)
    sun.angle = math.radians(0.8)
    so = bpy.data.objects.new('sun', sun)
    scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(52), 0, math.radians(-140))

    cam = bpy.data.cameras.new('cam')
    cam.lens = 45
    co = bpy.data.objects.new('cam', cam)
    scene.collection.objects.link(co)
    scene.camera = co
    out = os.environ.get('TEMP', '.')
    for tag, pos in (('', Vector((0.95, -0.95, 0.75))), ('-top', Vector((0.05, -0.4, 1.6)))):
        co.location = pos
        co.rotation_euler = (Vector((0, 0, 0.02)) - pos).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(out, f'impact-{vid}{tag}.png')
        bpy.ops.render.render(write_still=True)
        print('PREVIEW', scene.render.filepath)


only = ARGS[ARGS.index('only') + 1] if 'only' in ARGS else None
for vid in VARIANTS:
    if only and vid != only:
        continue
    p = build(vid)
    if 'preview' in ARGS:
        preview(vid, p)
