"""Shared helpers for modelling weapons in Blender (run headless).

Conventions (Blender space, Z up): the weapon stands along +Z, its lowest
point at z = 0, the grip axis on x = 0, width on X, thickness on Y, and the
face that the viewer sees looks toward -Y. The glTF exporter turns this into
the site's convention (Y up, face toward +Z).

Usage inside a weapon script:
    import sys, os; sys.path.append(os.path.dirname(__file__))
    from forge_bl import *
    reset()
    ... build ...
    export('buster')
"""
import math
import os
import bpy
import bmesh
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT_DIR = os.path.join(ROOT, 'assets', 'weapons')


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


# ---------- materials ----------

def mat(name, color, metallic=1.0, roughness=0.3, emission=None, strength=0.0,
        alpha=1.0, transmission=0.0, coat=0.0):
    """Principled material. color/emission are linear RGB tuples."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = roughness
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = strength
    if transmission:
        b.inputs['Transmission Weight'].default_value = transmission
    if coat:
        b.inputs['Coat Weight'].default_value = coat
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    return m


def srgb(hex_value):
    """'#rrggbb' -> linear RGB tuple."""
    h = hex_value.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


# ---------- objects ----------

def _link(obj, material=None):
    bpy.context.scene.collection.objects.link(obj)
    if material:
        obj.data.materials.append(material)
    return obj


def from_bmesh(name, bm, material=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    return _link(bpy.data.objects.new(name, me), material)


def outline(name, pts, thickness, material=None, edge=0.0, segments=1, holes=()):
    """Flat outline in the XZ plane, given as [(x, z), ...] counter-clockwise,
    extruded to `thickness` along Y and centered. `edge` > 0 adds a chamfer of
    that width all around (reads as a sharpened edge on blades). `holes` is a
    list of (x, z, r) circles cut through."""
    bm = bmesh.new()
    verts = [bm.verts.new((x, 0, z)) for x, z in pts]
    bm.faces.new(verts)
    bmesh.ops.triangulate  # keep linter quiet
    res = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    ext = [g for g in res['geom'] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=ext, vec=(0, thickness, 0))
    bmesh.ops.translate(bm, verts=bm.verts[:], vec=(0, -thickness / 2, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = from_bmesh(name, bm, material)
    for (hx, hz, hr) in holes:
        cut = cylinder(name + '_hole', hr, thickness * 4, (hx, 0, hz), axis='Y')
        boolean(obj, cut)
    if edge > 0:
        bev(obj, edge, segments, limit='ANGLE')
    return obj


def bev(obj, width, segments=2, limit='ANGLE', angle=30):
    m = obj.modifiers.new('bevel', 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = limit
    if limit == 'ANGLE':
        m.angle_limit = math.radians(angle)
    m.harden_normals = True
    return m


def subsurf(obj, levels=2):
    m = obj.modifiers.new('subsurf', 'SUBSURF')
    m.levels = levels
    m.render_levels = levels
    return m


def smooth(obj, angle=35):
    for p in obj.data.polygons:
        p.use_smooth = True
    try:
        obj.data.set_sharp_from_angle(angle=math.radians(angle))
    except AttributeError:
        pass
    return obj


def boolean(obj, cutter, op='DIFFERENCE'):
    m = obj.modifiers.new('bool', 'BOOLEAN')
    m.operation = op
    m.object = cutter
    m.solver = 'EXACT'
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def cylinder(name, r, depth, loc=(0, 0, 0), axis='Z', verts=32, material=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=verts, radius1=r, radius2=r, depth=depth)
    obj = from_bmesh(name, bm, material)
    if axis == 'Y':
        obj.rotation_euler = (math.radians(90), 0, 0)
    elif axis == 'X':
        obj.rotation_euler = (0, math.radians(90), 0)
    obj.location = loc
    return obj


def lathe(name, profile, material=None, segments=48, loc=(0, 0, 0)):
    """Revolve [(radius, z), ...] around the Z axis."""
    bm = bmesh.new()
    rings = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        rings.append([bm.verts.new((r * math.cos(a), r * math.sin(a), z)) for r, z in profile])
    for i in range(segments):
        A, B = rings[i], rings[(i + 1) % segments]
        for k in range(len(profile) - 1):
            bm.faces.new((A[k], B[k], B[k + 1], A[k + 1]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    obj = from_bmesh(name, bm, material)
    obj.location = loc
    return smooth(obj)


def tube(name, points, radius, material=None, bevel_res=4, closed=False):
    """Smooth tube through [(x, y, z), ...] (wraps, chains, cords)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = bevel_res
    sp = cu.splines.new('NURBS')
    sp.points.add(len(points) - 1)
    for p, co in zip(sp.points, points):
        p.co = (*co, 1)
    sp.use_endpoint_u = True
    sp.order_u = 3
    sp.use_cyclic_u = closed
    obj = _link(bpy.data.objects.new(name, cu), material)
    return obj


def helix(radius, z0, z1, turns, steps=240, phase=0.0):
    return [(radius * math.cos(phase + 2 * math.pi * turns * t / steps),
             radius * math.sin(phase + 2 * math.pi * turns * t / steps),
             z0 + (z1 - z0) * t / steps) for t in range(steps + 1)]


def box(name, size, loc=(0, 0, 0), material=None, bevel=0.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts[:])
    obj = from_bmesh(name, bm, material)
    obj.location = loc
    if bevel:
        bev(obj, bevel, 2, limit='NONE')
    return obj


def sphere(name, r, loc=(0, 0, 0), material=None, scale=(1, 1, 1)):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=r)
    obj = from_bmesh(name, bm, material)
    obj.location = loc
    obj.scale = scale
    return smooth(obj)


def mirror_x(obj):
    m = obj.modifiers.new('mirror', 'MIRROR')
    m.use_axis[0] = True
    m.use_clip = True
    return m


# ---------- export ----------

def ground_and_center():
    """Put the lowest point of everything on z = 0."""
    objs = [o for o in bpy.context.scene.objects if o.type in ('MESH', 'CURVE')]
    deps = bpy.context.evaluated_depsgraph_get()
    zmin = min((o.evaluated_get(deps).matrix_world @ Vector(c)).z
               for o in objs for c in o.evaluated_get(deps).bound_box)
    for o in objs:
        if o.parent is None:
            o.location.z -= zmin


def export(weapon_id):
    ground_and_center()
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, f'{weapon_id}.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=True,
                              export_yup=True, export_materials='EXPORT')
    print('EXPORTED', path)
    return path
