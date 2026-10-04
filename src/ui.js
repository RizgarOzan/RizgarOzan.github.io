// DOM side: index bar, hover tag, panel, routing (#/slug) and keyboard.
// The URL hash is the single source of truth for what is open, so the
// browser's back/forward buttons work like everywhere else.
// "Hakkımda" and "Referanslar" are panel-only routes: they open over the scene
// without pulling a sword. "#/demirhane" takes the camera down into the smithy.
import { entries, credits } from './data.js';
import { initPalette, isOpen as paletteOpen } from './palette.js';
import { t, lang, toggleLang } from './i18n.js';

const $ = (s) => document.querySelector(s);
const body = document.body;
const els = {};
let field = null;
let shown = -1;
let audio = null;
let forge = null;
let lastFocus = null;

const sections = entries.filter((e) => e.slug);           // things with a panel
const ABOUT = 'hakkimda';
const PAGES = [ABOUT, 'yazilar'];
const SOURCES = 'referanslar'; // the small drawer in the corner, not a page
const FORGE = 'demirhane';
const inForge = (e) => e?.place === 'forge';
const groupOf = (slug) => sections.filter((e) => inForge(e) === inForge(entries.find((x) => x.slug === slug))).map((e) => e.slug);
const slugAt = (i) => entries[i]?.slug;
const indexOfSlug = (slug) => entries.findIndex((e) => e.slug === slug);
const currentSlug = () => location.hash.replace(/^#\/?/, '');
const pad = (n) => String(n).padStart(2, '0');
// Small caps by hand: every lower-case run becomes a <span class="sc"> (smaller, uppercased
// by the language in force, so Turkish i -> İ and English i -> I). See .sc in styles.css.
function smallCaps(el) {
  if (!el) return;
  const walk = (node) => {
    for (const n of [...node.childNodes]) {
      if (n.nodeType === 1) { if (!n.classList.contains('sc')) walk(n); continue; }
      if (n.nodeType !== 3) continue;
      const parts = n.textContent.split(/(\p{Ll}+)/u);
      if (parts.length < 2) continue;
      const frag = document.createDocumentFragment();
      parts.forEach((p, k) => {
        if (!p) return;
        if (k % 2) { const s = document.createElement('span'); s.className = 'sc'; s.textContent = p; frag.append(s); } else frag.append(p);
      });
      n.replaceWith(frag);
    }
  };
  walk(el);
  el.classList.add('has-sc');
}
// Small caps and the line-by-line entrance, again after a language switch has swapped the text.
function prepText() {
  document.querySelectorAll('.brand-name, .entry h2, .writings b, .credits b').forEach(smallCaps);
  // Panel text comes in line by line: every block, and every row of a list, one step later.
  Object.values(els.articles).forEach((a) => {
    let n = 0;
    for (const c of a.children) {
      const rows = c.matches('.facts, .repos, .writings, .credits') ? [...c.children] : [c];
      rows.forEach((r) => { r.classList.add('ln'); r.style.setProperty('--i', n++); });
    }
  });
}
// The project bar's names and the way down, in the current language.
function labelBar() {
  els.buttons.forEach((b) => { b.querySelector('.l').textContent = t(entries.find((e) => e.slug === b.dataset.slug).label); });
  els.dig.querySelector('.l').textContent = t('Demirhane');
  els.dig.setAttribute('aria-label', t('Demirhane’ye in'));
}
function relang() {
  prepText();
  labelBar();
  syncSound($('[data-sound-toggle]')?.getAttribute('aria-pressed') === 'true');
  $('[data-mode-toggle]').textContent = t(body.classList.contains('is-list') ? 'Sahne' : 'Liste');
  lastHot = ''; // the hover tag redraws its words on the next frame
}
// List mode and the no-WebGL fallback show every entry as one plain page.
const flat = () => body.classList.contains('is-list') || body.classList.contains('no-webgl');
// Small things shown once (or until done once), remembered when storage allows.
const seen = (k) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };
const remember = (k) => { try { localStorage.setItem(k, '1'); } catch { /* private mode: shown again next time */ } };
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
const wide = window.matchMedia('(min-width: 761px)');

function navigate(slug) {
  if (slug) {
    const hash = `#/${slug}`;
    if (location.hash !== hash) location.hash = hash; else route();
  } else if (location.hash) {
    history.pushState(null, '', location.pathname + location.search);
    route();
  }
}

// Kaynaklar lives in a <details> drawer in the corner: its old route just opens it.
function openSources() {
  const d = $('details.sources');
  if (d) { d.open = true; d.querySelector('summary').focus(); }
}

