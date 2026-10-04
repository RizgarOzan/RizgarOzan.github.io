import { gsap } from 'gsap';
import { createWorld } from './scene/world.js';
import { createField } from './scene/field.js';
import { warm, warmPasses, settle } from './scene/warm.js';
import * as ui from './ui.js';
import { createAudio } from './audio.js';
import { localNow, daylight } from './clock.js';
import { linkSpeed } from './scene/loader.js';

const body = document.body;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function hasWebGL() {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
}

// index.html's watchdog turned the page into the list while the scripts were still on
// their way (a slow or failing CDN): stay with the list, now with working links.
const late = body.classList.contains('no-webgl');
window.__rzStarted = true;
ui.init();

if (late || !hasWebGL()) {
  ui.fallback();
} else {
  start().catch((err) => {
    console.error(err);
    ui.fallback();
  });
}

async function start() {
  const canvas = document.getElementById('scene');
  const world = createWorld(canvas);
  // The sky keeps Istanbul time; ?hour=14.5 pins it for testing.
  const pinned = parseFloat(new URLSearchParams(location.search).get('hour'));
  const skyTick = () => world.setDaylight(daylight(Number.isFinite(pinned) ? pinned : localNow().hour));
  skyTick();
  setInterval(skyTick, 30000);
  const audio = createAudio();
  // The swords stream in on their own (front one first) and fade in as they land;
  // the first frame waits only for the ground's maps and the shaders.
  const field = createField(world, {
    reducedMotion,
    audio,
    onOpened: ui.showEntry,
    onClosing: ui.closing,
  });
  // The smithy loads after the field is up, so the first frame is not held back by it.
  let forge = null;
  if (new URLSearchParams(location.search).has('debug')) window.__site = { field, world, gsap, get forge() { return forge; } };

  // A tap or click opens; a drag (while a weapon is open) turns it.
  let down = null;
  canvas.addEventListener('pointermove', (e) => field.pointerMove(e.clientX, e.clientY));
  canvas.addEventListener('pointerleave', () => field.pointerLeave());
  // Any input hurries the opening camera move.
  const hurry = () => field.hurry();
  window.addEventListener('keydown', hurry);
  canvas.addEventListener('pointerdown', (e) => {
    hurry();
    down = { x: e.clientX, y: e.clientY };
    field.pointerDown(e.clientX);
  });
  // A cancelled pointer (the browser took the gesture) only ends the drag; it never clicks.
  window.addEventListener('pointercancel', () => { field.pointerUp(); down = null; });
  window.addEventListener('pointerup', (e) => {
    field.pointerUp();
    if (!down || e.target !== canvas) { down = null; return; }
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > 6) return;
    if (field.state === 'forge' && forge) {
      field.pointerMove(e.clientX, e.clientY);
      const i = forge.pick(field.ndc);
      if (i >= 0) ui.go(i);
      return;
    }
    if (field.state !== 'home') return;
    const i = field.pickAt(e.clientX, e.clientY);
    if (i >= 0) ui.go(i);
  });
  // Scroll or swipe down into the smithy, back up to the field.
  let wheelLock = 0;
  window.addEventListener('wheel', (e) => {
    hurry();
    if (e.target.closest?.('.panel') || Math.abs(e.deltaY) < 12 || performance.now() < wheelLock) return;
    wheelLock = performance.now() + 900;
    if (e.deltaY > 0) loadForge();
    ui.dig(Math.sign(e.deltaY));
  }, { passive: true });
  let touchY = null;
  canvas.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (touchY === null) return;
    const dy = touchY - e.changedTouches[0].clientY;
    touchY = null;
    if (dy > 70) loadForge();
    if (Math.abs(dy) > 70) ui.dig(Math.sign(dy));
  }, { passive: true });
  window.addEventListener('resize', () => { world.resize(); field.relayout(); });
  const lite = navigator.connection?.saveData === true
    || (window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820);

  // The smithy waits until the intro is done and the page has been idle a moment,
  // unless the visitor heads down first (scroll, swipe or a link into it).
  let forgeStarted = false;
  function loadForge() {
    if (forgeStarted) return;
    forgeStarted = true;
    // createForge warms everything before it puts the smithy in the scene.
    // (its code too: fetched only now, so the first view's scripts are that much less)
    import('./scene/forge.js').then(({ createForge }) => createForge(world, { audio, reducedMotion })).then((f) => {
      forge = f;
      field.attachForge(f);
      ui.attachForge(f);
    }).catch((err) => console.error('forge failed to load', err));
  }
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1));
  window.addEventListener('hashchange', () => { if (ui.wantsForge()) loadForge(); });
  if (ui.wantsForge()) loadForge();

  // Honest progress: the ground's maps, then the shaders (built off the main thread).
  let got = 0;
  const step = () => ui.progress(0.25 + 0.45 * (++got / world.groundLoads.length));
  ui.progress(0.25);
  await Promise.all(world.groundLoads.map((p) => p.then(step)));
  const first = Promise.all([
    warm(world, world.scene, { shadows: ['depth'], must: true }),
    warmPasses(world, { skip: [world.depthPass] }),
  ]);
  // Whatever of the field is already in makes the first frame. The rest lands
  // in batches (warm.js: each landing costs one short pause), while the
  // opening shot holds still: the camera only starts its move once the swords
  // on their way are in, or after a few seconds on a slow line.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const arrived = Promise.all([field.arrived, world.ruinsArrived]);
  let allIn = false;
  arrived.then(() => { allIn = true; });
  // The ruins are most of the opening shot: worth a moment's wait so they do not pop
  // in behind the name (later than that they rise out of the fog instead).
  await Promise.race([Promise.all([world.ruinsArrived, Promise.race([field.arrived, sleep(250)])]), sleep(1600)]);
  await settle(world, { soon: true });
  await first;
  ui.progress(1);
  world.shown = true;
  body.classList.remove('is-loading');
  ui.attach(field, audio);
  // The name and line fade in with the opening glide (or soon, if the swords are slow
  // to arrive); the menus follow once the camera is nearly down.
  const reveal = () => body.classList.remove('pre-intro');
  setTimeout(reveal, 1500);
  setTimeout(() => body.classList.remove('pre-ui'), 7000); // never left hidden if the intro is held up
  // Once the field and its ruins are all in: the sharp ground maps, then the smithy.
  const settled = Promise.all([field.planted, world.ruins]);
  // the depth-of-field pass is first needed when a sword opens: it lands with the next batch
  warm(world, world.scene, { depthPass: world.depthPass });
  Promise.race([arrived, sleep(2500)])
    .then(() => settle(world))
    .then(() => {
      reveal();
      // the menus (and with them hover labels) only once the swords stand in the field
      Promise.all([field.planted, sleep(reducedMotion ? 0 : 1700)]).then(() => body.classList.remove('pre-ui'));
      return field.intro();
    })
    .then(() => ui.introDone())
    .then(async () => {
      while (!allIn) {
        await Promise.race([arrived, sleep(3000)]);
        await settle(world);
      }
    })
    .then(() => settled)
    .then(() => new Promise((r) => idle(r, { timeout: 1500 })))
    // Sharper ground (1.4 MB) once the field is in. On a fast line (over 1 MB/s) the rest
    // follows: the 2k ground (not on phones or Save-Data), every sword's sharp copy, and the
    // smithy ahead of time. On a slow line those wait until they are asked for: a sword's
    // sharp copy when it is opened, the smithy when the visitor heads down.
    .then(() => world.upgradeGround('1k'))
    .then(async () => {
      if (linkSpeed() < 1e6) return;
      if (!lite) await world.upgradeGround('2k');
      await field.sharpenAll();
      setTimeout(() => idle(loadForge, { timeout: 2000 }), 1000);
    })
    .catch((err) => console.error('startup', err));

  // GSAP advances inside our frame loop, so every tween step lands on a rendered frame.
  gsap.ticker.remove(gsap.updateRoot);
  let last = performance.now();
  let t = 0;
  let clock = gsap.ticker.time;
  let wasBelow = false;

  // Adaptive quality: watch the frame time and trade resolution for smoothness.
  // Shadows refresh every other frame; nothing that casts them moves fast.
  const renderer = world.renderer;
  world.quality = { dof: true, fx: true };
  world.windPhase = () => audio.windPhase;
  renderer.shadowMap.autoUpdate = false;
  const maxPR = Math.min(window.devicePixelRatio, 1.75);
  let pr = maxPR, frames = 0, spent = 0, settleUntil = performance.now() + 4000;
  function adapt(ms) {
    if (performance.now() < settleUntil) return;
    spent += ms; frames++;
    if (frames < 60) return;
    const avg = spent / frames;
    frames = 0; spent = 0;
    // First give up the light shafts and wind, then depth of field, then
    // resolution; win them back in reverse.
    const q = world.quality;
    if (avg > 24 && q.fx) { q.fx = false; settleUntil = performance.now() + 1500; return; }
    if (avg > 24 && q.dof) { q.dof = false; settleUntil = performance.now() + 1500; return; }
    if (avg < 13 && pr === maxPR && !q.dof) { q.dof = true; settleUntil = performance.now() + 1500; return; }
    if (avg < 13 && pr === maxPR && !q.fx) { q.fx = true; settleUntil = performance.now() + 1500; return; }
    const next = avg > 24 ? Math.max(0.75, pr - 0.25) : avg < 13 ? Math.min(maxPR, pr + 0.25) : pr;
    if (next === pr) return;
    pr = next;
    renderer.setPixelRatio(pr);
    world.composer.setPixelRatio?.(pr);
    world.resize();
    settleUntil = performance.now() + 1500;
  }
  let tick = 0;
  // If the GPU drops the context (driver reset, too many tabs) the page falls back
  // to the plain list instead of freezing; a restored context reloads the scene.
  // A frame that throws is skipped; only a run of failures gives up on the scene.
  let lost = false, failures = 0;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; ui.fallback(); });
  canvas.addEventListener('webglcontextrestored', () => location.reload());

  function frame(now) {
    // Scheduled first, so a throwing tween callback or frame can never stop the loop.
    requestAnimationFrame(frame);
    // rAF timestamps can trail performance.now(), so never step backwards.
    const elapsed = Math.max(0, (now - last) / 1000);
    const dt = Math.min(elapsed, 0.25);
    last = Math.max(now, last);
    clock += elapsed;
    try {
      gsap.updateRoot(clock);
      if (lost || document.hidden || body.classList.contains('is-list')) return;
      t += dt;
      world.update(t);
      field.update(t, dt);
      forge?.update(t, dt, { active: field.below || field.state === 'moving', ndc: field.ndc });
      if (field.below !== wasBelow) { wasBelow = field.below; audio.place(wasBelow); body.classList.toggle('is-below', wasBelow); if (wasBelow) ui.descended(); }
      // down in the smithy before it has arrived: a quiet loading line
      const waiting = field.below && !forge;
      if (waiting !== body.classList.contains('forge-wait')) body.classList.toggle('forge-wait', waiting);
      ui.frame();
      canvas.style.cursor = field.state === 'open' ? 'grab' : (field.state === 'home' && field.hovered >= 0) || (field.state === 'forge' && forge?.hovered >= 0) ? 'pointer' : '';
      const hold = world.shadowHold > 0;
      if (hold) world.shadowHold--;
      renderer.shadowMap.needsUpdate = (tick++ & 1) === 0 && !hold;
      if (!world.paused) world.render(); // warm.js pauses drawing for a frame or two while it uploads
      if (elapsed < 0.2) adapt(elapsed * 1000); // a tab switch is not a slow frame
      failures = 0;
    } catch (err) {
      if (failures++ === 0) console.error(err);
      if (failures > 90) { lost = true; ui.fallback(); }
    }
  }
  requestAnimationFrame(frame);
}
