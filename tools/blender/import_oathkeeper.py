"""Oathkeeper and Oblivion (Kingdom Hearts) from chek360's Sketchfab model.

blender -b --factory-startup -P tools/blender/import_oathkeeper.py -- oathkeeper|oblivion
(tools/blender/import_oblivion.py runs this with "oblivion".)

Source: "Oblivion and Oathkeeper" by chek360 (sketchfab 23d699c6ebb846259b0edbdedaa47efc, CC-BY),
C:/Users/forev/Downloads/kilic/sf/oblivion-and-oathkeeper. source/model.zip holds model/model.dae
(an Assimp export, Y up, metres, both keyblades lying crossed on the ground) and textures/ the
per-keyblade albedo / AO / metallic / roughness / normal maps.

Blender 5 has no Collada importer, so the two <geometry> blocks are read here directly: one
triangle list each, every attribute indexed by the one VERTEX index, normals and UVs per vertex.

Pipeline: read the keyblade's geometry with its own normals and UVs -> split the keychain off
(the 832-triangle links plus the charm at the end of the chain) -> Oblivion only: decimate
(links hardest, they are dense rings) and transfer the original normals back -> stand the
keyblade up along its shaft, teeth down, the face that Sketchfab shows toward -Y, shaft on
x = y = 0 -> scale (one factor for both keyblades, Oathkeeper = LENGTH) -> hang the chain from
its pommel ring (Oathkeeper: link by link along a draped line, see drape; Oblivion: turned
as one piece, see hang) -> ORM texture (AO, roughness, metallic) -> GLB with root <id>, children
<id>_blade and <id>_chain (an empty at the pommel attachment holding <id>_chain_mesh).
"""
import math
import os
import sys
import tempfile
import xml.etree.ElementTree as ET

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from mathutils.kdtree import KDTree

sys.path.append(os.path.dirname(__file__))
from forge_bl import reset, OUT_DIR

SRC = r'C:\Users\forev\Downloads\kilic\sf\oblivion-and-oathkeeper'
DAE = os.path.join(SRC, 'source', 'unz', 'model', 'model.dae')   # unzipped from source/model.zip
TEX = os.path.join(SRC, 'textures')
NS = '{http://www.collada.org/2005/11/COLLADASchema}'
MATERIAL = {'oathkeeper': 'Oathkeeper', 'oblivion': 'Oblivion'}
LENGTH = 1.1            # m, Oathkeeper from teeth end to pommel; Oblivion gets the same factor
LINK_TRIS = 832         # every chain link in the source is the same 832-triangle ring
CHARM_Y = -0.75         # source parts below this (Blender y) are the charms at the chain ends
# Oblivion is 83.6k triangles. Only the chain links (dense identical rings) are decimated, to 30 %
# -> ~70k; decimating the blade left dark bands across the shaft. Oathkeeper (52.3k) is left alone.
DECIMATE = {'oblivion': {'chain_links': 0.3, 'charm': 1.0, 'blade': 1.0}}
CLEARANCE = 0.012       # m (final scale) the hanging chain keeps from the blade
DRIFT = 0.12            # Oathkeeper's draped chain: sideways drift per metre of drop
TRIS_MAX = 80000


def ensure_unzipped():
    if not os.path.exists(DAE):
        import zipfile
        zipfile.ZipFile(os.path.join(SRC, 'source', 'model.zip')).extractall(os.path.join(SRC, 'source', 'unz'))


def read_geometry(material_name):
    """Arrays for the <geometry> bound to `material_name`: positions, normals (Blender Z up),
    uvs and the triangle index list."""
    root = ET.parse(DAE).getroot()
    geo_id = next(ig.get('url')[1:] for ig in root.iter(NS + 'instance_geometry')
                  if ig.find('.//' + NS + 'instance_material').get('target')[1:] == material_name)
    geo = next(g for g in root.iter(NS + 'geometry') if g.get('id') == geo_id)
    src = {s.get('id').split('-')[-1]: np.array(s.find(NS + 'float_array').text.split(), dtype=np.float64)
           for s in geo.iter(NS + 'source')}
    P = src['positions'].reshape(-1, 3)
    N = src['normals'].reshape(-1, 3)
    T = src['tex0'].reshape(-1, 2)
    idx = np.array(geo.find('.//' + NS + 'p').text.split(), dtype=np.int64).reshape(-1, 3)
    to_z_up = lambda a: np.stack([a[:, 0], -a[:, 2], a[:, 1]], 1)   # DAE Y up -> Blender Z up
    return to_z_up(P), to_z_up(N), T, idx


