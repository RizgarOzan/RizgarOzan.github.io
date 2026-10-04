// The night itself: renderer, sky, moon, stars, terrain, distant ridges,
// ground mist, drifting motes, lights and post-processing.
import * as THREE from 'three';
import { loadGLB } from './loader.js';
import { warm, uploadTextures } from './warm.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

export const MOON_DIR = new THREE.Vector3(0.3, 0.15, -1).normalize();
// Where the moon (night) or the hazy sun (day) sits; setDaylight moves it.
const lightDir = MOON_DIR.clone();
// 0 = night ... 1 = day, read by the sky, stars and ruin rims
const skyDay = { value: 0 };

const C = {
  zenith: new THREE.Color(0x03050f),
  horizon: new THREE.Color(0x121c3f),
  moonGlow: new THREE.Color(0x8fa8f0),
  fog: new THREE.Color(0x162249),   // = the sky at the horizon: horizon x 1.35 (skyMaterial)
  haze: new THREE.Color(0x24335f),  // low ground haze among the ruins
  // multipliers on the ground texture (linear), not colours of their own
  ground: new THREE.Color(0.085, 0.09, 0.115),
  groundLight: new THREE.Color(0.17, 0.175, 0.21),
  mist: new THREE.Color(0x5d6f9e),
  disc: new THREE.Color(1.0, 0.99, 0.95),
  rim: new THREE.Color(0x7d93d6).multiplyScalar(0.8),
  band: new THREE.Color(0),
};

// Overcast day (Shadow of the Colossus grey, not blue) and the dawn/dusk tint
// laid over it. Night is C as written above, cloned in createWorld.
const DAY = {
  band: new THREE.Color(0),
  // the sun: warmer and smaller than the moon, with a hot core (sky shader) and its own rays
  zenith: new THREE.Color(0x2a3442), horizon: new THREE.Color(0x67717d), moonGlow: new THREE.Color(0xffcf96),
  haze: new THREE.Color(0x5f6a78), mist: new THREE.Color(0x9da6b2),
  disc: new THREE.Color(2.6, 2.15, 1.5), rim: new THREE.Color(0xd9b98f).multiplyScalar(0.5),
  ridgeNear: new THREE.Color(0x4f5966), ridgeFar: new THREE.Color(0x5f6975),
  key: new THREE.Color(0xffe4c4), fill: new THREE.Color(0xb4c0d4),
  hemiSky: new THREE.Color(0x8995a8), hemiGround: new THREE.Color(0x27241f),
};
// Warmth sits in the sky's horizon band and the light; fog and haze only
// turn a dusky mauve, so the valley does not go orange.
const DUSK = {
  band: new THREE.Color(0xd0784e),
  zenith: new THREE.Color(0x1a1d32), horizon: new THREE.Color(0x4e3c50), moonGlow: new THREE.Color(0xffa060),
  fog: new THREE.Color(0x6c5660), haze: new THREE.Color(0x544656), mist: new THREE.Color(0x96808a),
  disc: new THREE.Color(1.3, 0.85, 0.55), rim: new THREE.Color(0xff9a5c).multiplyScalar(0.9),
  ridgeNear: new THREE.Color(0x3a3244), ridgeFar: new THREE.Color(0x52404f),
  key: new THREE.Color(0xff9a5a), fill: new THREE.Color(0xa898b8),
  hemiSky: new THREE.Color(0x5e5470), hemiGround: new THREE.Color(0x15100e),
};
DAY.fog = DAY.horizon.clone().multiplyScalar(1.35); // = sky at the horizon

// ---------- noise (terrain, ridges) ----------

function hash(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, oct = 5) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; }
  return s;
}
const smooth = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };

// ---------- GLSL ----------

const NOISE_GLSL = /* glsl */`
  float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
  float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a*vn(p); p *= 2.03; a *= 0.5; } return s; }
`;

function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uMoon: { value: lightDir }, uDay: skyDay,
      uZenith: { value: C.zenith }, uHorizon: { value: C.horizon }, uGlow: { value: C.moonGlow },
      uDisc: { value: C.disc }, uBand: { value: C.band },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uMoon, uZenith, uHorizon, uGlow, uDisc, uBand;
      uniform float uDay;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uZenith, smoothstep(-0.05, 0.6, h));
        col += uHorizon * 0.35 * exp(-abs(h) * 14.0);
        col += uBand * exp(-abs(h) * 9.0); // dawn/dusk glow, black otherwise
        float m = max(dot(d, uMoon), 0.0);
        col += uGlow * (pow(m, 8.0) * 0.08 + pow(m, 90.0) * 0.14 + pow(m, 1400.0) * 0.3);
        // moon disc with soft maria; by day a larger, softer sun behind haze
        float disc = smoothstep(mix(0.99952, 0.99966, uDay), mix(0.99962, 0.99975, uDay), m);
        vec3 tang = normalize(cross(uMoon, vec3(0.0, 1.0, 0.0)));
        vec3 bit = cross(tang, uMoon);
        vec2 mp = vec2(dot(d, tang), dot(d, bit)) * 1300.0;
        float maria = smoothstep(0.45, 0.75, fbm(mp * 0.06 + 3.0)) * (1.0 - uDay);
        vec3 moon = uDisc * (1.3 - maria * 0.35);
        col = mix(col, moon, disc);
        // thin cloud bands drifting across the lower sky; a grey overcast by day
        float band = fbm(vec2(atan(d.z, d.x) * 3.0, h * 9.0)) * smoothstep(0.02, 0.18, h) * smoothstep(0.45, 0.15, h);
        float deck = smoothstep(0.35, 0.8, fbm(vec2(atan(d.z, d.x) * 2.0, h * 4.0) + 7.0)) * smoothstep(0.05, 0.5, h);
        col = mix(col, uHorizon * 0.55, band * mix(0.45, 0.6, uDay));
        col = mix(col, uZenith * 0.8, deck * uDay * 0.5);
        col += uGlow * band * pow(m, 4.0) * 0.25;
        // by day: a hot halo tight round the sun and faint rays, so it never reads as the moon
        float ray = 0.55 + 0.45 * sin(atan(dot(d, bit), dot(d, tang)) * 13.0) * sin(atan(dot(d, bit), dot(d, tang)) * 5.0 + 1.3);
        col += uGlow * uDay * (pow(m, 900.0) * 0.55 + pow(m, 60.0) * 0.07 + pow(m, 14.0) * ray * 0.05);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function makeStars(count = 1800) {
  const pos = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = Math.random(), v = Math.random() * 0.85 + 0.1;
    const th = u * Math.PI * 2, y = v;
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(th) * r * 180, y * 180, Math.sin(th) * r * 180], i * 3);
    size[i] = Math.pow(Math.random(), 6) * 2.6 + 0.6;
    phase[i] = Math.random() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uMoon: { value: lightDir }, uDay: skyDay },
    vertexShader: /* glsl */`
      attribute float aSize; attribute float aPhase;
      uniform float uTime, uPR, uDay; uniform vec3 uMoon;
      varying float vA;
      void main(){
        vec3 d = normalize(position);
        float tw = 0.65 + 0.35 * sin(uTime * (0.6 + fract(aPhase) * 1.8) + aPhase);
        float nearMoon = smoothstep(0.985, 0.94, dot(d, uMoon));
        vA = tw * smoothstep(0.08, 0.35, d.y) * nearMoon * (1.0 - smoothstep(0.0, 0.45, uDay));
        gl_PointSize = aSize * uPR;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0), vA * smoothstep(0.5, 0.0, r)); }`,
  });
  return new THREE.Points(g, m);
}

