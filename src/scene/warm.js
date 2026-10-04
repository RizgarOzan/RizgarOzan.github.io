// Nothing new goes on screen until the GPU is ready for it. Building a shader
// program on first use stalls the frame for as long as the driver needs (on
// Windows/ANGLE, seconds for a whole scene), so programs are built ahead with
// compileAsync (KHR_parallel_shader_compile: off the main thread), including the
// variants the renderer would otherwise build mid-frame: shadow depth, the
// depth-of-field pass and faded (transparent) copies.
//
// Measured on the Radeon 780M (ANGLE/D3D11): compiling in the background costs
// nothing on screen, but the first query of newly built programs holds the GPU
// process for ~0.3 s however many are pending, and the first real draws with
// them (new shader + target + blend combinations) hold it again. So arrivals
// are batched: warm() uploads its textures, compiles, then waits for the next
// settle(), which primes everything compiled so far, lets each member put
// itself on stage (in the scene, not yet shown), draws one rehearsal frame
// off screen (world.rehearse) and only then lets them appear. main.js calls
// settle() where a pause costs least: before the first frame, once the intro
// camera move is over, and when the smithy has loaded.
import * as THREE from 'three';

// What WebGLShadowMap draws a caster with (getDepthMaterial in three r170).
const SHADOW_SIDE = { [THREE.FrontSide]: THREE.BackSide, [THREE.BackSide]: THREE.FrontSide, [THREE.DoubleSide]: THREE.DoubleSide };
const SHADOW = {
  depth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), // directional and spot lights
  distance: new THREE.MeshDistanceMaterial(), // point lights
};
function shadowVariant(kind, m) {
  const d = SHADOW[kind].clone();
  d.side = m.shadowSide ?? SHADOW_SIDE[m.side];
  for (const k of ['visible', 'wireframe', 'alphaMap', 'alphaTest', 'map', 'displacementMap', 'displacementScale', 'displacementBias']) d[k] = m[k];
  return d;
}
// A copy that shares the original's program key, drawn see-through (fading out of the way).
function fadeVariant(m) {
  const v = m.clone();
  v.onBeforeCompile = m.onBeforeCompile;
  v.customProgramCacheKey = m.customProgramCacheKey;
  v.transparent = true;
  return v;
}
// Same kind of object over the same geometry, so every per-object part of the key matches.
function standIn(o, material) {
  if (o.isInstancedMesh) return new THREE.InstancedMesh(o.geometry, material, 1);
  if (o.isPoints) return new THREE.Points(o.geometry, material);
  if (o.isSprite) return new THREE.Sprite(material);
  return new THREE.Mesh(o.geometry, material);
}

function texturesOf(root) {
  const out = new Set();
  const add = (v) => { if (v && v.isTexture && !v.isRenderTargetTexture) out.add(v); };
  root.traverse((o) => {
    for (const m of [].concat(o.material || [])) {
      for (const k of Object.keys(m)) add(m[k]);
      if (m.uniforms) for (const u of Object.values(m.uniforms)) add(u?.value);
    }
  });
  return out;
}

const frame = () => new Promise((r) => requestAnimationFrame(r));
// The scene stops drawing (main.js: world.paused) and the GPU is given two frames
// to drain. A query waits for the GPU process to get through what is queued: with
// frames streaming back to back (no vsync) priming took 300-850 ms, with the
// queue empty 30-90 ms. The caller lowers world.paused when done.
async function quiet(world) {
  world.paused = (world.paused || 0) + 1;
  if (!world.shown) return; // nothing is drawing yet
  await frame();
  await frame();
}
// Upload textures across frames, a few milliseconds' worth per frame.
export async function uploadTextures(world, textures, budget = 4) {
  const list = [...textures].filter((t) => t.image && t.version > 0 && !world.renderer.properties.get(t).__webglTexture);
  while (list.length) {
    const t0 = performance.now();
    do world.renderer.initTexture(list.shift()); while (list.length && performance.now() - t0 < budget);
    if (list.length) await frame();
  }
}

// A program's first use asks the driver for its uniforms and attributes;
// done here instead of in the middle of a frame that draws it.
async function prime(world, materials) {
  const programs = new Set();
  for (const m of materials) for (const p of world.renderer.properties.get(m).programs?.values() || []) programs.add(p);
  const list = [...programs];
  // compileAsync only waits for each material's last program; wait for them all
  while (list.some((p) => !p.isReady())) await frame();
  for (const p of list) { p.getUniforms(); p.getAttributes(); }
}

const waiting = []; // warming, to be landed by settle()
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise((r) => setTimeout(r, 0));
// Land everything of one batch compiled so far (and still compiling) at once.
// below: the batch is the smithy (rehearsed with its lights).
// soon: only what has finished compiling (and anything warmed with must).
export async function settle(world, { below = false, batch: name = 'field', soon = false } = {}) {
  await tick(); // let warm() calls just started register
  const batch = waiting.filter((b) => b.batch === name && (!soon || b.must || b.isCompiled));
  batch.forEach((b) => waiting.splice(waiting.indexOf(b), 1));
  if (!batch.length) return;
  await Promise.all(batch.map((b) => b.compiled.promise));
  await quiet(world);
  try {
    await prime(world, new Set(batch.flatMap((b) => [...b.materials])));
    batch.forEach((b) => b.primed.resolve());
    await Promise.all(batch.map((b) => b.staged.promise));
    world.rehearse?.(below);
  } finally {
    world.paused--;
  }
  batch.forEach((b) => b.landed.resolve());
}

