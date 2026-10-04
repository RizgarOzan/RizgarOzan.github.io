// The smithy under the field (Demirhane): reached by scrolling down.
// The anvil holds what is being forged right now, the slate board carries the
// open-source ledger, and the wall rack holds favourite blades that have no
// project yet. The room itself is assets/env/forge.glb (tools/blender/forge_room.py);
// its empties mark where things go. Without the file a bare room stands in.
// A hammer with no smith works the hot blade while Rızgar is probably at the
// forge (clock.js); otherwise it lies on the anvil and the hearth burns low.
import * as THREE from 'three';
import { loadGLB } from './loader.js';
import { warm, settle } from './warm.js';
import { entries, rack } from '../data.js';
import { loadWeapon } from './field.js';
import { collectSway } from './sway.js';
import { localNow, whereabouts, daylight } from '../clock.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);
const AXIS_Z = V(0, 0, 1);
const FLOOR = -14;
// The hammer's own frame (tools/blender/forge_room.py): head centre along the handle, face below its axis.
const HAM_X = 0.4, HAM_FACE = -0.074;
const HOME = { pos: V(0.3, -12.4, 5.3), look: V(0.1, -12.88, -1) };
// A phone's tall, narrow frame: from the front left, with a wider lens (field.js applies
// portraitFov down here), so the anvil, the board and the hearth all fit.
const PORTRAIT_HOME = { pos: V(-2.05, -12.0, 5.9), look: V(0.6, -12.72, -1.6) };
const PORTRAIT_FOV = 56;
// The blades on the wall rack, by model id: shown by name on hover, not opened.
const RACK_NAMES = { oathkeeper: 'Oathkeeper', purenail: 'Pure Nail', chaos: 'Blades of Chaos' };
const isPortrait = () => window.innerWidth < window.innerHeight * 0.9;
const FALLBACK = {
  anvil_slot: V(-0.8, FLOOR + 0.81, 0.4),
  forge_board: V(0, -12.3, -3.4),
  forge_light: V(2.65, FLOOR + 0.88, -2.85),
  rack: [V(-3.45, -12.2, -3.29), V(-2.9, -12.2, -3.29), V(-2.35, -12.2, -3.29), V(-1.85, -12.2, -3.29)],
};
// How hard the hearth burns for each whereabouts key (clock.js).
const HEAT = { forge: 1, morning: 0.7, school: 0.36, sleep: 0.12 };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const frame = () => new Promise((r) => requestAnimationFrame(r));

// ?hour=14 (Istanbul) and optionally ?day=1 (0 = Sunday) pin the clock for testing.
const query = new URLSearchParams(location.search);
function clockNow() {
  const h = parseFloat(query.get('hour'));
  if (!Number.isFinite(h)) return localNow();
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  const now = localNow(new Date(d.getTime() + (h - 3) * 3600e3));
  return query.has('day') ? { ...now, day: Number(query.get('day')) } : now;
}

function fallbackRoom() {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.95 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 10), stone);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR, 0.5);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), stone);
  wall.position.set(0, FLOOR + 3, -3.5);
  const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.81, 0.3), new THREE.MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.8, roughness: 0.45 }));
  anvil.position.set(-0.8, FLOOR + 0.405, 0.4);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.008, 0.04));
  blade.name = 'anvil_blade';
  blade.position.set(-0.84, FLOOR + 0.814, 0.4);
  // same frame as the modelled one: grip at the origin, handle along +x, face toward -y
  const hammer = new THREE.Group();
  hammer.name = 'forge_hammer';
  const iron = new THREE.MeshStandardMaterial({ color: 0x222326, metalness: 0.8, roughness: 0.5 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.13, 0.052), iron);
  head.position.set(HAM_X, HAM_FACE + 0.065, 0);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.43, 8), new THREE.MeshStandardMaterial({ color: 0x8a6a4c, roughness: 0.8 }));
  handle.rotation.z = Math.PI / 2;
  handle.position.x = 0.215;
  hammer.add(head, handle);
  [floor, wall, anvil].forEach((m) => { m.receiveShadow = true; m.castShadow = true; g.add(m); });
  g.add(blade, hammer);
  return g;
}

// Heat along the blade (u: tang 0 -> tip 1) as an emissive map, with darker
// flecks of scale; the colour map carries the same scale as grey oxide.
function bladeMaps() {
  const W = 512, H = 64;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const heat = mk(), base = mk();
  const h = heat.getContext('2d'), b = base.getContext('2d');
  const g = h.createLinearGradient(0, 0, W, 0);
  [[0, '#000'], [0.22, '#000'], [0.3, '#1c0300'], [0.38, '#5a0d00'], [0.46, '#b82600'], [0.54, '#ff6410'],
    [0.62, '#ffb245'], [0.7, '#ffc862'], [0.8, '#ff9a30'], [0.9, '#f26a16'], [1, '#c8400a']].forEach(([o, c]) => g.addColorStop(o, c));
  h.fillStyle = g; h.fillRect(0, 0, W, H);
  b.fillStyle = '#2c2826'; b.fillRect(0, 0, W, H);
  for (let i = 0; i < 520; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = 1 + Math.random() * 3.5;
    h.fillStyle = `rgba(0,0,0,${0.25 + Math.random() * 0.45})`;
    h.beginPath(); h.ellipse(x, y, r * 1.8, r, 0, 0, Math.PI * 2); h.fill();
    b.fillStyle = `rgba(${90 + Math.random() * 40},${84 + Math.random() * 30},${80 + Math.random() * 30},${0.3 + Math.random() * 0.4})`;
    b.beginPath(); b.ellipse(x, y, r * 1.8, r, 0, 0, Math.PI * 2); b.fill();
  }
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { emissiveMap: tex(heat, true), map: tex(base, true) };
}