// Low haze lying in the valley: thick at the foot of anything beyond ~12 m
// from the camera, thinning with height, so the ruin rings separate into
// layers and their tops stay as silhouettes. Applied just before scene fog.
// The haze drifts with the wind and gathers in long banks across the valley
// (stretched along x), so the ruin rows stand in separate layers of fog.
const HAZE_GLSL = /* glsl */`
  uniform vec3 uHaze; uniform float uHazeA, uHazeT;
  void applyHaze(inout vec3 col, vec3 w){
    float h = exp(-max(w.y, 0.0) * 0.42) * smoothstep(12.0, 34.0, length(w.xz - cameraPosition.xz));
    h *= 0.55 + 0.6 * fbm(w.xz * 0.045 + 2.0 + vec2(uHazeT * 0.02, uHazeT * 0.004));
    float bank = vn(vec2(w.x * 0.035 + uHazeT * 0.03, w.z * 0.16 + 4.0));
    h *= 0.7 + 0.6 * smoothstep(0.35, 0.8, bank) * exp(-max(w.y, 0.0) * 0.25);
    col = mix(col, uHaze, clamp(h * uHazeA, 0.0, 1.0));
  }
`;
const hazeUniforms = { uHaze: { value: C.haze }, uHazeA: { value: 0.85 }, uHazeT: { value: 0 } };

// ---------- ground (Poly Haven brown_mud_rocks_01, CC0) ----------
// Sampled in world space twice (2.6 m and a rotated 4.3 m tile) and blended by
// low-frequency noise, then darkened by a 30 m macro noise and the per-vertex
// shade, so no tile repeat survives. The crater meshes from field.js get the
// same patch (GROUND_IMPACT), so their earth continues the field's exactly.

