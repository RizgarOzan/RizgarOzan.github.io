// The sword field: planting the weapons, hover response, and the single
// choreography queue that pulls a weapon out, frames it, and plants it back.
// Continuous reactions (hover, lights) run on springs; one-off moves run on
// GSAP timelines. Only one timeline is ever alive, so nothing overlaps.
import * as THREE from 'three';
import { gsap } from 'gsap';
import { loadGLB } from './loader.js';
import { warm } from './warm.js';
import { entries, slots as SLOT_POS } from '../data.js';
import { collectSway } from './sway.js';

const HOME = { pos: new THREE.Vector3(0, 1.0, 6.3), look: new THREE.Vector3(0, 1.12, -1.4) };
// The opening glide: from high over the field's edge, past the ruins' skyline, down among the swords.
const INTRO = { pos: new THREE.Vector3(-4.6, 4.6, 15.5), look: new THREE.Vector3(2.2, 3.6, -14) };
const INTRO_VIA = new THREE.Vector3(-2.4, 2.1, 10.6);
const FORGE = { pos: new THREE.Vector3(0.5, -12.35, 6.4), look: new THREE.Vector3(0.45, -12.95, -1) }; // smithy fallback pose
const RAISE_CLEAR = 0.42; // how far above the ground the lowest point floats when inspected
// An open weapon sways side to side (face-on at the middle) instead of turning round.
const SWAY = THREE.MathUtils.degToRad(35), SWAY_W = (Math.PI * 2) / 16;

// Critically damped spring for values that react continuously.
class Spring {
  constructor(v = 0, stiffness = 120) { this.v = v; this.target = v; this.vel = 0; this.k = stiffness; this.d = 2 * Math.sqrt(stiffness); }
  // Sub-stepped so slow frames still settle in the same wall-clock time.
  step(dt) {
    const n = Math.max(1, Math.ceil(dt * 120));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      const a = -this.k * (this.v - this.target) - this.d * this.vel;
      this.vel += a * h;
      this.v += this.vel * h;
    }
    return this.v;
  }
}

// Stands in for a model that failed to load: a plain, unlit-looking stake of dull iron, so a
// missing file reads as "something is missing here", not as a different sword.
const placeholder = {
  build() {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.1, 0.05), new THREE.MeshStandardMaterial({ color: 0x3a3d45, metalness: 0.2, roughness: 0.9 }));
    m.position.y = 0.55;
    return new THREE.Group().add(m);
  },
};

function seeded(i) { const s = Math.sin(i * 91.7 + 13.1) * 43758.5; return s - Math.floor(s); }

function heightOf(obj) {
  const b = new THREE.Box3().setFromObject(obj);
  return { min: b.min.y, max: b.max.y, width: b.max.x - b.min.x };
}

// assets/weapons/<id>.glb; rejects when the file is missing (callers decide what stands in).
export async function loadWeapon(id, priority) {
  const gltf = await loadGLB(`assets/weapons/${id}.glb`, priority);
  gltf.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { build: () => gltf.scene.clone(true), update: null };
}

const deg = THREE.MathUtils.degToRad;
function poseOf(entry) {
  const p = entry.pose || {};
  return new THREE.Euler(deg(p.pitch || 0), deg(p.yaw || 0), deg(-(p.lean || 0)));
}

// The broken earth where the blade went in: three Blender variants
// (tools/blender/impact.py), shared across slots and tinted to the night ground.
const impactCache = new Map();
const impactTint = new THREE.Color(1, 1, 1); // world.js re-materials the craters with the ground texture
function loadImpact(variant, world, priority) {
  if (!impactCache.has(variant)) {
    impactCache.set(variant, loadGLB(`assets/env/impact-${variant}.glb`, priority).then((gltf) => {
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        o.material.color.copy(impactTint);
        o.material.roughness = 0.96;
        world.groundImpact?.(o.material);
      });
      return gltf.scene;
    }).catch(() => null));
  }
  return impactCache.get(variant);
}
// This slot's crater, placed (not yet in the scene), or null.
async function crater(world, index) {
  const src = await loadImpact('abc'[index % 3], world, index);
  if (!src) return null;
  const m = src.clone();
  m.rotation.y = seeded(index * 4.1) * Math.PI * 2;
  m.position.y = -0.012;
  return m;
}

function makeMound(accent) {
  const g = new THREE.Group();
  // Soft ring of light on the ground, raised on hover.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.95, 64),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(accent) }, uA: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColor; uniform float uA; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; float a = smoothstep(1.0, 0.55, r) * smoothstep(0.3, 0.62, r); gl_FragColor = vec4(uColor, a * uA); }',
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  g.add(ring);
  return { group: g, ring };
}

// One pooled burst of dust/sparks, reused for every pull and plant.
function makeDust() {
  const N = 90;
  const pos = new Float32Array(N * 3), vel = new Float32Array(N * 3), life = new Float32Array(N);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(0x9fb0d8) }, uPR: { value: Math.min(window.devicePixelRatio, 1.75) } },
    vertexShader: 'attribute float aLife; uniform float uPR; varying float vL; void main(){ vL = aLife; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = (2.0 + 5.0 * aLife) * uPR * (6.0 / -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uColor; varying float vL; void main(){ float r = length(gl_PointCoord - 0.5); if (r > 0.5 || vL <= 0.0) discard; gl_FragColor = vec4(uColor, vL * 0.6 * (1.0 - r * 2.0)); }',
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return {
    points,
    burst(origin, strength = 1) {
      for (let i = 0; i < N; i++) {
        const a = Math.random() * Math.PI * 2, s = (0.4 + Math.random() * 1.2) * strength;
        pos.set([origin.x + Math.cos(a) * 0.12, origin.y + 0.03, origin.z + Math.sin(a) * 0.12], i * 3);
        vel.set([Math.cos(a) * s, (0.6 + Math.random() * 1.4) * strength, Math.sin(a) * s], i * 3);
        life[i] = 0.6 + Math.random() * 0.4;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aLife.needsUpdate = true;
    },
    update(dt) {
      let alive = false;
      for (let i = 0; i < N; i++) {
        if (life[i] <= 0) continue;
        alive = true;
        vel[i * 3 + 1] -= 3.2 * dt;
        for (let k = 0; k < 3; k++) { vel[i * 3 + k] *= 1 - 1.6 * dt; pos[i * 3 + k] += vel[i * 3 + k] * dt; }
        if (pos[i * 3 + 1] < 0.01) { pos[i * 3 + 1] = 0.01; vel[i * 3 + 1] = 0; }
        life[i] -= dt * 0.9;
      }
      if (alive) { geo.attributes.position.needsUpdate = true; geo.attributes.aLife.needsUpdate = true; }
    },
  };
}

