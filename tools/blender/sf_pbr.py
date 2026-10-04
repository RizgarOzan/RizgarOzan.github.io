"""Helpers for turning a textured Sketchfab download into a site GLB (run inside Blender).

Used by import_buster.py, import_master.py, import_leviathan.py.

    src = load_source(path)                      # one joined mesh, transforms applied
    orient(src, Matrix.Rotation(...))            # source frame -> forge_bl frame (Z up, face -Y)
    fit(src, length, grip_band=(t0, t1))         # grip axis on x = y = 0, lowest point z = 0, scaled
    parts = split(src, prefix, classify)         # loose parts -> named child meshes
    m = pbr_material(name, base, orm, normal)    # images from save_jpeg()
    export_glb(wid, parts)                       # root empty <wid>, GLB + stats

Texture maps are read with Image.pixels (raw stored values, rows bottom-up) and written back
as JPEG files in %TEMP%/sf_tex/<id>/, which the glTF exporter embeds unchanged.
"""
import os
import bpy
import numpy as np
from mathutils import Vector, Matrix
from forge_bl import OUT_DIR

TEX_DIR = os.path.join(os.environ.get('TEMP', '.'), 'sf_tex')


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


# ---------- geometry ----------

def load_source(path):
    if path.lower().endswith('.obj'):
        bpy.ops.wm.obj_import(filepath=path)
    else:
        bpy.ops.import_scene.fbx(filepath=path)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    for o in list(bpy.context.scene.objects):
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    o.data.materials.clear()
    return o


def coords(o):
    a = np.empty(len(o.data.vertices) * 3, dtype=np.float64)
    o.data.vertices.foreach_get('co', a)
    return a.reshape(-1, 3)


def orient(o, rot):
    o.data.transform(rot.to_4x4())
    o.data.update()


def fit(o, length, grip_band):
    """Scale so the full height is `length`, the lowest point at z = 0, and the grip axis
    (bbox centre in XY of the vertices between fractions grip_band of the height) on x = y = 0."""
    v = coords(o)
    z0, z1 = v[:, 2].min(), v[:, 2].max()
    t = (v[:, 2] - z0) / (z1 - z0)
    g = v[(t >= grip_band[0]) & (t <= grip_band[1])]
    cx = (g[:, 0].min() + g[:, 0].max()) / 2
    cy = (g[:, 1].min() + g[:, 1].max()) / 2
    s = length / (z1 - z0)
    o.data.transform(Matrix.Scale(s, 4) @ Matrix.Translation((-cx, -cy, -z0)))
    o.data.update()


def split(o, prefix, classify):
    """Separate loose parts, name each by classify(zmin_t, zmax_t, centre_t) -> suffix, join equal suffixes."""
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.separate(type='LOOSE')
    bpy.ops.object.mode_set(mode='OBJECT')
    pieces = [p for p in bpy.context.scene.objects if p.type == 'MESH']
    H = max(coords(p)[:, 2].max() for p in pieces)
    groups = {}
    for p in pieces:
        z = coords(p)[:, 2] / H
        groups.setdefault(classify(z.min(), z.max(), (z.min() + z.max()) / 2), []).append(p)
    parts = []
    for suffix, ps in sorted(groups.items()):
        bpy.ops.object.select_all(action='DESELECT')
        for p in ps:
            p.select_set(True)
        bpy.context.view_layer.objects.active = ps[0]
        if len(ps) > 1:
            bpy.ops.object.join()
        j = bpy.context.view_layer.objects.active
        j.name = j.data.name = f'{prefix}_{suffix}'
        parts.append(j)
    return parts


# ---------- textures ----------

def read(path, size=None):
    """Image file -> float32 array (h, w, 4), raw stored values, rows bottom-up.
    Always Non-Color: Blender linearises the pixels of float-loaded sRGB images (some 8-bit
    RGBA PNGs load as float), which would darken a colour map that is written back as is."""
    img = bpy.data.images.load(path, check_existing=False)
    img.colorspace_settings.name = 'Non-Color'
    if size and tuple(img.size) != tuple(size):
        img.scale(*size)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)