// Decoded off the main thread where the browser can (ImageBitmap, pre-flipped so
// it lands exactly as an <img> upload with flipY would); t.userData.loaded
// settles once the image is in (or failed).
const bitmaps = typeof createImageBitmap !== 'undefined' && !/^((?!chrome|android).)*safari/i.test(navigator.userAgent);
function tex(url, srgb, aniso) {
  const t = new THREE.Texture();
  t.userData.loaded = new Promise((done) => {
    const set = (img) => { t.image = img; t.needsUpdate = true; done(); };
    if (bitmaps) {
      t.flipY = false;
      // a plain fetch, so the <link rel=preload> in index.html is the same request
      fetch(url).then((r) => (r.ok ? r.blob() : Promise.reject(r.status)))
        .then((b) => createImageBitmap(b, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
        .then(set, done);
    } else new THREE.ImageLoader().load(url, set, undefined, done);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Same value noise as the JS fbm above, so the shader can rebuild the
// terrain's vertex shade on the craters.
const GROUND_SHADE_GLSL = /* glsl */`
  vec3 groundShade(vec2 p){
    float n = fbm(vec2(p.x * 0.3 + 11.0, p.y * 0.3));
    return mix(uGShadeA, uGShadeB, smoothstep(0.35, 0.75, n) * 0.8);
  }
`;

// The flash along fresh cracks when a blade is pulled (field.js drives it).
// Lives in the ground and crater shaders, so the lines follow the real surface.
const CRACK_GLSL = /* glsl */`
  uniform vec3 uCrackAt, uCrackCol; uniform float uCrackA, uCrackR;
  float ch(float x){ return fract(sin(x * 127.1 + uCrackAt.z) * 43758.5453); }
  // piecewise-linear zigzag: straight runs with sharp kinks, like split earth
  float zig(float x, float s){ float i = floor(x), f = fract(x); return mix(ch(i + s) - 0.5, ch(i + 1.0 + s) - 0.5, f); }
  vec3 crackGlow(vec2 w){
    vec2 p = (w - uCrackAt.xy) / 1.1; float r = length(p);
    if (uCrackA < 0.002 || r > 1.0) return vec3(0.0);
    float a = atan(p.y, p.x), c = 0.0;
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      float ang = fi * 0.8976 + ch(fi) * 0.6;
      float off = zig(r * 9.0, fi * 13.0) * 0.07 + zig(r * 23.0, fi * 5.0) * 0.02;
      float da = abs(abs(mod(a - ang + 3.14159, 6.28318) - 3.14159) * r - off * r * 2.0);
      float len = 0.35 + ch(fi + 7.0) * 0.5;
      c += smoothstep(0.0075 * (1.0 - r * 0.5), 0.0, da) * smoothstep(len * uCrackR, len * uCrackR * 0.5, r);
    }
    return uCrackCol * min(c, 1.0) * smoothstep(0.05, 0.12, r) * uCrackA;
  }
`;
export const crack = {
  at: new THREE.Vector3(), color: new THREE.Color(), amount: { value: 0 }, reach: { value: 1 },
};

function patchGround(material, uniforms, impact) {
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms, hazeUniforms);
    if (impact) sh.defines = { ...sh.defines, GROUND_IMPACT: '' };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uGDiff, uGNor, uGArm;
        uniform vec3 uGShadeA, uGShadeB;
        uniform float uGNs, uEarthL;
        varying vec3 vGW;
        ${NOISE_GLSL}
        ${GROUND_SHADE_GLSL}
        ${HAZE_GLSL}
        ${CRACK_GLSL}`)
      .replace('#include <fog_fragment>', `gl_FragColor.rgb += crackGlow(vGW.xz);
        applyHaze(gl_FragColor.rgb, vGW);
        #include <fog_fragment>`)
      .replace('#include <map_fragment>', `
        vec2 gw = vGW.xz;
        const float GA = 2.4;
        mat2 gR = mat2(cos(GA), sin(GA), -sin(GA), cos(GA));
        vec2 gA = gw * 0.385;
        vec2 gB = gR * gw * 0.233 + vec2(0.37, 0.71);
        float gBl = smoothstep(0.32, 0.68, fbm(gw * 0.085 + 5.0));
        vec3 gAlb = mix(texture2D(uGDiff, gA).rgb, texture2D(uGDiff, gB).rgb, gBl);
        vec3 gArm = mix(texture2D(uGArm, gA).rgb, texture2D(uGArm, gB).rgb, gBl);
        float gL = dot(gAlb, vec3(0.2126, 0.7152, 0.0722));
        gAlb = mix(vec3(gL), gAlb, 0.8);
        gAlb *= 0.5 + 0.9 * smoothstep(0.25, 0.75, fbm(gw * 0.03 + 3.0));
        diffuseColor.rgb *= gAlb * mix(1.0, gArm.r, 0.75);`)
      .replace('#include <color_fragment>', `
        #ifdef GROUND_IMPACT
          // crater vertex colours are earth/stone/crack shades: keep only their
          // brightness relative to plain earth, on top of the field's shade
          diffuseColor.rgb *= groundShade(gw) * clamp(dot(vColor.rgb, vec3(0.3333)) / uEarthL, 0.25, 1.8);
        #else
          #include <color_fragment>
        #endif`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * mix(0.85, 1.0, gArm.g);')
      .replace('#include <normal_fragment_maps>', `
        {
          vec3 nA = texture2D(uGNor, gA).xyz * 2.0 - 1.0;
          vec3 nB = texture2D(uGNor, gB).xyz * 2.0 - 1.0;
          nB.xy = nB.xy * gR;
          vec3 gn = mix(nA, nB, gBl);
          gn.xy *= uGNs;
          gn = normalize(gn);
          vec3 gT = mat3(viewMatrix) * vec3(1.0, 0.0, 0.0);
          gT -= normal * dot(gT, normal); gT *= inversesqrt(max(dot(gT, gT), 1e-6));
          vec3 gBt = mat3(viewMatrix) * vec3(0.0, 0.0, 1.0);
          gBt -= normal * dot(gBt, normal); gBt *= inversesqrt(max(dot(gBt, gBt), 1e-6));
          normal = normalize(gT * gn.x + gBt * gn.y + normal * gn.z);
        }`);
  };
  material.customProgramCacheKey = () => (impact ? 'ground-impact' : 'ground');
}

// The first view gets tiny 256 px copies (90 KB for all three, so a slow line still
// draws the field soon); the 1k set replaces them once the swords are in, and the 2k
// set after that on a fast line (upgradeGround).
const GROUND_DIR = 'assets/textures/brown_mud_rocks_01/';
const GROUND_MAPS = { uGDiff: ['diff', true], uGNor: ['nor_gl', false], uGArm: ['arm', false] };
function makeGroundUniforms(aniso) {
  const t = (k) => tex(`${GROUND_DIR}${GROUND_MAPS[k][0]}_256.webp`, GROUND_MAPS[k][1], aniso);
  return {
    uGDiff: { value: t('uGDiff') },
    uGNor: { value: t('uGNor') },
    uGArm: { value: t('uGArm') },
    uGShadeA: { value: C.ground }, uGShadeB: { value: C.groundLight },
    uGNs: { value: 1.15 },
    // mean brightness of the crater's plain-earth vertex colour (#3b3429, linear)
    uEarthL: { value: (0.0423 + 0.0335 + 0.0222) / 3 },
    uCrackAt: { value: crack.at }, uCrackCol: { value: crack.color }, uCrackA: crack.amount, uCrackR: crack.reach,
  };
}

function makeTerrain(groundUniforms) {
  const geo = new THREE.PlaneGeometry(240, 240, 240, 240);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const d = Math.hypot(x, (z + 2) * 1.15);
    const field = smooth(9, 24, d);
    let y = (fbm(x * 0.045, z * 0.045) - 0.5) * 2.4 * field;
    y += (fbm(x * 0.5, z * 0.5) - 0.5) * 0.07;
    y += smooth(30, 110, d) * fbm(x * 0.02 + 7, z * 0.02) * 9;
    p.setY(i, y);
    // same formula as groundShade() in GLSL
    const n = fbm(x * 0.3 + 11, z * 0.3);
    c.copy(C.ground).lerp(C.groundLight, smooth(0.35, 0.75, n) * 0.8);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  patchGround(mat, groundUniforms, false);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// The crater pieces (field.js) share one material per variant; before they are
// shown, that material gets the ground patch with the field's tint.
function groundImpact(m, uniforms) {
  if (m.name !== 'impact_earth' || m.userData.grounded) return;
  m.userData.grounded = true;
  m.vertexColors = true;
  m.roughness = 1;
  patchGround(m, uniforms, true);
  m.needsUpdate = true;
}

// Flat silhouette layers toward the horizon, colored by hand for aerial perspective.
function makeRidges() {
  const g = new THREE.Group();
  const layers = [
    { z: -95, base: 0, amp: 12, f: 0.02, seed: 5, color: 0x101a3d },
    { z: -150, base: 4, amp: 22, f: 0.012, seed: 9, color: 0x131f46 },
  ];
  layers.reverse().forEach((L) => {
    const s = new THREE.Shape();
    s.moveTo(-320, -20);
    for (let x = -320; x <= 320; x += 4) s.lineTo(x, L.base + fbm(x * L.f + L.seed, L.seed) * L.amp);
    s.lineTo(320, -20);
    const m = new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshBasicMaterial({ color: L.color, fog: false }));
    m.userData.near = L.z === -95;
    m.position.z = L.z;
    g.add(m);
  });
  return g;
}

// The ruined kingdom around the field (tools/blender/ruins.py), built in site space.
// Stone: Poly Haven rock_surface (CC0) on the GLB's box UVs, times the
// per-block vertex tint, with moss on tops and feet, rain streaks and a faint
// moonlit rim on the edges that face the moon. `far` pieces (far ring, castle)
// skip the textures and melt into flat silhouette layers: darker the nearer,
// their feet lost in the valley mist, the tone taken from the fog so day and
// night both hold.
function patchRuin(material, far = false) {
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, hazeUniforms);
    sh.uniforms.uMoonW = { value: lightDir };
    sh.uniforms.uRim = { value: C.rim };
    sh.uniforms.uFogC = { value: C.fog };
    sh.uniforms.uRuinIn = ruinIn;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRW; varying vec3 vRN;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vRW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vRN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uMoonW, uRim, uFogC; uniform float uRuinIn;
        varying vec3 vRW; varying vec3 vRN;
        ${NOISE_GLSL}
        ${HAZE_GLSL}`)
      .replace('#include <fog_fragment>', `applyHaze(gl_FragColor.rgb, vRW);
        #include <fog_fragment>
        gl_FragColor.rgb = mix(uFogC, gl_FragColor.rgb, uRuinIn * uRuinIn * (3.0 - 2.0 * uRuinIn));
        ${far ? `{
          float d = length(vRW - cameraPosition);
          vec3 sil = uFogC * mix(0.6, 0.72, smoothstep(50.0, 95.0, d));
          sil = mix(sil, uFogC, exp(-max(vRW.y, 0.0) * 0.3) * 0.55);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, sil, smoothstep(36.0, 64.0, d));
        }` : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float n = fbm(vRW.xz * 0.45 + vRW.y * 0.25);
          float up = smoothstep(0.55, 0.92, vRN.y);
          float moss = up * smoothstep(0.38, 0.62, n) + smoothstep(1.4, 0.0, vRW.y) * smoothstep(0.3, 0.7, n) * 0.8;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.42, 0.55, 0.4), clamp(moss, 0.0, 1.0));
          float streak = vn(vec2((vRW.x + vRW.z) * 2.7, vRW.y * 0.12));
          diffuseColor.rgb *= 0.78 + 0.3 * streak;
        }`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          vec3 mv = normalize(mat3(viewMatrix) * uMoonW);
          float fr = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5);
          reflectedLight.directDiffuse += uRim * fr * smoothstep(-0.05, 0.5, dot(normal, mv));
        }`);
  };
  material.customProgramCacheKey = () => (far ? 'ruin-far' : 'ruin');
}

// 0 -> 1 as the ruins rise out of the fog when they arrive after the first frame.
const ruinIn = { value: 1 };

