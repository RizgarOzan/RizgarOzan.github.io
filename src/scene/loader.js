// One glTF loader for the whole site. Assets are meshopt-compressed with WebP
// textures (tools/optimize-assets.sh), so the decoder is attached here once.
// Decoding runs in workers, so a big file never holds a frame.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// 'meshopt-decoder' stays outside the bundle (tools/build.mjs); index.html maps it to vendor/
import { MeshoptDecoder } from 'meshopt-decoder';

MeshoptDecoder.useWorkers?.(2);
export const gltfLoader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);

// Downloads go out a few at a time, lowest priority number first (then in the
// order asked), so on a slow line the front sword arrives first instead of
// everything arriving late together. Priority LATER and up (the ruins, the smithy,
// sharp copies fetched ahead) goes one file at a time, only while nothing more
// urgent is waiting or on its way, and never in the last free slot: on a slow line
// a big file must not share the line with the swords, and a sword opened meanwhile
// must be able to start its sharp copy at once.
// Jobs asked for in the same moment are sorted before any of them starts.
const MAX = 3;
const LATER = 5;
let active = 0, urgent = 0, big = 0, queued = false;
const waiting = [];
function next() {
  queued = false;
  while (active < MAX && waiting.length) {
    const job = waiting[0];
    const later = job.priority >= LATER;
    if (later && (urgent > 0 || big > 0 || active >= MAX - 1)) return;
    waiting.shift();
    active++;
    if (later) big++; else urgent++;
    job.run().finally(() => { active--; if (later) big--; else urgent--; next(); });
  }
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
    const job = { priority, run: () => gltfLoader.loadAsync(url).then(resolve, reject) };
    const at = waiting.findIndex((j) => j.priority > priority);
    waiting.splice(at < 0 ? waiting.length : at, 0, job);
    if (!queued) { queued = true; setTimeout(next, 0); }
  });
}
