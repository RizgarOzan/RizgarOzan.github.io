// Hanging parts (chains, charms, cloth tails) swing like damped pendulums.
// Import scripts split them into nodes named <id>_chain / _wrap / _charm with
// the origin at the attachment point; this finds them and drives them from the
// attachment point's real acceleration, plus a little wind.
import * as THREE from 'three';

const KINDS = {
  chain: { k: 26, c: 2.4, gain: 0.05, wind: 0.6, f: 1.3, max: 0.9 },
  charm: { k: 30, c: 2.8, gain: 0.05, wind: 0.5, f: 1.5, max: 0.8 },
  wrap: { k: 10, c: 2.6, gain: 0.035, wind: 1.1, f: 0.6, max: 0.5 },
};
const MAX_ACC = 40;
const STEP = 1 / 120;

function makeSway(node, kind) {
  const P = KINDS[kind];
  // Chains modelled lying flat stick out sideways once the sword stands: turn
  // them so they hang down, a little outward so they clear the grip.
  if (kind !== 'wrap') {
    const box = new THREE.Box3();
    node.traverse((o) => { o.updateMatrix(); if (o.geometry) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(o === node ? new THREE.Matrix4() : o.matrix)); } });
    const d = box.getCenter(new THREE.Vector3()).applyQuaternion(node.quaternion);
    if (d.lengthSq() > 1e-6 && d.y > -0.3 * d.length()) { // only chains lying near-flat
      const want = new THREE.Vector3(Math.sign(d.x || 1) * 0.3, -1, Math.sign(d.z) * 0.15).normalize();
      node.quaternion.premultiply(new THREE.Quaternion().setFromUnitVectors(d.normalize(), want));
    }
  }
  const rest = node.quaternion.clone();
  const ang = new THREE.Vector2(), vel = new THREE.Vector2();
  const cur = new THREE.Vector3(), prev = new THREE.Vector3(), pv = new THREE.Vector3(), v = new THREE.Vector3(), a = new THREE.Vector3();
  const inv = new THREE.Quaternion(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const seed = Math.random() * 100;
  let primed = 0;

  return function step(dt, t) {
    if (dt <= 0 || !node.parent) return;
    node.getWorldPosition(cur);
    if (primed < 2) { if (primed === 1) pv.subVectors(cur, prev).divideScalar(dt); prev.copy(cur); primed++; return; }
    v.subVectors(cur, prev).divideScalar(dt);
    a.subVectors(v, pv).divideScalar(dt).clampLength(0, MAX_ACC);
    prev.copy(cur);
    pv.copy(v);
    // Acceleration in the parent's frame: the hanging part lags behind it.
    node.parent.getWorldQuaternion(inv).invert();
    a.applyQuaternion(inv);
    const wx = Math.sin(t * P.f + seed) * 0.6 + Math.sin(t * P.f * 2.3 + seed * 1.7) * 0.4;
    const wz = Math.sin(t * P.f * 0.8 + seed * 0.5) * 0.6 + Math.sin(t * P.f * 1.9 + seed) * 0.4;
    const fx = a.z * P.gain + wx * P.wind;
    const fz = -a.x * P.gain + wz * P.wind;
    for (let left = Math.min(dt, 0.25); left > 0; left -= STEP) {
      const h = Math.min(STEP, left);
      vel.x += (-P.k * ang.x - P.c * vel.x + fx) * h;
      vel.y += (-P.k * ang.y - P.c * vel.y + fz) * h;
      ang.x = THREE.MathUtils.clamp(ang.x + vel.x * h, -P.max, P.max);
      ang.y = THREE.MathUtils.clamp(ang.y + vel.y * h, -P.max, P.max);
    }
    node.quaternion.copy(rest).multiply(q.setFromEuler(e.set(ang.x, 0, ang.y)));
  };
}

// Every swinging node under root, as an array of step(dt, t) functions.
export function collectSway(root) {
  const out = [];
  root.traverse((o) => {
    const m = /_(chain|wrap|charm)(?:\.\d+|_\d+)?$/.exec(o.name || '');
    if (m) out.push(makeSway(o, m[1]));
  });
  return out;
}
