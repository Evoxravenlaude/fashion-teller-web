/**
 * Fashion Teller design engine.
 *
 * Turns a plain-language description into a garment specification, renders the specification as a
 * concept (SVG, so it is crisp on every screen and weighs a few KB), and turns a refinement
 * instruction into a new version of the specification with a readable list of what changed.
 *
 *   FTEngine.parse(prompt, hints)        -> spec
 *   FTEngine.refine(spec, instruction)   -> { spec, changes: ['Collar → mandarin', ...], noted: '…' | null }
 *   FTEngine.render(spec)                -> SVG markup (720×1150)
 *   FTEngine.title(spec)                 -> 'Midnight silk kaftan with gold embroidery'
 *   FTEngine.stitches(spec)              -> normalised embroidery paths for the gold-thread animation
 *   FTEngine.price(spec, vendor)         -> { price (₦), deliveryDays, breakdown }
 *
 * When a backend is configured, the server's design object is used as-is; this module still renders
 * a concept from the spec the server returns (or re-parses the prompt when it does not return one).
 */
(() => {
  const E = (window.FTEngine = {});

  /* ───────── vocabulary ───────── */
  const GARMENTS = {
    kaftan:  { words: ['kaftan', 'caftan', 'senator', 'tunic', 'jalabiya', 'jellabiya', 'thobe', 'thawb'], base: 48000, label: 'Kaftan', color: 'midnight', fabric: 'silk', length: 'ankle', sleeves: 'long', collar: 'round', fit: 'relaxed', emb: 'chest' },
    agbada:  { words: ['agbada', 'babariga', 'grand boubou', 'boubou grand'], base: 110000, label: 'Agbada', color: 'ivory', fabric: 'aso-oke', length: 'ankle', sleeves: 'long', collar: 'round', fit: 'relaxed', emb: 'chest' },
    boubou:  { words: ['boubou', 'bubu', 'kaba'], base: 62000, label: 'Boubou', color: 'royal blue', fabric: 'ankara', length: 'ankle', sleeves: 'long', collar: 'v', fit: 'relaxed', emb: 'neck' },
    dress:   { words: ['dress', 'gown', 'frock', 'iro and buba', 'wrapper'], base: 58000, label: 'Dress', color: 'emerald', fabric: 'ankara', length: 'knee', sleeves: 'short', collar: 'round', fit: 'fitted', emb: 'none' },
    suit:    { words: ['suit', 'tuxedo', 'blazer', 'jacket'], base: 135000, label: 'Suit', color: 'charcoal', fabric: 'wool', length: 'full', sleeves: 'long', collar: 'notch', fit: 'fitted', emb: 'none' },
    shirt:   { words: ['shirt', 'blouse', 'top'], base: 30000, label: 'Shirt', color: 'white', fabric: 'cotton', length: 'hip', sleeves: 'long', collar: 'classic', fit: 'regular', emb: 'none' },
  };
  const FABRICS = {
    silk:      { words: ['silk', 'satin', 'charmeuse'], x: 1.5, label: 'silk' },
    ankara:    { words: ['ankara', 'wax print', 'african print', 'kitenge', 'kente'], x: 1.0, label: 'Ankara' },
    'aso-oke': { words: ['aso-oke', 'aso oke', 'asooke', 'aso ofi'], x: 1.9, label: 'aso-oke' },
    linen:     { words: ['linen'], x: 1.2, label: 'linen' },
    wool:      { words: ['wool', 'tweed', 'cashmere', 'flannel'], x: 1.7, label: 'wool' },
    cotton:    { words: ['cotton', 'poplin', 'chambray', 'denim'], x: 1.0, label: 'cotton' },
    lace:      { words: ['lace', 'guipure', 'cord lace'], x: 1.45, label: 'lace' },
    velvet:    { words: ['velvet', 'velour'], x: 1.55, label: 'velvet' },
    brocade:   { words: ['brocade', 'damask', 'jacquard'], x: 1.35, label: 'brocade' },
    chiffon:   { words: ['chiffon', 'organza', 'tulle'], x: 1.25, label: 'chiffon' },
  };
  const COLORS = {
    midnight: '#101B3F', navy: '#1B2A4A', 'royal blue': '#2546A8', blue: '#2F5DA8', sky: '#7FB2E5', 'powder blue': '#A9C8E8', teal: '#1F6F78', turquoise: '#2AA8A8',
    black: '#16181C', charcoal: '#3A3E45', grey: '#8A8F98', gray: '#8A8F98', silver: '#C0C4C8', white: '#F6F6F2', ivory: '#F1EAD6', cream: '#EDE3C8', beige: '#D9C9A8', sand: '#D6C39A', tan: '#C9A27A', camel: '#B98B5A', brown: '#6B4423', chocolate: '#4A2C1A',
    emerald: '#1F6B4E', green: '#2E7D4F', forest: '#1E4D33', olive: '#6B7B3A', sage: '#9AAB8A', mint: '#9FD8C0', lime: '#9BC53D',
    crimson: '#8E1F2B', red: '#B3261E', burgundy: '#5E1A2A', wine: '#6B1F3A', maroon: '#5A1A1A', coral: '#E8705E', orange: '#D97A1F', rust: '#A9512A', terracotta: '#B5593A', mustard: '#D9A520', yellow: '#E8C547', gold: '#D4AF37', champagne: '#E9D7A7', bronze: '#B0803C', copper: '#B87333',
    purple: '#5B2E91', violet: '#6F3FA3', lilac: '#B59BD6', lavender: '#C4B2E6', plum: '#5A2A4F', magenta: '#B0338A', fuchsia: '#C7308F', pink: '#E08BA8', blush: '#F2C6CF', rose: '#D9748A', peach: '#F3C1A3',
  };
  const ACCENTS = { gold: '#D4AF37', silver: '#C9CDD2', emerald: '#1F6B4E', crimson: '#8E1F2B', ivory: '#F4EFE3', black: '#16181C', white: '#FFFFFF', bronze: '#B0803C', copper: '#B87333', navy: '#1B2A4A', royal: '#2546A8', champagne: '#E9D7A7', pearl: '#EDEAE0' };
  const COLOR_NAMES = Object.keys(COLORS).sort((a, b) => b.length - a.length);
  const ACCENT_NAMES = Object.keys(ACCENTS).sort((a, b) => b.length - a.length);
  const LENGTHS = ['hip', 'knee', 'midi', 'ankle', 'full'];
  const SLEEVES = ['sleeveless', 'short', 'three-quarter', 'long'];
  const COLLAR_LABEL = { round: 'round neck', v: 'V-neck', mandarin: 'mandarin collar', classic: 'classic collar', notch: 'notch lapel', shawl: 'shawl lapel', square: 'square neck', sweetheart: 'sweetheart neckline', 'off-shoulder': 'off-the-shoulder' };
  const EMB_LABEL = { none: 'no embroidery', neck: 'embroidery at the neckline', chest: 'embroidery across the chest', 'chest-hem': 'embroidery on the chest and hem', full: 'embroidery on chest, cuffs and hem' };
  E.vocab = { GARMENTS, FABRICS, COLORS, ACCENTS, LENGTHS, SLEEVES, COLLAR_LABEL, EMB_LABEL };

  const has = (t, w) => new RegExp('(^|[^a-z])' + w.replace(/[-\s]/g, '[-\\s]?') + '(s|es)?([^a-z]|$)', 'i').test(t);
  const findKey = (t, table) => { for (const [k, v] of Object.entries(table)) for (const w of v.words) if (has(t, w)) return k; return null; };
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const clone = o => JSON.parse(JSON.stringify(o));

  /* ───────── parse: description -> spec ───────── */
  E.parse = (prompt = '', hints = {}) => {
    const t = ' ' + String(prompt).toLowerCase() + ' ';
    const garment = findKey(t, GARMENTS) || (hints.garment || 'kaftan').toLowerCase();
    const G = GARMENTS[garment] || GARMENTS.kaftan;
    const fabric = findKey(t, FABRICS) || (hints.fabric || G.fabric).toLowerCase().replace(' ', '-');
    const spec = {
      garment, fabric, color: G.color, accent: (hints.accent || 'gold').toLowerCase(),
      length: G.length, sleeves: G.sleeves, collar: G.collar, fit: G.fit,
      embroidery: G.emb, density: 2, buttons: garment === 'shirt' || garment === 'suit', pockets: false, puff: false, belt: false, pattern: fabric === 'ankara' ? 'ankara' : fabric === 'aso-oke' ? 'stripe' : 'plain',
      notes: [], sketch: [], sketchClip: true,
    };
    // colours: the first colour word that is not describing the embroidery / trim is the base
    const accentCtx = /(embroider|thread|trim|piping|accent|detail|button|stitch|lining|border|beading|bead)/;
    for (const c of COLOR_NAMES) {
      const m = new RegExp('(^|[^a-z])' + c.replace(' ', '[-\\s]?') + '([^a-z]|$)', 'i').exec(t);
      if (!m) continue;
      const after = t.slice(m.index, m.index + c.length + 32), before = t.slice(Math.max(0, m.index - 28), m.index);
      const isAccent = accentCtx.test(after) || /\b(with|and)\s+(deep|bright|fine|subtle|heavy|thin)?\s*$/.test(before);
      if (isAccent && ACCENTS[c.split(' ')[0]]) { spec.accent = c.split(' ')[0]; continue; }
      if (spec.color === G.color && !isAccent) spec.color = c;
    }
    for (const a of ACCENT_NAMES) if (has(t, a + ' (embroider|thread|trim|piping|accent|button|beading|stitch)') || has(t, a + ' and ' + '\\w+ (embroider|thread|trim)')) spec.accent = a;
    applyWords(spec, t, true);
    if (hints.garment && !findKey(t, GARMENTS)) spec.garment = garment;
    return spec;
  };

  /* Words shared by the first description and later refinements. Returns readable changes. */
  function applyWords(spec, t, initial) {
    const before = clone(spec), ch = [];
    const set = (k, v, label) => { if (spec[k] !== v) { spec[k] = v; ch.push(label || `${cap(k)} → ${v}`); } };
    // sleeves
    if (/sleeveless|no sleeves|without sleeves|remove the sleeves/.test(t)) set('sleeves', 'sleeveless', 'Sleeves → sleeveless');
    else if (/three[-\s]?quarter|3\/4|bracelet[-\s]length|elbow[-\s]length/.test(t)) set('sleeves', 'three-quarter', 'Sleeves → three-quarter');
    else if (/short sleeve|cap sleeve|shorter sleeve|sleeves? (to|at) the elbow|sleeves? shorter/.test(t)) set('sleeves', 'short', 'Sleeves → short');
    else if (/long sleeve|full sleeve|sleeves? to the wrist|sleeves? longer|lengthen the sleeve|wrist[-\s]length/.test(t)) set('sleeves', 'long', 'Sleeves → long');
    else if (/shorten the sleeve/.test(t)) set('sleeves', SLEEVES[Math.max(0, SLEEVES.indexOf(spec.sleeves) - 1)], 'Sleeves shortened');
    if (/puff(ed|y)? sleeve|balloon sleeve|bishop sleeve/.test(t)) set('puff', true, 'Sleeves → puff');
    if (/fitted sleeve|slim sleeve|plain sleeve|straight sleeve/.test(t)) set('puff', false, 'Sleeves → straight');
    // length
    if (/floor[-\s]length|full[-\s]length|to the floor|maxi/.test(t)) set('length', 'full', 'Length → floor');
    else if (/ankle/.test(t)) set('length', 'ankle', 'Length → ankle');
    else if (/midi|mid[-\s]calf|tea[-\s]length|calf[-\s]length/.test(t)) set('length', 'midi', 'Length → midi');
    else if (/knee/.test(t)) set('length', 'knee', 'Length → knee');
    else if (/hip[-\s]length|cropped|waist[-\s]length|mini/.test(t)) set('length', 'hip', 'Length → hip');
    else if (/\b(shorter|shorten (it|the (hem|length|dress|kaftan|gown)))\b/.test(t) && !/sleeve/.test(t)) set('length', LENGTHS[Math.max(0, LENGTHS.indexOf(spec.length) - 1)], 'Length shortened');
    else if (/\b(longer|lengthen (it|the (hem|length|dress|kaftan|gown)))\b/.test(t) && !/sleeve/.test(t)) set('length', LENGTHS[Math.min(LENGTHS.length - 1, LENGTHS.indexOf(spec.length) + 1)], 'Length extended');
    // collar / neckline
    if (/mandarin|band collar|standing collar|nehru|stand[-\s]up collar/.test(t)) set('collar', 'mandarin', 'Collar → mandarin');
    else if (/shawl (collar|lapel)/.test(t)) set('collar', 'shawl', 'Lapel → shawl');
    else if (/notch(ed)? (collar|lapel)|peak(ed)? lapel/.test(t)) set('collar', 'notch', 'Lapel → notch');
    else if (/v[-\s]?neck|v neckline|deep neck/.test(t)) set('collar', 'v', 'Neckline → V');
    else if (/sweetheart/.test(t)) set('collar', 'sweetheart', 'Neckline → sweetheart');
    else if (/square neck/.test(t)) set('collar', 'square', 'Neckline → square');
    else if (/off[-\s]the[-\s]shoulder|off[-\s]shoulder|bardot/.test(t)) set('collar', 'off-shoulder', 'Neckline → off the shoulder');
    else if (/round neck|crew neck|boat neck|scoop/.test(t)) set('collar', 'round', 'Neckline → round');
    else if (/classic collar|shirt collar|spread collar|point collar|button[-\s]down collar/.test(t)) set('collar', 'classic', 'Collar → classic');
    else if (/no collar|collarless|remove the collar/.test(t)) set('collar', 'round', 'Collar removed');
    // fit
    if (/fitted|slim|tailored fit|body[-\s]?con|snug|tight/.test(t)) set('fit', 'fitted', 'Fit → fitted');
    else if (/relaxed|loose|flowing|oversized|roomy|wide|free[-\s]flowing/.test(t)) set('fit', 'relaxed', 'Fit → relaxed');
    else if (/regular fit|classic fit/.test(t)) set('fit', 'regular', 'Fit → regular');
    // embroidery
    const emb = /embroider|thread ?work|stitching|motif|beading|bead|sequin|applique|appliqué/.test(t);
    if (/no embroidery|remove the embroidery|plain,? no|without embroidery|keep it plain/.test(t)) set('embroidery', 'none', 'Embroidery removed');
    else if (/(down|all the way) to the hem|hem(line)? (and|&) chest|chest (and|&) hem|to the hem/.test(t)) set('embroidery', spec.embroidery === 'full' ? 'full' : 'chest-hem', 'Embroidery → chest and hem');
    else if (/cuff/.test(t) && emb) set('embroidery', 'full', 'Embroidery → chest, cuffs and hem');
    else if (/all over|everywhere|full embroidery|heavily embroidered/.test(t)) set('embroidery', 'full', 'Embroidery → chest, cuffs and hem');
    else if (emb && /(across|on|over) the chest|chest/.test(t)) set('embroidery', spec.embroidery === 'chest-hem' || spec.embroidery === 'full' ? spec.embroidery : 'chest', 'Embroidery → chest');
    else if (emb && /neck|collar/.test(t)) set('embroidery', spec.embroidery === 'none' ? 'neck' : spec.embroidery, 'Embroidery → neckline');
    else if (emb && spec.embroidery === 'none') set('embroidery', 'chest', 'Embroidery → chest');
    if (/deeper|heavier|denser|more (gold|embroidery|detail|thread)|richer|bolder|thicker/.test(t)) set('density', Math.min(3, spec.density + 1), 'Embroidery → heavier');
    if (/lighter|finer|subtle|less (gold|embroidery|detail)|minimal|thinner|simpler/.test(t)) set('density', Math.max(1, spec.density - 1), 'Embroidery → lighter');
    // accents in refinements
    if (!initial) for (const a of ACCENT_NAMES) if (has(t, a) && /(trim|embroider|thread|accent|piping|button|detail|stitch)/.test(t)) set('accent', a, `Accent → ${a}`);
    if (!initial) for (const c of COLOR_NAMES) if (has(t, c) && /(make it|change (it|the colou?r)|colou?r|in |to |base|body|fabric|instead)/.test(t) && !/(trim|embroider|thread|accent|piping|button)[^.]*\b/.test(t.slice(0, t.indexOf(c)))) { set('color', c, `Colour → ${c}`); break; }
    // details
    if (/add (a )?pocket|with pockets|side pockets|chest pocket/.test(t)) set('pockets', true, 'Pockets added');
    if (/no pockets|remove the pockets/.test(t)) set('pockets', false, 'Pockets removed');
    if (/add buttons|with buttons|button(ed)? front|button placket/.test(t)) set('buttons', true, 'Buttons added');
    if (/no buttons|remove the buttons|without buttons/.test(t)) set('buttons', false, 'Buttons removed');
    if (/belt|sash|tie at the waist|waist tie|cinched/.test(t)) set('belt', true, 'Belt added');
    if (/no belt|remove the belt/.test(t)) set('belt', false, 'Belt removed');
    // fabric in refinements
    if (!initial) { const f = findKey(t, FABRICS); if (f) { set('fabric', f, `Fabric → ${FABRICS[f].label}`); spec.pattern = f === 'ankara' ? 'ankara' : f === 'aso-oke' ? 'stripe' : 'plain'; } }
    if (!initial) { const g = findKey(t, GARMENTS); if (g && /(make it|turn it into|change (it )?to|instead|as a)/.test(t)) set('garment', g, `Garment → ${GARMENTS[g].label}`); }
    if (/stripe/.test(t)) set('pattern', 'stripe', 'Pattern → stripes');
    if (/plain fabric|solid colou?r|no pattern|no print/.test(t)) set('pattern', 'plain', 'Pattern → plain');
    void before;
    return ch;
  }

  /* ───────── refine: spec + instruction -> new spec + change list ───────── */
  E.refine = (spec, instruction) => {
    const next = clone(spec); next.notes = [...(spec.notes || [])];
    const t = ' ' + String(instruction).toLowerCase() + ' ';
    const changes = applyWords(next, t, false);
    let noted = null;
    if (!changes.length) { noted = instruction.trim(); next.notes.push(noted); }
    return { spec: next, changes, noted };
  };

  /* ───────── titles ───────── */
  /* Nearest colour name for a hex value, so custom colours still read well in titles and for tailors. */
  E.colorName = c => {
    if (!c || c[0] !== '#') return c;
    const n = parseInt(c.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255; let best = c, bd = 1e9;
    for (const [k, v] of Object.entries(COLORS)) { if (k === 'gray') continue; const m = parseInt(v.slice(1), 16), d = (r - (m >> 16)) ** 2 * 2 + (g - ((m >> 8) & 255)) ** 2 * 4 + (b - (m & 255)) ** 2 * 3; if (d < bd) { bd = d; best = k; } }
    return best;
  };
  E.title = spec => {
    const G = GARMENTS[spec.garment] || GARMENTS.kaftan, F = FABRICS[spec.fabric];
    const fabric = F ? F.label : spec.fabric;
    const pat = spec.pattern && !['plain', 'ankara', 'stripe'].includes(spec.pattern) ? ' ' + spec.pattern : '';
    let s = `${cap(E.colorName(spec.color))}${pat} ${fabric} ${G.label.toLowerCase()}`;
    if (spec.embroidery !== 'none') s += ` with ${E.colorName(spec.accent)} embroidery`;
    return s;
  };
  E.summary = spec => [
    spec.fit === 'fitted' ? 'Fitted' : `${cap(spec.fit)} fit`, `${spec.sleeves === 'sleeveless' ? 'Sleeveless' : cap(spec.sleeves) + ' sleeves'}${spec.puff ? ' (puff)' : ''}`,
    `${cap(spec.length)} length`, cap(COLLAR_LABEL[spec.collar] || spec.collar), cap(EMB_LABEL[spec.embroidery] || ''), spec.pattern && spec.pattern !== 'plain' ? cap(spec.pattern) + ' pattern' : null, spec.sketch?.length ? `Hand sketch (${spec.sketch.length} strokes)` : null, spec.pockets ? 'Pockets' : null, spec.belt ? 'Belt' : null, spec.buttons && spec.garment !== 'suit' && spec.garment !== 'shirt' ? 'Buttons' : null,
  ].filter(Boolean);

  /* ───────── pricing in naira ───────── */
  const DENSITY_COST = { none: 0, neck: 6000, chest: 14000, 'chest-hem': 24000, full: 36000 };
  E.price = (spec, vendor = {}) => {
    const G = GARMENTS[spec.garment] || GARMENTS.kaftan, F = FABRICS[spec.fabric] || { x: 1 };
    const base = Math.round(G.base * F.x);
    const emb = Math.round(DENSITY_COST[spec.embroidery] * (0.7 + spec.density * 0.3));
    const extras = (spec.sketch?.length ? Math.min(15000, 3000 + spec.sketch.length * 400) : 0) + (spec.pockets ? 2500 : 0) + (spec.belt ? 3000 : 0) + (spec.puff ? 2000 : 0) + (spec.length === 'full' ? 4000 : 0);
    const labour = Math.round(base * 0.12);
    const factor = vendor.priceFactor || 1;
    const price = Math.round(((base + emb + extras + labour) * factor) / 500) * 500;
    const complexity = 1 + (spec.embroidery === 'none' ? 0 : spec.density * 0.6) + (spec.garment === 'agbada' || spec.garment === 'suit' ? 1.5 : 0);
    const deliveryDays = Math.max(3, Math.round((vendor.leadMin || 5) + complexity * (vendor.speedFactor || 1)));
    return { price, deliveryDays, breakdown: { fabric: base, embroidery: emb, extras, labour, factor } };
  };

  /* ───────── render: spec -> SVG ─────────
     720×1150, the same frame as the concept video. A ghost-mannequin front view with soft shading,
     a fabric texture, and embroidery in the accent colour. */
  const W = 720, H = 1150, CX = 360;
  let id = 'ft'; // current render namespace for gradient/pattern ids
  const hex = (c, table = COLORS) => table[c] || table[c?.split(' ')[0]] || c || '#101B3F';
  const shade = (h, k) => { // k<0 darker, >0 lighter
    const n = parseInt(h.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = v => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
    return '#' + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  };
  const lum = h => { const n = parseInt(h.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  const HEM = { hip: 640, knee: 800, midi: 910, ankle: 1040, full: 1090 };

  function geometry(s) {
    const g = s.garment, fitW = { fitted: 0, regular: 10, relaxed: 22 }[s.fit] ?? 10;
    const sw = ({ kaftan: 158, agbada: 165, boubou: 162, dress: 128, suit: 158, shirt: 148 }[g] || 150) + fitW;
    const hemY = g === 'suit' ? 730 : g === 'shirt' ? HEM.hip : HEM[s.length] || HEM.ankle;
    const flare = { kaftan: 0.14, agbada: 0.2, boubou: 0.3, dress: 0.4, suit: -0.03, shirt: 0 }[g];
    const waistY = g === 'dress' ? 540 : 560;
    const waistW = g === 'dress' ? 96 : sw - (s.fit === 'fitted' ? 22 : s.fit === 'regular' ? 10 : 0);
    const hemW = (g === 'dress' ? waistW : sw) + (hemY - (g === 'dress' ? waistY : 260)) * flare;
    const sl = { long: { cuffY: 740, dx: 118 }, 'three-quarter': { cuffY: 610, dx: 98 }, short: { cuffY: 430, dx: 52 }, sleeveless: null }[s.sleeves];
    const cw = { kaftan: 112, agbada: 126, boubou: 120, dress: 62, suit: 76, shirt: 74 }[g] || 80;
    const cuffW = s.puff ? cw + 38 : cw;
    return { sw, hemY, hemW, waistY, waistW, sl, cuffW, shoulderY: 262, neckW: g === 'dress' ? 58 : 62 };
  }

  function bodyPath(s, G) {
    const { sw, hemY, hemW, waistY, waistW, shoulderY: sy } = G, g = s.garment;
    const L = CX - sw, R = CX + sw;
    if (g === 'dress') return `M${L} ${sy} C${L + 6} ${sy + 110} ${CX - waistW - 10} ${waistY - 60} ${CX - waistW} ${waistY} C${CX - waistW - 30} ${waistY + 140} ${CX - hemW + 20} ${hemY - 60} ${CX - hemW} ${hemY} Q${CX} ${hemY + 26} ${CX + hemW} ${hemY} C${CX + hemW - 20} ${hemY - 60} ${CX + waistW + 30} ${waistY + 140} ${CX + waistW} ${waistY} C${CX + waistW + 10} ${waistY - 60} ${R - 6} ${sy + 110} ${R} ${sy} Z`;
    if (g === 'suit') return `M${L} ${sy} C${L + 4} ${sy + 120} ${CX - waistW - 6} ${waistY - 80} ${CX - waistW} ${waistY} L${CX - hemW} ${hemY} Q${CX} ${hemY + 10} ${CX + hemW} ${hemY} L${CX + waistW} ${waistY} C${CX + waistW + 6} ${waistY - 80} ${R - 4} ${sy + 120} ${R} ${sy} Z`;
    const mid = g === 'shirt' ? waistW : sw + (hemW - sw) * 0.35;
    return `M${L} ${sy} C${L} ${sy + 160} ${CX - mid} ${waistY} ${CX - hemW} ${hemY} Q${CX} ${hemY + (g === 'shirt' ? 14 : 30)} ${CX + hemW} ${hemY} C${CX + mid} ${waistY} ${R} ${sy + 160} ${R} ${sy} Z`;
  }
  function sleevePaths(s, G) {
    if (!G.sl) return [];
    const { sw, sl, cuffW, shoulderY: sy } = G, g = s.garment;
    const wing = g === 'agbada' || g === 'boubou';
    const out = [];
    for (const d of [-1, 1]) {
      const x0 = CX + d * (sw - 4), x1 = CX + d * (sw + sl.dx), y1 = sl.cuffY, under = CX + d * (sw - 26);
      if (wing) { // a wide hanging panel from the shoulder
        const wx = CX + d * (sw + 165), wy = Math.min(sl.cuffY + 40, 760);
        out.push(`M${x0} ${sy + 4} C${CX + d * (sw + 90)} ${sy + 20} ${wx} ${sy + 120} ${wx - d * 10} ${wy} C${wx - d * 60} ${wy + 10} ${CX + d * (sw + 30)} ${wy - 30} ${under} ${sy + 150} Z`);
      } else if (s.puff) {
        out.push(`M${x0} ${sy} C${CX + d * (sw + 70)} ${sy - 30} ${x1 + d * 18} ${sy + 120} ${x1} ${y1 - 20} Q${x1 - d * cuffW * 0.5} ${y1 + 10} ${x1 - d * cuffW} ${y1 - 10} C${x1 - d * cuffW - d * 6} ${sy + 220} ${under} ${sy + 150} ${under} ${sy + 150} Z`);
      } else {
        out.push(`M${x0} ${sy} C${CX + d * (sw + 46)} ${sy + 20} ${x1 - d * 4} ${sy + 180} ${x1} ${y1} L${x1 - d * cuffW} ${y1 + 8} C${x1 - d * cuffW - d * 4} ${sy + 230} ${under + d * 6} ${sy + 150} ${under} ${sy + 150} Z`);
      }
    }
    return out;
  }
  /* Neckline: `hole` is cut out of the garment with a mask (so a photo or the stage shows through),
     `deco` is drawn on top (collar band, lapels, outline). */
  function neckline(s, G, fill, line, view) {
    const { neckW: nw, shoulderY: sy } = G, c = s.collar, g = s.garment;
    const o = (d, extra = '') => `<path d="${d}" fill="none" stroke="${line}" stroke-width="2"${extra}/>`;
    if (view === 'back') { const d = `M${CX - nw + 6} ${sy - 2} Q${CX} ${sy + 26} ${CX + nw - 6} ${sy - 2}`; return { hole: d + ' Z', deco: o(d) + (c === 'mandarin' ? `<path d="M${CX - nw} ${sy - 30} Q${CX} ${sy - 18} ${CX + nw} ${sy - 30} L${CX + nw - 4} ${sy + 4} Q${CX} ${sy + 18} ${CX - nw + 4} ${sy + 4} Z" fill="${shade(fill, -0.14)}" stroke="${line}" stroke-width="2"/>` : '') }; }
    if (g === 'suit') {
      const bY = 560, inner = `<path d="M${CX - 70} ${sy} L${CX} ${bY} L${CX + 70} ${sy} Z" fill="#F4F1EA" opacity=".95"/>`;
      const lap = d => c === 'shawl'
        ? `<path d="M${CX + d * 70} ${sy} C${CX + d * 62} ${sy + 120} ${CX + d * 24} ${bY - 60} ${CX} ${bY} L${CX + d * 34} ${bY - 20} C${CX + d * 70} ${bY - 150} ${CX + d * 96} ${sy + 60} ${CX + d * 106} ${sy + 6} Z" fill="${shade(fill, -0.18)}"/>`
        : `<path d="M${CX + d * 70} ${sy} L${CX} ${bY} L${CX + d * 40} ${bY - 36} L${CX + d * 100} ${sy + 110} L${CX + d * 122} ${sy + 72} L${CX + d * 96} ${sy + 50} L${CX + d * 112} ${sy + 4} Z" fill="${shade(fill, -0.16)}"/>`;
      return { hole: `M${CX - 40} ${sy - 4} Q${CX} ${sy + 30} ${CX + 40} ${sy - 4} Z`, deco: inner + lap(-1) + lap(1) };
    }
    if (c === 'v') { const d = `M${CX - nw} ${sy - 2} L${CX} ${sy + 150} L${CX + nw} ${sy - 2}`; return { hole: d + ' Z', deco: o(d) }; }
    if (c === 'sweetheart') { const d = `M${CX - nw - 8} ${sy} C${CX - nw - 8} ${sy + 70} ${CX - 30} ${sy + 90} ${CX} ${sy + 60} C${CX + 30} ${sy + 90} ${CX + nw + 8} ${sy + 70} ${CX + nw + 8} ${sy}`; return { hole: d + ' Z', deco: o(d) }; }
    if (c === 'square') { const d = `M${CX - nw} ${sy} V${sy + 90} H${CX + nw} V${sy}`; return { hole: d + ' Z', deco: o(d) }; }
    if (c === 'off-shoulder') { const d = `M${CX - G.sw - 20} ${sy + 60} Q${CX} ${sy + 110} ${CX + G.sw + 20} ${sy + 60}`; return { hole: `${d} L${CX + G.sw + 200} ${sy + 60} L${CX + G.sw + 200} 0 L${CX - G.sw - 200} 0 L${CX - G.sw - 200} ${sy + 60} Z`, deco: o(d) }; }
    if (c === 'mandarin') return { hole: `M${CX - nw} ${sy} Q${CX} ${sy + 60} ${CX + nw} ${sy} Z`, deco: `<path d="M${CX - nw - 6} ${sy - 30} Q${CX} ${sy - 2} ${CX + nw + 6} ${sy - 30} L${CX + nw} ${sy + 4} Q${CX} ${sy + 40} ${CX - nw} ${sy + 4} Z" fill="${shade(fill, -0.14)}" stroke="${line}" stroke-width="2"/><path d="M${CX} ${sy - 16} V${sy + 36}" stroke="${line}" stroke-width="1.5"/>` };
    if (c === 'classic') return { hole: `M${CX - nw} ${sy} Q${CX} ${sy + 48} ${CX + nw} ${sy} Z`, deco: `<path d="M${CX - nw - 4} ${sy - 26} L${CX - 14} ${sy + 72} L${CX} ${sy + 30} L${CX + 14} ${sy + 72} L${CX + nw + 4} ${sy - 26} Q${CX} ${sy + 6} ${CX - nw - 4} ${sy - 26} Z" fill="${shade(fill, -0.12)}" stroke="${line}" stroke-width="2"/>` };
    const d = `M${CX - nw} ${sy - 2} Q${CX} ${sy + 76} ${CX + nw} ${sy - 2}`; return { hole: d + ' Z', deco: o(d) }; // round
  }
  function embroidery(s, G, view) {
    const a = hex(s.accent, ACCENTS), { sw, hemY, hemW, neckW: nw, shoulderY: sy, sl, cuffW } = G, d = s.density, paths = [];
    const stroke = (p, w = 3, o = 1) => `<path d="${p}" fill="none" stroke="${a}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" opacity="${o}"/>`;
    if (s.embroidery === 'none') return '';
    const deepV = view === 'back' ? 26 : s.collar === 'v' ? 150 : 76;
    if (view === 'back' && s.embroidery === 'neck') return '';
    // neckline motif: nested arcs following the neckline
    for (let i = 0; i < d + 1; i++) {
      const k = 8 + i * 10;
      paths.push(stroke(s.collar === 'v' ? `M${CX - nw - k} ${sy - 2} L${CX} ${sy + deepV + k} L${CX + nw + k} ${sy - 2}` : `M${CX - nw - k} ${sy - 2} Q${CX} ${sy + deepV + k * 1.2} ${CX + nw + k} ${sy - 2}`, i === 0 ? 3.5 : 2.2, 1 - i * 0.18));
    }
    if (view !== 'back' && (s.embroidery === 'chest' || s.embroidery === 'chest-hem' || s.embroidery === 'full')) {
      // chest panel: a column of motifs below the neck
      const top = sy + deepV + 20 + d * 10, bottom = Math.min(top + 120 + d * 60, G.waistY + 20), half = 28 + d * 12;
      paths.push(stroke(`M${CX - half} ${top} H${CX + half} V${bottom} H${CX - half} Z`, 2.4, .9));
      for (let y = top + 18; y < bottom - 8; y += 22) paths.push(stroke(`M${CX - half + 10} ${y} q${half / 2 - 5} -10 ${half - 10} 0 t${half - 10} 0`, 2, .85));
      for (let i = 0; i < d; i++) { const y = top + 8 + i * 14; paths.push(stroke(`M${CX - half - 16 - i * 8} ${y} v${bottom - top - 16 - i * 28}`, 1.8, .6)); paths.push(stroke(`M${CX + half + 16 + i * 8} ${y} v${bottom - top - 16 - i * 28}`, 1.8, .6)); }
      // two chevrons across the chest like the kaftan video
      paths.push(stroke(`M${CX - sw + 40} ${top - 6} L${CX - half - 30} ${top + 24}`, 2.2, .7)); paths.push(stroke(`M${CX + sw - 40} ${top - 6} L${CX + half + 30} ${top + 24}`, 2.2, .7));
    }
    if (s.embroidery === 'chest-hem' || s.embroidery === 'full') {
      const y = hemY - 36, w = hemW - 14;
      for (let i = 0; i < d; i++) paths.push(stroke(`M${CX - w} ${y - i * 12} Q${CX} ${y - i * 12 + 22} ${CX + w} ${y - i * 12}`, i === 0 ? 3 : 2, 1 - i * 0.2));
      for (let x = CX - w + 30; x < CX + w - 20; x += 40) paths.push(stroke(`M${x} ${y + 4} l10 -14 l10 14`, 1.8, .8));
    }
    if (s.embroidery === 'full' && sl) {
      for (const dd of [-1, 1]) { const x1 = CX + dd * (sw + sl.dx); for (let i = 0; i < d; i++) paths.push(stroke(`M${x1 - dd * 4} ${sl.cuffY - 16 - i * 10} L${x1 - dd * cuffW + dd * 4} ${sl.cuffY - 8 - i * 10}`, 2.2, 1 - i * .2)); }
    }
    return `<g class="emb">${paths.join('')}</g>`;
  }
  function pattern(s, fill) {
    const lite = lum(fill) > 0.6, ink = lite ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.14)', ink2 = lite ? 'rgba(0,0,0,.07)' : 'rgba(255,255,255,.07)';
    const acc = hex(s.accent, ACCENTS);
    switch (s.pattern === 'plain' ? s.fabric : s.pattern) {
      case 'ankara': return `<pattern id="${id}-fab" width="72" height="72" patternUnits="userSpaceOnUse"><circle cx="36" cy="36" r="18" fill="none" stroke="${ink}" stroke-width="5"/><circle cx="36" cy="36" r="6" fill="${acc}" opacity=".55"/><path d="M0 0h72v72H0z" fill="none"/><path d="M0 36h12M60 36h12M36 0v12M36 60v12" stroke="${ink2}" stroke-width="4"/><circle cx="0" cy="0" r="7" fill="${ink2}"/><circle cx="72" cy="72" r="7" fill="${ink2}"/><circle cx="72" cy="0" r="7" fill="${ink2}"/><circle cx="0" cy="72" r="7" fill="${ink2}"/></pattern>`;
      case 'stripe': case 'aso-oke': return `<pattern id="${id}-fab" width="40" height="34" patternUnits="userSpaceOnUse"><rect width="40" height="6" fill="${ink}"/><rect y="14" width="40" height="2" fill="${acc}" opacity=".5"/><rect y="22" width="40" height="3" fill="${ink2}"/></pattern>`;
      case 'lace': return `<pattern id="${id}-fab" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="13" cy="13" r="7" fill="none" stroke="${ink}" stroke-width="1.6"/><circle cx="0" cy="0" r="3" fill="${ink2}"/><circle cx="26" cy="26" r="3" fill="${ink2}"/></pattern>`;
      case 'wool': return `<pattern id="${id}-fab" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="10" height="2.5" fill="${ink2}"/></pattern>`;
      case 'linen': case 'cotton': return `<pattern id="${id}-fab" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="1" fill="${ink2}"/><rect width="1" height="6" fill="${ink2}"/></pattern>`;
      case 'brocade': return `<pattern id="${id}-fab" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M30 6 Q44 30 30 54 Q16 30 30 6Z" fill="none" stroke="${acc}" stroke-width="1.6" opacity=".5"/><path d="M6 30 Q30 44 54 30 Q30 16 6 30Z" fill="none" stroke="${ink}" stroke-width="1.4"/></pattern>`;
      case 'kente': return `<pattern id="${id}-fab" width="48" height="48" patternUnits="userSpaceOnUse"><rect width="24" height="10" fill="${acc}" opacity=".55"/><rect x="24" y="24" width="24" height="10" fill="${acc}" opacity=".55"/><rect y="12" width="24" height="4" fill="${ink}"/><rect x="24" y="36" width="24" height="4" fill="${ink}"/><rect x="24" width="4" height="24" fill="${ink2}"/><rect y="24" width="4" height="24" fill="${ink2}"/><rect x="34" y="4" width="10" height="10" fill="${ink}"/><rect x="8" y="30" width="10" height="10" fill="${ink}"/></pattern>`;
      case 'adire': { const a2 = lite ? 'rgba(20,30,80,.3)' : 'rgba(255,255,255,.42)'; return `<pattern id="${id}-fab" width="64" height="64" patternUnits="userSpaceOnUse"><circle cx="32" cy="32" r="22" fill="none" stroke="${a2}" stroke-width="3" stroke-dasharray="2 5"/><circle cx="32" cy="32" r="13" fill="none" stroke="${a2}" stroke-width="3" stroke-dasharray="2 4"/><circle cx="32" cy="32" r="4" fill="${a2}"/><circle cx="0" cy="0" r="9" fill="none" stroke="${a2}" stroke-width="3" stroke-dasharray="2 4"/><circle cx="64" cy="64" r="9" fill="none" stroke="${a2}" stroke-width="3" stroke-dasharray="2 4"/></pattern>`; }
      case 'check': return `<pattern id="${id}-fab" width="36" height="36" patternUnits="userSpaceOnUse"><rect width="36" height="12" fill="${ink2}"/><rect width="12" height="36" fill="${ink2}"/><rect width="12" height="12" fill="${ink}"/><rect y="24" width="36" height="1.5" fill="${acc}" opacity=".5"/></pattern>`;
      case 'floral': return `<pattern id="${id}-fab" width="56" height="56" patternUnits="userSpaceOnUse"><g transform="translate(28 28)"><circle r="4" fill="${acc}" opacity=".8"/>${[0, 72, 144, 216, 288].map(a => `<ellipse rx="5" ry="10" transform="rotate(${a}) translate(0 -11)" fill="${ink}"/>`).join('')}</g><g transform="translate(0 0) scale(.6)">${[0, 90, 180, 270].map(a => `<ellipse rx="5" ry="9" transform="rotate(${a}) translate(0 -10)" fill="${ink2}"/>`).join('')}</g><g transform="translate(56 56) scale(.6)">${[0, 90, 180, 270].map(a => `<ellipse rx="5" ry="9" transform="rotate(${a}) translate(0 -10)" fill="${ink2}"/>`).join('')}</g></pattern>`;
      case 'velvet': case 'silk': case 'chiffon': default: return `<pattern id="${id}-fab" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="transparent"/></pattern>`;
    }
  }

  /* opt: id (namespace for defs), view ('front'|'back'), bg (false = transparent, for try-on), viewBox (crop for tiles),
     sketch (false hides the sketch layer), live (true adds an empty <g class="live"> for drawing into) */
  E.render = (spec, opt = {}) => {
    id = String(opt.id || 'ft').replace(/[^a-zA-Z0-9_-]/g, '');
    const view = opt.view || 'front', bgOn = opt.bg !== false;
    const s = { ...spec }, G = geometry(s), fill = hex(s.color), lite = lum(fill) > 0.62;
    const line = lite ? 'rgba(0,0,0,.28)' : 'rgba(255,255,255,.22)';
    const sheen = s.fabric === 'silk' || s.fabric === 'velvet' || s.fabric === 'chiffon';
    const body = bodyPath(s, G), sleeves = sleevePaths(s, G);
    const defs = `<defs>
      <linearGradient id="${id}-bodyg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(fill, sheen ? 0.22 : 0.1)}"/><stop offset=".55" stop-color="${fill}"/><stop offset="1" stop-color="${shade(fill, -0.32)}"/></linearGradient>
      <linearGradient id="${id}-slg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(fill, 0.05)}"/><stop offset="1" stop-color="${shade(fill, -0.36)}"/></linearGradient>
      <linearGradient id="${id}-bgfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E1733"/><stop offset="1" stop-color="#0A1128"/></linearGradient>
      <linearGradient id="${id}-fold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="rgba(0,0,0,0)"/><stop offset=".5" stop-color="rgba(0,0,0,.22)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></linearGradient>
      <radialGradient id="${id}-floor" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="rgba(0,0,0,.55)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></radialGradient>
      ${pattern(s, fill)}
      <clipPath id="${id}-bodyclip"><path d="${body}"/></clipPath>
    </defs>`;
    const folds = s.garment === 'dress' || s.garment === 'shirt' || s.garment === 'suit' ? [CX - 60, CX + 60] : [CX - G.hemW * 0.55, CX - G.hemW * 0.15, CX + G.hemW * 0.25, CX + G.hemW * 0.6];
    const foldEls = folds.map(x => `<rect x="${x - 26}" y="${G.waistY - 40}" width="52" height="${G.hemY - G.waistY + 60}" fill="url(#${id}-fold)" opacity=".55"/>`).join('');
    const sleeveEls = sleeves.map(p => `<path d="${p}" fill="url(#${id}-slg)" stroke="${line}" stroke-width="2"/><path d="${p}" fill="url(#${id}-fab)" opacity=".9"/>`).join('');
    let details = '';
    if (s.garment === 'suit') {
      details += `<path d="M${CX} ${view === 'back' ? G.shoulderY + 30 : 560} V${G.hemY - 6}" stroke="${line}" stroke-width="1.6"/>`;
      if (view !== 'back') details += [575, 640].map(y => `<circle cx="${CX + 2}" cy="${y}" r="7" fill="${shade(fill, -0.5)}" stroke="${line}"/>`).join('');
      if (s.pockets !== false && view !== 'back') details += `<path d="M${CX - 130} 600 h60 M${CX + 70} 600 h60" stroke="${line}" stroke-width="2"/>`;
      // trousers
      const tw = 100;
      details += `<path d="M${CX - 138} 700 L${CX - tw} 1090 H${CX - 12} L${CX} 760 L${CX + 12} 1090 H${CX + tw} L${CX + 138} 700 Z" fill="url(#${id}-bodyg)" stroke="${line}" stroke-width="2"/><path d="M${CX - 138} 700 L${CX - tw} 1090 H${CX - 12} L${CX} 760 L${CX + 12} 1090 H${CX + tw} L${CX + 138} 700 Z" fill="url(#${id}-fab)" opacity=".9"/><path d="M${CX - 70} 720 L${CX - 56} 1086 M${CX + 70} 720 L${CX + 56} 1086" stroke="${lite ? 'rgba(0,0,0,.12)' : 'rgba(255,255,255,.1)'}" stroke-width="2"/>`;
    }
    if (view === 'back') { /* no front fastenings on the back */ }
    else if (s.buttons && s.garment !== 'suit') {
      const y0 = G.shoulderY + (s.collar === 'v' ? 160 : 80), y1 = s.garment === 'shirt' ? G.hemY - 30 : G.waistY + 60;
      details += `<path d="M${CX} ${y0 - 10} V${y1 + 10}" stroke="${line}" stroke-width="1.6"/>`;
      for (let y = y0; y <= y1; y += (y1 - y0) / 5) details += `<circle cx="${CX}" cy="${y}" r="6" fill="${shade(fill, lite ? -0.3 : 0.5)}" stroke="${line}"/>`;
    }
    if (s.pockets && s.garment !== 'suit' && view !== 'back') details += `<path d="M${CX - G.waistW + 24} ${G.waistY + 40} v70 h66 M${CX + G.waistW - 24} ${G.waistY + 40} v70 h-66" fill="none" stroke="${line}" stroke-width="2"/>`;
    if (s.belt) details += `<rect x="${CX - G.waistW - 6}" y="${G.waistY - 14}" width="${G.waistW * 2 + 12}" height="28" rx="4" fill="${shade(hex(s.accent, ACCENTS), -0.2)}" opacity=".9"/><rect x="${CX - 16}" y="${G.waistY - 20}" width="32" height="40" rx="5" fill="none" stroke="${hex(s.accent, ACCENTS)}" stroke-width="4"/>`;
    const title = E.title(s), neck = neckline(s, G, fill, line, view);
    const showSketch = opt.sketch !== false && view !== 'back' && s.sketch?.length;
    const clipAll = `<clipPath id="${id}-allclip"><path d="${body}"/>${sleeves.map(p => `<path d="${p}"/>`).join('')}${s.garment === 'suit' ? `<path d="M${CX - 138} 700 L${CX - 100} 1090 H${CX + 100} L${CX + 138} 700 Z"/>` : ''}</clipPath>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${opt.viewBox || `0 0 ${W} ${H}`}" role="img" aria-label="${title.replace(/"/g, '&quot;')}" data-concept="${id}" data-view="${view}">
      ${defs.replace('</defs>', `<mask id="${id}-neck" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/><path d="${neck.hole}" fill="#000"/></mask>${clipAll}</defs>`)}
      ${bgOn ? `<rect width="${W}" height="${H}" fill="url(#${id}-bgfill)"/><ellipse cx="${CX}" cy="${G.hemY + 50}" rx="${G.hemW + 120}" ry="46" fill="url(#${id}-floor)"/>` : ''}
      <g class="garment">
        <g mask="url(#${id}-neck)">
        ${sleeveEls}
        <path d="${body}" fill="url(#${id}-bodyg)" stroke="${line}" stroke-width="2"/>
        <path d="${body}" fill="url(#${id}-fab)" opacity=".92"/>
        <g clip-path="url(#${id}-bodyclip)">${foldEls}${sheen ? `<path d="M${CX - G.sw + 30} ${G.shoulderY} L${CX - 40} ${G.hemY} L${CX + 10} ${G.hemY} L${CX - G.sw + 80} ${G.shoulderY} Z" fill="rgba(255,255,255,.07)"/>` : ''}${view === 'back' ? `<rect x="0" y="0" width="${W}" height="${H}" fill="rgba(0,0,0,.08)"/>` : ''}</g>
        ${details}
        </g>
        ${neck.deco}
        ${embroidery(s, G, view)}
        ${showSketch ? `<g class="sketch"${s.sketchClip === false ? '' : ` clip-path="url(#${id}-allclip)"`}>${E.sketchPaths(s.sketch)}</g>` : ''}
        ${opt.live ? `<g class="live"${s.sketchClip === false ? '' : ` clip-path="url(#${id}-allclip)"`}></g>` : ''}
      </g>
    </svg>`;
  };

  /* ───────── sketch layer ─────────
     Strokes are drawn by the user's finger in the 720×1150 frame: {c: colour, w: width, p: [x,y,x,y,…], m: mirror}.
     Mirror draws the same stroke reflected across the centre line, so one hand decorates both sides. */
  E.strokePath = p => {
    if (p.length < 4) return p.length === 2 ? `M${p[0]} ${p[1]} l0.1 0` : '';
    let d = `M${p[0]} ${p[1]}`;
    for (let i = 2; i < p.length - 2; i += 2) { const mx = (p[i] + p[i + 2]) / 2, my = (p[i + 1] + p[i + 3]) / 2; d += ` Q${p[i]} ${p[i + 1]} ${mx} ${my}`; }
    return d + ` L${p[p.length - 2]} ${p[p.length - 1]}`;
  };
  const mirrorPts = p => p.map((v, i) => (i % 2 ? v : W - v));
  E.sketchPaths = strokes => (strokes || []).map(k => {
    const one = pts => `<path d="${E.strokePath(pts)}" fill="none" stroke="${k.c}" stroke-width="${k.w}" stroke-linecap="round" stroke-linejoin="round"${k.c === 'erase' ? '' : ''}/>`;
    return one(k.p) + (k.m ? one(mirrorPts(k.p)) : '');
  }).join('');
  E.simplify = (p, min = 3) => { const out = [p[0], p[1]]; for (let i = 2; i < p.length; i += 2) { const dx = p[i] - out[out.length - 2], dy = p[i + 1] - out[out.length - 1]; if (dx * dx + dy * dy >= min * min) out.push(Math.round(p[i]), Math.round(p[i + 1])); } if (out.length === 2 && p.length > 2) out.push(Math.round(p[p.length - 2]), Math.round(p[p.length - 1])); return out; };
  E.FRAME = { W, H, CX };

  /* Normalised (0..1) paths for the gold-thread animation drawn over the frame while generating. */
  E.stitches = spec => {
    const G = geometry(spec), n = ([x, y]) => [x / W, y / H], p = [];
    const sy = G.shoulderY, nw = G.neckW;
    p.push([n([CX - nw - 10, sy]), n([CX, sy + 90]), n([CX + nw + 10, sy])]);
    p.push([n([CX - nw - 24, sy]), n([CX, sy + 112]), n([CX + nw + 24, sy])]);
    if (spec.embroidery !== 'none' && spec.embroidery !== 'neck') {
      const top = sy + 120, half = 40 + spec.density * 10;
      p.push([n([CX - half, top]), n([CX + half, top]), n([CX + half, top + 180]), n([CX - half, top + 180]), n([CX - half, top])]);
      for (let i = 0; i < 6; i++) p.push([n([CX - half + 10, top + 20 + i * 26]), n([CX + half - 10, top + 20 + i * 26])]);
    } else {
      p.push([n([CX - G.sw, sy + 20]), n([CX - G.hemW, G.hemY])]); p.push([n([CX + G.sw, sy + 20]), n([CX + G.hemW, G.hemY])]);
    }
    if (spec.embroidery === 'chest-hem' || spec.embroidery === 'full') p.push([n([CX - G.hemW + 10, G.hemY - 30]), n([CX, G.hemY - 10]), n([CX + G.hemW - 10, G.hemY - 30])]);
    return p;
  };

  /* ═════════ Builder catalogue: templates, palettes, options, daily challenges ═════════
     The user designs; these are the parts they assemble, like an avatar builder. */
  const BASE = { garment: 'kaftan', fabric: 'silk', color: 'midnight', accent: 'gold', length: 'ankle', sleeves: 'long', collar: 'round', fit: 'relaxed', embroidery: 'chest', density: 2, buttons: false, pockets: false, puff: false, belt: false, pattern: 'plain', notes: [], sketch: [], sketchClip: true };
  E.blank = (garment = 'kaftan') => { const G = GARMENTS[garment] || GARMENTS.kaftan; return { ...clone(BASE), garment, fabric: G.fabric, color: G.color, length: G.length, sleeves: G.sleeves, collar: G.collar, fit: G.fit, embroidery: G.emb, buttons: garment === 'shirt' || garment === 'suit', pattern: G.fabric === 'ankara' ? 'ankara' : G.fabric === 'aso-oke' ? 'stripe' : 'plain' }; };

  const T = (id, name, tag, garment, o) => ({ id, name, tag, garment, spec: { ...E.blank(garment), ...(o.fabric && !o.pattern ? { pattern: 'plain' } : {}), ...o, template: id } });
  E.TEMPLATES = [
    T('senator', 'Classic Senator', 'Everyday', 'kaftan', { fabric: 'cotton', color: '#1B2A4A', collar: 'mandarin', embroidery: 'neck', density: 1, length: 'ankle', fit: 'regular', buttons: true }),
    T('royal-kaftan', 'Royal Kaftan', 'Owambe', 'kaftan', { fabric: 'silk', color: 'midnight', accent: 'gold', embroidery: 'chest', density: 3 }),
    T('linen-kaftan', 'Breezy Linen', 'Weekend', 'kaftan', { fabric: 'linen', color: '#F6F6F2', accent: 'bronze', embroidery: 'neck', density: 1, sleeves: 'three-quarter', length: 'midi', collar: 'v' }),
    T('grand-agbada', 'Grand Agbada', 'Owambe', 'agbada', { fabric: 'aso-oke', color: 'ivory', accent: 'gold', embroidery: 'chest-hem', density: 3, pattern: 'stripe' }),
    T('wine-agbada', 'Wine Agbada', 'Wedding', 'agbada', { fabric: 'brocade', color: 'wine', accent: 'champagne', embroidery: 'full', density: 2, pattern: 'brocade' }),
    T('flow-boubou', 'Flowing Boubou', 'Everyday', 'boubou', { fabric: 'ankara', color: 'royal blue', accent: 'gold', pattern: 'ankara', embroidery: 'neck' }),
    T('adire-boubou', 'Adire Boubou', 'Heritage', 'boubou', { fabric: 'cotton', color: '#2F3E8F', accent: 'white', pattern: 'adire', embroidery: 'none', collar: 'round' }),
    T('ankara-flare', 'Ankara Flare', 'Party', 'dress', { fabric: 'ankara', color: 'emerald', accent: 'gold', pattern: 'ankara', puff: true, sleeves: 'short', length: 'knee', fit: 'fitted' }),
    T('evening-gown', 'Evening Gown', 'Gala', 'dress', { fabric: 'velvet', color: 'burgundy', accent: 'gold', collar: 'sweetheart', sleeves: 'sleeveless', length: 'full', embroidery: 'none' }),
    T('lace-bride', 'Lace Bride', 'Bridal', 'dress', { fabric: 'lace', color: 'ivory', accent: 'pearl', pattern: 'lace', collar: 'off-shoulder', sleeves: 'long', length: 'full', embroidery: 'neck', density: 1 }),
    T('kente-midi', 'Kente Midi', 'Heritage', 'dress', { fabric: 'cotton', color: '#D9A520', accent: 'emerald', pattern: 'kente', collar: 'square', sleeves: 'short', length: 'midi', belt: true }),
    T('sharp-suit', 'Sharp Two-piece', 'Office', 'suit', { fabric: 'wool', color: 'charcoal', collar: 'notch' }),
    T('shawl-tux', 'Shawl Tuxedo', 'Gala', 'suit', { fabric: 'velvet', color: 'black', collar: 'shawl', pockets: false }),
    T('classic-shirt', 'Crisp Shirt', 'Office', 'shirt', { fabric: 'cotton', color: 'white', collar: 'classic' }),
    T('ankara-shirt', 'Ankara Short-sleeve', 'Weekend', 'shirt', { fabric: 'ankara', color: 'orange', accent: 'navy', pattern: 'ankara', sleeves: 'short', collar: 'classic', pockets: true }),
  ];
  E.template = id => E.TEMPLATES.find(t => t.id === id);

  /* Palettes: each fabric texture has its own, and each garment style adds one of its own on top. */
  const P = (id, name, base, accents) => ({ id, name, base, accents });
  const FABRIC_PALETTES = {
    silk: [P('jewel', 'Jewel Silk', ['#101B3F', '#1F6B4E', '#5E1A2A', '#2546A8', '#5A2A4F', '#E9D7A7'], ['#D4AF37', '#C9CDD2', '#E9D7A7', '#EDEAE0']), P('sunset', 'Sunset Silk', ['#E8705E', '#D97A1F', '#F3C1A3', '#B3261E', '#D9A520', '#F2C6CF'], ['#D4AF37', '#5E1A2A', '#FFFFFF', '#16181C'])],
    ankara: [P('lagos', 'Lagos Market', ['#D97A1F', '#2E7D4F', '#B3261E', '#2546A8', '#E8C547', '#5B2E91'], ['#E8C547', '#16181C', '#FFFFFF', '#1F6B4E']), P('calabar', 'Calabar Carnival', ['#C7308F', '#2AA8A8', '#E8C547', '#E8705E', '#9BC53D', '#1B2A4A'], ['#FFFFFF', '#D4AF37', '#16181C', '#E8C547'])],
    'aso-oke': [P('owambe', 'Royal Owambe', ['#F1EAD6', '#5E1A2A', '#1F6F78', '#D4AF37', '#6B1F3A', '#2546A8'], ['#D4AF37', '#C9CDD2', '#5E1A2A', '#E9D7A7']), P('ileya', 'Ileya Earth', ['#EDE3C8', '#9AAB8A', '#B98B5A', '#4A2C1A', '#E9D7A7', '#6B7B3A'], ['#B0803C', '#4A2C1A', '#D4AF37', '#F1EAD6'])],
    linen: [P('earth', 'Earth Linen', ['#F6F6F2', '#D6C39A', '#9AAB8A', '#C9A27A', '#7FB2E5', '#8A8F98'], ['#B0803C', '#1B2A4A', '#FFFFFF', '#6B4423'])],
    cotton: [P('everyday', 'Everyday Cotton', ['#F6F6F2', '#1B2A4A', '#7FB2E5', '#B3261E', '#2E7D4F', '#16181C'], ['#D4AF37', '#FFFFFF', '#16181C', '#B3261E']), P('indigo', 'Indigo Dye', ['#2F3E8F', '#1B2A4A', '#A9C8E8', '#5B6FB5', '#F6F6F2', '#101B3F'], ['#FFFFFF', '#E8C547', '#A9C8E8', '#16181C'])],
    wool: [P('tailoring', 'Tailoring Greys', ['#3A3E45', '#1B2A4A', '#16181C', '#6B4423', '#8A8F98', '#1E4D33'], ['#C9CDD2', '#D4AF37', '#5E1A2A', '#F6F6F2'])],
    lace: [P('bridal', 'Bridal Lace', ['#F6F6F2', '#F1EAD6', '#F2C6CF', '#E9D7A7', '#C4B2E6', '#A9C8E8'], ['#EDEAE0', '#D4AF37', '#C9CDD2', '#E9D7A7'])],
    velvet: [P('evening', 'Evening Velvet', ['#5E1A2A', '#1E4D33', '#101B3F', '#5B2E91', '#16181C', '#B0338A'], ['#D4AF37', '#C9CDD2', '#E9D7A7', '#16181C'])],
    brocade: [P('damask', 'Damask Court', ['#6B1F3A', '#1F6F78', '#D4AF37', '#101B3F', '#F1EAD6', '#4A2C1A'], ['#E9D7A7', '#D4AF37', '#C9CDD2', '#16181C'])],
    chiffon: [P('pastel', 'Soft Chiffon', ['#F2C6CF', '#A9C8E8', '#C4B2E6', '#9FD8C0', '#F3C1A3', '#F6F6F2'], ['#D4AF37', '#C9CDD2', '#FFFFFF', '#5A2A4F'])],
  };
  const GARMENT_PALETTES = {
    kaftan: P('senator', 'Senator Classics', ['#1B2A4A', '#3A3E45', '#F6F6F2', '#6B4423', '#1E4D33', '#101B3F'], ['#D4AF37', '#C9CDD2', '#F6F6F2', '#16181C']),
    agbada: P('grand', 'Grand Occasion', ['#F1EAD6', '#2546A8', '#5E1A2A', '#1F6B4E', '#D4AF37', '#16181C'], ['#D4AF37', '#C9CDD2', '#E9D7A7', '#16181C']),
    boubou: P('dakar', 'Dakar Breeze', ['#2546A8', '#2AA8A8', '#E8C547', '#F6F6F2', '#C7308F', '#D97A1F'], ['#D4AF37', '#FFFFFF', '#16181C', '#C9CDD2']),
    dress: P('party', 'Party Night', ['#1F6B4E', '#B0338A', '#16181C', '#E8705E', '#5B2E91', '#D4AF37'], ['#D4AF37', '#FFFFFF', '#16181C', '#C9CDD2']),
    suit: P('boardroom', 'Boardroom', ['#3A3E45', '#1B2A4A', '#16181C', '#8A8F98', '#4A2C1A', '#5E1A2A'], ['#C9CDD2', '#D4AF37', '#F6F6F2', '#16181C']),
    shirt: P('crisp', 'Crisp Shirts', ['#F6F6F2', '#A9C8E8', '#F2C6CF', '#1B2A4A', '#9AAB8A', '#16181C'], ['#16181C', '#FFFFFF', '#D4AF37', '#1B2A4A']),
  };
  E.palettes = (garment, fabric) => [...(FABRIC_PALETTES[fabric] || FABRIC_PALETTES.cotton), GARMENT_PALETTES[garment]].filter(Boolean);

  /* Option groups for each builder tab. `only` limits an option to some garments. */
  E.OPTIONS = {
    collar: [['round', 'Round'], ['v', 'V-neck'], ['mandarin', 'Mandarin'], ['classic', 'Shirt collar'], ['square', 'Square'], ['sweetheart', 'Sweetheart'], ['off-shoulder', 'Off-shoulder'], ['notch', 'Notch lapel'], ['shawl', 'Shawl lapel']],
    collarFor: { kaftan: ['round', 'v', 'mandarin', 'classic'], agbada: ['round', 'v', 'mandarin'], boubou: ['round', 'v', 'square', 'mandarin'], dress: ['round', 'v', 'square', 'sweetheart', 'off-shoulder', 'mandarin'], suit: ['notch', 'shawl'], shirt: ['classic', 'mandarin', 'round', 'v'] },
    sleeves: [['sleeveless', 'Sleeveless'], ['short', 'Short'], ['three-quarter', '¾'], ['long', 'Long']],
    length: [['hip', 'Hip'], ['knee', 'Knee'], ['midi', 'Midi'], ['ankle', 'Ankle'], ['full', 'Floor']],
    fit: [['fitted', 'Fitted'], ['regular', 'Regular'], ['relaxed', 'Relaxed']],
    embroidery: [['none', 'None'], ['neck', 'Neckline'], ['chest', 'Chest'], ['chest-hem', 'Chest + hem'], ['full', 'All over']],
    fabric: Object.keys(FABRICS).map(k => [k, cap(FABRICS[k].label)]),
    pattern: [['plain', 'Plain'], ['ankara', 'Ankara'], ['kente', 'Kente'], ['adire', 'Adire'], ['stripe', 'Aso-oke stripe'], ['lace', 'Lace'], ['brocade', 'Brocade'], ['check', 'Check'], ['floral', 'Floral']],
    garment: Object.keys(GARMENTS).map(k => [k, GARMENTS[k].label]),
  };
  /* Switch garment while keeping the user's colours, fabric and pattern. */
  E.switchGarment = (spec, garment) => {
    const b = E.blank(garment), keep = { color: spec.color, accent: spec.accent, fabric: spec.fabric, pattern: spec.pattern, embroidery: spec.embroidery, density: spec.density, sketch: spec.sketch, sketchClip: spec.sketchClip, notes: spec.notes };
    const out = { ...b, ...keep, template: null };
    if (!E.OPTIONS.collarFor[garment].includes(out.collar)) out.collar = b.collar;
    return out;
  };
  E.shuffle = (spec, rnd = Math.random) => {
    const pick = a => a[Math.floor(rnd() * a.length)];
    const pals = E.palettes(spec.garment, spec.fabric), pal = pick(pals);
    return { ...spec, color: pick(pal.base), accent: pick(pal.accents), collar: pick(E.OPTIONS.collarFor[spec.garment]), sleeves: pick(E.OPTIONS.sleeves)[0], length: spec.garment === 'suit' || spec.garment === 'shirt' ? spec.length : pick(E.OPTIONS.length.slice(1))[0], embroidery: pick(E.OPTIONS.embroidery)[0], density: 1 + Math.floor(rnd() * 3), pattern: pick(E.OPTIONS.pattern)[0], palette: pal.id, template: null };
  };
  /* Which tile-crop to use when previewing a group, so the difference is visible at thumbnail size. */
  E.CROP = { collar: '170 150 380 300', embroidery: '110 200 500 700', sleeves: '0 180 720 700', length: '0 150 720 1000', fabric: '230 400 260 260', pattern: '230 400 260 260', template: '0 140 720 980', garment: '0 140 720 980', fit: '0 180 720 900' };

  /* Daily challenges: one per day for everyone, rotating. Completing it on a saved design earns bonus XP. */
  const light = c => { const h = hex(c); return lum(h) > 0.75; };
  E.CHALLENGES = [
    { id: 'owambe-agbada', title: 'Owambe ready', text: 'Design an agbada with embroidery on the chest.', template: 'grand-agbada', check: s => s.garment === 'agbada' && ['chest', 'chest-hem', 'full'].includes(s.embroidery) },
    { id: 'sketch-motif', title: 'Hand-drawn', text: 'Sketch your own motif on any design (3 strokes or more).', check: s => (s.sketch?.length || 0) >= 3 },
    { id: 'puff-dress', title: 'Puff it up', text: 'Make a dress with puff sleeves.', template: 'ankara-flare', check: s => s.garment === 'dress' && s.puff },
    { id: 'mandarin-kaftan', title: 'Stand tall', text: 'A kaftan with a mandarin collar.', template: 'senator', check: s => s.garment === 'kaftan' && s.collar === 'mandarin' },
    { id: 'all-white', title: 'All white', text: 'Design something light: white, ivory or cream.', template: 'linen-kaftan', check: s => light(s.color) },
    { id: 'kente-anything', title: 'Kente day', text: 'Use the Kente pattern on any garment.', template: 'kente-midi', check: s => s.pattern === 'kente' },
    { id: 'shawl-suit', title: 'Black tie', text: 'A suit with a shawl lapel.', template: 'shawl-tux', check: s => s.garment === 'suit' && s.collar === 'shawl' },
    { id: 'floor-gown', title: 'Red carpet', text: 'A floor-length dress.', template: 'evening-gown', check: s => s.garment === 'dress' && s.length === 'full' },
    { id: 'custom-colour', title: 'Your own colour', text: 'Pick a custom colour with the colour picker.', check: s => s.customColor === true },
    { id: 'adire-boubou', title: 'Adire Sunday', text: 'Put the Adire pattern on a boubou.', template: 'adire-boubou', check: s => s.garment === 'boubou' && s.pattern === 'adire' },
    { id: 'pocket-shirt', title: 'Utility', text: 'A short-sleeve shirt with pockets.', template: 'ankara-shirt', check: s => s.garment === 'shirt' && s.sleeves === 'short' && s.pockets },
    { id: 'belted', title: 'Cinched', text: 'Add a belt to any design.', check: s => s.belt },
    { id: 'mirror-sketch', title: 'Symmetry', text: 'Draw a mirrored sketch stroke.', check: s => (s.sketch || []).some(k => k.m) },
    { id: 'all-over', title: 'Go big', text: 'Embroidery all over, heaviest density.', check: s => s.embroidery === 'full' && s.density === 3 },
  ];
  E.dayIndex = (d = new Date()) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  E.dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  E.challengeFor = (d = new Date()) => E.CHALLENGES[E.dayIndex(d) % E.CHALLENGES.length];

  /* Readable change list between two specs, for the version history ("Collar → mandarin"). */
  E.diff = (a, b) => {
    if (!a) return [];
    const out = [], L = { garment: 'Style', fabric: 'Fabric', color: 'Colour', accent: 'Accent', length: 'Length', sleeves: 'Sleeves', collar: 'Collar', fit: 'Fit', embroidery: 'Embroidery', density: 'Embroidery weight', pattern: 'Pattern' };
    for (const k of Object.keys(L)) if (a[k] !== b[k]) out.push(`${L[k]} → ${k === 'color' || k === 'accent' ? E.colorName(b[k]) : k === 'embroidery' ? (EMB_LABEL[b[k]] || b[k]).replace('embroidery ', '').replace('no embroidery', 'none') : k === 'density' ? ['', 'light', 'medium', 'heavy'][b[k]] : String(b[k]).replace('-', ' ')}`);
    for (const k of ['puff', 'pockets', 'buttons', 'belt']) if (!!a[k] !== !!b[k]) out.push(`${cap(k === 'puff' ? 'puff sleeves' : k)} ${b[k] ? 'added' : 'removed'}`);
    const sa = a.sketch?.length || 0, sb = b.sketch?.length || 0;
    if (sb > sa) out.push(`Sketch +${sb - sa} stroke${sb - sa === 1 ? '' : 's'}`); else if (sb < sa) out.push(sb ? `Sketch −${sa - sb}` : 'Sketch cleared');
    else if (sb && JSON.stringify(a.sketch) !== JSON.stringify(b.sketch)) out.push('Sketch edited');
    const na = (a.notes || []).length, nb = (b.notes || []).length; if (na !== nb || JSON.stringify(a.notes || []) !== JSON.stringify(b.notes || [])) out.push(nb > na ? 'Tailor note added' : 'Tailor notes changed');
    if ((a.sketchClip !== false) !== (b.sketchClip !== false)) out.push('Sketch area changed');
    return out;
  };
  E.colorHex = c => hex(c);
  E.accentHex = c => hex(c, ACCENTS);
})();