// A pool of additive points: sparks off the anvil, embers off the coals,
// dust in the moon shaft. Each owns its own arrays; all share one shader.
function points(N, { size, color, soft = false }) {
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N), max = new Float32Array(N).fill(1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPR: { value: Math.min(window.devicePixelRatio, 1.75) }, uSize: { value: size }, uColor: { value: new THREE.Vector3(...color) } },
    vertexShader: 'attribute float aLife; uniform float uPR, uSize; varying float vL; void main(){ vL = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(uSize * (0.5 + 0.5 * aLife) * (6.0 / -mv.z), 7.0) * uPR; gl_Position = projectionMatrix * mv; }',
    // soft: fades in and out over its life (dust) instead of burning down (sparks, embers)
    fragmentShader: `uniform vec3 uColor; varying float vL; void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5 || vL <= 0.0) discard;
      ${soft ? 'gl_FragColor = vec4(uColor, sin(vL * 3.1416) * (1.0 - r * 2.0));' : 'gl_FragColor = vec4(mix(vec3(0.9, 0.18, 0.02), uColor, vL), vL * (1.0 - r * 2.0));'} }`,
  });
  const obj = new THREE.Points(geo, mat);
  obj.frustumCulled = false;
  return { obj, pos, vel, life, max, N, dirty() { geo.attributes.position.needsUpdate = true; geo.attributes.aLife.needsUpdate = true; } };
}

// Flames over the coals: one camera-facing quad, noise scrolled upward.
function flames() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: { value: 0 }, uHeat: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime, uHeat; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 p = vUv; float t = uTime;
        float f = n(vec2(p.x * 6.0, p.y * 3.0 - t * 2.2)) * 0.6 + n(vec2(p.x * 13.0, p.y * 6.0 - t * 3.7)) * 0.4;
        float width = 0.5 - abs(p.x - 0.5);
        float top = 0.15 + 0.75 * uHeat;
        float shape = smoothstep(0.0, 0.32, width) * (1.0 - smoothstep(top * 0.35, top, p.y + f * 0.35 * top));
        float k = shape * smoothstep(0.0, 0.08, p.y) * f * 1.6;
        vec3 c = mix(vec3(1.0, 0.25, 0.03), vec3(1.0, 0.75, 0.35), clamp(k * 1.2 - p.y * 0.5, 0.0, 1.0));
        gl_FragColor = vec4(c * k * 0.85 * smoothstep(0.1, 0.45, uHeat), 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.62), mat);
  m.geometry.translate(0, 0.31, 0);
  return m;
}

// The cold shaft from the hole in the vault: a soft additive cone, brightest
// where the eye looks through most of it, with slow drifting streaks of dust.
function shaftBeam(top, bottom, r0, r1, k, uTime) {
  const h = top.y - bottom.y;
  const geo = new THREE.CylinderGeometry(r0, r1, h, 40, 1, true);
  geo.translate(0, -h / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.FrontSide,
    uniforms: { uColor: { value: new THREE.Color(0x9fb4ff) }, uK: { value: k }, uH: { value: h }, uTime },
    vertexShader: `varying vec3 vN, vV; varying float vY, vA; void main(){ vec4 w = modelMatrix * vec4(position, 1.0);
      vY = -position.y; vA = atan(position.z, position.x); vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz);
      gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uK, uH, uTime; varying vec3 vN, vV; varying float vY, vA;
      void main(){
        float edge = pow(abs(dot(normalize(vN), normalize(vV))), 2.2);
        float y = vY / uH;
        float fade = smoothstep(0.0, 0.3, y) * (1.0 - smoothstep(0.78, 1.0, y)) * mix(1.25, 0.75, y);
        float streak = 0.7 + 0.3 * sin(vA * 9.0 + y * 4.0 + uTime * 0.11) * sin(vA * 4.0 - y * 2.5 - uTime * 0.07);
        gl_FragColor = vec4(uColor * edge * fade * streak * uK, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(top);
  m.renderOrder = 2;
  return m;
}

// Smoke over the coals, rising into the hood: a camera-turned quad of
// scrolling noise, lit orange from below, premultiplied so it both glows and veils.
function smoke() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, premultipliedAlpha: true, fog: false,
    uniforms: { uTime: { value: 0 }, uHeat: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime, uHeat; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main(){
        vec2 p = vUv; float t = uTime;
        float wx = (n(vec2(p.y * 3.0 - t * 0.6, 1.7)) - 0.5) * 0.25 * p.y;
        vec2 q = vec2((p.x + wx) * 3.2, p.y * 2.4 - t * 0.45);
        float f = n(q) * 0.55 + n(q * 2.1 + vec2(3.1, -t * 0.3)) * 0.3 + n(q * 4.3) * 0.15;
        float width = 0.18 + 0.22 * p.y;
        float body = 1.0 - smoothstep(width * 0.4, width, abs(p.x + wx - 0.5));
        float a = body * smoothstep(0.0, 0.2, p.y) * (1.0 - smoothstep(0.75, 1.0, p.y)) * smoothstep(0.42, 0.8, f);
        a *= 0.55 * (0.35 + 0.65 * uHeat);
        vec3 c = mix(vec3(1.0, 0.55, 0.25) * 0.9, vec3(0.3, 0.25, 0.22), smoothstep(0.0, 0.6, p.y));
        gl_FragColor = vec4(c * a, a);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.05), mat);
  m.geometry.translate(0, 0.525, 0);
  return m;
}

// Damp stone: seepage streaks down the walls, a wet band at their foot and
// puddles where rain comes down the shaft; wet patches go dark and glossy.
// Worked out from world position in the shader, so the GLB stays as it is.
function wetStone(mat, hole, floor) {
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWetP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWetP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWetP;
      float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(wh(i), wh(i + vec2(1, 0)), f.x), mix(wh(i + vec2(0, 1)), wh(i + vec2(1, 1)), f.x), f.y); }
      float wetness(vec3 p){
        float y = p.y - (${FLOOR.toFixed(1)});
        float u = p.x + p.z * 1.13;
        float streak = smoothstep(0.55, 0.85, wn(vec2(u * 7.0, 0.5))) * smoothstep(0.25, 0.75, wn(vec2(u * 2.3, y * 0.5 + 3.0)));
        float foot = 1.0 - smoothstep(0.05, 0.45 + 0.25 * wn(vec2(u * 3.0, 7.0)), y);
        float d = length(p.xz - vec2(${hole.x.toFixed(3)}, ${hole.z.toFixed(3)}));
        float puddle = (1.0 - smoothstep(0.5, 1.4, d)) * smoothstep(0.42, 0.6, wn(p.xz * 2.2));
        float damp = smoothstep(0.66, 0.8, wn(p.xz * 0.9 + 4.0)) * 0.6;
        ${floor ? 'return max(puddle, damp);' : 'return max(streak * step(0.15, y), foot * 0.75);'}
      }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      float wet = wetness(vWetP);
      roughnessFactor = mix(roughnessFactor, 0.16, wet);
      diffuseColor.rgb *= 1.0 - 0.4 * wet;`);
  };
  mat.customProgramCacheKey = () => (floor ? 'wet-floor' : 'wet-stone');
}

