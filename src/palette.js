// Quick menu: Ctrl+K, "/" or the header's "Ara" opens a filterable list of
// everything on the site. Arrow keys move, Enter picks, Esc closes; focus stays
// in the search box while it is open. Typing works with or without Turkish
// letters ("acik" finds "Açık", "I" and "İ" both match).
import { t } from './i18n.js';

const FOLD = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
// Turkish casing by hand (İ -> i, I -> ı): the first toLocaleLowerCase('tr') loads locale data, ~80 ms.
const fold = (s) => s.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase().replace(/[çğıöşüâîû]/g, (ch) => FOLD[ch]);

let root, input, list, items = [], shown = [], at = 0, lastFocus = null, closeTimer = 0;

// items: [{ label, group, keys, run(item) -> true to keep the menu open, small }]
export function initPalette(getItems) {
  root = document.querySelector('.palette');
  input = root.querySelector('input');
  list = root.querySelector('ul');
  root.addEventListener('pointerdown', (e) => { if (e.target === root) close(); });
  input.addEventListener('input', () => { at = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (shown.length) at = (at + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      mark();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pick(shown[at]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      e.preventDefault(); // nothing else to reach while the menu is open
    }
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li) pick(shown[+li.dataset.i]);
  });
  list.addEventListener('pointermove', (e) => {
    const li = e.target.closest('li[data-i]');
    if (li && +li.dataset.i !== at) { at = +li.dataset.i; mark(); }
  });
  window.addEventListener('keydown', (e) => {
    if (isOpen()) return;
    const typing = e.target.closest?.('input, textarea, [contenteditable="true"]');
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey) && !e.altKey) { e.preventDefault(); open(getItems()); }
    else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); open(getItems()); }
  });
  document.querySelectorAll('[data-palette]').forEach((b) => b.addEventListener('click', () => open(getItems())));
}

export const isOpen = () => root?.classList.contains('is-on');

function open(all) {
  clearTimeout(closeTimer);
  items = all.map((it) => ({ ...it, hay: fold(`${it.label} ${it.group || ''} ${it.keys || ''}`), head: fold(it.label) }));
  lastFocus = document.activeElement;
  input.value = '';
  at = 0;
  render();
  root.hidden = false;
  root.getBoundingClientRect(); // start the fade from the hidden state
  root.classList.add('is-on');
  input.focus({ preventScroll: true });
}

function close() {
  if (!isOpen()) return;
  root.classList.remove('is-on');
  closeTimer = setTimeout(() => { root.hidden = true; }, 160);
  if (lastFocus && document.contains(lastFocus) && lastFocus !== document.body) lastFocus.focus({ preventScroll: true });
  else input.blur();
  lastFocus = null;
}

function render() {
  const words = fold(input.value.trim()).split(/\s+/).filter(Boolean);
  shown = items.filter((it) => words.every((w) => it.hay.includes(w)));
  // what starts with the query first, the rest in the menu's own order
  if (words.length) shown = [...shown.filter((it) => it.head.startsWith(words[0])), ...shown.filter((it) => !it.head.startsWith(words[0]))];
  list.replaceChildren(...shown.map((it, i) => {
    const li = document.createElement('li');
    li.id = `pal-${i}`;
    li.dataset.i = i;
    li.setAttribute('role', 'option');
    if (it.small) li.className = 'is-small';
    const l = document.createElement('span'); l.className = 'pal-l'; l.textContent = it.label;
    const g = document.createElement('span'); g.className = 'pal-g'; g.textContent = it.group || '';
    if (it.lang) g.lang = it.lang; // small caps follow the language: github.com, not gİthub.com
    li.append(l, g);
    return li;
  }));
  if (!shown.length) {
    const li = document.createElement('li');
    li.className = 'pal-none';
    li.textContent = t('Bulunamadı');
    list.append(li);
  }
  mark();
}

function mark() {
  [...list.children].forEach((li) => li.setAttribute('aria-selected', String(+li.dataset.i === at)));
  const cur = list.querySelector(`#pal-${at}`);
  if (cur) { input.setAttribute('aria-activedescendant', cur.id); cur.scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
}

async function pick(it) {
  if (!it) return;
  const keep = await it.run(it);
  if (keep) {
    // a short confirmation in place of the label, then close
    const li = list.querySelector(`#pal-${shown.indexOf(it)} .pal-l`);
    if (li && typeof keep === 'string') li.textContent = keep;
    setTimeout(close, 700);
  } else close();
}
