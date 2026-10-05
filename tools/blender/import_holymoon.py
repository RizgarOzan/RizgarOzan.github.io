"""Holy Moonlight Sword (Bloodborne, Ludwig's Holy Blade), Bunny-HungTD's Sketchfab model (CC-BY).

blender -b --factory-startup -P tools/blender/import_holymoon.py
Reads  C:/Users/forev/Downloads/kilic/sf/moonlight-greatsword-ludwigs-holy-blade/
       (source/Moonlight Greatsword.zip -> source/x/Moonlight Greatsword.obj, unzipped by hand;
        textures/Moonlight_Greatsword_{albedo,ao,roughness,metallic,normal,emis}.png;
        uid 2b551a49e230443bbfc4b8b9eb5c2643)
Writes assets/weapons/holymoon.glb.

One 2.2k-tri mesh, kept as downloaded. The blade's albedo is black: its colour is the cyan
emissive map, exported as glTF emissive (factor 1). AO/roughness/metallic -> ORM. The cavity
map is not used (Sketchfab's cavity slot only darkens crevices slightly). The albedo's alpha is
a mask, not opacity, and is dropped. The two loose parts become holymoon_blade / holymoon_hilt.
"""
import os
import sys

sys.path.append(os.path.dirname(__file__))
import bpy
import numpy as np
from mathutils import Matrix
from sf_pbr import reset, load_source, coords, fit, split, read, save_jpeg, orm, pbr_material, export_glb

DIR = r'C:\Users\forev\Downloads\kilic\sf\moonlight-greatsword-ludwigs-holy-blade'
LENGTH = 1.75   # m; the source is 1744 units (mm) tall
SIZE = (2048, 2048)

reset()
src = load_source(os.path.join(DIR, 'source', 'x', 'Moonlight Greatsword.obj'))  # Z up, width X, flat on Y
v = coords(src)
z0, z1 = v[:, 2].min(), v[:, 2].max()
widest = v[np.argmax(np.abs(v[:, 0])), 2]                  # crossguard tip
if widest - z0 < z1 - widest:                              # guard near the bottom -> tip is up; flip
    src.data.transform(Matrix.Rotation(np.pi, 4, 'X'))
fit(src, LENGTH, grip_band=(0.86, 0.95))


def classify(lo, hi, c):
    return 'blade' if lo < 0.05 else 'hilt'      # two loose parts: blade, guard+grip+pommel


parts = split(src, 'holymoon', classify)

tex = lambda n: read(os.path.join(DIR, 'textures', f'Moonlight_Greatsword_{n}.png'), SIZE)
m = pbr_material('holymoon',
                 save_jpeg('holymoon', 'albedo', tex('albedo')[..., :3], data=False),
                 save_jpeg('holymoon', 'orm', orm(tex('ao')[..., 0], tex('roughness')[..., 0],
                                                  tex('metallic')[..., 0])),
                 save_jpeg('holymoon', 'normal', tex('normal')[..., :3], quality=92))
nt = m.node_tree
bsdf = nt.nodes['Principled BSDF']
te = nt.nodes.new('ShaderNodeTexImage')
te.image = save_jpeg('holymoon', 'emissive', tex('emis')[..., :3], data=False)
nt.links.new(te.outputs['Color'], bsdf.inputs['Emission Color'])
bsdf.inputs['Emission Strength'].default_value = 1.0
for p in parts:
    p.data.materials.clear()
    p.data.materials.append(m)

export_glb('holymoon', parts)
