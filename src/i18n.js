// Language. Turkish lives in index.html (crawlable, works without scripts); English is applied here.
// [data-i18n="key"] swaps an element's inner HTML, [data-i18n-attr="attr:key,attr:key"] its attributes.
// The choice is remembered (localStorage) and linkable (?lang=en). Strings built in JS go through t(),
// keyed by their Turkish text. Other modules hear about a switch through the 'rz:lang' event on document.
const STORE = 'rz-lang';
const GH = '<span lang="en">GitHub</span>';

const EN = {
  brand: 'I build games, tools and AI systems.',
  'nav.forge': 'Forge',
  'nav.about': 'About',
  'nav.search': 'Search',
  up: '↑ Field',
  keys: 'Arrow keys work too',
  sources: 'credits',
  'cue.m': 'Below: the forge',
  'cue.d': 'Scroll down',
  'pal.foot': '<span><kbd>↑</kbd><kbd>↓</kbd> select</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span>',
  cv: 'Download CV <small>PDF</small>',
  'cv.href': 'assets/cv/Rizgar_Ozan_CV.pdf',
  'a.sections': 'Sections',
  'a.close': 'Close',
  'a.prev': 'Previous',
  'a.next': 'Next',
  'a.contact': 'Contact',
  'a.email': 'Email: rizgarozan7@gmail.com',
  'a.palette': 'Quick menu',
  'a.query': 'What are you looking for?',
  'a.search': 'Search',
  'a.results': 'Results',
  'a.loading': 'Loading',

  'rag.kicker': '<span>01</span> AI',
  'rag.lead': 'An experiment where I measure which parts of a search system actually help with Turkish questions.',
  'rag.actions': `<a class="btn primary" href="https://github.com/RizgarOzan/turkish-rag-eval">Code on ${GH}</a>
        <a class="btn" href="yazilar/turkce-bm25.html">Read the post <small>(Turkish)</small></a>
        <a class="btn" href="https://huggingface.co/datasets/RizgarOzan/turkish-rag-eval">Dataset</a>`,
  'rag.p1': 'RAG means a language model first finds and reads the relevant passages in a set of documents, then answers. I compared 12 search setups on a Turkish test set of 58 questions that I labelled by hand. Every result can be reproduced with one command.',
  'rag.facts': `<div><dt>Key result</dt><dd>Using the first 5 letters of each word as its stem raises search quality (nDCG) by 23–29% on its own. No heavy morphology tool needed.</dd></div>
        <div><dt>What I tried</dt><dd>Keyword search (BM25), search by meaning (dense embeddings), a mix of the two (hybrid RRF) and 3 ways of splitting the text</dd></div>
        <div><dt>What I measured</dt><dd>nDCG@10 · Recall@5 · MRR · P95 latency · Python</dd></div>`,

  'm3.kicker': '<span>02</span> Game tool',
  'm3.lead': 'A toolkit that makes match-3 levels easier to design and their difficulty easy to measure.',
  'm3.actions': `<a class="btn primary" href="https://rizgarozan.github.io/match3-lab/">Play in the browser</a>
        <a class="btn" href="https://github.com/RizgarOzan/match3-lab">Code on ${GH}</a>`,
  'm3.p1': 'I wrote the game rules in plain C#, apart from Unity, so the same rules run in the game, in the tests and in the bots. Levels live in a simple format you can write by hand. Bots play every level thousands of times and turn its difficulty into a number.',
  'm3.facts': `<div><dt>Measured</dt><dd>6 levels, 1000 bot games each. The win rates of a greedy and a random bot draw the difficulty curve.</dd></div>
        <div><dt>Tools</dt><dd>Command line (validate · sim · curve · tune) · Unity level editor · simulator window</dd></div>
        <div><dt>Built with</dt><dd>C# / .NET · Unity 6 · xUnit · WebGL</dd></div>`,

  'tmp.kicker': '<span>03</span> <span lang="en">Unity</span> tool',
  'tmp.lead': 'A Unity package that finds the letters your fonts cannot draw, before the game ships.',
  'tmp.actions': `<a class="btn primary" href="https://github.com/RizgarOzan/tmp-glyph-audit">Code on ${GH}</a>`,
  'tmp.p1': 'Unity draws text with TextMeshPro, and a letter the font lacks (like ğ or ş) shows up in the game as an empty box. The package scans every scene, every prefab and the text files loaded at runtime, follows each font’s fallback chain, and reports the missing letters.',
  'tmp.facts': `<div><dt>How to use</dt><dd>From a window in the editor, or as a command in automated builds (CI). It reports the result with exit code 0, 1 or 2.</dd></div>
        <div><dt>Tests</dt><dd>24 xUnit and 5 EditMode tests</dd></div>
        <div><dt>Built with</dt><dd>C# · TextMeshPro · Unity 2023.2+ · open source, installed from a git URL (UPM)</dd></div>`,

  'bd.kicker': '<span>04</span> Game',
  'bd.lead': 'A short educational adventure, seen through the eyes of a detective looking into a mysterious death.',
  'bd.actions': '<a class="btn primary" href="https://rizgarozan.itch.io/bilim-dedektifi">Download on <span lang="en">itch.io</span></a>',
  'bd.p1': 'We made it as a team for a course at Hacettepe. The game is free on itch.io.',
  'bd.facts': `<div><dt>Status</dt><dd>Released · free · Windows download</dd></div>
        <div><dt>Genre</dt><dd>Educational detective and mystery game</dd></div>
        <div><dt>Team</dt><dd>Hacettepe course project, made as a team</dd></div>`,

  'ce.kicker': '<span>05</span> Web',
  'ce.lead': 'A math study platform that shapes itself around each student.',
  'ce.actions': `<a class="btn primary" href="https://github.com/ilkhanarda/Code-Enigma">Code on ${GH}</a>`,
  'ce.p1': 'I am building it with <span lang="tr">İlkhan Arda Akmaca</span>. I work on the interface: the personal dashboard, the charts where students compare themselves with their peers, the filters and the settings screens.',
  'ce.facts': `<div><dt>Sections</dt><dd>Personal dashboard · Assessment tests · Video lessons</dd></div>
        <div><dt>Built with</dt><dd>React 19 · Vite · Tailwind CSS 4 · GSAP</dd></div>`,

  'anvil.kicker': 'Forge · On the anvil',
  'anvil.h2': 'On the anvil',
  'anvil.lead': 'A game I am working on right now and have not announced yet.',
  'anvil.p1': 'The glowing blade on the anvil is that game. The hammer keeps my hours: it swings while I am at it and rests on the anvil while I am in class or asleep.',
  'anvil.p2': 'When I announce the game, its name and what it is will go here.',

  'oss.kicker': 'Forge · Open source',
  'oss.h2': 'Open source contributions',
  'oss.lead': 'Fixes for bugs I found in open source projects I use, sent back to their maintainers.',
  'oss.actions': `<a class="btn primary" href="https://github.com/RizgarOzan">See them on ${GH}</a>`,
  'oss.p1': 'Most are in libraries that evaluate AI search systems, and in Unity tools. The numbers below count the changes (PRs) the maintainers accepted and merged.',
  // measured with gh on 2026-10-04 10:24 (Istanbul), same as index.html and the CVs
  'oss.stats': '<span><b>71</b> merged PRs</span><span><b>22</b> projects</span><span><b>32</b> awaiting review</span>',
  'oss.repos': `<li><b>MTEB</b><span>15 PR</span><em>The retrieval benchmark library my RAG work builds on</em></li>
        <li><b>kornia</b><span>13 PR</span><em>Computer vision library; edge cases in numerical code</em></li>
        <li><b>LightRAG</b><span>4 PR</span><em>RAG framework; text parsing and Markdown fixes</em></li>
        <li><b>unity-mcp</b><span>5 PR</span><em>The bridge between the Unity editor and AI assistants</em></li>
        <li><b>docling</b><span>4 PR</span><em>Document reader; fixes to OCR model downloads and old file formats (AFP, EBCDIC)</em></li>`,

  'about.kicker': 'About',
  'about.lead': 'Game mechanics, data models, interfaces: I am a developer who likes working out how the parts fit together.',
  'about.p1': 'I live in Ankara, study at Hacettepe University and make games on the side. I have made a habit of measuring before I say something works.',
  'about.facts': `<div><dt>Experience</dt><dd>Software engineering intern at Barko Elektronik, July to August 2026. In a team of two we set up an LLM stack that runs on the company’s own hardware and wrote data services with FastAPI and Docker. I connected the company portal to Active Directory.</dd></div>
        <div><dt>Education</dt><dd>Hacettepe University, Computer Education and Instructional Technology. I graduate in June 2027.</dd></div>
        <div><dt>Focus</dt><dd>Turkish search and RAG (Python) · Game development (Unity, C#)</dd></div>
        <div><dt>Tools</dt><dd>Unity · C# · Python · React · JavaScript · Tailwind CSS · Git</dd></div>
        <div><dt>Interests</dt><dd>Game design · Interfaces</dd></div>
        <div><dt>Writing</dt><dd><a href="#/yazilar">The model that beat BM25 in Turkish</a></dd></div>
        <div><dt>Contact</dt><dd><a href="mailto:rizgarozan7@gmail.com">rizgarozan7@gmail.com</a> · <a href="https://github.com/RizgarOzan">GitHub</a> · <a href="https://www.linkedin.com/in/rizgarozan/">LinkedIn</a></dd></div>`,

  'writing.kicker': 'Writing',
  'writing.h2': 'Things I measured and wrote up',
  'writing.lead': 'When I want to explain something I measured in a project at length, it goes here.',
  'writing.writings': '<li><a href="yazilar/turkce-bm25.html"><time datetime="2026-09-19">19 September 2026</time><b>The model that beat BM25 in Turkish</b><span>With my 58-question test set I checked whether an AI model can beat classic keyword matching (BM25) in Turkish search. The small multilingual model could not; the model trained for search did. The post is in Turkish.</span></a></li>',

  'credits.h2': 'Credits',
  'credits.fine': 'The models are fan works shared on Sketchfab, used under their authors’ Creative Commons licenses. The weapon designs and names belong to their games and publishers; this site is not commercial. Textures come from Poly Haven (CC0). Sound sources are <a href="assets/audio/CREDITS.txt">listed separately</a>. The fonts are Cormorant Garamond and EB Garamond (OFL); the scene runs on three.js and GSAP.',
};