def build_mesh(name, P, N, T, tris):
    """Mesh with the source's split vertices, per-loop UVs and custom normals."""
    used, inv = np.unique(tris.ravel(), return_inverse=True)
    loops = inv.astype(np.int32)
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(used))
    me.vertices.foreach_set('co', P[used].astype(np.float32).ravel())
    me.loops.add(len(loops))
    me.loops.foreach_set('vertex_index', loops)
    me.polygons.add(len(tris))
    me.polygons.foreach_set('loop_start', np.arange(0, len(loops), 3, dtype=np.int32))
    me.update(calc_edges=True)
    me.uv_layers.new(name='UVMap').data.foreach_set('uv', T[tris.ravel()].astype(np.float32).ravel())
    me.polygons.foreach_set('use_smooth', np.ones(len(tris), dtype=bool))
    me.normals_split_custom_set([tuple(n) for n in N[tris.ravel()]])
    obj = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def loose_parts(P, tris):
    """Component id per triangle; vertices that share a position count as connected."""
    _, pos_id = np.unique(np.round(P / 1e-5).astype(np.int64), axis=0, return_inverse=True)
    pos_id = pos_id.ravel()
    parent = np.arange(pos_id.max() + 1)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    for a, b, c in pos_id[tris]:
        ra, rb, rc = find(a), find(b), find(c)
        parent[rb] = ra
        parent[find(rc)] = ra
    return np.array([find(pos_id[t[0]]) for t in tris])


def split_parts(P, tris):
    comp = loose_parts(P, tris)
    ids, counts = np.unique(comp, return_counts=True)
    size = dict(zip(ids, counts))
    link = np.array([size[c] == LINK_TRIS for c in comp])
    cy = {c: P[tris[comp == c].ravel(), 1].mean() for c in ids}
    charm = np.array([(not l) and cy[c] < CHARM_Y for c, l in zip(comp, link)])
    print('PARTS', len(ids), 'links', len({c for c in comp[link]}), 'charm parts', len({c for c in comp[charm]}))
    return link, charm


def merge(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bm.to_mesh(obj.data)
    bm.free()


def decimate(obj, ratio):
    if ratio >= 1:
        return
    m = obj.modifiers.new('dec', 'DECIMATE')
    m.decimate_type = 'COLLAPSE'
    m.ratio = ratio
    m.use_collapse_triangulate = True
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=m.name)


def transfer_normals(obj, source):
    m = obj.modifiers.new('normals', 'DATA_TRANSFER')
    m.object = source
    m.use_loop_data = True
    m.data_types_loops = {'CUSTOM_NORMAL'}
    m.loop_mapping = 'POLYINTERP_NEAREST'
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=m.name)


def coords(obj):
    a = np.empty(len(obj.data.vertices) * 3, dtype=np.float32)
    obj.data.vertices.foreach_get('co', a)
    return a.reshape(-1, 3).astype(np.float64)


def surface_samples(P, tris, n=200000, seed=1):
    """Points spread evenly over the surface (the shaft rods are long faces with few vertices)."""
    A, B, C = P[tris[:, 0]], P[tris[:, 1]], P[tris[:, 2]]
    area = np.linalg.norm(np.cross(B - A, C - A), axis=1)
    rng = np.random.default_rng(seed)
    f = rng.choice(len(tris), n, p=area / area.sum())
    u, v = rng.random(n), rng.random(n)
    m = u + v > 1
    u[m], v[m] = 1 - u[m], 1 - v[m]
    return A[f] + u[:, None] * (B[f] - A[f]) + v[:, None] * (C[f] - A[f])


