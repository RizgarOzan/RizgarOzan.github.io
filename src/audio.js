// Sound: recorded CC0 effects from assets/audio/ (sources in CREDITS.txt).
// Nothing loads or plays until the first user gesture (browser rule), and
// the user can mute from the header.
const KEY = 'kilic-ses';
const DIR = 'assets/audio/';
// name -> variant count (1 = a single file)
const FILES = { wind: 1, forge: 1, hover: 4, pull: 1, plant: 1, descend: 1, hammer: 4 };
// per-sound level (files are normalised: one-shots ~-18 LUFS, beds quieter)
const GAIN = { hover: 0.16, pull: 0.55, plant: 0.8, descend: 0.6, hammer: 0.32 };
const WIND_UP = 0.5, WIND_DOWN = 0.06, FORGE_DOWN = 0.55;
const WIND_LFO = 0.07; // Hz; world.js times its gusts to this through windPhase

export function createAudio() {
  let ctx = null;
  let master = null;
  let wind = null;
  let windStart = 0;
  let fire = null;
  let below = false;
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== 'off'; } catch { /* storage blocked: sound stays on */ }
  const buffers = {};

  let gestured = false;
  function ensure() {
    if (ctx) return true;
    if (!gestured) return false; // browsers refuse a context before the first gesture
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = enabled ? 1 : 0;
    master.connect(ctx.destination);
    startBeds();
    place(below); // the context may first open while already in the smithy
    if (!enabled) ctx.suspend();
    load();
    return true;
  }

  // The recordings (about 300 KB) are only fetched once main.js says the field is in
  // (preload): on a slow line they must not share the line with the swords.
  let wanted = false, fetched = false;
  function preload() { wanted = true; load(); }

  // Opus in Ogg where the browser takes it, MP3 otherwise (older Safari).
  function load() {
    if (fetched || !wanted || !ctx) return;
    fetched = true;
    const ogg = new Audio().canPlayType('audio/ogg; codecs="opus"') !== '';
    const decode = (buf) => new Promise((ok, fail) => {
      const p = ctx.decodeAudioData(buf, ok, fail); // callback form for old Safari
      if (p?.catch) p.catch(fail);
    });
    const get = (file, ext) => fetch(DIR + file + ext).then((r) => {
      if (!r.ok) throw new Error(`${file}${ext}: ${r.status}`);
      return r.arrayBuffer();
    }).then(decode);
    for (const [name, n] of Object.entries(FILES)) {
      buffers[name] = [];
      for (let i = 1; i <= n; i++) {
        const file = n > 1 ? name + i : name;
        (ogg ? get(file, '.ogg').catch(() => get(file, '.mp3')) : get(file, '.mp3'))
          .then((b) => {
            buffers[name].push(b);
            if (name === 'wind') loopInto(b, wind);
            if (name === 'forge') loopInto(b, fire);
          })
          .catch((e) => console.warn('audio:', e.message));
      }
    }
  }

  // Bed gains exist from the start so place() can crossfade before the files arrive.
  function startBeds() {
    wind = ctx.createGain();
    wind.gain.value = 0;
    // slow swell on the wind, the same 0.07 Hz the scene's gusts follow
    const swell = ctx.createGain();
    swell.gain.value = 0.75;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = WIND_LFO;
    const depth = ctx.createGain();
    depth.gain.value = 0.25;
    lfo.connect(depth).connect(swell.gain);
    wind.connect(swell).connect(master);
    lfo.start();
    windStart = ctx.currentTime;
    fire = ctx.createGain();
    fire.gain.value = 0;
    fire.connect(master);
  }

  function loopInto(buffer, dest) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(dest);
    src.start(ctx.currentTime, Math.random() * buffer.duration);
  }

  // One recorded sound, a random variant, slightly detuned (±4 %) so repeats differ.
  function play(name, { gain = GAIN[name], rate = 1, delay = 0 } = {}) {
    const list = buffers[name];
    if (!list?.length) return; // still loading: skip rather than play late
    const src = ctx.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
    const g = ctx.createGain();
    g.gain.value = gain * (0.9 + Math.random() * 0.2);
    src.connect(g).connect(master);
    src.start(ctx.currentTime + delay);
  }

  // Crossfade the field's wind and the smithy's fire.
  function place(isBelow) {
    below = isBelow;
    if (!ctx) return;
    const t = ctx.currentTime;
    wind?.gain.setTargetAtTime(isBelow ? WIND_DOWN : WIND_UP, t, 0.6);
    fire?.gain.setTargetAtTime(isBelow ? FORGE_DOWN : 0, t, 0.6);
  }

  // Earth and stone grinding past while the camera sinks (or climbs).
  function descend(down) {
    if (!enabled || !ensure()) return;
    play('descend', { rate: down ? 0.92 : 1.06 });
  }

  // Hammer on hot steel at the anvil.
  function hammer() {
    if (!ctx || !below || !enabled) return;
    play('hammer');
  }

  // A faint blade ring when the cursor finds a sword.
  function hover() {
    if (!enabled || !ensure()) return;
    play('hover');
  }

  // Pull: gravel scrape, then steel sliding free.
  function pull() {
    if (!enabled || !ensure()) return;
    play('pull');
  }

  // Plant: a heavy thud into earth with a little grit.
  function plant() {
    if (!enabled || !ensure()) return;
    play('plant');
  }

  function toggle() {
    enabled = !enabled;
    try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* storage blocked */ }
    if (ensure()) {
      // muted: fade out, then suspend the context so it costs nothing
      if (enabled) ctx.resume();
      master.gain.setTargetAtTime(enabled ? 1 : 0, ctx.currentTime, 0.05);
      if (!enabled) setTimeout(() => { if (!enabled) ctx.suspend(); }, 300);
    }
    return enabled;
  }

  // Browsers suspend contexts created before a gesture; resume on the first one.
  const wake = () => { gestured = true; if (ensure() && enabled && ctx.state === 'suspended') ctx.resume(); };
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, wake, { once: true, passive: true }));
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else if (enabled) ctx.resume();
  });

  return { hover, pull, plant, toggle, place, descend, hammer, preload, get enabled() { return enabled; }, get wind() { return wind; },
    // turns of the wind swell so far (it starts at phase 0), or null before the sound starts
    get windPhase() { return wind ? (ctx.currentTime - windStart) * WIND_LFO : null; } };
}