// Earth clods flung out when a blade is pulled: one instanced mesh, simulated on
// the CPU only while a burst is alive; they bounce once and sink back in.
function makeDebris() {
  const N = 30;
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x2b2722, roughness: 1, metalness: 0, flatShading: true }), N);
  mesh.count = 0;
  mesh.frustumCulled = false;
  const P = Array.from({ length: N }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: new THREE.Vector3(), age: 9 }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  return {
    mesh,
    burst(origin) {
      P.forEach((c, i) => {
        const a = Math.random() * Math.PI * 2, sp = 0.5 + Math.random() * 1.3;
        c.p.set(origin.x + Math.cos(a) * 0.08, 0.04, origin.z + Math.sin(a) * 0.08);
        c.v.set(Math.cos(a) * sp, 1.1 + Math.random() * 1.9, Math.sin(a) * sp);
        c.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
        c.w.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14);
        const k = 0.01 + Math.pow(Math.random(), 2) * 0.03;
        c.s.set(k * (0.8 + Math.random() * 0.5), k * (0.6 + Math.random() * 0.4), k * (0.8 + Math.random() * 0.5));
        c.age = i < 22 ? 0 : 9; // a handful, not a fountain
      });
    },
    update(dt) {
      let n = 0;
      for (const c of P) {
        if (c.age > 2.2) continue;
        c.age += dt;
        if (c.p.y > 0.0 || c.v.y > 0) {
          c.v.y -= 9.8 * dt;
          c.p.addScaledVector(c.v, dt);
          c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt;
          if (c.p.y < c.s.y && c.v.y < 0) {
            c.p.y = c.s.y;
            if (c.v.y < -1.2) { c.v.y *= -0.28; c.v.x *= 0.45; c.v.z *= 0.45; c.w.multiplyScalar(0.4); } else c.v.set(0, 0, 0);
          }
        }
        const sink = THREE.MathUtils.smoothstep(c.age, 1.5, 2.2);
        q.setFromEuler(c.r);
        m4.compose(sc.copy(c.p).setY(c.p.y - sink * c.s.y * 1.2), q, c.s);
        mesh.setMatrixAt(n++, m4);
      }
      mesh.count = n;
      if (n) mesh.instanceMatrix.needsUpdate = true;
    },
  };
}

// The dust ring a planted blade knocks outward along the ground.
function makeShock() {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    uniforms: { uA: { value: 0 }, uR: { value: 0.2 }, uColor: { value: new THREE.Color(0x7d8299) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform float uA, uR; uniform vec3 uColor; varying vec2 vUv;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y); }
      void main(){
        vec2 p = (vUv - 0.5) * 4.0; float r = length(p);
        float w = 0.1 + uR * 0.22;
        float ring = smoothstep(w, 0.0, abs(r - uR)) * smoothstep(0.0, w, r - uR * 0.5);
        float n = vn(vec2(atan(p.y, p.x) * 5.0, r * 3.0)) * 0.6 + vn(p * 9.0) * 0.4;
        gl_FragColor = vec4(uColor, ring * smoothstep(0.3, 0.8, n) * uA);
      }`,
  }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 3;
  return mesh;
}

// Per-slot additions to the weapon's own (cloned) materials: a moonlight glint
// that sweeps up the blade on hover, and a rim that brightens while it is open.
// Every material of one slot shares the same uniform objects.
const GLINT_COL = new THREE.Color(0.8, 0.88, 1.0);
function patchBlade(material, u) {
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.uniforms.uGlintCol = { value: GLINT_COL };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uHolderInv; varying float vGlintY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGlintY = (uHolderInv * modelMatrix * vec4(transformed, 1.0)).y;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uGlint, uLen; uniform float uRimA, uRoughMin; uniform vec3 uGlintCol; varying float vGlintY;')
      // roughness floor (data.js roughMin; 0 = as modelled), applied after the model's own map
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, uRoughMin);')
      .replace('#include <opaque_fragment>', `{
          float hN = (vGlintY + uLen.x) / uLen.y;
          float band = exp(-pow((hN - uGlint.x) * 20.0, 2.0)) * uGlint.y;
          float fr = pow(1.0 - saturate(abs(dot(normal, normalize(vViewPosition)))), 3.0);
          outgoingLight += uGlintCol * (band * (0.1 + 0.9 * fr) * mix(0.35, 1.0, metalnessFactor) * 0.6 + fr * uRimA);
          // soft knee on the brightest highlights: polished parts (a revolver's cylinder, a
          // keen edge) glow instead of clipping to hard white dots
          float pk = max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b);
          if (pk > 0.85) outgoingLight *= (0.85 + (pk - 0.85) / (1.0 + (pk - 0.85) * 1.4)) / pk;
        }
        #include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => 'blade-fx';
}