def shaft_frame(X):
    """Direction (in the ground plane) and a point of the shaft line, from surface samples X:
    principal axis of the whole keyblade, refined on its middle 40 % (the bare shaft)."""
    xy = X[:, :2]
    c = xy.mean(0)
    d = np.linalg.svd(xy - c, full_matrices=False)[2][0]
    s = (xy - c) @ d
    lo, hi = s.min(), s.max()
    mid = (s > lo + 0.3 * (hi - lo)) & (s < lo + 0.7 * (hi - lo))
    c2 = X[mid].mean(0)
    d2 = np.linalg.svd(xy[mid] - c2[:2], full_matrices=False)[2][0]
    return np.array([d2[0], d2[1], 0.0]), c2


def stand_up(X_blade, attach):
    """Matrix that stands the keyblade on its teeth: shaft -> +Z, pommel (chain side) up,
    the source's top face (+Z) -> -Y, shaft line through x = y = 0."""
    d, c = shaft_frame(X_blade)
    if (attach - c) @ d < 0:
        d = -d                                   # d points teeth -> pommel
    n = np.array([0.0, 0.0, 1.0])
    R = np.array([np.cross(d, n), -n, d])        # rows: new X, new Y, new Z
    M = np.eye(4)
    M[:3, :3] = R
    M[:3, 3] = -R @ c
    return Matrix(M.tolist()), d


def attachment(V_blade, V_chain):
    """Where the chain hooks into the pommel: the chain vertex nearest to the blade."""
    kd = KDTree(len(V_blade))
    for i, v in enumerate(V_blade):
        kd.insert(v, i)
    kd.balance()
    best = min(((kd.find(v)[2], i) for i, v in enumerate(V_chain)))
    p = V_chain[best[1]]
    q = np.array(kd.find(p)[0])
    return (p + q) / 2


def hang(chain_V, blade_V, pivot, clearance=CLEARANCE, skip=0.04):
    """The keychain keeps its source shape (a loose curl, it lay on the ground); it is only
    turned as one piece about the pommel ring. Picks the turn that brings the chain's chord
    (ring -> charm) closest to straight down while every link stays `clearance` off the blade
    (except within `skip` of the ring, where the first link hooks into the pommel itself);
    both faces of the curl (a half turn about the chord) are tried. Returns a 3x3 rotation."""
    kd = KDTree(len(blade_V))
    for i, v in enumerate(blade_V):
        kd.insert(v, i)
    kd.balance()
    rel = chain_V - pivot
    far = rel[np.argmax(np.linalg.norm(rel, axis=1))]
    chord = Vector(far / np.linalg.norm(far))
    test = rel[np.linalg.norm(rel, axis=1) > skip][::3]   # the first link hooks into the pommel itself
    best = None
    for flip in (0.0, math.pi):
        A = chord.rotation_difference(Vector((0, 0, -1))).to_matrix() @ Matrix.Rotation(flip, 3, chord)
        for deg in range(0, 181):
            if best is not None and deg >= best[0]:
                break
            for sign in (1, -1):
                Rm = Matrix.Rotation(math.radians(deg * sign), 3, 'Y') @ A   # swing in the blade plane
                pts = test @ np.array(Rm).T + pivot
                if min(kd.find(p)[2] for p in pts) >= clearance:
                    best = (deg, sign, flip, Rm)
                    break
    print('HANG chord_from_vertical', best[0] * best[1], 'flipped', best[2] != 0)
    return best[3]