def save_jpeg(wid, name, rgb, quality=88, data=True):
    """(h, w, 3) float array in 0..1 -> JPEG next to the other prepared maps; returns the loaded image."""
    h, w = rgb.shape[:2]
    os.makedirs(os.path.join(TEX_DIR, wid), exist_ok=True)
    path = os.path.join(TEX_DIR, wid, f'{wid}_{name}.jpg')
    img = bpy.data.images.new(f'tmp_{name}', w, h, alpha=False)
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(rgba.ravel())
    img.filepath_raw = path
    img.file_format = 'JPEG'
    # Image.save writes the stored bytes as they are. save_render (used before) ran them
    # through the scene's view transform (AgX), which desaturated colour maps and lifted
    # roughness (0.22 -> 0.49 on the Chaos guard).
    img.save(filepath=path, quality=quality)
    bpy.data.images.remove(img)
    out = bpy.data.images.load(path, check_existing=False)
    out.name = f'{wid}_{name}'
    out.colorspace_settings.name = 'Non-Color' if data else 'sRGB'
    return out


def orm(ao, rough, metal):
    """Single-channel (h, w) arrays -> packed (h, w, 3)."""
    return np.stack([ao, rough, metal], axis=-1)


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def spec_gloss_to_metal(diffuse, specular):
    """KHR spec/gloss -> metal/rough conversion (Khronos reference): sRGB diffuse and specular
    (h, w, 3) -> (sRGB base colour, metallic)."""
    d = srgb_to_lin(diffuse)
    s = srgb_to_lin(specular)
    eps, diel = 1e-6, 0.04

    def bright(c):
        return np.sqrt(0.299 * c[..., 0] ** 2 + 0.587 * c[..., 1] ** 2 + 0.114 * c[..., 2] ** 2)

    one_minus = 1 - s.max(axis=-1)
    db, sb = bright(d), bright(s)
    a = diel
    b = db * one_minus / (1 - diel) + sb - 2 * diel
    c = diel - sb
    disc = np.maximum(b * b - 4 * a * c, 0)
    metal = np.clip((-b + np.sqrt(disc)) / (2 * a), 0, 1)
    metal = np.where(sb < diel, 0.0, metal)
    m = metal[..., None]
    from_d = d * (one_minus / (1 - diel) / np.maximum(1 - metal, eps))[..., None]
    from_s = (s - diel * (1 - m)) / np.maximum(m, eps)
    base = from_d + (from_s - from_d) * m * m
    return lin_to_srgb(np.clip(base, 0, 1)), metal


# ---------- material ----------

def _gltf_output_group():
    g = bpy.data.node_groups.get('glTF Material Output')
    if g:
        return g
    g = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    g.nodes.new('NodeGroupInput')
    return g


def pbr_material(name, base, orm_img, normal, normal_strength=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tb = nt.nodes.new('ShaderNodeTexImage'); tb.image = base
    nt.links.new(tb.outputs['Color'], bsdf.inputs['Base Color'])
    if orm_img:
        to = nt.nodes.new('ShaderNodeTexImage'); to.image = orm_img
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(to.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
        grp = nt.nodes.new('ShaderNodeGroup'); grp.node_tree = _gltf_output_group()
        nt.links.new(sep.outputs['Red'], grp.inputs['Occlusion'])
    if normal:
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = normal
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    return m


# ---------- export ----------

def export_glb(wid, parts, out_name=None):
    root = bpy.data.objects.new(wid, None)
    bpy.context.scene.collection.objects.link(root)
    for p in parts:
        p.parent = root
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f'{out_name or wid}.glb')
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True,
                              export_yup=True, export_materials='EXPORT',
                              export_image_format='AUTO')
    tris = 0
    lo = Vector((1e9,) * 3); hi = Vector((-1e9,) * 3)
    for p in parts:
        n = sum(len(f.vertices) - 2 for f in p.data.polygons)
        tris += n
        v = coords(p)
        lo = Vector(map(min, lo, v.min(0))); hi = Vector(map(max, hi, v.max(0)))
        print(f'  PART {p.name}: {n} tris')
    print(f'STATS {wid} tris {tris} dims_m x{hi.x - lo.x:.3f} y{hi.y - lo.y:.3f} z{hi.z - lo.z:.3f} '
          f'min {tuple(round(c, 3) for c in lo)} bytes {os.path.getsize(path)}')
    print('EXPORTED', path)
    return path