const RUIN_STONE = new Set(['stone', 'stone_dark', 'stone_moss', 'stone_pale']);
function loadRuins(world, parent, aniso, arrived) {
  const patched = new Set();
  const centre = new THREE.Vector3();
  let map, nor, arm;
  // after the swords: on a slow line they make the page, the ruins rise out of the fog later
  return loadGLB('assets/env/ruins.glb', 5).then(async (gltf) => {
    // 512 px, asked for only now so they never share the line with the first view:
    // the ruins stand 12 m and more away, in haze
    const dir = 'assets/textures/rock_surface/';
    map = tex(dir + 'diff_512.webp', true, aniso);
    nor = tex(dir + 'nor_gl_512.webp', false, aniso);
    arm = tex(dir + 'arm_512.webp', false, aniso);
    const r = gltf.scene;
    // Smaller and farther than built: the blocks read as real masonry and the
    // kingdom sits across the valley instead of walling the field in.
    // ruins.py checks the nav/logo zones through this same placement.
    r.scale.setScalar(0.6);
    r.position.z = -12;
    r.updateMatrixWorld(true);
    r.traverse((o) => {
      if (!o.isMesh) return;
      o.receiveShadow = true;
      // Only the near ring is inside the moon's shadow box; the rest would
      // just cost a shadow pass.
      o.geometry.computeBoundingSphere();
      const bs = o.geometry.boundingSphere;
      centre.copy(bs.center).applyMatrix4(o.matrixWorld);
      o.castShadow = centre.length() < 26 && bs.radius * o.matrixWorld.getMaxScaleOnAxis() < 8;
      const m = o.material;
      // The two lit windows should be a faint far-off ember, not a white slab.
      if (m.name === 'cold_glow') { m.emissiveIntensity = Math.min(m.emissiveIntensity, 0.12); return; }
      if (patched.has(m)) return;
      patched.add(m);
      if (RUIN_STONE.has(m.name)) {
        // the texture averages ~0.12 linear: lift the base colour so the
        // stone keeps the brightness it had untextured
        m.color.multiplyScalar(5.5);
        Object.assign(m, { map, normalMap: nor, roughnessMap: arm, aoMap: arm, aoMapIntensity: 0.8, roughness: 1 });
        m.normalScale.set(1.3, 1.3);
      }
      patchRuin(m, m.name === 'stone_far');
      m.needsUpdate = true;
    });
    await Promise.all([map, nor, arm].map((t) => t.userData.loaded));
    const warmed = warm(world, r, {
      shadows: ['depth'], depthPass: world.depthPass,
      stage: () => { r.visible = false; r.userData.landing = true; parent.add(r); },
    });
    arrived();
    await warmed;
    r.visible = true;
    r.userData.landing = false;
    return r;
  }).catch((err) => { arrived(); console.error('ruins failed to load', err); });
}

// Where the ground mist parts around a sword: (x, z, radius, -), set by field.js.
const mistHoles = Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, 0, 0));

function makeMist(y, scale, alpha, speed) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: C.mist }, uAlpha: { value: alpha }, uSpeed: { value: speed }, uScale: { value: scale }, uHoles: { value: mistHoles } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uAlpha, uSpeed, uScale; uniform vec3 uColor; uniform vec4 uHoles[6];
      varying vec2 vUv; varying vec3 vW;
      ${NOISE_GLSL}
      void main(){
        // parted around each blade: thinned in a soft ring and pushed outward
        float part = 1.0; vec2 push = vec2(0.0);
        for (int i = 0; i < 6; i++) {
          vec2 dv = vW.xz - uHoles[i].xy; float r = uHoles[i].z;
          float d = length(dv);
          float k = r > 0.0 ? smoothstep(r, r * 0.25, d) : 0.0;
          part -= 0.75 * k;
          push += dv / max(d, 1e-3) * k * r * 0.5;
        }
        vec2 p = (vW.xz - push) * uScale;
        float n = fbm(p + vec2(uTime * uSpeed, uTime * uSpeed * 0.4));
        n = fbm(p * 1.3 + n * 1.8 - vec2(uTime * uSpeed * 0.6, 0.0));
        float edge = smoothstep(0.5, 0.18, length(vUv - 0.5));
        gl_FragColor = vec4(uColor, smoothstep(0.35, 0.85, n) * uAlpha * edge * max(part, 0.0));
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(70, 50), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, y, -6);
  mesh.renderOrder = 2;
  return mesh;
}

function makeMotes(count = 140) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - 0.5) * 22, Math.random() * 3.2 + 0.2, Math.random() * -12 + 3], i * 3);
    seed[i] = Math.random() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPR: { value: 1 }, uAlpha: { value: 1 } },
    vertexShader: /* glsl */`
      attribute float aSeed; uniform float uTime, uPR, uAlpha; varying float vA;
      void main(){
        vec3 p = position;
        float t = uTime * (0.12 + fract(aSeed) * 0.15) + aSeed;
        p += vec3(sin(t * 1.3) * 0.6, sin(t * 0.9) * 0.35, cos(t * 1.1) * 0.6);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = (0.4 + 0.6 * pow(0.5 + 0.5 * sin(uTime * 1.7 + aSeed * 3.0), 3.0)) * smoothstep(-28.0, -8.0, mv.z) * uAlpha;
        gl_PointSize = (3.0 + fract(aSeed * 7.0) * 3.0) * uPR * (6.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
        gl_FragColor = vec4(vec3(0.72, 0.9, 1.0), vA * pow(1.0 - r * 2.0, 2.0) * 0.85); }`,
  });
  return new THREE.Points(g, m);
}

// Wind across the field: sparse ash specks and, now and then, a leaf. Both
// ride uWind, the wind's integrated travel (metres), so gusts carry them faster.
function makeAsh(count = 44) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set([(Math.random() - 0.5) * 24, Math.random() * 3.0 + 0.15, Math.random() * -13 + 4], i * 3);
    seed[i] = Math.random() * 100;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uWind: { value: 0 }, uPR: { value: 1 }, uColor: { value: new THREE.Color() } },
    vertexShader: /* glsl */`
      attribute float aSeed; uniform float uTime, uWind, uPR; varying float vA;
      void main(){
        vec3 p = position;
        p.x = mod(p.x + uWind * (0.75 + fract(aSeed * 3.1) * 0.5) + 12.0, 24.0) - 12.0;
        p.y += sin(uTime * 0.8 + aSeed) * 0.22 + sin(uTime * 2.3 + aSeed * 5.0) * 0.04;
        p.z += sin(uTime * 0.5 + aSeed * 2.0) * 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = smoothstep(12.0, 9.5, abs(p.x)) * smoothstep(-26.0, -6.0, mv.z) * (0.45 + 0.55 * fract(aSeed * 7.3));
        gl_PointSize = (1.6 + fract(aSeed * 5.7) * 1.6) * uPR * (6.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying float vA;
      void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5) discard;
        gl_FragColor = vec4(uColor, vA * smoothstep(0.5, 0.15, r) * 0.7); }`,
  });
  return new THREE.Points(g, m);
}