def drape(chain_V, chain_tris, blade_V, pivot, clearance=CLEARANCE):
    """Oathkeeper: the keychain lay on the ground in a loose curl, and turning it rigidly
    (hang) left it arcing up and out of the pommel. Here every link keeps its own shape and
    the link-to-link spacing and twist of the source, but the links are moved one by one onto
    a hanging line: down from the pommel ring in front of the grip, drifting slightly
    outward, resting on the keyblade's front surface (+ clearance) and never swinging back in
    below an obstacle, as a real chain falls off an edge. The charm rides on the end of the
    line. Each link's frame is (tangent, -Y off the tangent), so the faces the source showed
    up stay toward the viewer.
    Returns the new vertex positions."""
    comp = loose_parts(chain_V, chain_tris)
    vparts = {}
    for c, t in zip(comp, chain_tris):
        vparts.setdefault(c, set()).update(t.tolist())
    groups = [np.array(sorted(v)) for v in vparts.values()]
    ntri = {c: n for c, n in zip(*np.unique(comp, return_counts=True))}
    keys = list(vparts.keys())
    links = [groups[i] for i, c in enumerate(keys) if ntri[c] == LINK_TRIS]
    charm = np.concatenate([groups[i] for i, c in enumerate(keys) if ntri[c] != LINK_TRIS])
    # order the links from the ring outward (nearest neighbour walk)
    cen = [chain_V[g].mean(0) for g in links]
    order, left = [], list(range(len(links)))
    cur = min(left, key=lambda i: np.linalg.norm(cen[i] - pivot))
    while left:
        left.remove(cur)
        order.append(cur)
        if left:
            cur = min(left, key=lambda i: np.linalg.norm(cen[i] - cen[order[-1]]))
    elems = [links[i] for i in order] + [charm]
    C = np.array([chain_V[g].mean(0) for g in elems[:-1]])
    # the charm's reference point: where it is nearest the last link
    last = chain_V[elems[-2]]
    d = np.linalg.norm(chain_V[charm][:, None, :] - last[None, ::7, :], axis=2).min(1)
    C = np.vstack([C, chain_V[charm][d < d.min() + 0.004].mean(0)])
    gaps = np.linalg.norm(np.diff(np.vstack([pivot, C]), axis=0), axis=1)
    s_target = np.cumsum(gaps)
    # source tangents (central differences, charm: from the last link toward its body)
    T = np.gradient(C, axis=0)
    T[-1] = chain_V[charm].mean(0) - C[-2]
    T /= np.linalg.norm(T, axis=1, keepdims=True)

    # hanging line: down from the ring along the grip, drifting slightly outward (DRIFT, on the
    # side the source chain lay), resting on the keyblade's front (-Y) and falling forward off
    # anything that sticks out, never swinging back in below it
    reach = s_target[-1] + np.linalg.norm(chain_V[charm] - C[-1], axis=1).max()
    step = 0.002
    zs = pivot[2] - np.arange(0, reach + 0.3, step)
    sign = 1.0 if (chain_V[:, 0] - pivot[0]).mean() >= 0 else -1.0
    xs = pivot[0] + sign * DRIFT * (pivot[2] - zs)
    band, half = 0.006, 0.012           # m: height band, half-width of a link seen from the front
    front = np.full(len(zs), pivot[1])
    for i, (z, x) in enumerate(zip(zs, xs)):
        m = (np.abs(blade_V[:, 2] - z) < band) & (np.abs(blade_V[:, 0] - x) < half)
        if m.any():
            front[i] = min(front[i], blade_V[m, 1].min() - clearance)
    front = np.minimum.accumulate(front)
    k = 9
    fs = np.convolve(np.pad(front, k, mode='edge'), np.ones(2 * k + 1) / (2 * k + 1), mode='same')[k:-k]
    front = np.minimum(fs, front)
    pts = np.stack([xs, front, zs], 1)
    pts[0] = pivot
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])

    def at(sv):
        p = np.array([np.interp(sv, s, pts[:, i]) for i in range(3)])
        q = np.array([np.interp(sv + 0.004, s, pts[:, i]) for i in range(3)])
        t = q - np.array([np.interp(sv - 0.004, s, pts[:, i]) for i in range(3)])
        return p, t / np.linalg.norm(t)

    out = chain_V.copy()
    ny = np.array([0.0, -1.0, 0.0])
    for g, c, t, sv in zip(elems, C, T, s_target):
        p, tt = at(sv)
        # frames (tangent, -Y projected off it, binormal): source -> target, keeps each link's twist
        def frame(a):
            n = ny - a * (ny @ a)
            n /= np.linalg.norm(n)
            return np.stack([a, n, np.cross(a, n)])
        R = frame(tt).T @ frame(t)
        out[g] = (chain_V[g] - c) @ R.T + p
    print('DRAPE side', sign, 'links', len(links), 'length', round(float(reach), 3))
    return out