function route() {
  if (currentSlug() === SOURCES) { history.replaceState(null, '', location.pathname + location.search); openSources(); }
  if (flat()) { const a = els.articles[currentSlug()]; if (a) a.scrollIntoView(); else window.scrollTo(0, 0); return; }
  if (!field) return;
  const slug = currentSlug();
  const i = indexOfSlug(slug);
  els.buttons.forEach((b) => b.setAttribute('aria-current', b.dataset.slug === slug ? 'true' : 'false'));
  if (PAGES.includes(slug)) {
    // stay where the camera is, or is heading (a descent under way keeps going down)
    field.request(field.below || typeof field.asked === 'string' ? FORGE : -1);
    showEntry(slug);
    return;
  }
  if (slug === FORGE) { hidePanel(); field.request(FORGE); return; }
  const e = entries[i];
  if (inForge(e)) { field.request(`${FORGE}:${e.station}`); return; }
  if (i < 0 || field.below) hidePanel();
  field.request(i);
  // A sword whose model is still on its way (a deep link, a slow line): its text comes first.
  if (i >= 0 && !field.isPlanted(i)) showEntry(slug);
}

// The field is planting the open sword back. The panel goes with it, unless the
// route has already moved on to a page (Hakkımda, Yazılar, Kaynaklar) shown over the scene.
export function closing() {
  if (!PAGES.includes(currentSlug())) hidePanel();
}

function syncSound(on) {
  const b = $('[data-sound-toggle]');
  if (!b) return;
  b.setAttribute('aria-pressed', String(on));
  b.textContent = t(on ? 'Ses açık' : 'Ses kapalı');
}

// Back out one level: an open forge station returns to the smithy, anything else to the field.
function back() { navigate(field?.below && !PAGES.includes(currentSlug()) && currentSlug() !== FORGE ? FORGE : null); }

function hoverFromUI(i) {
  if (field && field.state === 'home' && !field.portrait) field.setHover(i);
}

// On a phone the first tap brings a weapon into frame, the second opens it.
function choose(i) {
  if (field && field.portrait && field.state === 'home' && field.hovered !== i) field.setHover(i);
  else navigate(slugAt(i));
}