function makeLeaves(count = 3) {
  const s = new THREE.Shape();
  s.moveTo(0, -0.05); s.quadraticCurveTo(0.032, -0.01, 0, 0.05); s.quadraticCurveTo(-0.032, -0.01, 0, -0.05);
  const base = new THREE.ShapeGeometry(s, 4);
  const g = new THREE.InstancedBufferGeometry().copy(base);
  g.instanceCount = count;
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(Array.from({ length: count }, (_, i) => i * 0.37 + Math.random() * 0.2)), 1));
  const m = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uWind: { value: 0 }, uColor: { value: new THREE.Color() } },
    vertexShader: /* glsl */`
      attribute float aSeed; uniform float uTime, uWind; varying float vShade;
      mat3 rot(vec3 a){ vec3 s = sin(a), c = cos(a);
        return mat3(c.y*c.z, c.y*s.z, -s.y, s.x*s.y*c.z - c.x*s.z, s.x*s.y*s.z + c.x*c.z, s.x*c.y, c.x*s.y*c.z + s.x*s.z, c.x*s.y*s.z - s.x*c.z, c.x*c.y); }
      void main(){
        // each leaf crosses the 20 m field once per lap of 70-100 m of wind
        float L = 70.0 + fract(aSeed * 7.7) * 30.0;
        float x = mod(uWind * 1.3 + aSeed * 41.0, L) - 10.0;
        float on = step(x, 10.0);
        float u = (x + 10.0) / 20.0;
        vec3 a = vec3(uTime * 2.1 + aSeed * 9.0, uTime * 1.3 + aSeed * 3.0, uTime * 2.7);
        vec3 p = rot(a) * position * on;
        vShade = 0.55 + 0.45 * abs(rot(a)[2].z);
        p += vec3(x, 2.4 - u * 2.0 + sin(uTime * 1.7 + aSeed * 6.0) * 0.18, -5.0 + fract(aSeed * 3.3) * 7.0 + sin(uTime * 0.9 + aSeed) * 0.4);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying float vShade;
      void main(){ gl_FragColor = vec4(uColor * vShade, 1.0); }`,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  return mesh;
}

// Crepuscular shafts from the moon (or the hazy sun) through the ruins, at half
// resolution: the open sky around the light (depth = far, the sky draws no
// depth) is the source; two radial blur passes stretch it toward the light,
// and the result is added back onto the scene before bloom.
const SHAFT_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
class ShaftsPass extends Pass {
  constructor() {
    super();
    this.needsSwap = false;
    this.enabled = false;
    const opt = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rtA = new THREE.WebGLRenderTarget(1, 1, opt);
    this.rtB = new THREE.WebGLRenderTarget(1, 1, opt);
    this.light = new THREE.Vector2(0.5, 0.5);
    this.aspect = 1;
    this.mask = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, tDepth: { value: null }, uLight: { value: this.light }, uAspect: { value: 1 }, uFloor: { value: new THREE.Color() } },
      vertexShader: SHAFT_VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tColor, tDepth; uniform vec2 uLight; uniform float uAspect; uniform vec3 uFloor; varying vec2 vUv;
        void main(){
          float sky = step(0.99999, texture2D(tDepth, vUv).x);
          vec2 d = (vUv - uLight) * vec2(uAspect, 1.0);
          float near = exp(-dot(d, d) * 14.0);
          vec3 c = texture2D(tColor, vUv).rgb;
          // only what outshines the plain sky: the disc and its halo
          c = max(min(c, vec3(3.0)) - uFloor, 0.0);
          gl_FragColor = vec4(c * sky * near, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    const blur = (step) => new THREE.ShaderMaterial({
      uniforms: { tIn: { value: null }, uLight: { value: this.light }, uStep: { value: step } },
      vertexShader: SHAFT_VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tIn; uniform vec2 uLight; uniform float uStep; varying vec2 vUv;
        void main(){
          vec2 dv = (uLight - vUv) * uStep;
          float j = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
          vec2 uv = vUv + dv * j;
          vec3 acc = vec3(0.0); float w = 1.0, sum = 0.0;
          for (int i = 0; i < 16; i++) { acc += texture2D(tIn, uv).rgb * w; sum += w; w *= 0.93; uv += dv; }
          gl_FragColor = vec4(acc / sum, 1.0);
        }`,
      depthTest: false, depthWrite: false,
    });
    this.blurA = blur(0.045);
    this.blurB = blur(0.012);
    this.add = new THREE.ShaderMaterial({
      uniforms: { tIn: { value: null }, uTint: { value: new THREE.Color() }, uStrength: { value: 0 }, uLight: { value: this.light }, uAspect: this.mask.uniforms.uAspect },
      vertexShader: SHAFT_VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tIn; uniform vec3 uTint; uniform float uStrength, uAspect; uniform vec2 uLight; varying vec2 vUv;
        void main(){
          vec2 d = (vUv - uLight) * vec2(uAspect, 1.0);
          float r = length(d);
          // kept off the disc itself, so the moon stays crisp and the shafts start beside it
          gl_FragColor = vec4(texture2D(tIn, vUv).rgb * uTint * uStrength * exp(-r * 1.6) * mix(0.18, 1.0, smoothstep(0.03, 0.16, r)), 1.0);
        }`,
      blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.mask);
  }

  setSize(w, h) {
    this.rtA.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.rtB.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
    this.mask.uniforms.uAspect.value = w / Math.max(h, 1);
  }

  render(renderer, writeBuffer, readBuffer) {
    const q = this.quad;
    this.mask.uniforms.tColor.value = readBuffer.texture;
    this.mask.uniforms.tDepth.value = readBuffer.depthTexture;
    q.material = this.mask; renderer.setRenderTarget(this.rtA); q.render(renderer);
    this.blurA.uniforms.tIn.value = this.rtA.texture;
    q.material = this.blurA; renderer.setRenderTarget(this.rtB); q.render(renderer);
    this.blurB.uniforms.tIn.value = this.rtB.texture;
    q.material = this.blurB; renderer.setRenderTarget(this.rtA); q.render(renderer);
    this.add.uniforms.tIn.value = this.rtA.texture;
    q.material = this.add;
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(readBuffer);
    q.render(renderer);
    renderer.autoClear = ac;
  }
}

// Scene used only to bake the reflection map: the same sky plus two dim
// softboxes, so metal blades pick up long moonlit highlights.
function makeEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), skyMaterial()));
  const box = (w, h, intensity, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc8d6ff).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos); m.lookAt(...look);
    env.add(m);
  };
  box(30, 6, 1.4, [0, 18, 14], [0, 0, 0]);
  box(26, 7, 0.9, [0, 3, 30], [0, 1.5, 0]); // behind the viewer: lets blade faces read silver

  box(4, 26, 2.2, [-20, 6, -16], [0, 2, 0]);
  box(4, 20, 0.7, [22, 5, 6], [0, 2, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02, 0.1, 100).texture;
  pmrem.dispose();
  return tex;
}

const finalShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uGrade: { value: 1 } },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform vec2 uRes; uniform float uGrade; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      // grade (display space): a gentle filmic S that leaves the blacks where
      // they are, cool shadows, warm highlights
      vec3 gr = clamp(c.rgb, 0.0, 1.0);
      gr += 0.38 * gr * (1.0 - gr) * (gr - 0.2);
      float l = dot(gr, vec3(0.2126, 0.7152, 0.0722));
      gr += vec3(-0.006, 0.0, 0.012) * (1.0 - smoothstep(0.0, 0.35, l)) + vec3(0.018, 0.008, -0.012) * smoothstep(0.35, 0.95, l);
      c.rgb = mix(c.rgb, gr, uGrade);
      vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
      c.rgb *= mix(0.55, 1.0, smoothstep(1.05, 0.25, length(q)));
      float g = fract(sin(dot(floor(vUv * uRes) + floor(uTime * 24.0) * 17.0, vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (g - 0.5) * 0.022;
      gl_FragColor = c;
    }`,
};

// Drawn only while needed (an extra pass, off otherwise): the earth the camera
// sinks through on its way to the smithy, and the moonlight flare of a pull (field.js).
const fxShader = {
  uniforms: {
    tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
    // x, y: how far the first and second edge have crossed the screen, z: +1 down / -1 up, w: on
    uStrata: { value: new THREE.Vector4(0, 0, 1, 0) }, uCamY: { value: 0 },
    // xy: screen position, z: strength
    uFlare: { value: new THREE.Vector3(0.5, 0.5, 0) },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform vec2 uRes; varying vec2 vUv;
    uniform vec4 uStrata; uniform float uCamY; uniform vec3 uFlare;
    float sh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float sn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
      return mix(mix(sh(i), sh(i+vec2(1,0)), u.x), mix(sh(i+vec2(0,1)), sh(i+vec2(1,1)), u.x), u.y); }
    // A cut through the ground at the camera's depth: soil, clay, gravel, bedrock,
    // warm near the smithy's roof. Drawn in world metres, so it slides past as the camera sinks.
    vec3 earth(vec2 uv){
      vec2 w = vec2((uv.x - 0.5) * uRes.x / uRes.y, uv.y - 0.5) * 4.2;
      float y = uCamY + w.y;
      float d = -y + (sn(vec2(w.x * 0.4, y * 0.3)) - 0.5) * 1.3;
      vec3 c = vec3(0.050, 0.042, 0.038);                                   // topsoil
      c = mix(c, vec3(0.105, 0.072, 0.052), smoothstep(1.0, 1.25, d));       // clay
      c = mix(c, vec3(0.068, 0.066, 0.068), smoothstep(3.4, 3.6, d));        // gravel
      c = mix(c, vec3(0.050, 0.054, 0.068), smoothstep(6.2, 6.5, d));        // bedrock
      c = mix(c, vec3(0.085, 0.050, 0.032), smoothstep(9.6, 11.6, d));       // warm above the smithy
      // sediment: thin bands, light and dark, gently wavy
      float band = fract(d * 1.6 + sn(vec2(w.x * 0.8, d)) * 0.5);
      c *= 1.0 + 0.35 * smoothstep(0.05, 0.0, abs(band - 0.5)) - 0.25 * smoothstep(0.1, 0.0, band);
      c *= 0.84 + 0.3 * sn(vec2(w.x, y) * 36.0);                             // grain
      // stones: thick in the gravel, scattered elsewhere; lit from the side the light comes from
      vec2 p = vec2(w.x, y) * 2.6;
      vec2 cell = floor(p), f = fract(p) - 0.5;
      float h = sh(cell);
      float dens = 0.05 + 0.4 * smoothstep(3.3, 3.7, d) * (1.0 - smoothstep(6.0, 6.6, d)) + 0.1 * smoothstep(6.6, 7.4, d);
      if (h < dens) {
        vec2 o = (vec2(sh(cell + 7.1), sh(cell + 3.3)) - 0.5) * 0.3;
        float r = 0.1 + 0.2 * sh(cell + 1.9);
        vec2 e = (f - o) / vec2(r * (1.0 + 0.5 * sh(cell + 4.4)), r);
        float k = dot(e, e) + (sn(f * 9.0 + cell) - 0.5) * 0.45;
        float from = mix(1.0, -1.0, smoothstep(8.5, 11.5, d));               // moon above, fire below
        float lit = clamp(0.5 + 0.6 * e.y * from, 0.0, 1.0);
        vec3 stone = mix(vec3(0.15, 0.15, 0.16), vec3(0.17, 0.13, 0.10), smoothstep(1.0, 3.0, d) * (1.0 - smoothstep(3.4, 4.0, d)));
        stone *= (0.75 + 0.5 * sh(cell + 5.2)) * (0.4 + 0.8 * lit);
        vec2 sd = e + vec2(0.0, 0.45 * from);
        c *= 1.0 - 0.45 * smoothstep(1.7, 0.9, dot(sd, sd));                // its shadow on the earth
        c = mix(c, stone, smoothstep(1.0, 0.84, k));
      }
      return c;
    }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      if (uFlare.z > 0.0) {
        vec2 fd = (vUv - uFlare.xy) * vec2(uRes.x / uRes.y, 1.0);
        float streak = exp(-abs(fd.y) * 110.0) * exp(-abs(fd.x) * 2.6);
        c.rgb += vec3(0.72, 0.84, 1.0) * uFlare.z * (streak * 0.6 + exp(-dot(fd, fd) * 70.0) * 0.4);
      }
      if (uStrata.w > 0.0) {
        // edge 1 enters first (the ground going down, the smithy's roof going up), edge 2 lets go
        bool down = uStrata.z > 0.0;
        float uy = down ? vUv.y : 1.0 - vUv.y;
        float a = uStrata.x * 1.3 - 0.15 + (sn(vec2(vUv.x * 9.0, 1.7)) - 0.5) * 0.07 + (sn(vec2(vUv.x * 37.0, 4.2)) - 0.5) * 0.025;
        float b = uStrata.y * 1.3 - 0.15 + (sn(vec2(vUv.x * 7.0, 8.3)) - 0.5) * 0.09 + (sn(vec2(vUv.x * 29.0, 2.6)) - 0.5) * 0.03;
        float m = smoothstep(a + 0.003, a - 0.003, uy) * smoothstep(b - 0.003, b + 0.003, uy);
        vec3 moonC = vec3(0.32, 0.42, 0.7), fireC = vec3(1.0, 0.42, 0.14);
        vec3 e = earth(vUv);
        e += (down ? moonC : fireC) * exp(-max(a - uy, 0.0) * 14.0) * 0.3;
        e += (down ? fireC : moonC) * exp(-max(uy - b, 0.0) * 10.0) * 0.32;
        c.rgb = mix(c.rgb, e, m);
      }
      gl_FragColor = c;
    }`,
};

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const pr = Math.min(window.devicePixelRatio, 1.75);
  renderer.setPixelRatio(pr);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(C.fog, 0.022);
  scene.environment = makeEnvironment(renderer);
  scene.environmentIntensity = 1.35;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 64, 32), skyMaterial());
  sky.renderOrder = -2;
  const stars = makeStars();
  stars.renderOrder = -1;
  const skyGroup = new THREE.Group();
  skyGroup.add(sky, stars);
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const groundUniforms = makeGroundUniforms(aniso);
  // everything that belongs to the night outside, hidden as one in the smithy,
  // and the smithy below, shown only down there. Each holds its own lights: a
  // shader is built for the lights in view, so keeping the two sets apart keeps
  // the field's shaders free of the smithy's lights (and the reverse), and the
  // smithy arriving never rebuilds what is already on screen.
  const outdoor = new THREE.Group();
  const underground = new THREE.Group();
  underground.visible = false;
  const ridges = makeRidges();
  outdoor.add(ridges, makeTerrain(groundUniforms));
  scene.add(skyGroup, outdoor, underground);

  const mistLow = makeMist(0.14, 0.18, 0.16, 0.05);
  const mistHigh = makeMist(0.7, 0.1, 0.06, 0.03);
  const motes = makeMotes();
  const ash = makeAsh();
  const leaves = makeLeaves();
  outdoor.add(mistLow, mistHigh, motes, ash, leaves);

  // Moonlight comes from behind the field so every blade gets a rim.
  const moon = new THREE.DirectionalLight(0xbcd0ff, 2.6);
  moon.position.copy(MOON_DIR).multiplyScalar(30).setY(16);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -12, right: 12, top: 10, bottom: -6, near: 1, far: 70 });
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.02;
  // Soft key from just beside the camera so blade faces read, not just rims.
  const fill = new THREE.DirectionalLight(0x9db0e8, 1.25);
  fill.position.set(3, 4, 9);
  const hemi = new THREE.HemisphereLight(0x2c3d7a, 0x05060c, 0.5);
  outdoor.add(moon, fill, hemi);
  scene.add(moon.target);

  const composer = new EffectComposer(renderer);
  // The scene's depth stays readable for the light shafts (the sky writes none).
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) rt.depthTexture = new THREE.DepthTexture(1, 1);
  composer.addPass(new RenderPass(scene, camera));
  const shafts = new ShaftsPass();
  composer.addPass(shafts);
  // Depth of field, only switched on while a weapon is being inspected.
  const bokeh = new BokehPass(scene, camera, { focus: 4, aperture: 0, maxblur: 0.006 });
  bokeh.materialDepth.name = 'dof-depth';
  bokeh.enabled = false;
  composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.55, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const fxPass = new ShaderPass(fxShader);
  fxPass.enabled = false;
  composer.addPass(fxPass);
  const final = new ShaderPass(finalShader);
  composer.addPass(final);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const p = renderer.getPixelRatio(); // the adaptive quality loop changes it after creation
    final.uniforms.uRes.value.set(w * p, h * p);
    fxPass.uniforms.uRes.value.set(w * p, h * p);
    stars.material.uniforms.uPR.value = p;
    motes.material.uniforms.uPR.value = p * (h / 900);
    ash.material.uniforms.uPR.value = p * (h / 900);
  }
  resize();

  const lightNdc = new THREE.Vector3(), camFwd = new THREE.Vector3();
  let wind = 0, lastT = 0;
  function update(t) {
    const dt = Math.min(Math.max(t - lastT, 0), 0.1);
    lastT = t;
    const fx = api.quality?.fx !== false;
    // Wind: the sound's slow LFO (0.07 Hz) when audio runs, else the same tempo.
    const ph = api.windPhase?.() ?? t * 0.07;
    const gust = 0.5 + 0.5 * Math.sin(ph * Math.PI * 2);
    wind += dt * (0.35 + 0.9 * gust);
    hazeUniforms.uHazeT.value = t;
    ash.visible = leaves.visible = fx;
    ash.material.uniforms.uTime.value = leaves.material.uniforms.uTime.value = t;
    ash.material.uniforms.uWind.value = leaves.material.uniforms.uWind.value = wind;
    // Shafts: only outside, only while the light is near the frame.
    let s = 0;
    if (fx && !under && shaftStrength > 0) {
      camera.getWorldDirection(camFwd);
      if (camFwd.dot(lightDir) > 0.2) {
        lightNdc.copy(lightDir).multiplyScalar(100).add(camera.position).project(camera);
        const edge = Math.max(Math.abs(lightNdc.x), Math.abs(lightNdc.y));
        s = shaftStrength * smooth(1.5, 0.95, edge);
        shafts.light.set(lightNdc.x * 0.5 + 0.5, lightNdc.y * 0.5 + 0.5);
      }
    }
    shafts.enabled = s > 0.002;
    shafts.add.uniforms.uStrength.value = s;
    skyGroup.position.copy(camera.position);
    stars.material.uniforms.uTime.value = t;
    mistLow.material.uniforms.uTime.value = t;
    mistHigh.material.uniforms.uTime.value = t;
    if (ruinIn.value < 1) ruinIn.value = Math.min(1, ruinIn.value + dt / 3.5); // risen out of the fog, eased (shader)
    motes.material.uniforms.uTime.value = t;
    final.uniforms.uTime.value = t;
  }

  function setFocus(distance, amount) {
    bokeh.enabled = amount > 0.01;
    bokeh.uniforms.focus.value = distance;
    bokeh.uniforms.aperture.value = amount * 0.0035;
  }

  // Time of day. d: 0 night ... 1 overcast day; tint: dawn/dusk warmth, by
  // default strongest halfway through the ramp. Everything is a lerp from the
  // night values as built, so d = 0 is exactly the night above.
  const NIGHT = {
    zenith: C.zenith.clone(), horizon: C.horizon.clone(), moonGlow: C.moonGlow.clone(), fog: C.fog.clone(),
    haze: C.haze.clone(), mist: C.mist.clone(), disc: C.disc.clone(), rim: C.rim.clone(), band: C.band.clone(),
    ridgeNear: new THREE.Color(0x101a3d), ridgeFar: new THREE.Color(0x131f46),
    key: moon.color.clone(), fill: fill.color.clone(), hemiSky: hemi.color.clone(), hemiGround: hemi.groundColor.clone(),
  };
  // scalars: [night, day, dusk]
  const S = {
    key: [moon.intensity, 4.2, 3.4], keyY: [16, 24, 6], elev: [0.15, 0.17, 0.11],
    fill: [fill.intensity, 1.3, 1.0], hemi: [hemi.intensity, 1.25, 0.8],
    density: [scene.fog.density, 0.0145, 0.02], hazeA: [0.85, 0.5, 0.8],
    exposure: [renderer.toneMappingExposure, 0.86, 0.98], bloom: [bloom.strength, 0.3, 0.38],
    env: [scene.environmentIntensity, 1.1, 1.0], motes: [1, 0.25, 0.6],
    shafts: [0.85, 0.5, 0.7],
  };
  let shaftStrength = 0;
  const ASH = { night: new THREE.Color(0.32, 0.36, 0.46), day: new THREE.Color(0.42, 0.4, 0.38) };
  const LEAF = { night: new THREE.Color(0.035, 0.032, 0.035), day: new THREE.Color(0.16, 0.11, 0.07) };
  const forgeFog = new THREE.Color(0x0b0806);
  let day = 0, warm = 0, under = false;
  const mixC = (out, k) => out.copy(NIGHT[k]).lerp(DAY[k], day).lerp(DUSK[k], warm);
  const mixS = (k) => { const [n, d, w] = S[k]; const v = n + (d - n) * day; return v + (w - v) * warm; };
  const ridgeMats = ridges.children.map((m) => [m.material, m.userData.near ? 'ridgeNear' : 'ridgeFar']);
  function apply() {
    skyDay.value = day;
    for (const k of ['zenith', 'horizon', 'moonGlow', 'fog', 'haze', 'mist', 'disc', 'rim', 'band']) mixC(C[k], k);
    for (const [m, k] of ridgeMats) mixC(m.color, k);
    mixC(moon.color, 'key'); mixC(fill.color, 'fill');
    mixC(hemi.color, 'hemiSky'); mixC(hemi.groundColor, 'hemiGround');
    lightDir.set(0.3, mixS('elev'), -1).normalize();
    moon.position.copy(lightDir).multiplyScalar(30).setY(mixS('keyY'));
    hazeUniforms.uHazeA.value = mixS('hazeA');
    motes.material.uniforms.uAlpha.value = mixS('motes');
    shaftStrength = mixS('shafts');
    shafts.add.uniforms.uTint.value.copy(C.moonGlow).lerp(C.disc, 0.5);
    // the plain sky around the light, so only the disc and halo cast shafts
    shafts.mask.uniforms.uFloor.value.copy(C.horizon).multiplyScalar(1.6);
    ash.material.uniforms.uColor.value.copy(ASH.night).lerp(ASH.day, day);
    leaves.material.uniforms.uColor.value.copy(LEAF.night).lerp(LEAF.day, day);
    final.uniforms.uGrade.value = under ? 0 : 1;
    // Underground smithy (camera near y = -12.4): nothing from outside may show
    // or light it, whatever the hour; it keeps the night grading it was tuned in.
    bloom.strength = under ? S.bloom[0] : mixS('bloom');
    scene.environmentIntensity = under ? S.env[0] : mixS('env');
    renderer.toneMappingExposure = under ? S.exposure[0] : mixS('exposure');
    moon.intensity = under ? 0 : mixS('key');
    fill.intensity = under ? 0 : mixS('fill');
    hemi.intensity = under ? 0 : mixS('hemi');
    scene.fog.color.copy(under ? forgeFog : C.fog);
    scene.fog.density = under ? 0.06 : mixS('density');
  }
  function setDaylight(d, tint) {
    day = Math.min(1, Math.max(0, d));
    warm = tint ?? Math.pow(Math.sin(Math.PI * day), 1.5) * 0.85;
    apply();
  }
  function setUnderground(on) {
    skyGroup.visible = outdoor.visible = !on;
    underground.visible = on;
    moon.shadow.autoUpdate = !on; // its shadow map is not redrawn down in the smithy
    under = on;
    // three draws shadow maps before it takes stock of the frame's lights, so on
    // the frame the light set changes they would be built for the old set
    // (shader programs compiled mid-frame, for nothing): skip that one frame.
    api.shadowHold = 1;
    apply();
  }

  // One frame drawn off screen with everything that otherwise first shows up
  // mid-session: the depth-of-field pass, faded (see-through) swords, every
  // shadow map, all objects in or out of view, and (below) the smithy with its
  // own lights. The driver finishes its per-draw setup for new shaders on the
  // first real draw (a pause of a few hundred ms on the Radeon/ANGLE tested);
  // this puts that pause where it costs least (warm.js, main.js).
  function rehearse(below = false) {
    const rt = renderer.getRenderTarget(), wasUnder = under, hold = api.shadowHold;
    const touched = [], shown = [], fading = new Set();
    scene.traverse((o) => {
      if ((o.isMesh || o.isPoints || o.isSprite) && o.frustumCulled) { o.frustumCulled = false; touched.push(o); }
      if (o.userData.landing && !o.visible) { o.visible = true; shown.push(o); }
      for (const m of [].concat(o.material || [])) if (m.userData.baseOpacity !== undefined) fading.add(m);
    });
    // swords are drawn both ways: solid, and see-through while they fade
    const flip = () => fading.forEach((m) => { m.transparent = !m.transparent; m.needsUpdate = true; });
    const lit = [];
    scene.traverse((l) => { if (l.isLight && l.castShadow) { lit.push([l, l.shadow.autoUpdate]); l.shadow.autoUpdate = true; } });
    try {
      if (below !== under) setUnderground(below);
      renderer.setRenderTarget(composer.readBuffer);
      renderer.shadowMap.needsUpdate = false;
      renderer.render(scene, camera); // takes stock of this set of lights
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera); // now with its shadow maps
      if (!below) bokeh.render(renderer, composer.writeBuffer, composer.readBuffer);
      fxPass.render(renderer, composer.writeBuffer, composer.readBuffer); // first drawn here, not on the first pull
      if (!below && fading.size) {
        flip();
        renderer.setRenderTarget(composer.readBuffer);
        renderer.render(scene, camera);
        bokeh.render(renderer, composer.writeBuffer, composer.readBuffer);
        flip();
      }
    } finally {
      if (wasUnder !== under) setUnderground(wasUnder);
      api.shadowHold = Math.max(hold, 1); // the light set may have changed under three's feet
      lit.forEach(([l, a]) => { l.shadow.autoUpdate = a; });
      touched.forEach((o) => { o.frustumCulled = true; });
      shown.forEach((o) => { o.visible = false; });
      renderer.setRenderTarget(rt);
    }
  }

  // quality.fx (main.js) switches the shafts and the wind particles off first when
  // frames run slow; windPhase() can be set to follow the wind sound's LFO.
  const api = {
    renderer, scene, camera, composer, resize, update, setFocus, setUnderground, setDaylight, mistHoles, crack,
    outdoor, underground, depthPass: bokeh.materialDepth, rehearse,
    shadowHold: 1, // frames to leave the shadow maps as they are (the first: no lights taken stock of yet)
    quality: { dof: true, fx: true }, windPhase: null,
    render: () => {
      const u = fxPass.uniforms;
      fxPass.enabled = u.uStrata.value.w > 0 || u.uFlare.value.z > 0;
      composer.render();
    },
    // the extra pass's settings: the earth passing on the way down, the pull's flare
    post: fxPass.uniforms,
    groundImpact: (m) => groundImpact(m, groundUniforms),
    // The first view's ground maps, each settling when it is in (the frame waits for them).
    groundLoads: Object.keys(GROUND_MAPS).map((k) => groundUniforms[k].value.userData.loaded),
    // Set once the first frame is up: from then on the ruins rise out of the fog when they come.
    shown: false,
    ruins: null,
    // Swap the ground maps for a sharper set ('1k' or '2k'), uploaded a few per frame first.
    async upgradeGround(res) {
      const next = Object.fromEntries(Object.entries(GROUND_MAPS).map(([k, [name, srgb]]) => [k, tex(`${GROUND_DIR}${name}_${res}.jpg`, srgb, aniso)]));
      await Promise.all(Object.values(next).map((t) => t.userData.loaded));
      if (Object.values(next).some((t) => !t.image)) return;
      await uploadTextures(api, Object.values(next));
      for (const [k, t] of Object.entries(next)) { const old = groundUniforms[k].value; groundUniforms[k].value = t; old.dispose(); }
    },
  };
  // ruinsArrived: in and compiling; ruins: in the scene
  let arrived;
  api.ruinsArrived = new Promise((r) => { arrived = r; });
  api.ruins = loadRuins(api, outdoor, aniso, arrived).then((r) => { if (r && api.shown) ruinIn.value = 0; return r; });
  return api;
}