def orm_material(paths, wid, gloss=False):
    """Principled material from the source maps (paths: albedo, AO, roughness, metallic,
    normal); AO/roughness/metallic packed into one ORM JPEG (R, G, B)."""
    imgs = {k: bpy.data.images.load(v) for k, v in paths.items()}
    w, h = imgs['AO'].size
    px = {}
    for k in ('AO', 'roughness', 'metallic'):
        a = np.empty(w * h * 4, dtype=np.float32)
        imgs[k].pixels.foreach_get(a)
        px[k] = a.reshape(-1, 4)[:, 0]
    # gloss=True (the keyblades): their "roughness" maps are glossiness. Sketchfab shows the parts
    # they mark white (Oathkeeper's gold wings, Oblivion's shaft rails) as the shiniest.
    if gloss:
        px['roughness'] = 1 - px['roughness']
    orm = bpy.data.images.new(f'{wid}_orm', w, h)
    orm.colorspace_settings.name = 'Non-Color'
    orm.pixels.foreach_set(np.stack([px['AO'], px['roughness'], px['metallic'], np.ones(w * h, np.float32)], 1).ravel())
    path = os.path.join(tempfile.gettempdir(), f'{wid}_orm.jpg')
    orm.filepath_raw = path
    orm.file_format = 'JPEG'
    bpy.context.scene.render.image_settings.quality = 92
    orm.save()
    orm = bpy.data.images.load(path)
    orm.colorspace_settings.name = 'Non-Color'
    for k in ('AO', 'roughness', 'metallic'):
        bpy.data.images.remove(imgs[k])

    m = bpy.data.materials.new(wid)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']

    def tex(img, noncolor):
        n = nt.nodes.new('ShaderNodeTexImage')
        n.image = img
        if noncolor:
            img.colorspace_settings.name = 'Non-Color'
        return n
    nt.links.new(tex(imgs['albedo'], False).outputs['Color'], b.inputs['Base Color'])
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(tex(orm, True).outputs['Color'], sep.inputs['Color'])
    nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
    nt.links.new(sep.outputs['Blue'], b.inputs['Metallic'])
    # glTF occlusion: a "glTF Material Output" group with an Occlusion input, fed from R.
    grp = bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    if 'Occlusion' not in grp.interface.items_tree:
        grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    gn = nt.nodes.new('ShaderNodeGroup')
    gn.node_tree = grp
    nt.links.new(sep.outputs['Red'], gn.inputs['Occlusion'])
    nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tex(imgs['normal'], True).outputs['Color'], nm.inputs['Color'])
    nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    return m


def chain_pivot(chain, wid, root):
    """<id>_chain becomes an empty at the attachment holding the chain mesh (<id>_chain_mesh)
    at identity. The site sways the empty; tools that re-centre mesh nodes (meshopt
    quantization in tools/optimize-assets.sh moves a mesh node's origin to its bounds)
    then leave the pivot alone."""
    chain.name = chain.data.name = f'{wid}_chain_mesh'
    pivot = bpy.data.objects.new(f'{wid}_chain', None)
    bpy.context.scene.collection.objects.link(pivot)
    pivot.parent = root
    pivot.location = chain.location.copy()
    chain.parent = pivot
    chain.location = (0, 0, 0)
    return pivot


