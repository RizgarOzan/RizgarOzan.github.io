// Makes the two ruin files the site loads from the Blender export (tools/blender/ruins.py):
//   assets/env/ruins-near.glb   the ring around the field (walls, arch, colonnade, cella, trees, ivy)
//   assets/env/ruins-far.glb    the keep, the colossus, the bridge, the far silhouettes, the castle
// and shrinks them without changing the picture:
//   - flat-shaded pieces (every face with its own normals, so nothing is shared between faces)
//     lose their NORMAL attribute and get a "<material>_flat" material; world.js draws those with
//     flatShading, which gives the very same faceting from screen derivatives. With the normals
//     gone the vertices weld, and the welded mesh can be simplified.
//   - the far silhouette layers (stone_far) are drawn untextured and melt into the fog, so they
//     also lose their UVs.
//   - positions, normals, colours and UVs are quantized (KHR_mesh_quantization), meshopt packs the rest.
// Usage: node tools/ruins-lod.mjs [assets/env/ruins.glb]   (the export; left untouched)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// gltf-transform's libraries from the npx cache that tools/optimize-assets.sh fills
const cache = execSync('npm config get cache', { encoding: 'utf8' }).trim();
const { readdirSync, existsSync } = await import('node:fs');
const base = readdirSync(join(cache, '_npx')).map((d) => join(cache, '_npx', d, 'node_modules')).find((d) => existsSync(join(d, '@gltf-transform/functions')));
if (!base) throw new Error('run tools/optimize-assets.sh once so npx fetches @gltf-transform/cli');
const require = createRequire(join(base, 'x.js'));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { weld, simplifyPrimitive, quantize, meshopt, prune } = require('@gltf-transform/functions');
const { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } = require('meshoptimizer');
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

// which export mesh goes to which file, and how far each may be simplified (1 = not at all)
const NEAR = { wall_nl: 1, drums_nl: 1, wall_nr: 1, stump_nr: 1, debris_c: 1, arch_c: 1, colonnade: 1, cella: 1, glow: 1, deadtrees: 1, ivy: 1 };
// Nothing is simplified: every piece is masonry of separate blocks (the far layers too), and
// the simplifier shears those into flakes. A ratio below 1 here is for trying, with a screenshot.
const FAR = { keep: 1, aqueduct: 1, bridge: 1, colossus: 1, far: 1, castle: 1 };
const SILHOUETTE = new Set(['stone_far']); // untextured in world.js: UVs are dead weight
const key = (name) => name.replace(/_\d+$/, '');

function isFlat(prim) {
  const idx = prim.getIndices(), n = prim.getAttribute('NORMAL');
  if (!idx || !n) return false;
  const a = [], b = [], c = [];
  let flat = 0;
  const tris = idx.getCount() / 3;
  for (let t = 0; t < tris; t++) {
    n.getElement(idx.getScalar(t * 3), a); n.getElement(idx.getScalar(t * 3 + 1), b); n.getElement(idx.getScalar(t * 3 + 2), c);
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 0.02 && Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]) + Math.abs(a[2] - c[2]) < 0.02) flat++;
  }
  return flat / tris > 0.9;
}

async function make(src, keepSet, out) {
  const doc = await io.read(src);
  const root = doc.getRoot();
  const flatMats = new Map();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (!(key(mesh.getName()) in keepSet)) { node.setMesh(null); node.dispose(); continue; }
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const mname = mat?.getName() || '';
      if (SILHOUETTE.has(mname)) prim.setAttribute('TEXCOORD_0', null);
      if (isFlat(prim)) {
        prim.setAttribute('NORMAL', null);
        if (!flatMats.has(mname)) flatMats.set(mname, mat.clone().setName(`${mname}_flat`));
        prim.setMaterial(flatMats.get(mname));
      }
    }
  }
  await doc.transform(prune({ keepLeaves: true }), ...(process.env.NOWELD ? [] : [weld()]));
  for (const mesh of root.listMeshes()) {
    const ratio = keepSet[key(mesh.getName())];
    for (const prim of mesh.listPrimitives()) {
      const before = prim.getIndices().getCount() / 3;
      if (ratio < 1 && !process.env.NOSIMP) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: 0.01, lockBorder: true });
      console.log(`  ${mesh.getName().padEnd(14)} ${prim.getMaterial()?.getName().padEnd(16)} tris ${String(before).padStart(6)} -> ${String(prim.getIndices().getCount() / 3).padStart(6)}  verts ${prim.getAttribute('POSITION').getCount()}`);
    }
  }
  await doc.transform(...(process.env.NOQUANT ? [] : [quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeColor: 8, quantizeTexcoord: 12 })]), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(out, doc);
  const { statSync } = await import('node:fs');
  console.log(`${out}: ${(statSync(out).size / 1024).toFixed(0)} KB`);
}

const src = process.argv[2] || join(root, 'assets/env/ruins.glb');
console.log('near');
await make(src, NEAR, join(root, 'assets/env/ruins-near.glb'));
console.log('far');
await make(src, FAR, join(root, 'assets/env/ruins-far.glb'));
