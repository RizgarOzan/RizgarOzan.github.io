// Scene metadata. Readable content lives in index.html (one <article> per
// slug), so it stays crawlable and works without WebGL.
//
// weapon: model id: assets/weapons/<id>.glb (a missing file shows a plain stand-in stake).
// pose:   how the weapon stands in the ground, degrees: lean = sideways tilt
//         (positive leans the pommel to the viewer's right), pitch = forward
//         tilt toward the viewer, yaw = turn around the blade.
// sink:   how deep the blade sits in the earth, in meters.
// scale:  size multiplier when a model's real size reads too small next to the others.
// glow:   emissive multiplier for blades whose light should carry across the field.
// env:    reflection boost for very dark blades, so black steel still reads at night.
// roughMin: floor on the model's roughness, for chrome parts that would mirror the bright sky as a white blot.
//
// place: 'field' (a sword planted outside) or 'forge' (a station in the
//        underground smithy below the field, reached by scrolling down).
export const entries = [
  { slug: 'turkish-rag-eval', label: 'Turkish RAG Eval', weapon: 'buster', accent: '#cfd8e6', pose: { lean: -16, pitch: 6, yaw: 18 }, sink: 0.34 },
  { slug: 'match3-lab', label: 'Match3 Lab', weapon: 'rebellion', accent: '#e2614c', pose: { lean: 7, pitch: 2, yaw: -10 }, sink: 0.3, env: 1.6 },
  { slug: 'tmp-glyph-audit', label: 'TMP Glyph Audit', weapon: 'revolver', accent: '#a7c4ff', pose: { lean: -6, pitch: 3, yaw: 8 }, sink: 0.26, scale: 1.15, roughMin: 0.32 },
  { slug: 'bilim-dedektifi', label: 'Bilim Dedektifi', weapon: 'master', accent: '#8a7bff', pose: { lean: 0, pitch: 0, yaw: 0 }, sink: 0.3, scale: 1.5, env: 4 },
  { slug: 'code-enigma', label: 'Code-Enigma', weapon: 'zangetsu', accent: '#c9ccd6', pose: { lean: 9, pitch: 4, yaw: 20 }, sink: 0.26, scale: 1.2, env: 7 },
  { slug: 'gizli', label: 'Şu an örste', place: 'forge', station: 'anvil', accent: '#ff8a4c' },
  { slug: 'acik-kaynak', label: 'Açık kaynak', place: 'forge', station: 'board', accent: '#e6c56e' },
];

// Favourite blades with no project yet: they hang unfinished on the smithy wall.
export const rack = ['oathkeeper', 'purenail', 'chaos'];

// Where each field sword stands (x, z): rank 1 in front, a shallow V behind.
export const slots = [
  [0, 0.8],
  [-1.25, -0.3],
  [1.25, -0.3],
  [-2.3, -1.5],
  [2.3, -1.5],
];

// Model credits for the "Referanslar" page (Sketchfab, Creative Commons).
const SF = 'https://sketchfab.com/3d-models/';
export const credits = [
  { name: 'Buster Sword', author: 'Dharvey296', url: `${SF}final-fantasy-7-buster-sword-9b931e7276c54c25ba919393f23500e4`, license: 'CC BY 4.0' },
  { name: 'Rebellion', author: 'ScreamingHomie', url: `${SF}rebellion-sword-game-asset-devil-may-cry-5-07a2646d166b469daa6bf41028d5e4cc`, license: 'CC BY-NC 4.0' },
  { name: 'Master Sword', author: 'Yogensia', url: `${SF}master-sword-legend-of-zelda-fan-art-1e6d1805959b4ed3b7ad92fdee480ef6`, license: 'CC BY-NC-SA 4.0' },
  { name: 'Tensa Zangetsu', author: 'JohnHB', url: `${SF}tensa-zangetsu-27a18833edf44f25800d470c54067cb5`, license: 'CC BY 4.0' },
  { name: 'Oathkeeper', author: 'chek360', url: `${SF}oblivion-and-oathkeeper-23d699c6ebb846259b0edbdedaa47efc`, license: 'CC BY 4.0' },
  { name: 'Revolver (gunblade)', author: 'nikexz', url: `${SF}gunblade-from-ffviii-66562b7ae1744c7a80f68d67af8f25f0`, license: 'CC BY 4.0' },
  { name: 'Pure Nail', author: 'João Desager', url: `${SF}hollow-knight-pure-nail-5ff6de0de67d498987a0c8cc534dee03`, license: 'CC BY 4.0' },
  { name: 'Leviathan Axe', author: 'Sky_Hunter', url: `${SF}leviathan-axe-09974baf271e498f94a92e284217d56e`, license: 'CC BY 4.0' },
  { name: 'Blades of Chaos', author: 'John Machine', url: `${SF}blades-of-chaos-from-god-of-war-a914101b147a4d86a440e76acc946bc8`, license: 'CC BY 4.0' },
];
