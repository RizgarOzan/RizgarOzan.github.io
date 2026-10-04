"""Dark Moon Greatsword (Elden Ring), rebuilt for the site.

blender -b --factory-startup -P tools/blender/moonlight_import.py
Writes assets/weapons/moonlight.glb (Y up, +Z face, tip at the origin,
pommel on top, root node "moonlight").

Proportions come from Mohamed_na9911's low-poly STL (thing 7129374, CC-BY-SA)
and replica photos; everything is rebuilt here. Blender space (Z up): the
tip is at z = 0 and the sword stands pommel-up, width on X, thickness on Y,
the viewer-facing side toward -Y (forge_bl convention).

Parts (all parented to the empty "moonlight"):
  moonlight_blade      translucent crystal shell, diamond section, chamfered edges
  moonlight_inner      opaque emissive slab inside it (fakes transmission)
  moonlight_core       bright light line along the spine, both faces
  (engraving)          frost-fern grooves cut 0.5 mm into the shell, faint emissive floors
  moonlight_plates     tilted translucent sheets inside the blade (internal ice)
  moonlight_guard      drooping pewter crossbar with bulbous tips, gnarled
  moonlight_collar     rope ring where the grip meets the guard
  moonlight_grip       cord-wrapped gnarled grip
  moonlight_pommel     ridged knob
"""
import math
import os
import random
import sys

sys.path.append(os.path.dirname(__file__))
import bpy
import bmesh
from mathutils import Vector, noise
from forge_bl import reset, mat, srgb, from_bmesh, smooth, OUT_DIR

TOTAL = 1.70
L_BLADE = 1.20
Z_GUARD = L_BLADE            # guard centre line
Z_GRIP0 = Z_GUARD + 0.028
Z_GRIP1 = 1.615
Z_TOP = TOTAL

W_ROOT = 0.084               # half width at the root
T_ROOT = 0.0145              # half thickness at the spine
EDGE = 0.013                 # width of the edge chamfer

PEWTER = srgb('#8d939c')


def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def n3(x, y, z):
    return noise.noise(Vector((x, y, z)))


# ---------- blade profile ----------

def half_width(s):
    """s = 0 at the root, 1 at the tip. Straight taper, then the point."""
    base = W_ROOT * (1 - 0.34 * s)
    if s <= 0.74:
        return base
    k = (s - 0.74) / 0.26
    return base * (1 - k) ** 1.05 + 1e-4 * (1 - k)


def half_thick(s):
    return T_ROOT * (1 - 0.55 * s) + 0.0005


def section(s, sx=1.0, sy=1.0):
    """16 points (x, y) of the diamond-with-chamfer section, CCW: edge,
    shoulder, two facet points, spine, ... so colour can grade across it."""
    w = half_width(s) * sx
    t = half_thick(s) * sy
    b = min(EDGE * sx, w * 0.45)
    tb = 0.3 * t
    half = [(w, 0), (w - b, tb)]
    for f in (2 / 3, 1 / 3):
        half.append(((w - b) * f, tb + (t - tb) * (1 - f)))
    top = half + [(0, t)] + [(-x, y) for x, y in reversed(half[1:])]
    bot = [(-x, -y) for x, y in top[1:-1]]
    return top + [(-w, 0)] + list(reversed(bot))


def surface_y(x, s):
    """Height of the front facet above the blade's mid plane at (x, s)."""
    w, t = half_width(s), half_thick(s)
    b = min(EDGE, w * 0.45)
    tb = 0.3 * t
    ax = abs(x)
    if ax <= w - b:
        return t - (t - tb) * ax / (w - b)
    return tb * clamp((w - ax) / b)


# ---------- generic loft ----------