export function init() {
  els.list = $('.index ol');
  els.tag = $('.tag');
  els.tagNum = $('.tag-num');
  els.tagTitle = $('.tag-title');
  els.panel = $('.panel');
  els.index = $('.index');
  els.count = $('.step-count');
  els.loaderBar = $('.loader-bar');
  const cl = $('[data-credits]');
  credits.forEach((c) => {
    const li = document.createElement('li');
    const b = document.createElement('b'); b.textContent = c.name; b.lang = 'en';
    const a = document.createElement('a'); a.href = c.url; a.rel = 'noopener'; a.target = '_blank'; a.textContent = c.author;
    const l = document.createElement('span'); l.textContent = c.license;
    li.append(b, l, a);
    cl?.appendChild(li);
  });
  // the Kaynaklar drawer closes on Esc or a click anywhere else
  const src = $('details.sources');
  document.addEventListener('pointerdown', (e) => { if (src?.open && !src.contains(e.target)) src.open = false; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && src?.open) { src.open = false; src.querySelector('summary').focus(); } });
  els.articles = Object.fromEntries([...document.querySelectorAll('.entry')].map((a) => [a.id, a]));
  prepText();
  els.cue = $('.cue');
  els.keys = $('.keys-hint');
  els.announce = $('[data-announce]');
  // a phone turned (or a window resized) while a panel is open: the bar beside it follows
  wide.addEventListener('change', () => { if (body.classList.contains('is-open')) els.index.inert = !wide.matches; });

  els.buttons = sections.filter((e) => !inForge(e)).map((e) => {
    const i = entries.indexOf(e);
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.slug = e.slug;
    b.style.setProperty('--c', e.accent);
    const n = document.createElement('span'); n.className = 'n'; n.textContent = pad(i + 1);
    const l = document.createElement('span'); l.className = 'l';
    b.append(n, l);
    b.addEventListener('click', () => choose(i));
    b.addEventListener('mouseenter', () => hoverFromUI(i));
    b.addEventListener('focus', () => hoverFromUI(i));
    b.addEventListener('mouseleave', () => hoverFromUI(-1));
    b.addEventListener('blur', () => hoverFromUI(-1));
    li.appendChild(b);
    els.list.appendChild(li);
    return b;
  });
  // The way down, at the end of the bar.
  const dig = document.createElement('li');
  dig.className = 'dig';
  dig.innerHTML = '<button type="button"><span class="l"></span><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>';
  dig.firstChild.addEventListener('click', () => navigate(FORGE));
  els.dig = dig.firstChild;
  labelBar();
  els.list.appendChild(dig);
  if (els.cue) dig.appendChild(els.cue); // the first-visit hint sits right above the way down

  document.querySelectorAll('[data-home]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); navigate(null); if (flat()) window.scrollTo(0, 0); }));
  document.querySelectorAll('[data-back]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); back(); }));
  document.querySelectorAll('[data-about]').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); navigate(ABOUT); }));
  const step = (dir) => {
    const list = groupOf(currentSlug());
    const at = list.indexOf(currentSlug());
    if (at < 0) return; // About / Referanslar are not in a sequence
    navigate(list[(at + dir + list.length) % list.length]);
  };
  document.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => step(Number(b.dataset.step))));
  // Phone: swipe the open panel sideways for the previous / next one.
  let sx = null, sy = 0;
  els.panel.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  els.panel.addEventListener('touchend', (e) => {
    if (sx === null || !body.classList.contains('is-open') || flat()) { sx = null; return; }
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    sx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });


  const toggle = $('[data-mode-toggle]');
  // the loader's "open the list" may have switched before this script was in
  toggle.setAttribute('aria-pressed', String(body.classList.contains('is-list')));
  toggle.addEventListener('click', () => {
    body.classList.remove('pre-intro', 'pre-ui');
    const on = !body.classList.contains('is-list');
    body.classList.toggle('is-list', on);
    toggle.setAttribute('aria-pressed', String(on));
    toggle.textContent = t(on ? 'Sahne' : 'Liste');
    hidePanel();
    window.scrollTo(0, 0);
    if (on) return;
    route();
    // Back to the scene: whatever the hash points at shows its text right away, even if the
    // camera is still on its way (an onOpened that fired during list mode was dropped).
    if (field && els.articles[currentSlug()]) showEntry(currentSlug());
  });

  const sound = $('[data-sound-toggle]');
  let stored = true;
  try { stored = localStorage.getItem('kilic-ses') !== 'off'; } catch { /* storage blocked: sound stays on */ }
  syncSound(stored);
  sound?.addEventListener('click', () => {
    if (!audio) return;
    syncSound(audio.toggle());
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);

  const kbd = $('[data-palette] kbd');
  if (kbd && /Mac|iPhone|iPad/.test(navigator.platform)) kbd.textContent = '⌘K';
  initPalette(paletteItems);
  document.addEventListener('rz:lang', relang);
  toggle.textContent = t(body.classList.contains('is-list') ? 'Sahne' : 'Liste');

  window.addEventListener('keydown', (ev) => {
    if (!field || body.classList.contains('is-list') || paletteOpen() || ev.target.closest?.('input, textarea')) return;
    if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') hideKeys();
    if (ev.key === 'Escape') { back(); return; }
    if (field.below) return;
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft' && ev.key !== 'Enter') return;
    const dir = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    const list = sections.filter((e) => !inForge(e)).map((e) => entries.indexOf(e));
    if (field.current >= 0 || PAGES.includes(currentSlug())) {
      if (!dir) return;
      const at = list.indexOf(indexOfSlug(currentSlug()));
      if (at < 0) return; // About / Referanslar are not in a sequence
      navigate(slugAt(list[(at + dir + list.length) % list.length]));
    } else if (dir) {
      const at = list.indexOf(field.hovered);
      field.setHover(at < 0 ? (dir > 0 ? list[0] : list[list.length - 1]) : list[(at + dir + list.length) % list.length]);
    } else if (field.hovered >= 0 && slugAt(field.hovered) && ev.target === body) {
      navigate(slugAt(field.hovered));
    }
  });
}