// Strings built in JS, by their Turkish text.
const UI = {
  'Ses açık': 'Sound on', 'Ses kapalı': 'Sound off', Liste: 'List', Sahne: 'Scene',
  Demirhane: 'Forge', 'Demirhane’ye in': 'Go down to the forge', 'Rafta, sahibini bekliyor': 'On the rack, waiting for a project',
  'Şu an örste': 'On the anvil now', 'Açık kaynak': 'Open source', 'Örsteki iş': 'On the anvil',
  Proje: 'Project', Hakkımda: 'About', Sayfa: 'Page', Yazılar: 'Writing', Yazı: 'Post',
  'Sahne görünümü': 'Scene view', 'Liste görünümü': 'List view', Görünüm: 'View',
  'Sesi kapat': 'Mute', 'Sesi aç': 'Turn sound on', Ses: 'Sound',
  'E-postayı kopyala': 'Copy email', Kopyalandı: 'Copied', Kaynaklar: 'Credits', Bulunamadı: 'Nothing found',
  'CV’yi indir': 'Download CV', English: 'Türkçe', Dil: 'Language',
};

const META = {
  tr: {
    description: 'Rızgar Ozan oyunlar, Unity araçları ve Türkçe yapay zekâ arama sistemleri geliştiriyor. Ankara.',
    og: 'Ölçüm sistemleri kuruyorum: Türkçe retrieval değerlendirmeleri ve oyun araçları. Ankara.',
    alt: 'Ay ışığında toprağa saplanmış kılıçlar ve arkada yıkık bir krallık',
    locale: ['tr_TR', 'en_US'], toggle: 'Switch to English',
  },
  en: {
    description: 'Rızgar Ozan builds games, Unity tools and AI search systems for Turkish. Ankara.',
    og: 'I build measurement systems: Turkish retrieval evaluations and game tools. Ankara.',
    alt: 'Swords stuck in the ground under the moon, with a ruined kingdom behind them',
    locale: ['en_US', 'tr_TR'], toggle: 'Türkçeye geç',
  },
};

