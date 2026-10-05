// Light copy of a GLB for the web: textures shrunk, chosen meshes simplified, meshopt-packed.
//   node tools/parts-lod.mjs <in.glb> <out.glb> [--tex N] [--tex-big N --big <regex>] [--quality Q] [mesh=ratio ...]
//   --tex N        every texture resized to fit N px (WebP, --quality, default 80)
//   --tex-big N    textures whose name matches --big fit N px instead (big wall and floor maps)
//   mesh=ratio     simplify that mesh (by node/mesh name) to ratio of its triangles (welded first)
// Used by tools/optimize-assets.sh for the field swords' light copies and for the smithy.
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { statSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1]; };
const [inp, out] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--') && !a.includes('='));
const ratios = Object.fromEntries(args.filter((a) => a.includes('=') && !a.startsWith('--')).map((a) => a.split('=')).map(([k, v]) => [k, +v]));
const tex = +opt('--tex', 0), texBig = +opt('--tex-big', 0), big = opt('--big') ? new RegExp(opt('--big')) : null, quality = +opt('--quality', 80);

const cache = execSync('npm config get cache', { encoding: 'utf8' }).trim();
const base = readdirSync(join(cache, '_npx')).map((d) => join(cache, '_npx', d, 'node_modules')).find((d) => existsSync(join(d, '@gltf-transform/functions')));
if (!base) throw new Error('run tools/optimize-assets.sh once so npx fetches @gltf-transform/cli');
const require = createRequire(join(base, 'x.js'));
const { NodeIO } = require('@gltf-transform/core');
const { ALL_EXTENSIONS } = require('@gltf-transform/extensions');
const { weld, simplifyPrimitive, meshopt, textureCompress, prune } = require('@gltf-transform/functions');
const { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } = require('meshoptimizer');
const sharp = require('sharp');
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const doc = await io.read(inp);
if (tex) {
  // through PNG first, so the WebP is encoded once from the full image (a resize of a lossy
  // WebP would re-encode it at the default quality)
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'png' }));
  if (big && texBig) await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality, resize: [texBig, texBig], pattern: big }));
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', quality, resize: [tex, tex], pattern: big ? new RegExp(`^(?!${big.source})`) : undefined }));
}
if (Object.keys(ratios).length) {
  await doc.transform(weld());
  for (const mesh of doc.getRoot().listMeshes()) {
    const ratio = ratios[mesh.getName()];
    if (!(ratio < 1)) continue;
    for (const prim of mesh.listPrimitives()) {
      const before = prim.getIndices().getCount() / 3;
      simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: 0.001 });
      console.log(`  ${mesh.getName().padEnd(20)} tris ${String(before).padStart(6)} -> ${String(prim.getIndices().getCount() / 3).padStart(6)}`);
    }
  }
}
// keepLeaves: the empties are placement markers (the smithy's anvil_slot, log_slot, rack_slot_*)
await doc.transform(prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(out, doc);
console.log(`${out}: ${(statSync(out).size / 1024).toFixed(0)} KB`);
