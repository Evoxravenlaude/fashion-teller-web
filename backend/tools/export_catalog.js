/**
 * Exports the design vocabulary, templates and daily challenges from the site's engine (assets/js/engine.js and
 * catalog.js) into backend/core/data/catalog.json, plus test vectors the Python port is checked against.
 * Run it whenever the engine's vocabulary, pricing or challenges change:   node backend/tools/export_catalog.js
 */
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
global.window = global; window.FTEngine = {};
require(path.join(ROOT, 'assets/js/engine.js')); require(path.join(ROOT, 'assets/js/catalog.js'));
const E = window.FTEngine, V = E.vocab, O = E.OPTIONS;
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));
const catalog = {
  garments: Object.fromEntries(Object.entries(V.GARMENTS).map(([k, g]) => [k, pick(g, ['label', 'base', 'color', 'fabric', 'length', 'sleeves', 'collar', 'fit', 'emb'])])),
  fabrics: Object.fromEntries(Object.entries(V.FABRICS).map(([k, f]) => [k, pick(f, ['label', 'x'])])),
  colors: V.COLORS, accents: V.ACCENTS, lengths: V.LENGTHS, sleeves: V.SLEEVES, fits: V.FITS, patterns: V.PATTERNS,
  embroidery: Object.keys(V.EMB_LABEL), collarFor: V.COLLAR_FOR, detailsFor: V.DETAILS_FOR,
  templates: E.TEMPLATES.map(t => ({ id: t.id, name: t.name, garment: t.garment, spec: E.normalize(t.spec) })),
  challenges: E.CHALLENGES.map(c => pick(c, ['id', 'title', 'text', 'template', 'tab'])),
};
/* test vectors: what the JS engine says for a spread of specs */
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647), any = a => a[Math.floor(rnd() * a.length)];
const specs = E.TEMPLATES.map(t => t.spec);
for (let i = 0; i < 120; i++) { const g = any(Object.keys(V.GARMENTS)); specs.push({ garment: g, fabric: any(Object.keys(V.FABRICS)), color: rnd() < 0.2 ? '#12AB9f' : any(Object.keys(V.COLORS)), accent: any(Object.keys(V.ACCENTS)), length: any(V.LENGTHS), sleeves: any(V.SLEEVES), collar: any(['round', 'v', 'mandarin', 'classic', 'notch', 'shawl', 'square', 'sweetheart', 'off-shoulder']), fit: any(V.FITS), embroidery: any(Object.keys(V.EMB_LABEL)), density: any([1, 2, 3]), pattern: any(V.PATTERNS), puff: rnd() < 0.4, pockets: rnd() < 0.4, belt: rnd() < 0.4, buttons: rnd() < 0.4, customColor: rnd() < 0.2, sketch: rnd() < 0.3 ? Array.from({ length: 1 + Math.floor(rnd() * 5) }, () => ({ c: '#D4AF37', w: 8, m: rnd() < 0.5, p: [300, 400, 320, 420, 340, 400] })) : [], notes: rnd() < 0.2 ? ['hidden zip'] : [] }); }
specs.push({ garment: 'nope', color: '"><script>', accent: 5, notes: ['<b>x</b>', 7, ' '.repeat(5), 'y'.repeat(400)], sketch: [{ c: 'red', w: 900, p: [1, 2] }, { c: '#fff', w: 4, p: [1e9, -5, 30, 'a', 40, 50] }, 'x'], template: '../etc', palette: 'OK', density: 99, sketchClip: 0 }, null, 'str', { garment: 'dress', collar: 'notch', length: 'full', sleeves: 'sleeveless', puff: true });
const vendors = [{}, { priceFactor: 1.22, speedFactor: 0.8, leadMin: 4 }, { priceFactor: 0.82, speedFactor: 1.3, leadMin: 7 }];
const vectors = specs.map((s, i) => ({ in: s, norm: E.normalize(s), price: E.price(s, vendors[i % 3]), vendor: vendors[i % 3], challenges: E.CHALLENGES.filter(c => E.checkChallenge(c, s)).map(c => c.id) }));
fs.writeFileSync(path.join(ROOT, 'backend/core/data/catalog.json'), JSON.stringify(catalog));
fs.writeFileSync(path.join(ROOT, 'backend/core/data/vectors.json'), JSON.stringify(vectors));
console.log('catalog:', Object.keys(catalog).join(', '), '| templates', catalog.templates.length, '| vectors', vectors.length);

/* the demo data the site seeds in built-in mode, so `manage.py seed` loads exactly the same world */
const mem = {}; global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
global.addEventListener = () => {}; global.dispatchEvent = () => {}; window.FT_CONFIG = {};
require(path.join(ROOT, 'assets/js/store.js'));
const db = JSON.parse(mem['ft.db.v2']);
for (const u of db.users) { delete u.passHash; delete u.salt; }
fs.writeFileSync(path.join(ROOT, 'backend/core/data/seed.json'), JSON.stringify({ demo: Object.values(window.FTStore.DEMO), db }));
console.log('seed:', db.users.length, 'users,', db.designs.length, 'designs,', db.orders.length, 'orders,', db.commissions.length, 'commissions');