export let lang = 'tr';
export const t = (s) => (lang === 'en' && UI[s]) || s;

// The Turkish originals, taken before anything else touches the page (ui.js adds small caps afterwards).
const html = new Map();
const attrs = new Map();
const nodes = [...document.querySelectorAll('[data-i18n]')];
nodes.forEach((el) => html.set(el, el.innerHTML));
const attrNodes = [...document.querySelectorAll('[data-i18n-attr]')].map((el) => {
  const pairs = el.dataset.i18nAttr.split(',').map((p) => p.split(':'));
  attrs.set(el, Object.fromEntries(pairs.map(([a]) => [a, el.getAttribute(a)])));
  return [el, pairs];
});

function apply(next) {
  const en = next === 'en';
  nodes.forEach((el) => {
    const v = en ? EN[el.dataset.i18n] : html.get(el);
    if (v != null && el.innerHTML !== v) el.innerHTML = v;
  });
  attrNodes.forEach(([el, pairs]) => pairs.forEach(([a, k]) => {
    const v = en ? EN[k] : attrs.get(el)[a];
    if (v != null) el.setAttribute(a, v);
  }));
  document.documentElement.lang = next;
  const m = META[next];
  const set = (sel, v) => document.querySelector(sel)?.setAttribute('content', v);
  set('meta[name="description"]', m.description);
  set('meta[property="og:description"]', m.og);
  set('meta[property="og:image:alt"]', m.alt);
  set('meta[property="og:locale"]', m.locale[0]);
  set('meta[property="og:locale:alternate"]', m.locale[1]);
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', `https://rizgarozan.github.io/${en ? '?lang=en' : ''}`);
  const b = document.querySelector('[data-lang-toggle]');
  if (b) { b.setAttribute('aria-label', m.toggle); b.lang = en ? 'tr' : 'en'; }
}

export function setLang(next) {
  if (next !== 'en') next = 'tr';
  if (next === lang) return;
  lang = next;
  apply(next);
  try { localStorage.setItem(STORE, next); } catch { /* storage blocked: the link still carries it */ }
  // linkable: ?lang=en (Turkish is the plain address); the hash route stays as it is
  const u = new URL(location.href);
  if (next === 'en') u.searchParams.set('lang', 'en'); else u.searchParams.delete('lang');
  history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  document.dispatchEvent(new CustomEvent('rz:lang', { detail: next }));
}

export const toggleLang = () => setLang(lang === 'en' ? 'tr' : 'en');

// First choice: the link, then what this visitor picked last time, then Turkish.
const asked = new URLSearchParams(location.search).get('lang');
let start = asked === 'en' || asked === 'tr' ? asked : null;
if (!start) { try { start = localStorage.getItem(STORE) === 'en' ? 'en' : 'tr'; } catch { start = 'tr'; } }
if (start === 'en') { lang = 'en'; apply('en'); } else apply('tr');
if (asked) { try { localStorage.setItem(STORE, start); } catch { /* not remembered */ } }
document.querySelector('[data-lang-toggle]')?.addEventListener('click', toggleLang);
