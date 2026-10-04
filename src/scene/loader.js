// One glTF loader for the whole site. Assets are meshopt-compressed with WebP
// textures (tools/optimize-assets.sh), so the decoder is attached here once.
// Decoding runs in workers, so a big file never holds a frame.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

MeshoptDecoder.useWorkers?.(2);
export const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

// Downloads go out a few at a time, lowest priority number first (then in the
// order asked), so on a slow line the front sword arrives first instead of
// everything arriving late together.
const MAX = 3;
let active = 0;
const waiting = [];
function next() {
  while (active < MAX && waiting.length) { active++; waiting.shift().run(); }
}
// How fast files arrive, in bytes per second, from the big downloads finished so far
// (Resource Timing; a cached file counts as fast). 0 until one is in.
export function linkSpeed() {
  let bytes = 0, ms = 0;
  for (const r of performance.getEntriesByType('resource')) {
    if (r.encodedBodySize < 100000) continue;
    bytes += r.encodedBodySize;
    ms += Math.max(1, r.responseEnd - r.responseStart);
  }
  return ms ? (bytes / ms) * 1000 : 0;
}

export function loadGLB(url, priority = 5) {
  return new Promise((resolve, reject) => {
    const job = { priority, run: () => gltfLoader.loadAsync(url).then(resolve, reject).finally(() => { active--; next(); }) };
    const at = waiting.findIndex((j) => j.priority > priority);
    waiting.splice(at < 0 ? waiting.length : at, 0, job);
    next();
  });
}