// Upload root's textures and compile every program it needs, as it will be
// drawn (lit by target's lights, in its fog and reflections); then wait for the
// next settle(). root need not be in the scene.
//   shadows: shadow-map kinds its casters are drawn into ('depth', 'distance')
//   depthPass: an override material the scene is also drawn with (depth of field)
//   fade: also the see-through copies of lit materials
//   stage: called once primed, to put root in the scene (hidden:
//          give it userData.landing so the rehearsal draws it); warm() returns
//          after the rehearsal, when it may be shown
//   batch: which settle() lands it ('field' unless said otherwise)
//   must: a settle({ soon }) waits for it
export async function warm(world, root, { target = world.scene, shadows = [], depthPass = null, fade = false, stage = null, batch = 'field', must = false } = {}) {
  const member = { batch, must, materials: new Set(), compiled: deferred(), primed: deferred(), staged: deferred(), landed: deferred() };
  waiting.push(member);
  try {
    await compile(world, root, member.materials, { target, shadows, depthPass, fade });
  } catch (err) {
    console.error(err); // drawn anyway; it would only be built on first use
  } finally {
    member.isCompiled = true;
    member.compiled.resolve();
  }
  await member.primed.promise;
  stage?.();
  member.staged.resolve();
  await member.landed.promise;
}

async function compile(world, root, materials, { target, shadows, depthPass, fade }) {
  const { renderer, camera, composer } = world;
  // Textures first: an upload queued behind the driver's work on new programs
  // waits for all of it (seen: one 2k texture holding a frame for 0.7 s).
  await uploadTextures(world, texturesOf(root));
  const items = [], seen = new Set();
  const add = (o, materials, shadow) => {
    const material = Array.isArray(o.material) ? materials : materials[0];
    const key = [].concat(material).map((m) => m.uuid).join() + (o.isInstancedMesh ? 'i' : o.isPoints ? 'p' : o.isSprite ? 's' : 'm') + Object.keys(o.geometry?.attributes || {}).join() + shadow;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ o: standIn(o, material), shadow });
  };
  root.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isSprite) || !o.material) return;
    const list = [].concat(o.material);
    add(o, list, false);
    if (o.castShadow && !o.isPoints && !o.isSprite) for (const kind of shadows) add(o, list.map((m) => shadowVariant(kind, m)), true);
    if (depthPass) add(o, list.map(() => depthPass.clone()), false);
    if (fade && list.some((m) => m.isMeshStandardMaterial)) add(o, list.map(fadeVariant), false);
  });
  const lit = new THREE.Group(), cast = new THREE.Group();
  for (const { o, shadow } of items) {
    (shadow ? cast : lit).add(o);
    for (const m of [].concat(o.material)) materials.add(m);
  }
  const jobs = [];
  const rt = renderer.getRenderTarget(), fog = target.fog;
  try {
    // Drawn into a render target (the composer's): linear, not tone mapped, like the real frame.
    renderer.setRenderTarget(composer.readBuffer);
    if (lit.children.length) jobs.push(renderer.compileAsync(lit, camera, target));
    // Shadow maps are drawn with no scene around them (no fog) but the same lights.
    target.fog = null;
    if (cast.children.length) jobs.push(renderer.compileAsync(cast, camera, target));
  } finally {
    target.fog = fog;
    renderer.setRenderTarget(rt);
  }
  await Promise.all(jobs);
}

// The post-processing passes' own full-screen materials (each drawn on a quad
// with no scene lights; the last pass draws to the screen).
export async function warmPasses(world, { skip = [] } = {}) {
  const { renderer, camera, composer } = world;
  const jobs = [], all = new Set();
  const member = { batch: 'field', must: true, materials: all, compiled: deferred(), primed: deferred(), staged: deferred(), landed: deferred() };
  member.staged.resolve();
  waiting.push(member);
  const passes = composer.passes;
  passes.forEach((p, i) => {
    // OutputPass picks its defines on first render; set them the same way now.
    if (p.constructor.name === 'OutputPass' && p.material) {
      p.material.defines = {};
      if (THREE.ColorManagement.getTransfer(renderer.outputColorSpace) === THREE.SRGBTransfer) p.material.defines.SRGB_TRANSFER = '';
      if (renderer.toneMapping === THREE.ACESFilmicToneMapping) p.material.defines.ACES_FILMIC_TONE_MAPPING = '';
      p._outputColorSpace = renderer.outputColorSpace; p._toneMapping = renderer.toneMapping;
      p.material.needsUpdate = true;
    }
    const mats = new Set();
    for (const v of Object.values(p)) for (const m of [].concat(v)) if (m && m.isMaterial && !skip.includes(m)) mats.add(m);
    const geo = p.fsQuad?._mesh?.geometry || new THREE.PlaneGeometry(2, 2);
    const toScreen = i === passes.length - 1;
    for (const m of mats) {
      all.add(m);
      const quad = new THREE.Mesh(geo, m);
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(toScreen ? null : composer.readBuffer);
      jobs.push(renderer.compileAsync(quad, camera));
      renderer.setRenderTarget(prev);
    }
  });
  await Promise.all(jobs).catch((err) => console.error(err));
  member.isCompiled = true;
  member.compiled.resolve();
  await member.landed.promise;
}