def tri_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def main(wid):
    ensure_unzipped()
    reset()
    P, N, T, tris = read_geometry(MATERIAL[wid])
    link, charm = split_parts(P, tris)
    chain_f = link | charm
    blade = build_mesh(f'{wid}_blade', P, N, T, tris[~chain_f])
    links = build_mesh('links', P, N, T, tris[link])
    charm_o = build_mesh('charm', P, N, T, tris[charm])

    # Common scale: Oathkeeper's blade length -> LENGTH.
    Po, _, _, to = read_geometry(MATERIAL['oathkeeper'])
    lo_, co_ = split_parts(Po, to)
    Xo = surface_samples(Po, to[~(lo_ | co_)])
    do, _ = shaft_frame(Xo)
    so = Xo[:, :2] @ do[:2]
    scale = LENGTH / (so.max() - so.min())

    # Oblivion: decimate (links hardest), then put the source normals back.
    dec = DECIMATE.get(wid)
    if dec:
        for o, r in ((blade, dec['blade']), (links, dec['chain_links']), (charm_o, dec['charm'])):
            if r >= 1:
                continue
            ref = o.copy()
            ref.data = o.data.copy()
            bpy.context.scene.collection.objects.link(ref)
            merge(o)
            decimate(o, r)
            transfer_normals(o, ref)
            bpy.data.objects.remove(ref, do_unlink=True)

    # Stand up, centre the shaft, scale.
    att = attachment(coords(blade), np.vstack([coords(links), coords(charm_o)]))
    M = Matrix.Scale(scale, 4) @ stand_up(surface_samples(P, tris[~chain_f]), att)[0]
    for o in (blade, links, charm_o):
        o.data.transform(M)
        o.data.update()
    att = np.array(M @ Vector(att))

    # Keychain: one mesh, turned to hang from the pommel, origin at the attachment.
    bpy.ops.object.select_all(action='DESELECT')
    links.select_set(True)
    charm_o.select_set(True)
    bpy.context.view_layer.objects.active = links
    bpy.ops.object.join()
    chain = links
    chain.name = chain.data.name = f'{wid}_chain'
    if wid == 'oathkeeper':
        tri_idx = np.array([list(p.vertices) for p in chain.data.polygons])
        V = drape(coords(chain), tri_idx, coords(blade), att)
        chain.data.vertices.foreach_set('co', (V - att).astype(np.float32).ravel())
    else:
        R = hang(coords(chain), coords(blade), att)
        chain.data.transform(R.to_4x4() @ Matrix.Translation(-Vector(att)))
    chain.data.update()

    # Lowest point (teeth end, or the charm if it hangs lower) on z = 0.
    zmin = min(coords(blade)[:, 2].min(), coords(chain)[:, 2].min() + att[2])
    blade.data.transform(Matrix.Translation((0, 0, -zmin)))
    chain.location = Vector(att) - Vector((0, 0, zmin))
    root = bpy.data.objects.new(wid, None)
    bpy.context.scene.collection.objects.link(root)
    for o in (blade, chain):
        o.parent = root

    mat = orm_material({k: os.path.join(TEX, f'{MATERIAL[wid]}_{k}.jpeg') for k in
                        ('albedo', 'AO', 'roughness', 'metallic', 'normal')}, wid, gloss=True)
    for o in (blade, chain):
        o.data.materials.clear()
        o.data.materials.append(mat)

    pivot = chain_pivot(chain, wid, root)

    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f'{wid}.glb')
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True,
                              export_materials='EXPORT', export_image_format='AUTO',
                              export_tangents=False)
    tris_total = tri_count(blade) + tri_count(chain)
    allv = np.vstack([coords(blade), coords(chain) + np.array(pivot.location)])
    print('STATS', wid, 'tris', tris_total, 'blade', tri_count(blade), 'chain', tri_count(chain),
          'size_xyz_m', tuple(np.round(allv.max(0) - allv.min(0), 3)), 'min', tuple(np.round(allv.min(0), 3)),
          'chain_origin', tuple(np.round(np.array(pivot.location), 3)), 'bytes', os.path.getsize(path))
    assert tris_total <= TRIS_MAX, tris_total
    print('EXPORTED', path)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['oathkeeper']
    main(args[0])