def ring_loft(name, rings, material, cap_start=False, pole_end=None, colors=None, smooth_angle=40,
              face_jitter=0.0):
    """rings: list of lists of (x, y, z), all the same length. Optional pole
    vertex at the end and an n-gon cap at the start. colors: per-ring list of
    rgb tuples, written to a 'Color' attribute; face_jitter scales each face's
    colour by a random +-fraction so flat facets catch light differently."""
    bm = bmesh.new()
    col = bm.loops.layers.float_color.new('Color') if colors else None
    V = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rings[0])
    faces = []
    for i in range(len(rings) - 1):
        A, B = V[i], V[i + 1]
        for j in range(n):
            j2 = (j + 1) % n
            f = bm.faces.new((A[j], A[j2], B[j2], B[j]))
            if col:
                for l, c in zip(f.loops, (colors[i][j], colors[i][j2], colors[i + 1][j2], colors[i + 1][j])):
                    l[col] = (*c, 1.0)
    if pole_end is not None:
        p = bm.verts.new(pole_end)
        A = V[-1]
        for j in range(n):
            f = bm.faces.new((A[j], A[(j + 1) % n], p))
            if col:
                for l, c in zip(f.loops, (colors[-1][j], colors[-1][(j + 1) % n], colors[-1][j])):
                    l[col] = (*c, 1.0)
    if cap_start:
        f = bm.faces.new(list(reversed(V[0])))
        if col:
            for l in f.loops:
                l[col] = (*colors[0][0], 1.0)
    if col and face_jitter:
        rng = random.Random(len(rings) * 7 + n)
        for f in bm.faces:
            k = 1 + rng.uniform(-face_jitter, face_jitter)
            for l in f.loops:
                c = l[col]
                l[col] = (c[0] * k, c[1] * k, c[2] * k, 1.0)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = from_bmesh(name, bm, material)
    if colors:
        me = obj.data
        me.color_attributes.active_color = me.color_attributes['Color']
        me.color_attributes.render_color_index = 0
    return smooth(obj, smooth_angle)


# ---------- blade ----------

DEEP = srgb('#0d4a66')
ICE = srgb('#a9e4f7')