// Everything the quick menu offers, built when it opens (labels follow the current state).
function paletteItems() {
  const text = (slug, sel) => els.articles[slug]?.querySelector(sel)?.textContent || '';
  const go = (slug) => () => { navigate(slug); };
  const projects = sections.filter((e) => !inForge(e)).map((e, k) => ({
    label: t(e.label), group: `${t('Proje')} ${pad(k + 1)}`, keys: `${text(e.slug, '.kicker')} ${text(e.slug, '.lead')}`, run: go(e.slug),
  }));
  const list = body.classList.contains('is-list');
  const sound = $('[data-sound-toggle]');
  const soundOn = audio ? audio.enabled : sound?.getAttribute('aria-pressed') === 'true';
  const writing = els.articles.yazilar?.querySelector('.writings a');
  const open = (url) => () => { window.open(url, '_blank', 'noopener'); };
  return [
    ...projects,
    { label: t('Demirhane'), group: t('Demirhane'), keys: 'yer altı örs ocak forge smithy', run: go(flat() ? 'gizli' : FORGE) },
    { label: t('Örsteki iş'), group: t('Demirhane'), keys: `anvil ${text('gizli', '.lead')}`, run: go('gizli') },
    { label: t('Açık kaynak'), group: t('Demirhane'), keys: `katkı pr github open source ${text('acik-kaynak', '.lead')}`, run: go('acik-kaynak') },
    { label: t('Hakkımda'), group: t('Sayfa'), keys: 'rızgar ozan iletişim about contact', run: go(ABOUT) },
    { label: t('CV’yi indir'), group: 'PDF', lang: 'en', keys: 'cv özgeçmiş resume pdf indir download', run: () => { $('[data-cv]')?.click(); } },
    { label: t('Yazılar'), group: t('Sayfa'), keys: 'blog yazı writing posts', run: go('yazilar') },
    ...(writing ? [{ label: writing.querySelector('b').textContent, group: t('Yazı'), keys: 'bm25 rag', run: () => { location.href = writing.href; } }] : []),
    ...(body.classList.contains('no-webgl') ? [] : [{ label: t(list ? 'Sahne görünümü' : 'Liste görünümü'), group: t('Görünüm'), keys: 'liste sahne düz list scene view', run: () => { $('[data-mode-toggle]').click(); } }]),
    ...(audio && !flat() ? [{ label: t(soundOn ? 'Sesi kapat' : 'Sesi aç'), group: t('Ses'), keys: 'ses müzik sound audio', run: () => { sound.click(); } }] : []),
    { label: t('English'), group: t('Dil'), keys: 'dil türkçe ingilizce language english turkish', run: () => { toggleLang(); } },
    { label: t('E-postayı kopyala'), group: 'rizgarozan7@gmail.com', lang: 'en', keys: 'mail eposta iletişim email contact', run: async () => {
      try { await navigator.clipboard.writeText('rizgarozan7@gmail.com'); return t('Kopyalandı'); } catch { location.href = 'mailto:rizgarozan7@gmail.com'; return false; }
    } },
    { label: 'GitHub', group: 'github.com/RizgarOzan', lang: 'en', keys: 'kod code', run: open('https://github.com/RizgarOzan') },
    { label: 'LinkedIn', group: 'linkedin.com/in/rizgarozan', lang: 'en', keys: 'iş work', run: open('https://www.linkedin.com/in/rizgarozan/') },
    { label: t('Kaynaklar'), group: '', keys: 'referans lisans model atıf credits license', small: true, run: openSources },
  ];
}

// First visits: until the visitor has been down once, a quiet pointer to the smithy after the intro.
let cueTimer = 0;
export function introDone() {
  body.classList.remove('pre-intro', 'pre-ui');
  if (seen('rz-descended') || flat() || location.hash || !els.cue) return;
  cueTimer = setTimeout(() => {
    if (field?.state !== 'home' || location.hash || paletteOpen()) return;
    body.classList.add('show-cue');
    cueTimer = setTimeout(hideCue, 5500);
  }, 1200);
}
function hideCue() { clearTimeout(cueTimer); body.classList.remove('show-cue'); }
export function descended() { hideCue(); remember('rz-descended'); }

// The arrow keys work between projects: say so once, the first time a project opens.
let keysTimer = 0;
function showKeys() {
  if (!els.keys || seen('rz-keys') || !finePointer.matches) return;
  remember('rz-keys');
  els.keys.classList.add('is-on');
  keysTimer = setTimeout(hideKeys, 4500);
}
function hideKeys() { clearTimeout(keysTimer); els.keys?.classList.remove('is-on'); }

export function progress(p) {
  els.loaderBar.style.width = `${Math.round(p * 100)}%`;
}

export function attach(f, a) {
  field = f;
  audio = a;
  syncSound(a.enabled);
  route();
}

export function attachForge(fg) { forge = fg; }

// Is the hash pointing into the smithy (so it should start loading now)?
export function wantsForge() {
  const slug = currentSlug();
  return slug === FORGE || inForge(entries.find((e) => e.slug === slug));
}

// No WebGL (or the scene gave up): the page becomes the plain list.
export function fallback() {
  body.classList.remove('is-loading', 'pre-intro', 'pre-ui');
  body.classList.add('no-webgl');
  hidePanel();
}