// Chalk on slate, drawn unlit (the board's light is baked in) so the hearth's
// flicker never touches it. Fonts are the page's own (--serif / --sans).
async function boardCanvas(c, mood) {
  const css = getComputedStyle(document.documentElement);
  const serif = css.getPropertyValue('--serif').trim() || 'Georgia, serif';
  const sans = css.getPropertyValue('--sans').trim() || 'Georgia, serif';
  const lead = (document.querySelector('#gizli .lead')?.textContent || '').replace(/\s+/g, ' ').trim();
  const lang = document.documentElement.lang === 'en' ? 'en' : 'tr';
  const [now, anvil] = lang === 'en' ? ['NOW', 'ON THE ANVIL'] : ['ŞU AN', 'ÖRSTE'];
  // load the exact faces drawn below, for the exact text (Turkish letters live in the latin-ext files)
  try {
    await Promise.all([
      document.fonts.load(`500 66px ${serif}`, `${now} ${anvil}`),
      document.fonts.load(`400 104px ${sans}`, mood.text),
      document.fonts.load(`italic 400 100px ${sans}`, lead),
    ]);
  } catch { /* system fallback */ }
  // drawn on the CPU: a GPU canvas flushes these thousands of strokes in one GPU task
  const W = c.width, H = c.height, x = c.getContext('2d', { willReadFrequently: true });
  // slate: blue-black, mottled, old chalk smudges, light pooled from the candle (upper right)
  x.fillStyle = '#16191c'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 1400; i++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.035})`;
    x.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 40, 2 + Math.random() * 6);
  }
  for (let i = 0; i < 14; i++) {
    x.fillStyle = 'rgba(220,215,200,0.025)';
    x.beginPath(); x.ellipse(Math.random() * W, Math.random() * H, 120 + Math.random() * 260, 30 + Math.random() * 60, Math.random() - 0.5, 0, Math.PI * 2); x.fill();
  }
  await frame(); // the slate, the text and the grain each get a frame of their own
  const pool = x.createRadialGradient(W * 0.86, -H * 0.1, 40, W * 0.7, H * 0.2, W * 0.95);
  pool.addColorStop(0, 'rgba(255,226,180,0.16)'); pool.addColorStop(1, 'rgba(255,226,180,0)');
  x.fillStyle = pool; x.fillRect(0, 0, W, H);
  const vig = x.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.62);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  x.fillStyle = vig; x.fillRect(0, 0, W, H);

  const maxW = W - 220;
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  // one line, shrunk to fit; long sentences keep only their last clause
  const fit = (text, weight, px, min, family) => {
    let t = text;
    x.font = `${weight} ${px}px ${family}`;
    if (x.measureText(t).width > maxW && t.includes(', ')) {
      t = t.slice(t.lastIndexOf(', ') + 2);
      t = t.charAt(0).toLocaleUpperCase(lang) + t.slice(1);
    }
    while (px > min && x.measureText(t).width > maxW) { px -= 2; x.font = `${weight} ${px}px ${family}`; }
    return t;
  };
  const chalk = (text, y, a = 0.95) => {
    // a few slightly offset passes give the dry, grainy edge of chalk
    for (let k = 0; k < 3; k++) {
      x.fillStyle = `rgba(238,232,216,${k ? a * 0.22 : a})`;
      x.fillText(text, W / 2 + (k ? Math.random() * 3 - 1.5 : 0), y + (k ? Math.random() * 3 - 1.5 : 0));
    }
  };
  const label = (text, y) => {
    x.font = `500 66px ${serif}`;
    x.letterSpacing = '12px';
    chalk(text, y, 0.62);
    x.letterSpacing = '0px';
  };
  // where he is and what is on the anvil; the open-source numbers live in the panel beside it
  label(now, 300);
  chalk(fit(mood.text, 400, 104, 64, sans), 440);
  x.strokeStyle = 'rgba(238,232,216,0.35)'; x.lineWidth = 4;
  x.beginPath(); x.moveTo(W * 0.3, 560); x.lineTo(W * 0.7, 560); x.stroke();
  label(anvil, 720);
  chalk(fit(lead, 'italic 400', 100, 60, sans), 860);
  await frame();
  // grain: knock tiny holes out of the chalk
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(0,0,0,${Math.random() * 0.5})`; x.fillRect(Math.random() * W, Math.random() * H, 2, 2); }
  x.globalCompositeOperation = 'source-over';
  // the punched-out grain revealed nothing: put slate back underneath
  x.globalCompositeOperation = 'destination-over';
  x.fillStyle = '#16191c'; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'source-over';
}