def lerp3(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def grade(x, s, lo, hi):
    """Colour at lateral position x, station s: lo at the spine, hi at the
    chamfered edges and toward the tip."""
    l = clamp(abs(x) / max(half_width(s), 1e-4))
    tip = clamp((s - 0.78) / 0.22) ** 1.5
    u = max(l ** 1.7, tip)
    return lerp3(lo, hi, u)


def blade_rings(sx=1.0, sy=1.0, s_end=1.0, n=72, lo=DEEP, hi=ICE):
    rings, cols = [], []
    for i in range(n):
        s = s_end * i / n
        z = L_BLADE * (1 - s)
        pts = section(s, sx, sy)
        rings.append([(x, y, z) for x, y in pts])
        cols.append([grade(x, s, lo, hi) for x, y in pts])
    return rings, cols


def vertex_color_material(name, **kw):
    m = mat(name, (1, 1, 1), **kw)
    nt = m.node_tree
    ca = nt.nodes.new('ShaderNodeVertexColor')
    ca.layer_name = 'Color'
    nt.links.new(ca.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    return m


def band_materials(obj, mats):
    """Shell faces by lateral band: 0 spine strip .. 2 outer facet, 3 chamfer;
    the tip third climbs one band so the point glows like the edges."""
    me = obj.data
    me.materials.clear()
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        c = p.center
        s = clamp(1 - c.z / L_BLADE)
        w = half_width(s)
        b = min(EDGE, w * 0.45)
        l = abs(c.x) / max(w, 1e-4)
        if l > (w - b) / w - 0.02:
            band = 3
        else:
            band = min(2, int(l / ((w - b) / w) * 3))
        if s > 0.8:
            band = min(3, band + 1)
        p.material_index = band


def build_blade():
    # Moon crystal: vertex colours grade deep teal at the spine to pale ice at
    # the edges and tip (Three multiplies COLOR_0 into the base colour only),
    # so the emissive follows the same grade in four material bands.
    ice = srgb('#9fe4f8')
    bands = [vertex_color_material(f'moonlight_crystal_{k}', metallic=0.0, roughness=0.12,
                                   emission=ice, strength=st, alpha=0.8, coat=0.12)
             for k, st in enumerate((0.06, 0.15, 0.3, 0.6))]
    inner = vertex_color_material('moonlight_inner', metallic=0.0, roughness=0.4,
                                  emission=srgb('#1a93bd'), strength=0.6)
    core = mat('moonlight_core', srgb('#dffaff'), metallic=0.0, roughness=0.5,
               emission=srgb('#dffaff'), strength=3.0)
    etch = mat('moonlight_etch', srgb('#8fd8ee'), metallic=0.0, roughness=0.5,
               emission=srgb('#8fd8ee'), strength=0.6)
    plate = mat('moonlight_plate', srgb('#a8e6fb'), metallic=0.0, roughness=0.1,
                emission=srgb('#6fcbe8'), strength=0.25, alpha=0.3)

    rings, cols = blade_rings()
    b = ring_loft('moonlight_blade', rings, bands[0], cap_start=True, pole_end=(0, 0, 0.0),
                  colors=cols, smooth_angle=20, face_jitter=0.08)
    band_materials(b, bands)
    rings, cols = blade_rings(0.80, 0.55, 0.985, lo=DEEP, hi=srgb('#2d86a8'))
    s = ring_loft('moonlight_inner', rings, inner, cap_start=True,
                  pole_end=(0, 0, L_BLADE * 0.015), colors=cols, smooth_angle=20, face_jitter=0.08)
    p = build_plates(plate)

    # light line on the spine: a thin ridge strip on each face
    bm = bmesh.new()
    for side in (-1, 1):
        rings = []
        for i in range(60):
            sv = 0.97 * i / 59
            z = L_BLADE * (1 - sv)
            hw = 0.0045 * (1 - 0.5 * sv)
            y0 = surface_y(0, sv)
            rings.append([(hw, side * (y0 - 0.001), z), (hw, side * (y0 + 0.0006), z),
                          (-hw, side * (y0 + 0.0006), z), (-hw, side * (y0 - 0.001), z)])
        V = [[bm.verts.new(p) for p in r] for r in rings]
        for i in range(len(V) - 1):
            for j in range(4):
                bm.faces.new((V[i][j], V[i][(j + 1) % 4], V[i + 1][(j + 1) % 4], V[i + 1][j]))
        bm.faces.new(list(reversed(V[0])))
        bm.faces.new(V[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    c = from_bmesh('moonlight_core', bm, core)

    cutter = build_engraving(etch)
    m = b.modifiers.new('etch', 'BOOLEAN')
    m.operation = 'DIFFERENCE'
    m.object = cutter
    m.solver = 'EXACT'
    m.use_self = True
    m.material_mode = 'TRANSFER'
    bpy.context.view_layer.objects.active = b
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter, do_unlink=True)
    return [b, s, c, p]


def build_plates(material):
    """Thin tilted sheets floating inside the blade: internal ice planes."""
    rng = random.Random(5)
    bm = bmesh.new()
    for _ in range(8):
        s0 = rng.uniform(0.04, 0.72)
        length = rng.uniform(0.12, 0.26)
        s1 = min(s0 + length / L_BLADE, 0.9)
        zc = L_BLADE * (1 - (s0 + s1) / 2)
        w = half_width((s0 + s1) / 2) * rng.uniform(0.3, 0.6)
        t = half_thick((s0 + s1) / 2)
        yc = rng.uniform(-0.45, 0.45) * t
        xc = rng.uniform(-0.3, 0.3) * half_width((s0 + s1) / 2)
        tilt = math.radians(rng.uniform(-14, 14))      # around the blade axis
        lean = math.radians(rng.uniform(-6, 6))        # around X
        hl = L_BLADE * (s1 - s0) / 2
        quad = [(-w, -hl), (w, -hl), (w, hl), (-w, hl)]
        verts = []
        for face in (-1, 1):
            for qx, qz in quad:
                x = xc + qx * math.cos(tilt)
                y = yc + qx * math.sin(tilt) + qz * math.sin(lean) + face * 0.00015
                z = zc + qz * math.cos(lean)
                verts.append(bm.verts.new((x, y, z)))
        bm.faces.new(verts[:4])
        bm.faces.new(list(reversed(verts[4:])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return from_bmesh('moonlight_plates', bm, material)


# ---------- frost-fern engraving ----------

def leaf_points(base, d, length, width, nseg=5):
    """Frost leaf from `base` along unit direction d (in XZ): a slim lens with
    a serrated outline, as (x, z)."""
    px, pz = -d[1], d[0]
    seed = base[0] * 37 + base[1] * 91

    def edge(u, sign):
        v = width * math.sin(math.pi * u) ** 0.6 * (1 - 0.45 * u)
        jag = 0.55 + 0.45 * abs(math.sin(u * 9.0 + seed)) ** 0.5
        return v * jag * sign

    pts = []
    for k in range(nseg + 1):
        u = k / nseg
        v = edge(u, 1)
        pts.append((base[0] + d[0] * length * u + px * v, base[1] + d[1] * length * u + pz * v))
    for k in range(nseg - 1, 0, -1):
        u = k / nseg
        v = edge(u, -1)
        pts.append((base[0] + d[0] * length * u + px * v, base[1] + d[1] * length * u + pz * v))
    return pts


def build_engraving(material):
    bm = bmesh.new()
    shapes = []   # list of (x, z) polygons

    def rot(d, a):
        c, s = math.cos(a), math.sin(a)
        return (d[0] * c - d[1] * s, d[0] * s + d[1] * c)

    def stem(a, b, w):
        dx, dz = b[0] - a[0], b[1] - a[1]
        l = math.hypot(dx, dz) or 1
        px, pz = -dz / l * w, dx / l * w
        shapes.append([(a[0] + px, a[1] + pz), (b[0] + px * 0.4, b[1] + pz * 0.4),
                       (b[0] - px * 0.4, b[1] - pz * 0.4), (a[0] - px, a[1] - pz)])

    # Fronds branch off the spine, swept toward the tip (about 35 deg off the
    # vein), each carrying slim serrated leaflets; dense at the root, sparse
    # and small toward the point.
    z = L_BLADE - 0.04
    j = 0
    while z > 0.09:
        s = 1 - z / L_BLADE
        scale = 0.3 + 0.7 * (1 - s) ** 1.1
        side = 1 if j % 2 == 0 else -1
        ang = math.radians(34 + 9 * n3(z * 7, 1, 2))
        d = (side * math.sin(ang), -math.cos(ang))          # outward and toward the tip
        base = (side * 0.003, z)
        length = 0.085 * scale
        wmax = half_width(s) - 0.012
        if abs(base[0] + d[0] * length) > wmax:
            length = (wmax - abs(base[0])) / abs(d[0])
        tip = (base[0] + d[0] * length, base[1] + d[1] * length)
        stem(base, tip, 0.0012 * (0.6 + scale))
        k = 0
        for f in (0.1, 0.27, 0.44, 0.61, 0.78):
            lside = 1 if k % 2 == 0 else -1
            k += 1
            lb = (base[0] + d[0] * length * f, base[1] + d[1] * length * f)
            ld = rot(d, lside * math.radians(22 + 8 * n3(z * 11, f, 3)))
            ll = (0.052 - 0.022 * f) * scale
            if abs(lb[0] + ld[0] * ll) > wmax + 0.006:
                ll = max(0.012 * scale, (wmax + 0.006 - abs(lb[0])) / max(abs(ld[0]), 0.2))
            shapes.append(leaf_points(lb, ld, ll, 0.0055 * scale))
        shapes.append(leaf_points(tip, d, 0.04 * scale, 0.0045 * scale))
        z -= 0.038 * (0.5 + 0.5 * scale)
        j += 1

    # Each shape becomes a prism from 0.5 mm under the facet to 1.5 mm above
    # it; the whole thing is subtracted from the shell (groove floors take
    # this material).
    for face in (-1, 1):
        for poly in shapes:
            lo, hi = [], []
            for x, zz in poly:
                s = 1 - zz / L_BLADE
                y = surface_y(x, s)
                lo.append(bm.verts.new((x, face * (y - 0.0005), zz)))
                hi.append(bm.verts.new((x, face * (y + 0.0015), zz)))
            try:
                bm.faces.new(lo)
                bm.faces.new(hi)
                n = len(poly)
                for k in range(n):
                    bm.faces.new((lo[k], lo[(k + 1) % n], hi[(k + 1) % n], hi[k]))
            except ValueError:
                pass
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return from_bmesh('moonlight_etch_cutter', bm, material)


# ---------- hilt ----------

def pewter_material():
    return vertex_color_material('moonlight_pewter', metallic=1.0, roughness=0.42)


def shade(k):
    return tuple(c * k for c in PEWTER)


def build_guard(material):
    """Crossbar in the XZ plane: arms droop toward the blade, bulbous tips,
    gnarled surface with spiral ribs."""
    M, SEG = 110, 28
    span = 0.215
    rings, cols = [], []

    def path(u):
        return Vector((span * u, 0, Z_GUARD + 0.012 - 0.056 * abs(u) ** 2.3))

    for i in range(M + 1):
        u = -1 + 2 * i / M
        c = path(u)
        T = (path(min(u + 0.01, 1)) - path(max(u - 0.01, -1))).normalized()
        N1 = Vector((0, 1, 0))
        N2 = T.cross(N1).normalized()
        au = abs(u)
        r0 = 0.021 + 0.009 * au ** 2
        if au > 0.86:                                   # club-shaped rounded tip
            r0 *= math.sqrt(max(0.0, 1 - ((au - 0.86) / 0.14) ** 2))
        if au < 0.26:                                   # thick centre the blade sinks into
            r0 += 0.014 * (0.5 + 0.5 * math.cos(math.pi * au / 0.26))
        ring, col = [], []
        for j in range(SEG):
            th = 2 * math.pi * j / SEG
            cx, sx = math.cos(th), math.sin(th)
            gn = n3(c.x * 16 + 3, cx * 1.7, sx * 1.7 + c.x * 6)
            lump = max(0.0, n3(c.x * 7 + 21, cx * 0.9, sx * 0.9)) ** 1.2
            rib = max(0.0, math.cos(3 * th + c.x * 120)) ** 2.5
            k = 1 + 0.16 * gn + 0.22 * lump + 0.09 * rib * (0.4 + au)
            r = r0 * k
            p = c + (N1 * cx + N2 * sx) * r
            ring.append(tuple(p))
            col.append(shade(clamp(0.3 + 0.55 * (gn + 0.45) + 0.25 * rib + 0.2 * lump, 0.22, 1.0)))
        rings.append(ring)
        cols.append(col)
    g = ring_loft('moonlight_guard', rings, material, colors=cols, smooth_angle=50)
    return g


def build_collar(material):
    """Rope ring where the grip meets the guard, twisted strands."""
    N, SEG = 64, 16
    R, r0 = 0.027, 0.0075
    zc = Z_GUARD + 0.043
    rings, cols = [], []
    for i in range(N + 1):
        a = 2 * math.pi * i / N
        ring, col = [], []
        for j in range(SEG):
            th = 2 * math.pi * j / SEG
            strand = 0.5 + 0.5 * math.cos(th * 3 + a * 7)
            r = r0 * (0.86 + 0.2 * strand)
            cx, sx = math.cos(a), math.sin(a)
            ring.append(((R + r * math.cos(th)) * cx, (R + r * math.cos(th)) * sx, zc + r * math.sin(th)))
            col.append(shade(0.45 + 0.5 * strand))
        rings.append(ring)
        cols.append(col)
    return ring_loft('moonlight_collar', rings, material, colors=cols, smooth_angle=60)


def build_grip(material):
    N, SEG = 120, 30
    rings, cols = [], []
    for i in range(N + 1):
        f = i / N
        z = Z_GRIP0 - 0.006 + (Z_GRIP1 + 0.004 - Z_GRIP0 + 0.006) * f
        r0 = 0.0225 - 0.002 * math.sin(math.pi * f) + 0.002 * (f > 0.985)
        ring, col = [], []
        for j in range(SEG):
            th = 2 * math.pi * j / SEG
            cx, sx = math.cos(th), math.sin(th)
            gn = n3(cx * 1.6, sx * 1.6, z * 11)
            # two-start diagonal cord wrap plus a thinner counter wrap
            wrap = max(0.0, math.cos(2 * th + 2 * math.pi * z / 0.034)) ** 1.4
            cross = max(0.0, math.cos(th - 2 * math.pi * z / 0.05)) ** 3
            lump = max(0.0, n3(cx * 0.9 + 7, sx * 0.9, z * 3.5)) ** 1.1
            r = r0 * (1 + 0.07 * gn + 0.08 * wrap + 0.04 * cross + 0.22 * lump)
            ring.append((r * cx, r * sx, z))
            col.append(shade(clamp(0.3 + 0.3 * wrap + 0.4 * (gn + 0.45) + 0.3 * lump, 0.22, 1.0)))
        rings.append(ring)
        cols.append(col)
    return ring_loft('moonlight_grip', rings, material, cap_start=True, colors=cols, smooth_angle=50)


def build_pommel(material):
    N, SEG = 48, 30
    keys = [(0.0, 0.021), (0.08, 0.026), (0.2, 0.024), (0.38, 0.034), (0.62, 0.035),
            (0.8, 0.028), (0.93, 0.018), (1.0, 0.0)]
    rings, cols = [], []
    for i in range(N):
        f = i / N
        for (fa, ra), (fb, rb) in zip(keys, keys[1:]):
            if fa <= f <= fb:
                t = (f - fa) / (fb - fa)
                r0 = ra + (rb - ra) * (0.5 - 0.5 * math.cos(math.pi * t))
                break
        z = Z_GRIP1 + (Z_TOP - Z_GRIP1) * f
        groove = 0.5 + 0.5 * math.cos(2 * math.pi * f * 5.0) if 0.3 < f < 0.85 else 1.0
        ring, col = [], []
        for j in range(SEG):
            th = 2 * math.pi * j / SEG
            gn = n3(math.cos(th) * 1.5 + 11, math.sin(th) * 1.5, z * 12)
            lump = max(0.0, n3(math.cos(th) * 0.9 + 5, math.sin(th) * 0.9, z * 6)) ** 1.1
            r = r0 * (0.94 + 0.06 * groove) * (1 + 0.09 * gn + 0.16 * lump)
            ring.append((r * math.cos(th), r * math.sin(th), z))
            col.append(shade(clamp(0.45 + 0.3 * groove + 0.3 * (gn + 0.5), 0.3, 1.0)))
        rings.append(ring)
        cols.append(col)
    return ring_loft('moonlight_pommel', rings, material, cap_start=True,
                     pole_end=(0, 0, Z_TOP), colors=cols, smooth_angle=50)


# ---------- assemble ----------

def build():
    reset()
    parts = build_blade()
    pewter = pewter_material()
    parts += [build_guard(pewter), build_collar(pewter), build_grip(pewter), build_pommel(pewter)]
    root = bpy.data.objects.new('moonlight', None)
    bpy.context.scene.collection.objects.link(root)
    for o in parts:
        o.parent = root
    return parts


def export(parts):
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, 'moonlight.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True,
                              export_yup=True, export_materials='EXPORT',
                              export_vertex_color='ACTIVE')
    deps = bpy.context.evaluated_depsgraph_get()
    tris = 0
    lo = Vector((1e9,) * 3)
    hi = Vector((-1e9,) * 3)
    for o in parts:
        ev = o.evaluated_get(deps)
        me = ev.to_mesh()
        own = sum(len(p.vertices) - 2 for p in me.polygons)
        print(f'  {o.name}: {own} tris')
        tris += own
        for v in me.vertices:
            w = ev.matrix_world @ v.co
            lo = Vector(map(min, lo, w))
            hi = Vector(map(max, hi, w))
        ev.to_mesh_clear()
    print(f'MOONLIGHT TRIS {tris} BBOX x[{lo.x:.3f},{hi.x:.3f}] y[{lo.y:.3f},{hi.y:.3f}] '
          f'z[{lo.z:.3f},{hi.z:.3f}] FILE {path} {os.path.getsize(path)} bytes')
    return path


export(build())