export function createField(world, { onOpened, onClosing, reducedMotion, audio }) {
  const { scene, camera } = world;
  // Everything of the field lives in world.outdoor (hidden, with its lights, down in the smithy).
  const outdoor = world.outdoor || scene;

  // Field swords come first in entries; forge stations follow and live in forge.js.
  const fieldEntries = entries.filter((e) => e.place !== 'forge');

  const dust = makeDust();
  outdoor.add(dust.points);
  const burst = (at, strength) => { if (!reducedMotion) dust.burst(at, strength); };
  const debris = makeDebris();
  const shock = makeShock();
  outdoor.add(debris.mesh, shock);
  const fxOn = () => !reducedMotion && world.quality?.fx !== false;
  const crackFx = { a: 0, r: 1 }, shockFx = { a: 0, r: 0.2 };
  // The pull's moment: time slows as the blade clears the earth, moonlight runs
  // up the steel and the camera leans in. Particles and sway follow warp.v.
  const warp = { v: 1 }, flare = { a: 0, s: null }, push = { v: 0 };
  function pullMoment(tl, s) {
    if (!fxOn()) return;
    gsap.killTweensOf([warp, flare, push]);
    const slow = () => tl.timeScale(warp.v);
    gsap.timeline()
      .to(warp, { v: 0.3, duration: 0.06, ease: 'power2.out', onUpdate: slow })
      .to(warp, { v: 1, duration: 0.16, ease: 'power2.in', onUpdate: slow, onComplete: () => tl.timeScale(1) }, 0.26);
    s.glintT = 0;
    flare.s = s;
    gsap.timeline().to(flare, { a: 1, duration: 0.08, ease: 'power2.out' }).to(flare, { a: 0, duration: 0.85, ease: 'power2.in' });
    gsap.timeline().to(push, { v: 0.28, duration: 0.32, ease: 'power2.out' }).to(push, { v: 0, duration: 0.9, ease: 'power2.inOut' });
  }
  // Pull: clods fly with the dust and the cracks under the blade flash once.
  function pullFx(s) {
    if (!fxOn()) return;
    const P = s.root.position;
    debris.burst(P);
    // drawn by the ground and crater shaders (world.js), so it lies on the real surface
    const c = world.crack;
    if (c) {
      c.at.set(P.x, P.z, Math.random() * 50);
      c.color.set(s.entry.accent).lerp(GLINT_COL, 0.5);
      gsap.killTweensOf(crackFx);
      Object.assign(crackFx, { a: 0, r: 0.6 });
      gsap.timeline().to(crackFx, { a: 1, duration: 0.06, ease: 'power2.out' }).to(crackFx, { a: 0, duration: 0.75, ease: 'power2.in' });
      gsap.to(crackFx, { r: 1, duration: 0.25, ease: 'power2.out' });
    }
  }
  // Plant: a ring of dust runs out along the ground.
  function plantFx(s) {
    if (!fxOn()) return;
    const P = s.root.position;
    shock.position.set(P.x, 0.03, P.z);
    gsap.killTweensOf(shockFx);
    Object.assign(shockFx, { a: 0.42, r: 0.25 });
    gsap.to(shockFx, { r: 1.7, duration: 0.9, ease: 'power3.out' });
    gsap.to(shockFx, { a: 0, duration: 0.9, ease: 'power2.in' });
  }

  // Each slot stands ready (its light, ring and place in the V) from the start; its
  // sword is planted the moment its model and crater are in and warmed, front
  // sword first, and fades in. Lights never come or go, so nothing recompiles.
  const hits = [];
  const slots = fieldEntries.map((entry, i) => {
    const [x, z] = SLOT_POS[i];
    const root = new THREE.Group();
    root.position.set(x, 0, z);
    root.rotation.y = Math.atan2(HOME.pos.x - x, HOME.pos.z - z);
    const lift = new THREE.Group();
    const spin = new THREE.Group();
    root.add(lift);
    lift.add(spin);

    const mound = makeMound(entry.accent);
    root.add(mound.group);

    // A faint accent on the blade itself, held up at mid-height and close in, so it
    // tints the steel without pooling a coloured spot on the ground at its root.
    // It hangs outside root: root hides when faded, and a hidden light changes the
    // light count, which recompiles every lit shader. It dims instead.
    // Desaturated, so dark steel keeps its own colour and only takes a hint of the accent.
    const lightCol = new THREE.Color(entry.accent);
    const hsl = lightCol.getHSL({});
    lightCol.setHSL(hsl.h, hsl.s * 0.3, Math.max(hsl.l, 0.6));
    const light = new THREE.PointLight(lightCol, 0, 1.4, 2);
    root.updateMatrixWorld();
    light.position.set(0, 0.75, 0.45).applyMatrix4(root.matrixWorld);
    outdoor.add(light);
    outdoor.add(root);

    let planted;
    const s = {
      i, entry, root, lift, spin, weapons: [], baseTilts: [poseOf(entry)], light, ring: mound.ring, mound: mound.group, hit: null,
      top: 1.6, sink: 0.3, fadeMats: [], sway: [], glintT: 2, planted: false, ready: new Promise((r) => { planted = r; }),
      bladeU: { uGlint: { value: new THREE.Vector2(-1, 0) }, uRimA: { value: 0 }, uHolderInv: { value: new THREE.Matrix4() }, uLen: { value: new THREE.Vector2(0.3, 1) }, uRoughMin: { value: entry.roughMin || 0 } },
      hover: new Spring(0, 140), glow: new Spring(0, 60), fade: new Spring(1, 110), appear: { v: 0 },
      c: { raise: 0, straight: 0, shake: 0, spin: 0, drag: 0, swayT: 0 },
    };
    s.plant = (mod, earth, arrived) => plant(s, mod, earth, arrived).then(planted);
    return s;
  });

  async function plant(s, mod, earth, arrived) {
    const { entry, i, spin } = s;
    // Built off-stage, warmed, then put in the ground.
    const stage = new THREE.Group();
    stage.position.copy(s.root.position);
    stage.rotation.copy(s.root.rotation);
    const weapons = [entry.weapon].map((id) => {
      const obj = mod.build();
      if (entry.scale) obj.scale.multiplyScalar(entry.scale);
      const h = heightOf(obj);
      const length = h.max - h.min;
      const sink = entry.sink ?? Math.min(Math.max(length * 0.2, 0.12), 0.42);
      const holder = new THREE.Group();
      obj.position.y = -sink;
      holder.add(obj);
      return { id, obj, holder, update: mod.update, length, sink };
    });
    weapons[0].holder.rotation.copy(s.baseTilts[0]);

    // Each slot owns its materials so it can fade alone when it would block the camera.
    // Weapons that keep material references in userData (for idle effects) are
    // pointed at the clones too.
    const clones = new Map();
    const w0 = weapons[0];
    const bladeU = s.bladeU;
    bladeU.uLen.value.set(w0.sink, w0.length);
    const own = (m) => {
      if (!clones.has(m)) {
        const c = m.clone();
        if (c.isMeshStandardMaterial) patchBlade(c, bladeU);
        // r170 only applies envMapIntensity to a material's own envMap, so the
        // dark-blade boost needs the scene's reflection map set on the material
        if (entry.env && 'envMapIntensity' in c) { c.envMap = scene.environment; c.envMapIntensity = entry.env * (scene.environmentIntensity ?? 1); }
        if (entry.glow && c.emissiveMap) c.emissiveIntensity *= entry.glow;
        c.userData.baseOpacity = c.opacity;
        c.userData.baseTransparent = c.transparent;
        clones.set(m, c);
      }
      return clones.get(m);
    };
    const held = new THREE.Group();
    weapons.forEach((w) => held.add(w.holder));
    held.traverse((o) => {
      if (!o.material) return;
      o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
    });
    const remap = (bag) => {
      for (const k of Object.keys(bag)) {
        const v = bag[k];
        if (v && v.isMaterial && clones.has(v)) bag[k] = clones.get(v);
        else if (v && typeof v === 'object' && v.constructor === Object) remap(v);
      }
    };
    held.traverse((o) => remap(o.userData));
    const sway = collectSway(held);

    const top = Math.max(...weapons.map((w) => w.length - w.sink));
    const sink = Math.max(...weapons.map((w) => w.sink));
    const width = 0.9;
    const hit = new THREE.Mesh(new THREE.BoxGeometry(width, top + 0.2, 0.7), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = (top + 0.2) / 2;
    hit.userData.index = i;

    stage.add(held);
    if (earth) stage.add(earth);
    // In the ground (still unseen: appear is 0) for warm.js's rehearsal frame, then shown.
    const putIn = () => {
      weapons.forEach((w) => spin.add(w.holder));
      if (earth) s.mound.add(earth);
      s.root.add(hit);
      hits.push(hit);
      s.root.userData.landing = true;
      Object.assign(s, { weapons, top, sink, fadeMats: [...clones.values()], sway, hit, faded: undefined });
    };
    const warmed = warm(world, stage, { shadows: ['depth'], depthPass: world.depthPass, fade: true, stage: putIn });
    arrived();
    try { await warmed; } catch (err) { console.error(err); if (!s.hit) putIn(); }
    s.root.userData.landing = false;
    s.planted = true;
    // Rises out of nothing once the field is on screen; already there if it beat the first frame.
    if (world.shown && !reducedMotion) gsap.to(s.appear, { v: 1, duration: 1.2, ease: 'power2.out' });
    else s.appear.v = 1;
  }

  // Front sword first: its crater and model are asked for before the next slot's.
  const mods = {};
  const arrivals = slots.map((s) => {
    const id = s.entry.weapon;
    const earth = crater(world, s.i);
    mods[id] ||= loadWeapon(id, s.i).catch((err) => {
      // One broken model must not take the whole site down.
      console.error(`weapon "${id}" failed to load`, err);
      return placeholder;
    });
    return new Promise((arrived) => {
      Promise.all([mods[id], earth]).then(([mod, e]) => s.plant(mod, e, arrived)).catch((err) => { arrived(); console.error(err); });
    });
  });

  // ---------- camera rig ----------
  const rig = { pos: INTRO.pos.clone(), look: INTRO.look.clone(), shiftX: 0, shiftY: 0, shake: 0 };
  const isPortrait = () => window.innerWidth < window.innerHeight * 0.9;

  // Landscape sees the whole field; portrait is a carousel that frames one slot, held a
  // little high so its foot clears the hint, the contact icons and the bar at the bottom.
  function homePose(i) {
    if (!isPortrait()) return HOME;
    const P = slots[Math.max(i, 0)].root.position;
    return { pos: new THREE.Vector3(P.x * 0.9, 1.25, P.z + 5.2), look: new THREE.Vector3(P.x, 0.82, P.z - 0.4) };
  }

  function moveRig(pose, duration, ease = 'power3.inOut') {
    gsap.killTweensOf([rig.pos, rig.look]);
    const tl = gsap.timeline();
    tl.to(rig.pos, { x: pose.pos.x, y: pose.pos.y, z: pose.pos.z, duration, ease }, 0)
      .to(rig.look, { x: pose.look.x, y: pose.look.y, z: pose.look.z, duration, ease }, 0);
    return tl;
  }
  const parallax = { x: new Spring(0, 30), y: new Spring(0, 30), on: 1 };

  function inspectPose(s) {
    const lifted = s.sink + RAISE_CLEAR;
    const bottom = RAISE_CLEAR;
    const topY = s.top + lifted;
    const h = topY - bottom;
    const cy = bottom + h / 2;
    const portrait = window.innerWidth < window.innerHeight * 0.9;
    const fit = portrait ? 0.42 : 0.8;
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    let d = h / (fit * 2 * half);
    if (portrait) d = Math.max(d, 0.5 / (0.8 * 2 * half * camera.aspect));
    d = Math.max(d, 2.4);
    const P = s.root.position;
    // Approach mostly straight on: in this V layout that line never crosses a neighbor.
    const toHome = new THREE.Vector3(HOME.pos.x - P.x, 0, HOME.pos.z - P.z).normalize();
    const F = new THREE.Vector3(0, 0, 1).lerp(toHome, 0.25).normalize();
    return {
      raise: lifted,
      pos: new THREE.Vector3(P.x + F.x * d, cy + h * 0.04, P.z + F.z * d),
      look: new THREE.Vector3(P.x, cy, P.z),
      shiftX: portrait ? 0 : 0.2,
      shiftY: portrait ? 0.27 : 0, // portrait: weapon sits above the bottom sheet
    };
  }

  // ---------- state & queue ----------
  let state = 'intro';
  let current = -1;
  let hovered = -1;
  let externalHover = false; // true while the index bar or keyboard drives the hover
  let busy = null;         // the one live timeline
  let pending = undefined;  // latest request that arrived while busy
  let at = -1;              // last reached target: slot index, -1 (field home), 'forge' or 'forge:<station>'
  let below = false;        // camera is down in the smithy
  let forge = null;         // station poses, set by attachForge()
  let repose = false;       // the smithy arrived while the camera was already down there
  let relayoutQueued = false; // the window changed shape mid-move: frame again once it ends

  function run(tl) {
    busy = tl;
    return new Promise((resolve) => tl.eventCallback('onComplete', () => { busy = null; resolve(); }));
  }

  async function settle() {
    while (pending !== undefined) {
      const next = pending;
      pending = undefined;
      await goTo(next);
    }
  }

  // target: slot index, -1 for the field, 'forge' or 'forge:<station>' for the smithy.
  let asked = -1;         // the latest target asked for
  function request(target) {
    if (typeof target === 'number' && target >= slots.length) return;
    asked = target;
    if (busy || state === 'intro') { pending = target; return; }
    goTo(target).then(settle);
  }

  async function goTo(target) {
    if (target === at) return;
    // A sword still on its way: go to it once it is in the ground, if still wanted.
    if (typeof target === 'number' && target >= 0 && !slots[target].planted) {
      slots[target].ready.then(() => { if (asked === target) request(target); });
      return;
    }
    const down = typeof target === 'string';
    if (current >= 0) await close();
    if (down && !below) await descend();
    if (!down && below) await ascend();
    if (down) await station(target.split(':')[1] || null);
    else if (target >= 0) await open(target);
    at = target;
  }

  // ---------- the smithy below ----------
  const veil = document.querySelector('.veil');
  const depthFx = { v: 0 };
  let strataDir = 0; // +1 / -1 while the earth is drawn passing (down / up); 0: the plain black veil
  function setVeil() { if (veil) veil.style.opacity = strataDir ? '0' : String(Math.sin(Math.PI * Math.min(depthFx.v, 1)) ** 1.5); }
  const ease01 = (a, b, x) => THREE.MathUtils.smoothstep(x, Math.min(a, b), Math.max(a, b)) * (a < b ? 1 : -1) + (a < b ? 0 : 1);
  // How far the ground's edge and the smithy roof's edge have crossed the screen, from the camera's height.
  function strata() {
    const u = world.post?.uStrata.value;
    if (!u) return;
    if (!strataDir) { u.w = 0; return; }
    const y = rig.pos.y;
    if (strataDir > 0) u.set(ease01(0.8, -0.15, y), ease01(-9.4, -11.6, y), 1, 1);
    else u.set(ease01(-11.6, -9.4, y), ease01(-0.15, 0.8, y), -1, 1);
    world.post.uCamY.value = y;
  }

  function depthMove(pose, toBelow) {
    state = 'moving';
    parallax.on = 0;
    hovered = -1;
    audio?.descend?.(toBelow);
    const dur = reducedMotion ? 0.4 : 2.2;
    depthFx.v = 0;
    strataDir = fxOn() ? (toBelow ? 1 : -1) : 0;
    let flipped = false;
    const tl = gsap.timeline();
    tl.to(depthFx, {
      v: 1, duration: dur, ease: 'none',
      onUpdate: () => { setVeil(); if (!flipped && depthFx.v > 0.5) { flipped = true; below = toBelow; world.setUnderground?.(toBelow); } },
    }, 0)
      .to(rig.pos, { x: pose.pos.x, y: pose.pos.y, z: pose.pos.z, duration: dur, ease: 'power2.inOut' }, 0)
      .to(rig.look, { x: pose.look.x, y: pose.look.y, z: pose.look.z, duration: dur, ease: 'power2.inOut' }, 0)
      .to(rig, { shiftX: 0, shiftY: 0, duration: dur * 0.6, ease: 'power2.inOut' }, 0);
    return run(tl).then(() => { depthFx.v = 0; strataDir = 0; setVeil(); strata(); parallax.on = 1; state = toBelow ? 'forge' : 'home'; });
  }
  const descend = () => depthMove(forge?.pose(null) || FORGE, true);
  const ascend = () => depthMove(homePose(0), false);

  // Frame one smithy station (or the whole room) and report it open.
  function station(name) {
    const pose = forge?.pose(name) || FORGE;
    const dur = reducedMotion ? 0.4 : 1.3;
    const tl = gsap.timeline();
    tl.to(rig.pos, { x: pose.pos.x, y: pose.pos.y, z: pose.pos.z, duration: dur, ease: 'power3.inOut' }, 0)
      .to(rig.look, { x: pose.look.x, y: pose.look.y, z: pose.look.z, duration: dur, ease: 'power3.inOut' }, 0)
      .to(rig, { shiftX: name ? (isPortrait() ? 0 : 0.2) : 0, shiftY: name && isPortrait() ? 0.27 : 0, duration: dur, ease: 'power3.inOut' }, 0);
    if (name) {
      const idx = entries.findIndex((e) => e.station === name);
      tl.add(() => onOpened?.(idx), reducedMotion ? 0.2 : 0.6);
    }
    state = 'moving';
    return run(tl).then(() => { state = 'forge'; });
  }

  // Slots standing between the inspect camera and its target step aside (fade out).
  function clearLineOfSight(i, pose) {
    const dir = new THREE.Vector2(pose.look.x - pose.pos.x, pose.look.z - pose.pos.z);
    const dTarget = dir.length();
    dir.normalize();
    slots.forEach((o) => {
      if (o.i === i) { o.fade.target = 1; return; }
      const vx = o.root.position.x - pose.pos.x, vz = o.root.position.z - pose.pos.z;
      const t = vx * dir.x + vz * dir.y;
      const lateral = Math.abs(vx * dir.y - vz * dir.x);
      o.fade.target = (t > -0.6 && t < dTarget - 0.35 && lateral < 0.45 + t * 0.5) ? 0 : 1;
    });
  }

  function applyFade(s) {
    const f = s.fade.v * s.appear.v;
    const faded = f < 0.995;
    if (faded !== s.faded) {
      s.faded = faded;
      s.fadeMats.forEach((m) => {
        m.transparent = faded || m.userData.baseTransparent;
        if (!faded) m.opacity = m.userData.baseOpacity;
        m.needsUpdate = true;
      });
    }
    if (faded) s.fadeMats.forEach((m) => { m.opacity = m.userData.baseOpacity * Math.max(f, 0); });
    s.root.visible = f > 0.02;
  }

  function open(i) {
    const s = slots[i];
    const pose = inspectPose(s);
    clearLineOfSight(i, pose);
    gsap.killTweensOf([rig.pos, rig.look]);
    state = 'opening';
    current = i;
    parallax.on = 0;
    s.c.drag = 0;
    s.c.swayT = 0;
    const dur = reducedMotion ? 0.5 : 1.5;
    const tl = gsap.timeline();
    if (reducedMotion) {
      // same end pose in the camera's half second, no shake or slow-motion
      tl.to(s.c, { raise: pose.raise, straight: 1, duration: 0.45, ease: 'power2.inOut' }, 0)
        .add(() => audio?.pull(), 0);
    } else {
      tl.to(s.c, { shake: 1, raise: 0.05, duration: 0.28, ease: 'power1.in' })
        .add(() => { burst(s.root.position, 1); pullFx(s); audio?.pull(); }, 0.2)
        .to(s.c, { raise: pose.raise, duration: 1.05, ease: 'power3.out' }, 0.26)
        .to(s.c, { shake: 0, duration: 0.35, ease: 'power1.out' }, 0.3)
        .to(s.c, { straight: 1, duration: 1.1, ease: 'power2.inOut' }, 0.45);
      // power3.out from 0.05: the time the lowest point of the blade comes up out of the ground
      const u = 1 - Math.cbrt(Math.max(0, 1 - (s.sink - 0.05) / Math.max(pose.raise - 0.05, 0.01)));
      tl.add(() => pullMoment(tl, s), 0.26 + u * 1.05);
      // once it stands straight beside its panel: one more run of moonlight up the blade
      tl.add(() => { if (current === s.i) s.glintT = 0; }, 1.6);
    }
    tl.to(rig.pos, { x: pose.pos.x, y: pose.pos.y, z: pose.pos.z, duration: dur, ease: 'power3.inOut' }, 0.12)
      .to(rig.look, { x: pose.look.x, y: pose.look.y, z: pose.look.z, duration: dur, ease: 'power3.inOut' }, 0.12)
      .to(rig, { shiftX: pose.shiftX, shiftY: pose.shiftY, duration: dur, ease: 'power3.inOut' }, 0.12)
      .add(() => onOpened?.(i), reducedMotion ? 0.2 : 0.8);
    return run(tl).then(() => { state = 'open'; });
  }

  function close() {
    if (current < 0) return Promise.resolve();
    const s = slots[current];
    state = 'closing';
    onClosing?.(current);
    slots.forEach((o) => { o.fade.target = 1; });
    const dur = reducedMotion ? 0.5 : 1.25;
    const home = homePose(current);
    const tl = gsap.timeline();
    const t0 = reducedMotion ? 0 : 0.15;
    tl.to(rig.pos, { x: home.pos.x, y: home.pos.y, z: home.pos.z, duration: dur, ease: 'power3.inOut' }, t0)
      .to(rig.look, { x: home.look.x, y: home.look.y, z: home.look.z, duration: dur, ease: 'power3.inOut' }, t0)
      .to(rig, { shiftX: 0, shiftY: 0, duration: dur, ease: 'power3.inOut' }, t0)
      .to(s.c, { spin: 0, drag: 0, duration: reducedMotion ? 0.4 : 0.9, ease: 'power2.inOut' }, reducedMotion ? 0 : 0.1);
    if (reducedMotion) {
      tl.to(s.c, { straight: 0, raise: 0, duration: 0.42, ease: 'power2.in' }, 0.05)
        .add(() => audio?.plant(), 0.47);
    } else {
      tl.to(s.c, { straight: 0, duration: 0.8, ease: 'power2.inOut' }, 0.2)
        .to(s.c, { raise: 0, duration: 0.5, ease: 'power4.in' }, 0.75)
        .add(() => { burst(s.root.position, 0.8); plantFx(s); rig.shake = 1; audio?.plant(); }, 1.25);
    }
    return run(tl).then(() => {
      s.c.spin = 0;
      state = 'home';
      if (isPortrait()) { hovered = current; externalHover = true; }
      current = -1;
      parallax.on = 1;
    });
  }

  // Opening shot: the camera settles into the field, lights wake up one by one.
  // Any click, key or scroll hurries it (hurry()).
  function intro() {
    if (isPortrait()) { hovered = 0; externalHover = true; }
    const end = homePose(0);
    const path = new THREE.CatmullRomCurve3([INTRO.pos.clone(), INTRO_VIA, end.pos.clone()], false, 'centripetal');
    const g = { p: 0 };
    const tl = gsap.timeline();
    tl.to(g, {
      p: 1, duration: reducedMotion ? 0.01 : 2.8, ease: 'power2.inOut',
      onUpdate: () => {
        path.getPoint(g.p, rig.pos);
        // the eye comes down off the skyline a little after the camera starts to sink
        rig.look.lerpVectors(INTRO.look, end.look, THREE.MathUtils.smootherstep(g.p, 0.08, 1));
      },
    });
    slots.forEach((s, k) => tl.add(() => { s.glow.target = 1; }, 0.6 + k * 0.12));
    return run(tl).then(() => { state = 'home'; settle(); });
  }

  // Portrait: bring a slot into frame without opening it.
  function focusSlot(i) {
    if (!isPortrait() || state !== 'home' || busy) return;
    moveRig(homePose(i), reducedMotion ? 0.01 : 0.9);
  }

  // The window changed shape (a phone turned): frame whatever is in view again. While a
  // move is under way it waits for the move to end (update() calls it then).
  function relayout() {
    if (busy || !(state === 'home' || state === 'open' || state === 'forge')) { relayoutQueued = true; return; }
    if (state === 'forge' && typeof at === 'string') { const target = at; at = null; request(target); return; }
    if (state === 'home') moveRig(homePose(hovered), 0.6);
    else if (state === 'open' && current >= 0) {
      // e.g. a phone turned while a weapon is open: frame it again for the new shape
      const pose = inspectPose(slots[current]);
      clearLineOfSight(current, pose);
      moveRig(pose, 0.6);
      gsap.to(rig, { shiftX: pose.shiftX, shiftY: pose.shiftY, duration: 0.6, ease: 'power3.inOut', overwrite: 'auto' });
    }
  }

  // ---------- picking ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2(9, 9);

  // A slot counts once its sword has landed and mostly faded in.
  const ready = (i) => !!slots[i]?.planted && slots[i].appear.v > 0.6;
  function pick() {
    if (ndc.x > 2) return -1;
    raycaster.setFromCamera(ndc, camera);
    const h = raycaster.intersectObjects(hits, false).find((x) => ready(x.object.userData.index));
    return h ? h.object.userData.index : -1;
  }

  let dragging = false, lastX = 0, dragVel = 0;
  function pointerMove(x, y) {
    if (!isPortrait()) externalHover = false;
    ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    if (dragging && current >= 0) {
      const dx = x - lastX;
      lastX = x;
      dragVel = dx * 0.008;
      slots[current].c.drag += dragVel;
    }
  }
  function pointerDown(x) { if (state === 'open') { dragging = true; lastX = x; dragVel = 0; } }
  function pointerUp() { dragging = false; }
  function pointerLeave() { ndc.set(9, 9); }

  // A soft key light from beside the camera on whatever is being inspected,
  // so dark blades (black steel, worn iron) read as clearly as bright ones.
  const key = new THREE.SpotLight(0xdfe6ff, 0, 9, 0.38, 1, 1.2);
  key.castShadow = false;
  outdoor.add(key);
  scene.add(key.target);

  // ---------- frame ----------
  const tmp = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const focus = new Spring(0, 20);
  let focusDist = 4;
  function update(t, dt) {
    if (state === 'home' || state === 'intro') {
      const p = pick();
      if (p !== hovered && !externalHover) hovered = p;
    }
    // The smithy loaded after the camera went down on the fallback pose: frame the real one.
    if (repose && !busy && (state === 'forge' || !below)) {
      repose = false;
      if (below && typeof at === 'string') { const target = at; at = null; request(target); }
    }
    if (relayoutQueued && !busy && (state === 'home' || state === 'open' || state === 'forge')) { relayoutQueued = false; relayout(); }
    // A phone's narrow frame cannot hold the smithy's anvil, board and hearth at the field's lens.
    const fov = below && isPortrait() ? (forge?.portraitFov || 30) : 30;
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    // Down in the smithy the field is out of sight: its slots wait until the climb back.
    if (!below) slots.forEach((s) => {
      const isCur = s.i === current;
      s.hover.target = (s.i === hovered && state === 'home') ? 1 : 0;
      s.hover.step(dt);
      s.glow.step(dt);
      s.fade.step(dt);
      applyFade(s);
      const hv = s.hover.v;
      const dimmed = current >= 0 && !isCur ? 0.25 : 1;
      const vis = Math.max(s.fade.v, 0) * s.appear.v;
      s.light.intensity = (0.25 + hv * 0.6 + (isCur ? 0.2 : 0)) * s.glow.v * dimmed * vis;
      s.ring.material.uniforms.uA.value = hv * 0.18 * s.glow.v * vis;

      // glint: one sweep up the blade each time the hover starts (still light
      // under reduced motion); rim: up while the weapon is open
      if (s.hover.target === 1 && !s.hoverWas) s.glintT = 0;
      s.hoverWas = s.hover.target === 1;
      const bu = s.bladeU;
      const flaring = flare.s === s && flare.a > 0;
      if (reducedMotion) bu.uGlint.value.set(0.6, hv * 0.25);
      else if (s.glintT < 1.6) {
        s.glintT += flaring ? dt * warp.v / 0.5 : dt / 0.8;
        bu.uGlint.value.set(s.glintT * 1.35 - 0.2, Math.sin(Math.min(s.glintT, 1) * Math.PI) * vis * (flaring ? 1 + 2.4 * flare.a : 1));
      } else bu.uGlint.value.y = 0;
      bu.uRimA.value = (isCur ? focus.v * 0.32 : 0) + hv * 0.05;
      if (bu.uGlint.value.y > 0 && s.planted) bu.uHolderInv.value.copy(s.weapons[0].holder.matrixWorld).invert();
      // the ground mist parts around each blade, wider while it is raised or hovered
      world.mistHoles?.[s.i]?.set(s.root.position.x, s.root.position.z, vis > 0.05 ? 0.55 + hv * 0.2 + Math.min(s.c.raise, 1) * 0.6 : 0, 0);

      const bob = Math.sin(t * 1.4 + s.i) * 0.035 * s.c.straight;
      s.lift.position.y = hv * 0.06 + s.c.raise + bob;
      const sh = s.c.shake;
      s.lift.rotation.z = sh ? Math.sin(t * 55) * 0.012 * sh : 0;
      s.lift.rotation.x = sh ? Math.cos(t * 47) * 0.008 * sh : 0;

      if (isCur && state === 'open' && !dragging) {
        if (!reducedMotion) s.c.swayT += dt;
        s.c.spin = SWAY * Math.sin(s.c.swayT * SWAY_W);
        s.c.drag += dragVel;
        dragVel *= Math.pow(0.04, dt);
      }
      s.spin.rotation.y = s.c.spin * s.c.straight + s.c.drag;
      s.weapons.forEach((w, k) => {
        const b = s.baseTilts[k], f = 1 - s.c.straight;
        w.holder.rotation.set(b.x * f, b.y * f, b.z * f);
        w.update?.(w.obj, t);
      });
      if (s.root.visible) s.sway.forEach((f) => f(dt * warp.v, t));
    });
    dust.update(dt * warp.v);
    debris.update(dt * warp.v);
    // the flare rides the glint up the blade
    const post = world.post;
    if (post) {
      const fs = flare.s;
      if (fs && flare.a > 0.002 && fs.planted && !below) {
        const w = fs.weapons[0];
        const hN = THREE.MathUtils.clamp(fs.glintT * 1.35 - 0.2, 0.15, 0.95);
        tmp.set(0, hN * w.length - w.sink, 0).applyMatrix4(w.holder.matrixWorld).project(camera);
        post.uFlare.value.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5, flare.a * 0.9);
      } else post.uFlare.value.z = 0;
    }
    strata();
    if (world.crack) { world.crack.amount.value = crackFx.a; world.crack.reach.value = crackFx.r; }
    shock.material.uniforms.uA.value = shockFx.a;
    shock.material.uniforms.uR.value = shockFx.r;
    shock.visible = shockFx.a > 0.001;

    // camera
    const calm = !reducedMotion && (state === 'home' || (state === 'forge' && !forge?.focused));
    parallax.x.target = calm ? ndc.x * (ndc.x > 2 ? 0 : 1) * parallax.on : 0;
    parallax.y.target = calm ? ndc.y * (ndc.x > 2 ? 0 : 1) * parallax.on : 0;
    parallax.x.step(dt); parallax.y.step(dt);
    rig.shake = Math.max(0, rig.shake - dt * 2.8);
    const breathe = reducedMotion ? 0 : 1;
    camera.position.copy(rig.pos);
    camera.position.x += parallax.x.v * 0.45 + Math.sin(t * 0.21) * 0.06 * breathe;
    camera.position.y += parallax.y.v * 0.18 + Math.sin(t * 0.33) * 0.03 * breathe;
    if (rig.shake > 0) camera.position.add(tmp.set(Math.sin(t * 90), Math.cos(t * 77), 0).multiplyScalar(0.03 * rig.shake * rig.shake));
    camera.lookAt(rig.look);
    if (push.v > 0) camera.translateZ(-push.v);
    // Focus pulls onto the open weapon; everything else softens.
    focus.target = current >= 0 && (state === 'open' || state === 'opening') ? 1 : 0;
    focus.step(dt);
    if (current >= 0) {
      const s = slots[current];
      tmp.set(0, s.top * 0.5 + s.c.raise, 0);
      s.root.localToWorld(tmp);
      focusDist = tmp.sub(camera.position).dot(camera.getWorldDirection(fwd));
    }
    world.setFocus(focusDist, world.quality?.dof === false ? 0 : focus.v);
    if (current >= 0) {
      key.position.copy(camera.position).add(tmp.set(-0.9, 0.7, 0).applyQuaternion(camera.quaternion));
      slots[current].root.getWorldPosition(key.target.position);
      key.target.position.y += slots[current].top * 0.5 + slots[current].c.raise;
    }
    key.intensity = focus.v * 5 * (slots[current]?.entry.env ? 1.6 : 1); // stays visible: toggling it would recompile shaders

    const W = window.innerWidth, H = window.innerHeight;
    if (Math.abs(rig.shiftX) + Math.abs(rig.shiftY) > 0.0005) camera.setViewOffset(W, H, rig.shiftX * W, rig.shiftY * H, W, H);
    else if (camera.view && camera.view.enabled) camera.clearViewOffset();
  }

  // Screen position of a slot's label anchor (above the tallest blade).
  function screenPos(i) {
    const s = slots[i];
    tmp.set(0, s.top + 0.25, 0);
    s.root.localToWorld(tmp);
    tmp.project(camera);
    return { x: (tmp.x + 1) / 2 * window.innerWidth, y: (1 - tmp.y) / 2 * window.innerHeight, visible: tmp.z < 1 };
  }

  return {
    count: slots.length,
    // every sword is in the ground
    planted: Promise.all(slots.map((s) => s.ready)),
    // every sword is downloaded and compiling (lands at the next settle)
    arrived: Promise.all(arrivals),
    intro,
    hurry() { if (state === 'intro' && busy) busy.timeScale(4); },
    update,
    request,
    screenPos,
    get state() { return state; },
    get current() { return current; },
    get hovered() { return hovered; },
    get below() { return below; },
    get asked() { return asked; },
    ready,
    isPlanted: (i) => !!slots[i]?.planted,
    get ndc() { return ndc; },
    attachForge(f) {
      forge = f;
      if (below) { f.group.visible = true; repose = true; }
    },
    setHover(i) {
      if (isPortrait()) { if (i < 0) return; focusSlot(i); }
      externalHover = i >= 0;
      hovered = i;
    },
    get portrait() { return isPortrait(); },
    relayout,
    pickAt(x, y) { pointerMove(x, y); return pick(); },
    pointerMove, pointerDown, pointerUp, pointerLeave,
    isBusy: () => !!busy,
  };
}
