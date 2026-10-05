// Bundles src/ with three.js and GSAP (from vendor/) into dist/: one main file, one shared
// chunk and the smithy as its own chunk (src/main.js imports it on demand). Everything is
// minified (except the meshopt decoder, see below); three.js is tree-shaken to what the scene uses, so the first view fetches about
// 240 KB (gzip) in three requests instead of 320 KB in thirty.
// Usage: node tools/build.mjs        (fetches esbuild once through npx)
import { execSync } from 'node:child_process';
import { readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = join(root, 'vendor');
rmSync(join(root, 'dist'), { recursive: true, force: true });
const q = (p) => JSON.stringify(p);
execSync(['npx --yes esbuild@0.28.2 src/main.js src/i18n.js',
  '--bundle --format=esm --splitting --minify --target=es2020 --outdir=dist --entry-names=[name] --chunk-names=[name]-[hash]',
  `--alias:three=${q(join(vendor, 'three/build/three.module.js'))}`,
  `--alias:three/addons=${q(join(vendor, 'three/examples/jsm'))}`,
  `--alias:gsap=${q(join(vendor, 'gsap/index.js'))}`,
  // the meshopt decoder builds its workers from its own functions' source text, which minifying
  // breaks: it stays a separate, untouched file (index.html maps the specifier to vendor/)
  '--external:meshopt-decoder',
  '--legal-comments=none --log-level=warning'].join(' '), { cwd: root, stdio: 'inherit' });
for (const f of readdirSync(join(root, 'dist'))) console.log(`dist/${f}  ${(statSync(join(root, 'dist', f)).size / 1024).toFixed(0)} KB`);