export function go(i) {
  if (slugAt(i)) navigate(slugAt(i));
}

// Scroll/swipe between the field and the smithy.
export function dig(dir) {
  if (!field || flat() || body.classList.contains('is-open') || paletteOpen()) return;
  if (dir > 0 && field.state === 'home' && !field.below) navigate(FORGE);
  else if (dir < 0 && field.state === 'forge' && currentSlug() === FORGE) navigate(null);
}

export function showEntry(iOrSlug) {
  const slug = typeof iOrSlug === 'number' ? slugAt(iOrSlug) : iOrSlug;
  // A late onOpened must not show an entry the route has already left (or any panel in list mode).
  if (!slug || slug !== currentSlug() || flat()) return;
  const e = entries.find((x) => x.slug === slug);
  shown = entries.indexOf(e);
  Object.entries(els.articles).forEach(([id, a]) => a.classList.toggle('is-active', id === slug));
  body.style.setProperty('--accent', e?.accent || '#cfd8e6');
  const list = groupOf(slug);
  const at = list.indexOf(slug);
  els.count.textContent = at >= 0 && list.length > 1 ? `${pad(at + 1)} / ${pad(list.length)}` : '';
  els.panel.querySelector('.panel-foot').hidden = !(at >= 0 && list.length > 1);
  els.panel.setAttribute('aria-hidden', 'false');
  els.panel.querySelector('.panel-body').scrollTop = 0;
  // desktop keeps the project bar beside the panel (current one marked); a phone's sheet covers it
  els.index.inert = !wide.matches;
  hideCue();
  if (at >= 0 && list.length > 2) showKeys();
  const h = els.articles[slug]?.querySelector('h2');
  if (h) h.tabIndex = -1;
  if (!body.classList.contains('is-open')) {
    body.classList.add('is-open');
    lastFocus = document.activeElement;
    h?.focus({ preventScroll: true });
  } else if (h && (els.panel.contains(document.activeElement) || document.activeElement === body)) {
    // the next entry while the panel stays open (arrow keys, ← →): focus and say its title
    h.focus({ preventScroll: true });
    if (els.announce) els.announce.textContent = h.textContent;
  }
}

export function hidePanel() {
  const was = body.classList.contains('is-open');
  body.classList.remove('is-open');
  if (flat()) els.panel.removeAttribute('aria-hidden'); else els.panel.setAttribute('aria-hidden', 'true');
  els.index.inert = false;
  if (was && els.panel.contains(document.activeElement)) lastFocus?.focus?.({ preventScroll: true });
  lastFocus = null;
}

// Per-frame: hover tag follows the hovered sword (or smithy station, or a blade on
// the rack: name only, nothing to open), index mirrors the hover.
let lastHot = '';
let sounded = false;
export function frame() {
  const below = field.state === 'forge';
  // a slot whose sword has not landed yet gets no label over empty ground
  const h = field.state === 'home' ? (field.ready(field.hovered) ? field.hovered : -1) : below && forge ? forge.hovered : -1;
  const free = below && forge && h < 0 ? forge.rackHovered : -1;
  const key = h >= 0 ? `e${h}` : free >= 0 ? `r${free}` : '';
  if (key !== lastHot) {
    els.buttons.forEach((b) => b.classList.toggle('is-hot', b.dataset.slug === slugAt(h)));
    if (h >= 0) {
      const e = entries[h];
      els.tagNum.textContent = inForge(e) ? t('Demirhane') : pad(h + 1);
      els.tagTitle.textContent = t(e.label);
      els.tagTitle.lang = els.articles[e.slug]?.querySelector('h2')?.lang || lang;
      smallCaps(els.tagTitle);
      els.tag.style.setProperty('--accent', e.accent);
    } else if (free >= 0) {
      els.tagNum.textContent = t('Rafta, sahibini bekliyor');
      els.tagTitle.textContent = forge.rackName(free);
      els.tagTitle.lang = 'en';
      smallCaps(els.tagTitle);
    }
    if (key && sounded) audio?.hover();
    if (key) sounded = true;
    els.tag.classList.toggle('is-on', !!key);
    els.tag.classList.toggle('is-free', free >= 0);
    if (h >= 0 && field.portrait && slugAt(h)) els.buttons.find((b) => b.dataset.slug === slugAt(h))?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    lastHot = key;
  }
  if (key) {
    const p = h >= 0 ? (below ? forge : field).screenPos(h) : forge.rackPos(free);
    els.tag.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px) translate(-50%, -100%)`;
  }
}