export async function createForge(world, { audio, reducedMotion } = {}) {
  const { scene, camera, renderer } = world;
  // Built off-stage and warmed, then put in world.underground (shown only down
  // there, with these lights). The lights stay out of the group and always
  // visible: hiding a light changes the light count and recompiles every lit
  // shader. Away from the smithy they go dark.
  const group = new THREE.Group();
  group.visible = false;
  const lights = new THREE.Group();

  // All asked for at once (the loader queues them). The room goes up as soon as it is in;
  // blades still on their way hang themselves on the wall afterwards (lateAdd below).
  const roomLoad = loadGLB('assets/env/forge.glb', 10);
  const track = (p) => { const t = { p, done: false, mod: null }; p.then((m) => { t.done = true; t.mod = m; }, (err) => { t.done = true; t.err = err; }); return t; };
  const rackLoads = rack.map((id, k) => track(loadWeapon(id, 11 + k)));
  const axeLoad = track(loadWeapon('leviathan', 15));
  let room = null;
  try {
    room = (await roomLoad).scene;
  } catch { /* bare room below */ }
  if (room) {
    // Only props cast shadows (walls and floor just receive): the fire's cube
    // shadow renders the casters six times, so this keeps it cheap.
    const size = new THREE.Vector3();
    room.traverse((o) => {
      if (!o.isMesh) return;
      o.receiveShadow = true;
      o.geometry.computeBoundingBox();
      o.castShadow = o.geometry.boundingBox.getSize(size).multiply(o.getWorldScale(new THREE.Vector3())).length() < 2.5;
    });
  } else room = fallbackRoom();
  group.add(room);
  room.updateMatrixWorld(true);
  const spot = (name, fb) => {
    const o = room.getObjectByName(name);
    return o ? o.getWorldPosition(new THREE.Vector3()) : fb.clone();
  };
  const anvilAt = spot('anvil_slot', FALLBACK.anvil_slot);
  const anvilQ = room.getObjectByName('anvil_slot')?.getWorldQuaternion(new THREE.Quaternion()) || new THREE.Quaternion();
  const strikeAt = spot('strike_point', anvilAt.clone().add(V(0.04, 0.008, 0)));
  const fireAt = spot('forge_light', FALLBACK.forge_light);
  const boardMesh = room.getObjectByName('forge_board');
  const boardBox = boardMesh ? new THREE.Box3().setFromObject(boardMesh) : null;
  const boardAt = boardBox ? boardBox.getCenter(new THREE.Vector3()) : FALLBACK.forge_board.clone();
  const candleAt = spot('board_candle', boardAt.clone().add(V(1.54, 0.46, 0.45)));

  // Fire: the warm key, flickering, with the coals' own glow and flames.
  const fire = new THREE.PointLight(0xff7a2e, 34, 16, 2);
  fire.position.copy(fireAt).add(V(0, 0.12, 0.25));
  fire.castShadow = true;
  fire.shadow.mapSize.set(512, 512);
  fire.shadow.bias = -0.002;
  lights.add(fire);
  const coals = [];
  room.getObjectByName('forge_coals')?.traverse((o) => {
    if (o.isMesh) { o.material = o.material.clone(); coals.push({ m: o.material, base: o.material.emissiveIntensity || 3 }); }
  });
  const flame = flames();
  flame.position.copy(fireAt).add(V(0, -0.08, 0.05));
  const fumes = smoke();
  fumes.position.copy(fireAt).add(V(0, 0.12, 0.05));
  group.add(flame, fumes);
  // Damp, sooty stone (the soot is in the vertex colours).
  const wetMats = new Set();
  room.traverse((o) => { if (o.isMesh && /^(stone_wall|stone_floor|rock_vault)$/.test(o.material.name)) wetMats.add(o.material); });
  wetMats.forEach((m) => wetStone(m, anvilAt, m.name === 'stone_floor'));

  // Cold moonlight through the shaft onto the anvil (daylight when the sun is up).
  const pinnedHour = parseFloat(query.get('hour'));
  const day = daylight(Number.isFinite(pinnedHour) ? pinnedHour : localNow().hour);
  const shaftColor = new THREE.Color(0x9fb4ff).lerp(new THREE.Color(0xfff0d8), day);
  const shaft = new THREE.SpotLight(shaftColor, 70 + 50 * day, 14, 0.24, 0.55, 1.4);
  shaft.position.set(anvilAt.x + 0.1, FLOOR + 5.2, anvilAt.z - 0.15);
  shaft.target.position.copy(anvilAt);
  shaft.castShadow = true;
  shaft.shadow.mapSize.set(512, 512);
  shaft.shadow.bias = -0.0015;
  lights.add(shaft, shaft.target);
  // the visible shaft: a soft outer cone round a brighter core, dust turning inside
  const uTime = { value: 0 };
  const beams = [shaftBeam(V(anvilAt.x, FLOOR + 5.0, anvilAt.z), V(anvilAt.x, FLOOR, anvilAt.z), 0.4, 0.85, 0.055, uTime),
    shaftBeam(V(anvilAt.x + 0.03, FLOOR + 5.0, anvilAt.z - 0.02), V(anvilAt.x, FLOOR, anvilAt.z), 0.2, 0.5, 0.08, uTime)];
  beams.forEach((b) => { b.material.uniforms.uColor.value.copy(shaftColor); group.add(b); });
  // Low fills so the darkness keeps shape: a cool spill from the shaft toward
  // the rack, a warm bounce off the floor in front of the hearth.
  const fill = new THREE.HemisphereLight(0x3a4466, 0x1a0e08, 0.22);
  const spill = new THREE.PointLight(0x7f90c8, 2.4, 3.6, 1.6);
  spill.position.set(anvilAt.x - 1.8, FLOOR + 1.6, anvilAt.z - 2.6);
  const bounce = new THREE.PointLight(0xff8a50, 2.4, 6, 1.8);
  bounce.position.set(fireAt.x - 1.3, FLOOR + 0.5, fireAt.z + 1.6);
  lights.add(fill, spill, bounce);
  // The board's candle: steady, never flickers.
  const candle = new THREE.SpotLight(0xffdcb0, 3.2, 5, 0.85, 0.8, 1.2);
  candle.position.copy(candleAt).add(V(0, 0.05, 0.25));
  candle.target.position.copy(boardAt);
  lights.add(candle, candle.target);
  const wick = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowDot(), color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  wick.position.copy(candleAt).add(V(0, 0.012, 0));
  wick.scale.set(0.045, 0.07, 1);
  group.add(wick);
  // Strike flash: a short-lived light at the blade, independent of the camera.
  const flash = new THREE.PointLight(0xffb060, 0, 3.5, 2);
  flash.position.copy(strikeAt).add(V(0, 0.08, 0.05));
  lights.add(flash);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowDot(), color: 0xffc27a, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0 }));
  glint.position.copy(strikeAt).add(V(0, 0.02, 0.02));
  group.add(glint);
  const steady = [shaft, fill, spill, candle].map((l) => [l, l.intensity]);

  // What is on the anvil now: the modelled blade gets the heat.
  const blade = room.getObjectByName('anvil_blade');
  const bladeMat = new THREE.MeshStandardMaterial({ ...bladeMaps(), color: 0xffffff, metalness: 0.55, roughness: 0.62, emissive: 0xffffff, emissiveIntensity: 2.2 });
  blade?.traverse((o) => { if (o.isMesh) { o.material = bladeMat; o.castShadow = true; } });
  const hotColor = new THREE.Color(1, 1, 1), coolColor = new THREE.Color(0.6, 0.06, 0.0);

  // The hammer, by its grip-end empty (frame: see HAM_X). It is swung like a
  // smith would: the forearm turns about an elbow behind the grip while the
  // hammer turns further in the hand, so the head travels a wide, readable arc.
  const hammer = room.getObjectByName('forge_hammer');
  // its own materials, a little more of the cold sky in them so it reads against the dark wall
  hammer.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); o.material.envMapIntensity = 2.5; } });
  group.attach(hammer);
  const dir = V(0.75, 0, 0.66).normalize(); // grip -> head at the blow: the smith stands back-left
  const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(-dir.z, dir.x));
  const swingAxis = AXIS_Z.clone().applyQuaternion(qYaw);
  const grip0 = strikeAt.clone().addScaledVector(dir, -HAM_X).addScaledVector(UP, -HAM_FACE);
  const elbow = grip0.clone().addScaledVector(dir, -0.28).addScaledVector(UP, 0.04);
  const SWING = 1.6, FOREARM = 0.55; // hammer turn at the top of the swing (rad); share taken by the forearm
  // Resting: on its cheek across the anvil's heel, handle out toward the viewer.
  const Xa = V(1, 0, 0).applyQuaternion(anvilQ), Ya = V(0, 0, -1).applyQuaternion(anvilQ);
  const hx = Xa.clone().multiplyScalar(-0.6).addScaledVector(Ya, 0.8).normalize();
  const qRest = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(hx, new THREE.Vector3().crossVectors(UP, hx), UP));
  const restHead = anvilAt.clone().addScaledVector(Xa, 0.2);
  {
    // sit on whatever is there (anvil face or the blade on it)
    const under = ['anvil', 'anvil_blade'].map((n) => room.getObjectByName(n)).filter(Boolean);
    const ray = new THREE.Raycaster();
    let top = anvilAt.y + 0.009;
    const along = new THREE.Vector3().crossVectors(UP, hx);
    for (const k of [-0.06, 0, 0.05]) {
      ray.set(restHead.clone().addScaledVector(along, k).setY(anvilAt.y + 0.5), V(0, -1, 0));
      const h = ray.intersectObjects(under, true)[0];
      if (h) top = Math.max(top, h.point.y);
    }
    restHead.y = top + 0.028;
  }
  const pRest = restHead.clone().sub(V(HAM_X, HAM_FACE + 0.065, 0).applyQuaternion(qRest));
  const qSwing = new THREE.Quaternion(), qWork = new THREE.Quaternion(), pWork = new THREE.Vector3();

  // Sparks off the anvil (80), embers off the coals (120), dust in the shaft (90).
  const sparks = points(80, { size: 5.2, color: [1, 0.85, 0.45] });
  const embers = points(120, { size: 3.4, color: [1, 0.62, 0.22] });
  const dust = points(90, { size: 2.8, color: [shaftColor.r * 0.42, shaftColor.g * 0.42, shaftColor.b * 0.42], soft: true });
  group.add(sparks.obj, embers.obj, dust.obj);

  // The slate board: the overlay is the whole slate face.
  const boardCv = document.createElement('canvas');
  boardCv.width = 2048; boardCv.height = 1237;
  const boardTex = new THREE.CanvasTexture(boardCv);
  boardTex.colorSpace = THREE.SRGBColorSpace;
  boardTex.anisotropy = Math.min(8, renderer?.capabilities.getMaxAnisotropy() || 4);
  let mood = whereabouts(clockNow());
  await boardCanvas(boardCv, mood);
  boardTex.needsUpdate = true;
  const bw = boardBox ? boardBox.max.x - boardBox.min.x : 2.4, bh = boardBox ? boardBox.max.y - boardBox.min.y : 1.45;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(bw - 0.01, bh - 0.01), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }));
  board.position.set(boardAt.x, boardAt.y, (boardBox ? boardBox.max.z : boardAt.z) + 0.004);
  group.add(board);

  // Unfinished favourites on the wall rack; the room's own chains and hanging tools.
  const sway = collectSway(room);
  const rackHits = [];
  const rackTops = [];
  const box3 = new THREE.Box3();
  function hangRack(k, mod, parent) {
    const obj = mod.build();
    const box = box3.setFromObject(obj);
    const hook = spot(`rack_slot_${k}`, FALLBACK.rack[k]);
    obj.position.set(hook.x, hook.y + 0.18 - box.max.y, hook.z + 0.06);
    obj.rotation.z = (k % 2 ? 1 : -1) * 0.04;
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    parent.add(obj);
    sway.push(...collectSway(obj));
    // its hover area and the point its name hangs from
    obj.updateMatrixWorld(true);
    const b = box3.setFromObject(obj);
    const size = b.getSize(new THREE.Vector3());
    const hit = new THREE.Mesh(new THREE.BoxGeometry(Math.max(size.x, 0.3), size.y, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
    b.getCenter(hit.position);
    hit.userData.rack = k;
    parent.add(hit);
    rackHits.push(hit);
    rackTops[k] = V(hit.position.x, b.max.y + 0.08, hit.position.z);
  }

  // The Leviathan axe bitten into the chopping log (built edge-down at y = 0,
  // handle up, engraved face +z): log_slot gives the spot and the lean. The
  // hearth rims it from behind and the cold sky in its steel shows the face.
  const logSlot = room.getObjectByName('log_slot');
  const axeRim = new THREE.PointLight(0xff8a3c, 0, 1.8, 2);
  lights.add(axeRim);
  axeRim.position.copy(logSlot ? logSlot.getWorldPosition(new THREE.Vector3()) : fireAt).add(V(0.38, 0.42, -0.42));
  function setAxe(mod, parent) {
    if (!logSlot) return;
    const axe = mod.build();
    logSlot.getWorldQuaternion(axe.quaternion);
    logSlot.getWorldPosition(axe.position).addScaledVector(V(0, 1, 0).applyQuaternion(axe.quaternion), -0.02);
    axe.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material.envMapIntensity = 2.2; } });
    parent.add(axe);
  }
  // whatever is already downloaded goes up with the room; the rest comes later
  const late = [];
  rackLoads.forEach((t, k) => {
    if (!t.done) late.push([t, (mod, parent) => hangRack(k, mod, parent)]);
    else if (t.mod) hangRack(k, t.mod, group);
    else console.error(`rack "${rack[k]}" failed`, t.err);
  });
  if (!axeLoad.done) late.push([axeLoad, setAxe]);
  else if (axeLoad.mod) setAxe(axeLoad.mod, group);
  else console.error('leviathan failed', axeLoad.err);

  // Hit areas for the two stations.
  const stations = entries.map((e, i) => ({ e, i })).filter(({ e }) => e.place === 'forge');
  const hits = stations.map(({ e, i }) => {
    const anvil = e.station === 'anvil';
    const box = new THREE.Mesh(new THREE.BoxGeometry(anvil ? 1.3 : bw + 0.2, anvil ? 1.4 : bh + 0.2, anvil ? 1.0 : 0.3), new THREE.MeshBasicMaterial({ visible: false }));
    box.position.copy(anvil ? anvilAt.clone().add(V(0, -0.3, 0)) : boardAt);
    box.userData.index = i;
    group.add(box);
    return box;
  });
  const anchor = { anvil: anvilAt.clone().add(V(0, 0.62, 0)), board: boardAt.clone().add(V(0, bh / 2 + 0.16, 0)) };

  // Programs for the smithy's own lights (not the field's: those are hidden down
  // here), its fog and reflections, and its shadow maps; textures uploaded. Only
  // then does it go in the scene.
  const below = new THREE.Scene().add(lights);
  below.fog = scene.fog;
  below.environment = scene.environment;
  // Settled right away: the one short pause that costs (warm.js) comes now,
  // while the field is at rest, not during the descent.
  const warmed = warm(world, group, {
    target: below, shadows: ['depth', 'distance'], batch: 'forge',
    stage: () => { group.visible = true; (world.underground || scene).add(group, lights); },
  });
  await settle(world, { below: true, batch: 'forge' });
  await warmed;

  // Late blades: built off-stage, warmed for the smithy's lights (a stand-in set, so the
  // ones in the room stay where they are), then hung in one short settle each.
  const lateTarget = new THREE.Scene();
  lateTarget.fog = scene.fog;
  lateTarget.environment = scene.environment;
  lateTarget.add(lights.clone(true));
  for (const [t, place] of late) {
    t.p.then(async (mod) => {
      const holder = new THREE.Group();
      place(mod, holder);
      const landed = warm(world, holder, {
        target: lateTarget, shadows: ['depth', 'distance'], batch: 'forge',
        stage: () => { holder.visible = false; holder.userData.landing = true; group.add(holder); },
      });
      await settle(world, { below: true, batch: 'forge' });
      await landed;
      holder.userData.landing = false;
      holder.visible = true;
    }).catch((err) => console.error('smithy blade failed', err));
  }

  const raycaster = new THREE.Raycaster();
  let hovered = -1;
  let rackHovered = -1;
  let focused = null;
  const tmp = new THREE.Vector3();

  // Schedule: what the hearth and the hammer are doing at this hour.
  // (morning: the fire is still rising through the hour)
  const heatAt = (m, now) => (m.key === 'morning' ? 0.45 + 0.5 * Math.min(1, Math.max(0, now.hour - 8)) : HEAT[m.key] ?? 1);
  let target = heatAt(mood, clockNow());
  let heat = target;
  let checked = 0;
  async function recheck(force = false) {
    const now = clockNow();
    const m = whereabouts(now);
    target = heatAt(m, now);
    const changed = m.text !== mood.text || force;
    mood = m;
    if (changed) { await boardCanvas(boardCv, mood); boardTex.needsUpdate = true; }
  }
  // the chalk follows the page's language (i18n.js)
  document.addEventListener('rz:lang', () => recheck(true));

  // Hammer rhythm: bursts of 2-4 blows, a pause, again. lift 0 = face on the blade,
  // 1 = top of the swing. Each blow: a slow wind-up, a cock of the wrist at the
  // top, a fast fall, the blow itself (sparks, flash, sound on the same frame),
  // a small rebound off the steel.
  const ham = { phase: 'rest', u: 0, dur: 1.5, left: 0, top: 1, from: 0, lift: 0, rest: mood.working ? 0 : 1 };
  const go = (phase, dur) => { ham.phase = phase; ham.u = 0; ham.dur = dur; ham.from = ham.lift; };
  let bladeFlash = 0, flashK = 0;
  function impact() {
    const n = 34 + Math.floor(Math.random() * 24);
    for (let i = 0, j = 0; i < sparks.N && j < n; i++) {
      if (sparks.life[i] > 0) continue;
      j++;
      const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 2.6;
      sparks.pos.set([strikeAt.x, strikeAt.y + 0.01, strikeAt.z], i * 3);
      sparks.vel.set([Math.cos(a) * s, 0.7 + Math.random() * 2.4, Math.sin(a) * s * 0.7], i * 3);
      sparks.life[i] = sparks.max[i] = 0.45 + Math.random() * 0.6;
    }
    bladeFlash = 1;
    flashK = 1;
    audio?.hammer?.();
  }
  const ease = (u) => u * u * (3 - 2 * u);
  function stepHammer(dt) {
    ham.u += dt / ham.dur;
    const u = Math.min(1, ham.u);
    if (ham.phase === 'raise') ham.lift = ham.from + (ham.top - ham.from) * ease(u);
    else if (ham.phase === 'cock') ham.lift = ham.top + 0.08 * Math.sin(u * Math.PI / 2);
    else if (ham.phase === 'strike') ham.lift = (ham.top + 0.08) * (1 - u ** 2.6);
    else if (ham.phase === 'rebound') ham.lift = 0.14 * Math.sin(Math.PI * u) * (1 - 0.3 * u);
    else ham.lift = ham.from * (1 - ease(Math.min(1, ham.u * ham.dur / 0.3))); // rest: settle onto the blade
    if (ham.u < 1) return;
    const working = mood.working && !reducedMotion;
    if (ham.phase === 'rest') {
      if (working && ham.rest < 0.01) { ham.left = 2 + Math.floor(Math.random() * 3); ham.top = 0.85 + Math.random() * 0.15; go('raise', 0.5 + Math.random() * 0.12); } else go('rest', 0.5);
    } else if (ham.phase === 'raise') go('cock', 0.1 + Math.random() * 0.08);
    else if (ham.phase === 'cock') go('strike', 0.12 + Math.random() * 0.02);
    else if (ham.phase === 'strike') { impact(); go('rebound', 0.17); }
    else if (ham.phase === 'rebound') {
      ham.left -= 1;
      if (ham.left > 0 && working) { ham.top = 0.8 + Math.random() * 0.2; go('raise', 0.44 + Math.random() * 0.14); } else go('rest', 1.6 + Math.random() * 2.6);
    }
  }
  function poseHammer(dt) {
    // eases into the resting pose when the smith is away, back out when he returns
    const away = !mood.working || reducedMotion;
    ham.rest = Math.min(1, Math.max(0, ham.rest + (away && ham.phase === 'rest' ? dt : -dt) / 1.2));
    const r = smooth(0, 1, ham.rest);
    const l = ham.lift + 0.25 * Math.sin(Math.PI * r); // lifted clear while it moves between the two
    const th = SWING * l;
    qSwing.setFromAxisAngle(swingAxis, th);
    qWork.copy(qSwing).multiply(qYaw);
    pWork.copy(grip0).sub(elbow).applyAxisAngle(swingAxis, FOREARM * th).add(elbow);
    hammer.position.lerpVectors(pWork, pRest, r);
    hammer.quaternion.slerpQuaternions(qWork, qRest, r);
  }

  function stepParticles(dt, t) {
    let a = false;
    for (let i = 0; i < sparks.N; i++) {
      if (sparks.life[i] <= 0) continue;
      a = true;
      sparks.vel[i * 3 + 1] -= 9 * dt;
      for (let k = 0; k < 3; k++) sparks.pos[i * 3 + k] += sparks.vel[i * 3 + k] * dt;
      if (sparks.pos[i * 3 + 1] < FLOOR + 0.01) { sparks.pos[i * 3 + 1] = FLOOR + 0.01; sparks.vel[i * 3 + 1] *= -0.3; sparks.vel[i * 3] *= 0.5; sparks.vel[i * 3 + 2] *= 0.5; }
      sparks.life[i] -= dt * 1.4;
    }
    if (a) sparks.dirty();
    // embers: born in the coal bed at a rate set by the heat, drift up into the
    // hood; the draught carries a few out into the room
    const rate = 2 + 30 * heat;
    for (let i = 0; i < embers.N; i++) {
      if (embers.life[i] <= 0) {
        if (Math.random() < rate * dt / embers.N * 3) {
          embers.pos.set([fireAt.x + (Math.random() - 0.5) * 0.7, fireAt.y - 0.05, fireAt.z + (Math.random() - 0.5) * 0.5], i * 3);
          const out = Math.random() < 0.15;
          embers.vel.set([(Math.random() - 0.5) * (out ? 0.5 : 0.15), 0.25 + Math.random() * 0.55 * (0.4 + heat), out ? 0.1 + Math.random() * 0.18 : (Math.random() - 0.5) * 0.15], i * 3);
          embers.max[i] = (out ? 2.6 : 1.2) + Math.random() * 1.8;
          embers.life[i] = 1;
        }
        continue;
      }
      const p = i * 3;
      embers.vel[p] += Math.sin(t * 2.3 + i) * 0.25 * dt;
      embers.vel[p + 2] += Math.cos(t * 1.7 + i * 1.3) * 0.25 * dt;
      for (let k = 0; k < 3; k++) embers.pos[p + k] += embers.vel[p + k] * dt;
      embers.life[i] -= dt / embers.max[i];
    }
    embers.dirty();
    // dust: slow motes turning in the shaft
    for (let i = 0; i < dust.N; i++) {
      const p = i * 3;
      if (dust.life[i] <= 0) {
        const y = 0.5 + Math.random() * 3.6;
        const r = Math.sqrt(Math.random()) * (0.85 - 0.09 * y), an = Math.random() * Math.PI * 2; // inside the cone
        dust.pos.set([anvilAt.x + Math.cos(an) * r, FLOOR + y, anvilAt.z + Math.sin(an) * r], p);
        dust.max[i] = 6 + Math.random() * 8;
        dust.life[i] = 1;
      }
      dust.pos[p] += Math.sin(t * 0.3 + i) * 0.02 * dt;
      dust.pos[p + 1] -= 0.012 * dt;
      dust.pos[p + 2] += Math.cos(t * 0.27 + i * 2) * 0.02 * dt;
      dust.life[i] -= dt / dust.max[i];
    }
    dust.dirty();
  }

  return {
    group,
    pose(name) {
      focused = name;
      const tall = isPortrait();
      // the anvil from above, looking down at the work: the board behind it stays out of frame
      if (name === 'anvil') return tall
        ? { pos: anvilAt.clone().add(V(0.5, 1.15, 1.95)), look: anvilAt.clone().add(V(0.05, -0.05, 0)) }
        : { pos: anvilAt.clone().add(V(0.85, 1.0, 1.7)), look: anvilAt.clone().add(V(0.1, -0.08, 0)) };
      if (name === 'board') return tall
        ? { pos: boardAt.clone().add(V(0, -0.05, 4.4)), look: boardAt.clone().add(V(0, -0.1, 0)) }
        : { pos: boardAt.clone().add(V(0, 0.02, 4.6)), look: boardAt.clone() };
      return tall ? PORTRAIT_HOME : HOME;
    },
    portraitFov: PORTRAIT_FOV,
    get focused() { return focused; },
    get rackHovered() { return rackHovered; },
    rackName: (k) => RACK_NAMES[rack[k]] || rack[k],
    rackPos(k) {
      tmp.copy(rackTops[k] || FALLBACK.rack[k]).project(camera);
      return { x: (tmp.x + 1) / 2 * window.innerWidth, y: (1 - tmp.y) / 2 * window.innerHeight, visible: tmp.z < 1 };
    },
    get hammer() { return { phase: ham.phase, lift: ham.lift, rest: ham.rest }; }, // ?debug probes
    get hovered() { return hovered; },
    pick(ndc) {
      if (ndc.x > 2) return -1;
      raycaster.setFromCamera(ndc, camera);
      const h = raycaster.intersectObjects(hits, false)[0];
      return h ? h.object.userData.index : -1;
    },
    screenPos(i) {
      tmp.copy(entries[i].station === 'anvil' ? anchor.anvil : anchor.board).project(camera);
      return { x: (tmp.x + 1) / 2 * window.innerWidth, y: (1 - tmp.y) / 2 * window.innerHeight, visible: tmp.z < 1 };
    },
    update(t, dt, { active, ndc }) {
      group.visible = active;
      fire.shadow.autoUpdate = shaft.shadow.autoUpdate = active;
      if (!active) {
        hovered = -1;
        rackHovered = -1;
        lights.children.forEach((l) => { if (l.isLight) l.intensity = 0; });
        return;
      }
      steady.forEach(([l, v]) => { l.intensity = v; });
      hovered = focused ? -1 : this.pick(ndc);
      rackHovered = -1;
      if (!focused && hovered < 0 && ndc.x <= 2 && rackHits.length) {
        const r = raycaster.intersectObjects(rackHits, false)[0]; // ray already set by pick()
        if (r) rackHovered = r.object.userData.rack;
      }
      if (t - checked > 30) { checked = t; recheck(); }
      heat += (target - heat) * Math.min(1, dt * 0.4);
      const n = Math.sin(t * 7.3) * 0.5 + Math.sin(t * 13.1 + 1.3) * 0.3 + Math.sin(t * 23.7) * 0.2;
      fire.intensity = (6 + 30 * heat) * (1 + n * 0.12 * (0.3 + heat));
      bounce.intensity = 0.6 + 2.0 * heat;
      coals.forEach((c) => { c.m.emissiveIntensity = c.base * (0.3 + 0.7 * heat) * (1 + n * 0.12); });
      flame.material.uniforms.uTime.value = t;
      flame.material.uniforms.uHeat.value = heat;
      flame.quaternion.copy(camera.quaternion);
      fumes.material.uniforms.uTime.value = t;
      fumes.material.uniforms.uHeat.value = heat;
      fumes.rotation.y = Math.atan2(camera.position.x - fumes.position.x, camera.position.z - fumes.position.z);
      uTime.value = t;
      axeRim.intensity = 2.6 * (0.35 + 0.65 * heat) * (1 + n * 0.1);
      // the blade cools toward a dull red while nobody works it
      const bh2 = mood.working ? 1 : Math.min(0.55, heat * 0.6);
      bladeFlash = Math.max(0, bladeFlash - dt * 4);
      bladeMat.emissive.copy(coolColor).lerp(hotColor, Math.min(1, bh2 * 1.1));
      bladeMat.emissiveIntensity = (0.25 + 2.0 * bh2) * (1 + Math.sin(t * 1.3) * 0.06) + bladeFlash * 1.8;
      flashK = Math.max(0, flashK - dt * 7);
      flash.intensity = 11 * flashK * flashK;
      glint.material.opacity = flashK;
      glint.scale.setScalar(0.1 + 0.2 * (1 - flashK));
      stepHammer(dt);
      poseHammer(dt);
      stepParticles(dt, t);
      sway.forEach((f) => f(dt, t));
    },
  };
}

function glowDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 40, 2, 32, 36, 30);
  g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(0.25, 'rgba(255,200,110,0.8)'); g.addColorStop(1, 'rgba(255,140,40,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
