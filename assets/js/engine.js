/**
 * Fashion Teller design engine — garment construction.
 *
 * A design is a plain object (the "spec"). This file turns a spec into
 *   - a flat illustration (SVG, crisp on every screen, a few KB):      FTEngine.render(spec, opt)
 *   - the same garment as measured parts for the 3D viewer:            FTEngine.build3d(spec)
 *   - the detail layer on its own (seams, collars, embroidery, sketch): FTEngine.decoSvg(spec, view)
 *   - a seamless tile of the cloth (colour + pattern):                  FTEngine.tile(spec)
 *
 * Garments are drawn the way a pattern cutter blocks them: on a body with real proportions
 * (720 x 1150 frame, shoulder 268, waist 505, hip 615, knee 855, ankle 1078), with sloped shoulders,
 * set-in sleeves on a 25 degree arm, side seams through chest, waist and hip, and a hem per length.
 * The flat view and the 3D view are built from the same numbers, so they always agree.
 *
 * Every spec is normalised before use (FTEngine.normalize): unknown values fall back to defaults,
 * colours must be a known name or #rrggbb, sketch strokes are clamped. Nothing from a spec is ever
 * written into markup without passing through that step.
 *
 * Catalogue, pricing and wording live in catalog.js.
 */
(() => {
  const E = (window.FTEngine = window.FTEngine || {});
  const W = 720, H = 1150, CX = 360;
  /* body landmarks (y) and the arm the sleeves hang on */
  const B = { hps: 236, sp: 268, bust: 356, waist: 505, hip: 615, crotch: 664, knee: 855, ankle: 1078, floor: 1128 };
  const HEM = { hip: 652, knee: 836, midi: 952, ankle: 1060, full: 1106 };
  const ARM = { jx: 110, jy: 298, a: 25 * Math.PI / 180, len: 352 };
  const SIN = Math.sin(ARM.a), COS = Math.cos(ARM.a);
  const SLEEVE_LEN = { short: 120, 'three-quarter': 250, long: 352 };
  E.FRAME = { W, H, CX, B, HEM, ARM };

  /* ───────── vocabulary ───────── */
  const GARMENTS = {
    kaftan: { words: ['kaftan', 'caftan', 'senator', 'tunic', 'jalabiya', 'jellabiya', 'thobe', 'thawb', 'dashiki', 'danshiki'], base: 48000, label: 'Kaftan', color: 'midnight', fabric: 'silk', length: 'ankle', sleeves: 'long', collar: 'round', fit: 'regular', emb: 'chest' },
    agbada: { words: ['agbada', 'babariga', 'grand boubou', 'boubou grand'], base: 110000, label: 'Agbada', color: 'ivory', fabric: 'aso-oke', length: 'ankle', sleeves: 'long', collar: 'round', fit: 'relaxed', emb: 'chest' },
    boubou: { words: ['boubou', 'bubu', 'kaba'], base: 62000, label: 'Boubou', color: 'royal blue', fabric: 'ankara', length: 'ankle', sleeves: 'long', collar: 'v', fit: 'relaxed', emb: 'neck' },
    dress: { words: ['dress', 'gown', 'frock'], base: 58000, label: 'Dress', color: 'emerald', fabric: 'ankara', length: 'knee', sleeves: 'short', collar: 'round', fit: 'regular', emb: 'none' },
    suit: { words: ['suit', 'tuxedo', 'blazer', 'jacket'], base: 135000, label: 'Suit', color: 'charcoal', fabric: 'wool', length: 'full', sleeves: 'long', collar: 'notch', fit: 'regular', emb: 'none' },
    shirt: { words: ['shirt', 'blouse', 'top'], base: 30000, label: 'Shirt', color: 'white', fabric: 'cotton', length: 'hip', sleeves: 'long', collar: 'classic', fit: 'regular', emb: 'none' },
    tee: { words: ['t-shirt', 'tee', 'polo', 'tank top', 'singlet', 'vest top'], base: 14000, label: 'T-shirt', color: 'white', fabric: 'jersey', length: 'hip', sleeves: 'short', collar: 'round', fit: 'regular', emb: 'none' },
    hoodie: { words: ['hoodie', 'hoody', 'hooded top', 'sweatshirt', 'pullover', 'crewneck'], base: 26000, label: 'Hoodie', color: 'grey', fabric: 'jersey', length: 'hip', sleeves: 'long', collar: 'hood', fit: 'relaxed', emb: 'none', on: ['pockets'] },
    bomber: { words: ['bomber', 'bomber jacket', 'varsity jacket', 'track jacket', 'denim jacket', 'coach jacket', 'windbreaker'], base: 44000, label: 'Bomber jacket', color: 'olive', fabric: 'nylon', length: 'hip', sleeves: 'long', collar: 'rib', fit: 'regular', emb: 'none', on: ['pockets'], noEmb: true, complex: 0.8 },
    kimono: { words: ['kimono', 'yukata', 'haori'], base: 52000, label: 'Kimono', color: 'crimson', fabric: 'silk', length: 'ankle', sleeves: 'long', collar: 'wrap', fit: 'relaxed', emb: 'none', on: ['belt'], complex: 1 },
    joggers: { words: ['joggers', 'jogger', 'sweatpants', 'track pants', 'tracksuit bottoms'], base: 18000, label: 'Joggers', kind: 'bottom', color: 'charcoal', fabric: 'jersey', length: 'ankle', sleeves: 'sleeveless', collar: 'drawstring', fit: 'regular', emb: 'none', on: ['pockets'], noEmb: true },
    trousers: { words: ['trousers', 'pants', 'chinos', 'slacks', 'shorts', 'jeans', 'palazzo', 'culottes'], base: 24000, label: 'Trousers', kind: 'bottom', color: 'navy', fabric: 'cotton', length: 'ankle', sleeves: 'sleeveless', collar: 'waistband', fit: 'regular', emb: 'none', on: ['pockets'], noEmb: true },
    skirt: { words: ['skirt', 'wrapper', 'iro', 'kilt', 'sarong', 'lungi'], base: 20000, label: 'Skirt', kind: 'bottom', color: 'emerald', fabric: 'ankara', length: 'midi', sleeves: 'sleeveless', collar: 'waistband', fit: 'regular', emb: 'none', noEmb: true },
  };
  /* on: details a style starts with; lock: details it always has; noEmb: no embroidery; kind 'bottom': worn from the waist down */
  Object.assign(GARMENTS.suit, { on: ['buttons', 'pockets'], lock: ['buttons'], noEmb: true, complex: 1.5 }); Object.assign(GARMENTS.shirt, { on: ['buttons'], lock: ['buttons'], noEmb: true }); GARMENTS.agbada.complex = 1.5;
  const FABRICS = {
    silk: { words: ['silk', 'satin', 'charmeuse'], x: 1.5, label: 'silk' },
    ankara: { words: ['ankara', 'wax print', 'african print', 'kitenge'], x: 1.0, label: 'Ankara' },
    'aso-oke': { words: ['aso-oke', 'aso oke', 'asooke', 'aso ofi'], x: 1.9, label: 'aso-oke' },
    linen: { words: ['linen'], x: 1.2, label: 'linen' },
    wool: { words: ['wool', 'tweed', 'cashmere', 'flannel'], x: 1.7, label: 'wool' },
    cotton: { words: ['cotton', 'poplin', 'chambray', 'twill'], x: 1.0, label: 'cotton' },
    lace: { words: ['lace', 'guipure', 'cord lace'], x: 1.45, label: 'lace' },
    velvet: { words: ['velvet', 'velour'], x: 1.55, label: 'velvet' },
    brocade: { words: ['brocade', 'damask', 'jacquard'], x: 1.35, label: 'brocade' },
    chiffon: { words: ['chiffon', 'organza', 'tulle'], x: 1.25, label: 'chiffon' },
    jersey: { words: ['jersey', 'fleece', 'french terry', 'terry', 'knit'], x: 0.85, label: 'jersey' },
    denim: { words: ['denim', 'jean'], x: 1.15, label: 'denim' },
    nylon: { words: ['nylon', 'polyester', 'shell', 'satin bomber'], x: 1.1, label: 'nylon' },
  };
  const COLORS = {
    midnight: '#101B3F', navy: '#1B2A4A', 'royal blue': '#2546A8', blue: '#2F5DA8', sky: '#7FB2E5', 'powder blue': '#A9C8E8', teal: '#1F6F78', turquoise: '#2AA8A8',
    black: '#16181C', charcoal: '#3A3E45', grey: '#8A8F98', gray: '#8A8F98', silver: '#C0C4C8', white: '#F6F6F2', ivory: '#F1EAD6', cream: '#EDE3C8', beige: '#D9C9A8', sand: '#D6C39A', tan: '#C9A27A', camel: '#B98B5A', brown: '#6B4423', chocolate: '#4A2C1A',
    indigo: '#2F4A7A', khaki: '#B9A27A',
    emerald: '#1F6B4E', green: '#2E7D4F', forest: '#1E4D33', olive: '#6B7B3A', sage: '#9AAB8A', mint: '#9FD8C0', lime: '#9BC53D',
    crimson: '#8E1F2B', red: '#B3261E', burgundy: '#5E1A2A', wine: '#6B1F3A', maroon: '#5A1A1A', coral: '#E8705E', orange: '#D97A1F', rust: '#A9512A', terracotta: '#B5593A', mustard: '#D9A520', yellow: '#E8C547', gold: '#D4AF37', champagne: '#E9D7A7', bronze: '#B0803C', copper: '#B87333',
    purple: '#5B2E91', violet: '#6F3FA3', lilac: '#B59BD6', lavender: '#C4B2E6', plum: '#5A2A4F', magenta: '#B0338A', fuchsia: '#C7308F', pink: '#E08BA8', blush: '#F2C6CF', rose: '#D9748A', peach: '#F3C1A3',
  };
  const ACCENTS = { gold: '#D4AF37', silver: '#C9CDD2', emerald: '#1F6B4E', crimson: '#8E1F2B', ivory: '#F4EFE3', black: '#16181C', white: '#FFFFFF', bronze: '#B0803C', copper: '#B87333', navy: '#1B2A4A', royal: '#2546A8', champagne: '#E9D7A7', pearl: '#EDEAE0' };
  const LENGTHS = ['hip', 'knee', 'midi', 'ankle', 'full'];
  const SLEEVES = ['sleeveless', 'short', 'three-quarter', 'long'];
  const FITS = ['fitted', 'regular', 'relaxed'];
  const FORMS = ['woman', 'man'];                                   // the mannequin a design is shown on
  const FORM_FOR = { dress: 'woman', boubou: 'woman', skirt: 'woman', kimono: 'woman' };
  const PATTERNS = ['plain', 'ankara', 'kente', 'adire', 'stripe', 'lace', 'brocade', 'check', 'floral'];
  const COLLAR_LABEL = { round: 'round neck', v: 'V-neck', mandarin: 'mandarin collar', classic: 'classic collar', notch: 'notch lapel', shawl: 'shawl lapel', square: 'square neck', sweetheart: 'sweetheart neckline', 'off-shoulder': 'off-the-shoulder', polo: 'polo collar', hood: 'hood', rib: 'ribbed collar', wrap: 'wrap collar', drawstring: 'drawstring waist', elastic: 'elastic waist', waistband: 'flat-front waistband', pleated: 'pleated front', tie: 'wrap and tie' };
  const EMB_LABEL = { none: 'no embroidery', neck: 'embroidery at the neckline', chest: 'embroidery across the chest', 'chest-hem': 'embroidery on the chest and hem', full: 'embroidery on chest, cuffs and hem' };
  const COLLAR_FOR = { kaftan: ['round', 'v', 'mandarin', 'classic'], agbada: ['round', 'v'], boubou: ['round', 'v', 'square'], dress: ['round', 'v', 'square', 'sweetheart', 'off-shoulder', 'mandarin'], suit: ['notch', 'shawl'], shirt: ['classic', 'mandarin', 'round', 'v'], tee: ['round', 'v', 'polo'], hoodie: ['hood', 'round'], bomber: ['rib', 'classic'], kimono: ['wrap'], joggers: ['drawstring', 'elastic'], trousers: ['waistband', 'pleated'], skirt: ['waistband', 'tie'] };
  /* which detail toggles make sense on which garment */
  const DETAILS_FOR = { kaftan: ['pockets', 'buttons', 'belt'], agbada: [], boubou: ['belt'], dress: ['pockets', 'buttons', 'belt'], suit: ['pockets'], shirt: ['pockets'], tee: ['pockets'], hoodie: ['pockets'], bomber: ['pockets'], kimono: ['belt'], joggers: ['pockets'], trousers: ['pockets', 'belt'], skirt: ['pockets', 'belt'] };
  E.vocab = { GARMENTS, FABRICS, COLORS, ACCENTS, LENGTHS, SLEEVES, FITS, FORMS, FORM_FOR, PATTERNS, COLLAR_LABEL, EMB_LABEL, COLLAR_FOR, DETAILS_FOR };
  /** the mannequin for a design: the one saved with it, else the usual one for that style */
  E.formOf = spec => (spec && FORMS.includes(spec.form) ? spec.form : FORM_FOR[spec && spec.garment] || 'man');

  /* ───────── small helpers ───────── */
  const f1 = n => Math.round(n * 10) / 10;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const HEX = /^#[0-9a-f]{6}$/i;
  const hex = (c, table = COLORS) => (typeof c === 'string' && HEX.test(c) ? c : table[c] || COLORS[c] || '#101B3F');
  const shade = (h, k) => { // k<0 darker, >0 lighter
    const n = parseInt(h.slice(1), 16), f = v => clamp(Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k), 0, 255);
    return '#' + [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map(v => v.toString(16).padStart(2, '0')).join('');
  };
  const lum = h => { const n = parseInt(h.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
  E.colorHex = c => hex(c);
  E.accentHex = c => hex(c, ACCENTS);
  E.shade = shade; E.lum = lum;

  /* ───────── normalise (and make safe) ───────── */
  const cleanColor = (c, fallback, table = COLORS) => {
    if (typeof c !== 'string') return fallback;
    c = c.trim().toLowerCase();
    return HEX.test(c) || table[c] || COLORS[c] ? c : fallback;
  };
  const cleanSketch = sk => (Array.isArray(sk) ? sk : []).slice(0, 300).map(k => {
    if (!k || !Array.isArray(k.p)) return null;
    const p = k.p.slice(0, 800).map((v, i) => clamp(Math.round(Number(v) || 0), -60, (i % 2 ? H : W) + 60));
    if (p.length % 2) p.pop();
    if (p.length < 2) return null;
    return { c: hex(cleanColor(k.c, '#d4af37', ACCENTS), ACCENTS), w: clamp(Math.round(Number(k.w) || 8), 1, 40), m: !!k.m, p };
  }).filter(Boolean);
  E.blank = (garment = 'kaftan') => {
    const g = GARMENTS[garment] ? garment : 'kaftan', G = GARMENTS[g], on = k => (G.on || []).includes(k);
    return { garment: g, fabric: G.fabric, color: G.color, accent: 'gold', length: G.length, sleeves: G.sleeves, collar: G.collar, fit: G.fit, embroidery: G.emb, density: 2, buttons: on('buttons'), pockets: on('pockets'), puff: false, belt: on('belt'), pattern: G.fabric === 'ankara' ? 'ankara' : G.fabric === 'aso-oke' ? 'stripe' : 'plain', notes: [], sketch: [], sketchClip: true, customColor: false, template: null, palette: null, form: null };
  };
  E.normalize = raw => {
    const s = raw && typeof raw === 'object' ? raw : {};
    const out = E.blank(s.garment), g = out.garment, G = GARMENTS[g];
    if (FABRICS[s.fabric]) out.fabric = s.fabric;
    if (LENGTHS.includes(s.length)) out.length = s.length;
    if (SLEEVES.includes(s.sleeves)) out.sleeves = s.sleeves;
    if (FITS.includes(s.fit)) out.fit = s.fit;
    if (EMB_LABEL[s.embroidery]) out.embroidery = s.embroidery;
    out.pattern = PATTERNS.includes(s.pattern) ? s.pattern : 'plain';
    if (COLLAR_FOR[g].includes(s.collar)) out.collar = s.collar;
    out.color = cleanColor(s.color, out.color);
    out.accent = cleanColor(s.accent, 'gold', ACCENTS);
    out.density = clamp(Math.round(Number(s.density) || 2), 1, 3);
    for (const k of ['buttons', 'pockets', 'puff', 'belt', 'customColor']) out[k] = !!s[k];
    for (const k of G.lock || []) out[k] = true;
    if (G.kind === 'bottom') { out.embroidery = 'none'; out.sleeves = 'sleeveless'; out.puff = false; }
    out.sketchClip = s.sketchClip !== false;
    out.notes = (Array.isArray(s.notes) ? s.notes : []).filter(n => typeof n === 'string' && n.trim()).slice(0, 12).map(n => n.trim().slice(0, 160));
    out.sketch = cleanSketch(s.sketch);
    out.template = typeof s.template === 'string' && /^[a-z0-9-]{1,40}$/.test(s.template) ? s.template : null;
    out.palette = typeof s.palette === 'string' && /^[a-z0-9-]{1,30}$/.test(s.palette) ? s.palette : null;
    out.form = FORMS.includes(s.form) ? s.form : null;
    return out;
  };

  /* ───────── path pen: builds one side, mirrors the other, samples points for 3D ───────── */
  class Pen {
    constructor(x, y) { this.s = [x, y]; this.c = [x, y]; this.segs = []; }
    L(x, y) { this.segs.push(['L', this.c, [x, y]]); this.c = [x, y]; return this; }
    C(a, b, c, d, x, y) { this.segs.push(['C', this.c, [a, b], [c, d], [x, y]]); this.c = [x, y]; return this; }
    Q(a, b, x, y) { const p = this.c; return this.C(p[0] + (a - p[0]) * 2 / 3, p[1] + (b - p[1]) * 2 / 3, x + (a - x) * 2 / 3, y + (b - y) * 2 / 3, x, y); }
    fwd(m) { const P = m ? p => [2 * CX - p[0], p[1]] : p => p; return this.segs.map(s => { if (s[0] === 'L') { const p = P(s[2]); return `L${f1(p[0])} ${f1(p[1])}`; } const a = P(s[2]), b = P(s[3]), c = P(s[4]); return `C${f1(a[0])} ${f1(a[1])} ${f1(b[0])} ${f1(b[1])} ${f1(c[0])} ${f1(c[1])}`; }).join(''); }
    rev() { const P = p => [2 * CX - p[0], p[1]]; return [...this.segs].reverse().map(s => { const e = P(s[1]); if (s[0] === 'L') return `L${f1(e[0])} ${f1(e[1])}`; const a = P(s[3]), b = P(s[2]); return `C${f1(a[0])} ${f1(a[1])} ${f1(b[0])} ${f1(b[1])} ${f1(e[0])} ${f1(e[1])}`; }).join(''); }
    closed(m) { const s = m ? [2 * CX - this.s[0], this.s[1]] : this.s; return `M${f1(s[0])} ${f1(s[1])}${this.fwd(m)}Z`; }
    poly(n = 10) { const out = [this.s]; for (const s of this.segs) { if (s[0] === 'L') out.push(s[2]); else for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * u * s[1][0] + 3 * u * u * t * s[2][0] + 3 * u * t * t * s[3][0] + t * t * t * s[4][0], u * u * u * s[1][1] + 3 * u * u * t * s[2][1] + 3 * u * t * t * s[3][1] + t * t * t * s[4][1]]); } } return out; }
  }
  /* half-width at height y from a top→bottom profile [[x,y],...] (x measured from the centre line) */
  const widthAt = (prof, y) => { if (y <= prof[0][1]) return prof[0][0] - CX; for (let i = 1; i < prof.length; i++) { const a = prof[i - 1], b = prof[i]; if (y <= b[1]) { const t = b[1] === a[1] ? 0 : (y - a[1]) / (b[1] - a[1]); return a[0] + (b[0] - a[0]) * t - CX; } } return prof[prof.length - 1][0] - CX; };
  /* horizontal extents of a closed polygon at height y */
  const scanAt = (poly, y) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) { const x = a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]); if (x < lo) lo = x; if (x > hi) hi = x; } } return lo < hi ? [lo, hi] : null; };

  /* ───────── garment blocks ───────── */
  function dims(s) {
    const f = s.fit === 'fitted' ? -1 : s.fit === 'relaxed' ? 1 : 0, g = s.garment;
    const longish = HEM[s.length] >= HEM.midi ? s.length : 'ankle';
    let D;
    if (g === 'agbada') D = { nw: 58, sh: 142, ch: 152, wa: 164, hi: 176, flare: 0.1, hemY: HEM[longish], wings: 'agbada', legs: 'slim', hemDrop: 10 };
    else if (g === 'boubou') D = { nw: 56, sh: 138, ch: 150, wa: 156, hi: 164, flare: 0.07, hemY: HEM[longish], wings: 'bat', hemDrop: 12 };
    else if (g === 'dress') {
      const hemY = HEM[s.length];
      D = f < 0 ? { nw: 52, sh: 124, ch: 102, wa: 82, hi: 104, flare: 0.02, hemY, mermaid: hemY >= HEM.ankle, hemDrop: 6 }
        : f > 0 ? { nw: 52, sh: 126, ch: 108, wa: 94, hi: 120, flare: 0.46, hemY, hemDrop: 22 }
          : { nw: 52, sh: 125, ch: 104, wa: 86, hi: 111, flare: 0.24, hemY, hemDrop: 14 };
      D.sw = [36 + f * 3, 25 + f * 2];
    } else if (g === 'suit') D = { nw: 48, sh: 138, slope: 27, ch: 120 + f * 6, wa: 108 + f * 8, hi: 116 + f * 6, flare: 0, hemY: 706, legs: 'tailored', hemDrop: 5, sw: [45 + f * 3, 31 + f * 2], jacket: true };
    else if (g === 'shirt') D = { nw: 48, sh: 130 + f * 5, ch: 114 + f * 9, wa: 108 + f * 11, hi: 112 + f * 9, flare: 0, hemY: 642, hemDrop: 30, sw: [43 + f * 5, 28 + f * 3], styleLegs: 'tailored' };
    else if (g === 'tee') D = { nw: 52, sh: 128 + f * 5, ch: 112 + f * 10, wa: 107 + f * 12, hi: 110 + f * 10, flare: 0, hemY: 648, hemDrop: 5, sw: [46 + f * 5, 31 + f * 3], styleLegs: 'slim' };
    else if (g === 'hoodie') D = { nw: 56, sh: 136 + f * 5, slope: 30, ch: 126 + f * 9, wa: 124 + f * 11, hi: 122 + f * 8, flare: -0.24, hemY: 662, hemDrop: 3, sw: [54 + f * 5, 35 + f * 3], styleLegs: 'slim', rib: 34 };
    else if (g === 'bomber') D = { nw: 50, sh: 138, slope: 28, ch: 126 + f * 7, wa: 120 + f * 9, hi: 116 + f * 6, flare: s.collar === 'rib' ? -0.3 : -0.08, hemY: 652, hemDrop: 2, sw: [52 + f * 4, 34 + f * 2], jacket: true, styleLegs: 'slim', rib: s.collar === 'rib' ? 30 : 0 };
    else if (g === 'kimono') D = { nw: 54, sh: 134, ch: 126, wa: 118, hi: 122, flare: 0.02, hemY: HEM[HEM[s.length] >= HEM.knee ? s.length : 'ankle'], wings: 'kimono', hemDrop: 4 };
    else if (GARMENTS[g].kind === 'bottom') D = { nw: 40, sh: 110, ch: 104, wa: 90, hi: 104 + f * 5, flare: 0, hemY: B.ankle, hemDrop: 0, bottom: true };
    else D = { nw: 52, sh: 130 + f * 6, ch: 114 + f * 10, wa: 108 + f * 13, hi: 116 + f * 11, flare: 0.05 + (f > 0 ? 0.035 : 0), hemY: HEM[s.length], legs: 'slim', hemDrop: 8, slit: s.length !== 'hip', sw: [43 + f * 6, 29 + f * 4] };
    if (s.collar === 'square') D.nw = 62; else if (s.collar === 'sweetheart') D.nw = 66;
    D.slope = D.slope || 32; D.sp = B.hps + D.slope;
    if (D.mermaid) { D.kn = D.hi - 12; D.he = D.kn + (D.hemY - B.knee) * 0.5; } else D.he = D.hi + (D.hemY - B.hip) * D.flare;
    D.g = g; D.f = f;
    return D;
  }

  function sleeveGeo(s, D) {
    if (D.wings || s.sleeves === 'sleeveless') return null;
    const L = SLEEVE_LEN[s.sleeves], w0 = D.sw[0], k = (D.sw[1] - D.sw[0]) / ARM.len, puff = s.puff && s.garment !== 'suit';
    const w = t => { const tt = clamp(t, 0, L); return w0 + k * tt + (s.sleeves === 'short' ? 4 * tt / L : 0) + (puff ? 17 * Math.pow(Math.sin(Math.PI * Math.min(1, tt / (L * 0.94))), 0.75) : 0); };
    const O = t => [CX + ARM.jx + SIN * t + COS * w(t), ARM.jy + COS * t - SIN * w(t)];
    const I = t => [CX + ARM.jx + SIN * t - COS * w(t), ARM.jy + COS * t + SIN * w(t)];
    return { L, w, O, I, puff, w0, w1: w(L) };
  }

  /* neckline as an open curve from the left shoulder seam to the right; k grows it outward (for binding and embroidery rings) */
  function neckKind(s) {
    const c = s.collar, g = s.garment;
    if (g === 'suit') return { type: 'round', dp: 26 };
    if (g === 'kimono') return { type: 'v', dp: 150 };
    if (c === 'hood') return { type: 'round', dp: 58 };
    if (c === 'polo') return { type: 'v', dp: 58 };
    if (c === 'rib') return { type: 'round', dp: 30 };
    if (c === 'v') return { type: 'v', dp: g === 'shirt' ? 112 : g === 'boubou' || g === 'agbada' ? 164 : 144 };
    if (c === 'square') return { type: 'square', dp: 98 };
    if (c === 'sweetheart') return { type: 'sweet', dp: 104 };
    if (c === 'off-shoulder') return { type: 'off', dp: 0 };
    if (c === 'mandarin') return { type: 'round', dp: 44 };
    if (c === 'classic') return { type: 'v', dp: 44 };
    return { type: 'round', dp: g === 'agbada' ? 104 : g === 'dress' ? 88 : g === 'boubou' ? 92 : 70 };
  }
  function neckCurve(nk, D, k = 0) {
    const x = D.nw + k, y0 = B.hps + k * D.slope / (D.sh - D.nw), dp = nk.dp + k;
    if (nk.type === 'v') return { d: `M${f1(CX - x)} ${f1(y0)}L${CX} ${f1(B.hps + nk.dp + k * 1.5)}L${f1(CX + x)} ${f1(y0)}`, bottom: B.hps + nk.dp + k * 1.5 };
    if (nk.type === 'square') return { d: `M${f1(CX - x)} ${f1(y0)}V${f1(B.hps + dp)}H${f1(CX + x)}V${f1(y0)}`, bottom: B.hps + dp };
    if (nk.type === 'sweet') return { d: `M${f1(CX - x)} ${f1(y0)}C${f1(CX - x - 4)} ${f1(y0 + dp * 0.8)} ${f1(CX - 30)} ${f1(B.hps + dp * 1.22 + k)} ${CX} ${f1(B.hps + dp * 0.9 + k)}C${f1(CX + 30)} ${f1(B.hps + dp * 1.22 + k)} ${f1(CX + x + 4)} ${f1(y0 + dp * 0.8)} ${f1(CX + x)} ${f1(y0)}`, bottom: B.hps + dp * 1.02 + k };
    if (nk.type === 'off') { const y = D.sp + 46 + k, lo = D.sp + 122 + k * 1.2; return { d: `M${f1(CX - D.sh - 90)} ${f1(y)}Q${CX} ${f1(lo)} ${f1(CX + D.sh + 90)} ${f1(y)}`, bottom: (y + lo) / 2 }; }
    return { d: `M${f1(CX - x)} ${f1(y0)}C${f1(CX - x + 3)} ${f1(y0 + dp * 1.32)} ${f1(CX + x - 3)} ${f1(y0 + dp * 1.32)} ${f1(CX + x)} ${f1(y0)}`, bottom: y0 + dp * 0.99 };
  }

  /* Build the whole garment once. Everything else (flat view, 3D parts, detail layer) reads from this. */
  function build(spec, view = 'front') {
    const s = E.normalize(spec), D = dims(s), back = view === 'back', g = s.garment;
    const fill = hex(s.color), acc = hex(s.accent, ACCENTS), lite = lum(fill) > 0.62;
    const line = lite ? 'rgba(0,0,0,.30)' : 'rgba(255,255,255,.26)', soft = lite ? 'rgba(0,0,0,.16)' : 'rgba(255,255,255,.14)';
    const M = { s, D, view, fill, acc, line, soft, lite, under: [], behind: [], cuts: [], cutBehind: false, deco: [], flatOnly: [], emb: [], p3: [] };
    const ln = (d, w = 1.8, col = line, extra = '') => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`;
    const sh = (d, col, extra = '') => `<path d="${d}" fill="${col}" stroke="${line}" stroke-width="1.6" stroke-linejoin="round"${extra}/>`;
    const ribFill = shade(fill, lite ? -0.08 : 0.09), col = s.collar === 'polo' ? 'classic' : s.collar === 'rib' ? 'mandarin' : s.collar;
    if (D.bottom) return bottom();

    /* sleeves first: where the sleeve leaves the body decides the armhole depth */
    const SL = sleeveGeo(s, D); M.SL = SL;
    if (SL) {
      const k = (D.sw[1] - D.sw[0]) / ARM.len, t = (D.ch - ARM.jx + COS * SL.w0) / (SIN - COS * k);
      D.uaY = clamp(ARM.jy + COS * t + SIN * SL.w(t), 374, 424);
    } else D.uaY = D.wings ? 400 : 386;

    /* body: right-hand profile from the high shoulder point to the hem */
    const P = new Pen(CX + D.nw, B.hps).L(CX + D.sh, D.sp)
      .C(CX + D.sh - 5, D.sp + 46, CX + D.ch - 13, D.uaY - 38, CX + D.ch, D.uaY)
      .C(CX + D.ch, D.uaY + 40, CX + D.wa, B.waist - 54, CX + D.wa, B.waist)
      .C(CX + D.wa, B.waist + 40, CX + D.hi, B.hip - 46, CX + D.hi, B.hip);
    const hemSideY = D.hemY, hh = hemSideY - B.hip;
    if (D.mermaid) P.C(CX + D.hi, B.hip + 90, CX + D.kn, B.knee - 90, CX + D.kn, B.knee).C(CX + D.kn, B.knee + 70, CX + D.he - 12, hemSideY - 70, CX + D.he, hemSideY);
    else P.C(CX + D.hi, B.hip + hh * 0.4, CX + D.he - (D.he - D.hi) * 0.3, hemSideY - hh * 0.3, CX + D.he, hemSideY);
    const hemLow = hemSideY + D.hemDrop, backDip = back ? 6 : 12;
    M.body = `M${f1(CX + D.nw)} ${B.hps}${P.fwd()}Q${CX} ${f1(hemSideY + 2 * D.hemDrop)} ${f1(CX - D.he)} ${f1(hemSideY)}${P.rev()}Q${CX} ${B.hps + 2 * backDip} ${f1(CX + D.nw)} ${B.hps}Z`;
    M.prof = P.poly(12); M.hemSideY = hemSideY; M.hemLow = hemLow;
    const hemCurve = off => `M${f1(CX - D.he + 3)} ${f1(hemSideY - off)}Q${CX} ${f1(hemSideY + 2 * D.hemDrop - off)} ${f1(CX + D.he - 3)} ${f1(hemSideY - off)}`;
    const hemYAt = (x, off = 0) => hemSideY + D.hemDrop * (1 - Math.pow((x - CX) / D.he, 2)) - off;
    M.p3.push({ id: 'body', type: 'rows', depth: D.wings ? 'robe' : D.jacket ? 'jacket' : g === 'dress' ? 'dress' : 'torso', rows: rowsFrom(M.prof, B.hps, hemSideY), hemDrop: D.hemDrop, flare: D.flare, fit: D.f, mermaid: !!D.mermaid });

    /* trousers that come with the set */
    if (D.legs || D.styleLegs) {
      const own = !!D.legs, tail = (D.legs || D.styleLegs) === 'tailored', hw = tail ? 106 : 102, ao = tail ? 96 : 84, ai = tail ? 18 : 22, top = 566;
      const leg = new Pen(CX + 2, top).L(CX + hw, top).C(CX + hw + 2, top + 110, CX + ao + 10, B.knee - 90, CX + ao + 4, B.knee).L(CX + ao, B.ankle).L(CX + ai, B.ankle).C(CX + ai + 2, B.knee, CX + 12, B.crotch + 70, CX + 3, B.crotch).L(CX + 2, B.crotch - 12);
      if (own) M.under.push({ id: 'lr', d: leg.closed() }, { id: 'll', d: leg.closed(true) });
      const lp = leg.poly(8), rows = []; for (let y = B.crotch - 24; y <= B.ankle; y += 8) { const r = scanAt(lp, Math.min(y, B.ankle - 0.5)); if (r) rows.push([y, r[0], r[1]]); }
      const seatW = y => { const r = scanAt(lp, y); return r ? r[1] - CX : hw; };
      M.p3.push({ id: 'pelvis', type: 'rows', depth: 'round', fork: true, styling: !own, rows: [top, top + 5, B.crotch - 60, B.crotch - 40, B.crotch - 22, B.crotch - 8, B.crotch + 8].map(y => { const w = f1(y <= top + 5 ? hw : seatW(y)); return [y, CX - w, CX + w]; }) });
      M.p3.push({ id: 'legR', type: 'rows', depth: 'leg', styling: !own, rows }, { id: 'legL', type: 'rows', depth: 'leg', styling: !own, rows: rows.map(r => [r[0], 2 * CX - r[2], 2 * CX - r[1]]) });
      const below = own && hemLow < B.ankle - 6;
      if (below) {
        if (tail) M.deco.push(ln(`M${CX + 58} ${Math.max(hemLow + 6, B.crotch + 30)}L${CX + 57} ${B.ankle - 4}M${CX - 58} ${Math.max(hemLow + 6, B.crotch + 30)}L${CX - 57} ${B.ankle - 4}`, 1.4, soft));
        M.deco.push(ln(`M${CX + ai + 2} ${B.ankle - 9}H${CX + ao - 1}M${CX - ai - 2} ${B.ankle - 9}H${CX - ao + 1}`, 1.3, soft));
      }
    }

    /* the big draped panels of an agbada, or the batwing of a boubou */
    if (D.wings) {
      const wp = D.wings === 'kimono' ? new Pen(CX + D.nw + 30, B.hps + 12).L(CX + D.sh, D.sp).C(CX + D.sh + 44, D.sp + 26, CX + 236, 430, CX + 262, 558).L(CX + 250, 704).C(CX + 222, 722, CX + 180, 718, CX + 152, 700).L(CX + 128, 540).L(CX + 96, 500).L(CX + 96, D.sp + 60) : D.wings === 'agbada'
        ? new Pen(CX + D.nw + 30, B.hps + 12).L(CX + D.sh, D.sp).C(CX + D.sh + 64, D.sp + 20, CX + 296, D.sp + 96, CX + 318, D.sp + 212).C(CX + 331, D.sp + 330, CX + 323, 720, CX + 304, 792).C(CX + 270, 814, CX + 200, 802, CX + 150, 772).L(CX + 96, 742).L(CX + 96, D.sp + 60)
        : new Pen(CX + D.nw + 30, B.hps + 12).L(CX + D.sh, D.sp).C(CX + D.sh + 56, D.sp + 18, CX + 262, 372, CX + 300, 470).L(CX + 283, 513).C(CX + 238, 540, CX + 186, 612, CX + 168, 704).L(CX + 96, 704).L(CX + 96, D.sp + 60);
      M.behind.push({ id: 'wr', d: wp.closed(), vol: 'p' }, { id: 'wl', d: wp.closed(true), vol: 'p' });
      const poly = wp.poly(10), top = Math.min(...poly.map(p => p[1])), bot = Math.max(...poly.map(p => p[1])), rows = [];
      for (let y = top + 2; y < bot; y += 8) { const r = scanAt(poly, y); if (r) rows.push([y, r[0], r[1]]); }
      M.p3.push({ id: 'wingR', type: 'rows', depth: 'panel', rows }, { id: 'wingL', type: 'rows', depth: 'panel', rows: rows.map(r => [r[0], 2 * CX - r[2], 2 * CX - r[1]]) });
      const folds = D.wings === 'kimono' ? [[250, 480, 246, 696], [214, 452, 196, 706]] : D.wings === 'agbada'
        ? [[306, 520, 300, 786], [262, 470, 262, 804], [222, 440, 214, 800], [188, 430, 172, 778]]
        : [[272, 452, 278, 506], [236, 420, 232, 540], [202, 400, 192, 610]];
      for (const side of [1, -1]) for (const [x1, y1, x2, y2] of folds) M.flatOnly.push(ln(`M${CX + side * (D.sh - 8)} ${D.sp + 12}Q${CX + side * x1} ${y1 - 60} ${CX + side * x2} ${y2}`, 1.3, soft));
      if (D.wings === 'bat') for (const side of [1, -1]) M.deco.push(ln(`M${CX + side * 128} 548L${CX + side * (D.he - 34)} ${f1(hemSideY - 8)}`, 1.3, soft, ' stroke-dasharray="7 6"'));
    }

    /* set-in sleeves */
    if (SL) {
      const { L, O, I } = SL, n = SL.puff ? 9 : 3, sp = new Pen(CX + D.sh, D.sp), o1 = O(36);
      sp.C(CX + D.sh + 12, D.sp + 3, o1[0] - SIN * 22, o1[1] - COS * 22, o1[0], o1[1]);
      for (let i = 1; i <= n; i++) { const p = O(36 + (L - 36) * i / n); sp.L(p[0], p[1]); }
      const oe = O(L), ie = I(L); sp.Q((oe[0] + ie[0]) / 2 + SIN * 7, (oe[1] + ie[1]) / 2 + COS * 7, ie[0], ie[1]);
      for (let i = n - 1; i >= 0; i--) { const p = I(10 + (L - 10) * i / n); sp.L(p[0], p[1]); }
      sp.L(CX + D.sh - 36, D.sp + 28);
      M.behind.push({ id: 'sr', d: sp.closed(), vol: 'p' }, { id: 'sl', d: sp.closed(true), vol: 'p' });
      const ws = []; for (let t = 0; t <= L + 0.01; t += L / 14) ws.push([f1(t), f1(SL.w(t))]);
      M.p3.push({ id: 'sleeveR', type: 'tube', side: 1, j: [CX + ARM.jx, ARM.jy], a: ARM.a, len: L, w: ws, puff: SL.puff }, { id: 'sleeveL', type: 'tube', side: -1, j: [CX - ARM.jx, ARM.jy], a: ARM.a, len: L, w: ws, puff: SL.puff });
      /* cuffs and sleeve hems */
      const across = (t, col = soft, w = 1.4, extra = '') => { const a = O(t), b = I(t); return [1, -1].map(m => ln(`M${f1(CX + m * (a[0] - CX))} ${f1(a[1])}L${f1(CX + m * (b[0] - CX))} ${f1(b[1])}`, w, col, extra)).join(''); };
      const band = (t0, t1, col) => { const a = O(t0), b = O(t1), c = I(t1), e = I(t0); return [1, -1].map(m => sh(`M${f1(CX + m * (a[0] - CX))} ${f1(a[1])}L${f1(CX + m * (b[0] - CX))} ${f1(b[1])}L${f1(CX + m * (c[0] - CX))} ${f1(c[1])}L${f1(CX + m * (e[0] - CX))} ${f1(e[1])}Z`, col)).join(''); };
      if (g === 'suit') {
        M.deco.push(band(L - 1, L + 8, '#F4F1EA'));
        if (!back) for (let i = 0; i < 3; i++) { const p = O(L - 16 - i * 11); M.deco.push([1, -1].map(m => `<circle cx="${f1(CX + m * (p[0] - CX - 7))}" cy="${f1(p[1] + 2)}" r="3.2" fill="${shade(fill, lite ? -0.4 : -0.55)}" stroke="${line}" stroke-width=".8"/>`).join('')); }
      } else if (g === 'shirt' && s.sleeves === 'long') {
        M.deco.push(band(L - 30, L, shade(fill, lite ? -0.05 : 0.08)));
        const p = O(L - 15); M.deco.push([1, -1].map(m => `<circle cx="${f1(CX + m * (p[0] - CX - 9))}" cy="${f1(p[1] + 3)}" r="3.4" fill="${lite ? shade(fill, -0.3) : shade(fill, 0.6)}" stroke="${line}" stroke-width=".8"/>`).join(''));
      } else if (D.rib && s.sleeves === 'long') { M.deco.push(band(L - 27, L, ribFill), across(L - 20, soft, 1), across(L - 13, soft, 1), across(L - 6, soft, 1)); }
      else if (SL.puff) M.deco.push(band(L - 16, L, shade(fill, -0.12)), across(L - 24, soft, 1.2, ' stroke-dasharray="2 5"'));
      else M.deco.push(across(L - (s.sleeves === 'long' ? 16 : 11)), s.sleeves === 'long' && g === 'kaftan' ? across(L - 22) : '');
    }

    /* neck opening and what is cut out of the cloth */
    const nk = neckKind(s); M.nk = nk;
    const nc = neckCurve(nk, D); M.neckBottom = nc.bottom;
    if (back && nk.type !== 'off') M.cuts.push(`M${CX - D.nw} ${B.hps - 60}V${B.hps}Q${CX} ${B.hps + 2 * backDip} ${CX + D.nw} ${B.hps}V${B.hps - 60}Z`);
    else if (nk.type === 'off') { M.cuts.push(`${nc.d}V0H${f1(CX - D.sh - 90)}Z`); M.cutBehind = true; }
    else M.cuts.push(`${nc.d}V${B.hps - 60}H${f1(CX - D.nw)}Z`);

    /* collars, bindings, lapels */
    const collarFill = shade(fill, lite ? -0.06 : 0.1), inside = shade(fill, -0.42);
    if (g === 'suit') suitFront();
    else if (back) {
      if (col === 'mandarin') M.deco.push(sh(`M${CX - D.nw - 3} ${B.hps - 20}Q${CX} ${B.hps - 28} ${CX + D.nw + 3} ${B.hps - 20}L${CX + D.nw} ${B.hps + 5}Q${CX} ${B.hps + 15} ${CX - D.nw} ${B.hps + 5}Z`, collarFill));
      else if (col === 'classic') M.deco.push(sh(`M${CX - D.nw - 4} ${B.hps - 22}Q${CX} ${B.hps - 31} ${CX + D.nw + 4} ${B.hps - 22}L${CX + D.nw + 12} ${B.hps + 14}Q${CX} ${B.hps + 30} ${CX - D.nw - 12} ${B.hps + 14}Z`, collarFill));
      else if (nk.type === 'off') M.deco.push(ln(nc.d, 9, shade(fill, -0.1)), ln(nc.d, 1.2, soft, ' stroke-dasharray="2 5"'));
      else M.deco.push(ln(`M${CX - D.nw} ${B.hps}Q${CX} ${B.hps + 2 * backDip} ${CX + D.nw} ${B.hps}`, 7, shade(fill, -0.1)));
    } else if (col === 'mandarin') {
      M.deco.push(`<path d="M${CX - D.nw - 3} ${B.hps - 20}Q${CX} ${B.hps - 28} ${CX + D.nw + 3} ${B.hps - 20}L${CX + D.nw} ${B.hps + 4}Q${CX} ${B.hps + 14} ${CX - D.nw} ${B.hps + 4}Z" fill="${inside}"/>`);
      for (const m of [1, -1]) M.deco.push(sh(`M${CX + m * (D.nw + 3)} ${B.hps - 20}L${CX + m * (D.nw + 5)} ${B.hps + 6}C${CX + m * (D.nw - 2)} ${B.hps + 36} ${CX + m * 24} ${B.hps + 49} ${CX + m * 4} ${B.hps + 48}L${CX + m * 4} ${B.hps + 23}C${CX + m * 22} ${B.hps + 24} ${CX + m * (D.nw - 10)} ${B.hps + 12} ${CX + m * (D.nw + 3)} ${B.hps - 20}Z`, collarFill));
    } else if (col === 'classic') {
      M.deco.push(`<path d="M${CX - D.nw - 4} ${B.hps - 22}Q${CX} ${B.hps - 30} ${CX + D.nw + 4} ${B.hps - 22}L${CX + D.nw} ${B.hps + 4}Q${CX} ${B.hps + 14} ${CX - D.nw} ${B.hps + 4}Z" fill="${inside}"/>`);
      for (const m of [1, -1]) M.deco.push(sh(`M${CX + m * (D.nw + 4)} ${B.hps - 22}L${CX + m * (D.nw + 13)} ${B.hps + 8}L${CX + m * 47} ${B.hps + 76}L${CX + m * 3} ${B.hps + 42}Q${CX + m * (D.nw - 12)} ${B.hps + 22} ${CX + m * (D.nw + 4)} ${B.hps - 22}Z`, collarFill));
    } else if (nk.type === 'off') M.deco.push(ln(nc.d, 13, shade(fill, -0.1)), ln(nc.d, 1.2, soft, ' stroke-dasharray="2 5"'));
    else M.deco.push(ln(nc.d, 8, shade(fill, -0.12)), ln(neckCurve(nk, D, 5).d, 1, soft));
    if (['mandarin', 'classic'].includes(col) || g === 'suit') M.p3.push({ id: 'collar', type: 'band', y0: B.hps - 24, y1: B.hps + 6, r: D.nw - 8, tone: g === 'suit' ? 'white' : 'main' });

    /* seams that every garment has */
    if (SL && nk.type !== 'off') M.deco.push([1, -1].map(m => ln(`M${CX + m * D.sh} ${D.sp}C${CX + m * (D.sh - 5)} ${D.sp + 46} ${CX + m * (D.ch - 13)} ${f1(D.uaY - 38)} ${CX + m * D.ch} ${f1(D.uaY)}`, 1.5, soft)).join(''));
    if (!D.jacket && !D.rib && g !== 'shirt') M.deco.push(ln(hemCurve(9), 1.2, soft, ' stroke-dasharray="5 4"'));

    if (g === 'kaftan') kaftanDetails(); else if (g === 'shirt') shirtDetails(); else if (g === 'dress') dressDetails(); else if (g === 'tee') teeDetails(); else if (g === 'hoodie') hoodieDetails(); else if (g === 'bomber') bomberDetails(); else if (g === 'kimono') kimonoDetails();
    if (s.belt && g !== 'kimono' && DETAILS_FOR[g].includes('belt')) {
      const wa = widthAt(M.prof, B.waist) + 2;
      M.deco.push(`<path d="M${f1(CX - wa)} ${B.waist - 13}Q${CX} ${B.waist - 7} ${f1(CX + wa)} ${B.waist - 13}V${B.waist + 13}Q${CX} ${B.waist + 19} ${f1(CX - wa)} ${B.waist + 13}Z" fill="${shade(acc, -0.22)}" stroke="${line}" stroke-width="1.2"/>`);
      if (!back) M.deco.push(`<rect x="${CX - 17}" y="${B.waist - 17}" width="34" height="40" rx="6" fill="none" stroke="${acc}" stroke-width="4.5"/><path d="M${CX - 4} ${B.waist + 3}H${CX + 17}" stroke="${acc}" stroke-width="3" stroke-linecap="round"/>`);
    }
    embroider();
    return M;

    /* ── garment-specific details ── */
    function ribHem(h) {
      const y0 = hemSideY - h; let d = '';
      for (let x = CX - D.hi - 12; x <= CX + D.hi + 12; x += 7) d += `M${x} ${f1(y0 + 3)}V${f1(hemLow + 6)}`;
      M.deco.push(`<g clip-path="url(#${E._id}-bc)"><rect x="${CX - D.hi - 20}" y="${f1(y0)}" width="${2 * D.hi + 40}" height="${h + 40}" fill="${ribFill}"/>${ln(d, 1, soft)}${ln(`M${CX - D.hi - 20} ${f1(y0)}H${CX + D.hi + 20}`, 1.5, line)}</g>`);
    }
    function teeDetails() {
      if (back) { M.deco.push(ln(`M${CX - D.nw + 6} ${B.hps + 17}Q${CX} ${B.hps + 27} ${CX + D.nw - 6} ${B.hps + 17}`, 1.1, soft)); return; }
      if (s.collar === 'polo') { const y0 = B.hps + 46, y1 = y0 + 92; M.deco.push(ln(`M${CX - 13} ${y0}V${y1}H${CX + 13}V${y0}`, 1.4, line)); for (let i = 0; i < 3; i++) M.deco.push(button(CX, y0 + 14 + i * 30, 4.2)); }
      if (s.pockets) M.deco.push(sh(`M${CX + 44} 376H${CX + 90}V418Q${CX + 67} 430 ${CX + 44} 418Z`, 'none'), ln(`M${CX + 44} 385H${CX + 90}`, 1, soft));
    }
    function hoodieDetails() {
      ribHem(D.rib);
      const hooded = s.collar === 'hood';
      if (back) {
        if (hooded) M.deco.push(sh(`M${CX - D.nw - 20} ${B.hps - 4}Q${CX - 92} ${B.hps + 62} ${CX - 44} ${B.hps + 124}Q${CX} ${B.hps + 148} ${CX + 44} ${B.hps + 124}Q${CX + 92} ${B.hps + 62} ${CX + D.nw + 20} ${B.hps - 4}Q${CX} ${B.hps - 44} ${CX - D.nw - 20} ${B.hps - 4}Z`, collarFill), ln(`M${CX} ${B.hps - 22}V${B.hps + 132}`, 1.2, soft));
        return;
      }
      if (hooded) {
        const y = nc.bottom, x = D.nw + 2, cord = lite ? shade(fill, -0.5) : shade(fill, 0.72);
        M.behind.push({ id: 'hd', d: `M${CX - D.nw - 22} ${B.hps + 14}C${CX - D.nw - 26} ${B.hps - 30} ${CX - 40} ${B.hps - 62} ${CX} ${B.hps - 62}C${CX + 40} ${B.hps - 62} ${CX + D.nw + 26} ${B.hps - 30} ${CX + D.nw + 22} ${B.hps + 14}Z`, vol: 'p' });
        M.p3.push({ id: 'hood', type: 'hood', nw: D.nw });
        for (const m of [1, -1]) M.deco.push(sh(`M${CX + m * x} ${B.hps - 6}C${CX + m * (x + 16)} ${B.hps + 34} ${CX + m * 34} ${f1(y + 10)} ${CX - m * 10} ${f1(y + 26)}L${CX - m * 4} ${f1(y + 6)}C${CX + m * 20} ${f1(y - 8)} ${CX + m * (x - 14)} ${B.hps + 26} ${CX + m * (x - 10)} ${B.hps - 2}Z`, collarFill));
        for (const m of [1, -1]) M.deco.push(`<circle cx="${CX + m * 20}" cy="${f1(y + 22)}" r="3.4" fill="none" stroke="${cord}" stroke-width="1.6"/>`, ln(`M${CX + m * 20} ${f1(y + 25)}q${m * 3} 34 ${-m * 2} ${78 + m * 8}`, 2.6, cord), ln(`M${CX + m * 18} ${f1(y + 103 + m * 8)}v9`, 4.2, cord));
      } else M.deco.push(ln(`M${CX - 16} ${f1(nc.bottom + 6)}L${CX} ${f1(nc.bottom + 30)}L${CX + 16} ${f1(nc.bottom + 6)}`, 1.2, soft));
      if (s.pockets) M.deco.push(sh(`M${CX - 86} 618L${CX - 70} 534Q${CX} 524 ${CX + 70} 534L${CX + 86} 618Z`, 'none'), ln(`M${CX - 84} 604L${CX - 60} 546M${CX + 84} 604L${CX + 60} 546`, 1.3, soft));
    }
    function bomberDetails() {
      if (D.rib) ribHem(D.rib); else M.deco.push(`<g clip-path="url(#${E._id}-bc)">${ln(`M${CX - D.hi - 20} ${f1(hemSideY - 26)}H${CX + D.hi + 20}`, 1.5, line)}</g>`);
      if (back) { M.deco.push(ln(`M${CX - D.sh + 10} ${D.sp + 40}Q${CX} ${D.sp + 58} ${CX + D.sh - 10} ${D.sp + 40}`, 1.3, soft)); return; }
      const y0 = col === 'classic' ? B.hps + 44 : nc.bottom - 2, y1 = hemLow + 2, zip = lite ? shade(fill, -0.5) : shade(fill, 0.55);
      M.deco.push(ln(`M${CX - 8} ${f1(y0)}V${f1(y1)}M${CX + 8} ${f1(y0)}V${f1(y1)}`, 1.2, soft));
      if (D.rib) M.deco.push(ln(`M${CX} ${f1(y0)}V${f1(y1)}`, 2.2, zip, ' stroke-dasharray="2 3"'), `<rect x="${CX - 4}" y="${f1(y0 + 6)}" width="8" height="15" rx="2.5" fill="${zip}"/>`);
      else { for (let i = 0; i < 5; i++) M.deco.push(button(CX, y0 + 20 + i * ((y1 - y0 - 44) / 4), 5)); for (const m of [1, -1]) M.deco.push(ln(`M${CX + m * 40} ${D.sp + 96}H${CX + m * 96}`, 1.4, line), sh(`M${CX + m * 44} ${D.sp + 96}H${CX + m * 92}V${D.sp + 128}L${CX + m * 68} ${D.sp + 140}L${CX + m * 44} ${D.sp + 128}Z`, 'none')); }
      if (s.pockets) for (const m of [1, -1]) M.deco.push(ln(`M${CX + m * 50} 520L${CX + m * 78} 592`, 4.5, shade(fill, lite ? -0.2 : -0.36)), ln(`M${CX + m * 45} 518L${CX + m * 73} 594`, 1, soft));
    }
    function kimonoDetails() {
      const cf = shade(fill, lite ? -0.1 : 0.13), y1 = B.waist + 6;
      if (back) M.deco.push(sh(`M${CX - D.nw - 6} ${B.hps - 10}Q${CX} ${B.hps + 4} ${CX + D.nw + 6} ${B.hps - 10}L${CX + D.nw + 2} ${B.hps + 12}Q${CX} ${B.hps + 30} ${CX - D.nw - 2} ${B.hps + 12}Z`, cf), ln(`M${CX} ${B.hps + 26}V${f1(hemSideY)}`, 1.2, soft));
      else {
        /* the right panel lies under; the left panel (on the viewer's right) crosses over it */
        M.deco.push(sh(`M${CX - D.nw - 8} ${B.hps - 6}L${CX + 30} ${y1}L${CX + 8} ${y1}L${CX - D.nw + 12} ${B.hps + 2}Z`, cf));
        M.deco.push(sh(`M${CX + D.nw + 8} ${B.hps - 6}L${CX - 44} ${y1}L${CX - 20} ${y1}L${CX + D.nw - 12} ${B.hps + 2}Z`, cf), ln(`M${CX - 32} ${y1}L${CX - 40} ${f1(hemSideY)}`, 1.4, line));
      }
      if (s.belt) {
        const wa = widthAt(M.prof, B.waist) + 2, a = shade(acc, -0.12);
        M.deco.push(`<path d="M${f1(CX - wa)} ${B.waist - 30}Q${CX} ${B.waist - 24} ${f1(CX + wa)} ${B.waist - 30}V${B.waist + 30}Q${CX} ${B.waist + 36} ${f1(CX - wa)} ${B.waist + 30}Z" fill="${a}" stroke="${line}" stroke-width="1.4"/>`, ln(`M${f1(CX - wa)} ${B.waist}Q${CX} ${B.waist + 6} ${f1(CX + wa)} ${B.waist}`, 3, shade(acc, lum(acc) > 0.6 ? -0.35 : 0.4)));
        if (back) M.deco.push(sh(`M${CX - 42} ${B.waist - 44}H${CX + 42}V${B.waist + 44}H${CX - 42}Z`, a));
      }
    }

    /* ── trousers, joggers and skirts: the garment starts at the waist ── */
    function bottom() {
      const f = D.f, top = 538, wbH = 22, wTop = 87 + f * 2, len = s.length, yb = top + wbH;
      M.SL = null; M.nk = { type: 'none', dp: 0 }; M.neckBottom = top; D.uaY = top;
      const beltOn = () => { if (!s.belt || !DETAILS_FOR[g].includes('belt')) return; const w = widthAt(M.prof, top + wbH / 2) + 2, y = top + wbH / 2; M.deco.push(`<path d="M${f1(CX - w)} ${y - 11}H${f1(CX + w)}V${y + 11}H${f1(CX - w)}Z" fill="${shade(acc, -0.22)}" stroke="${line}" stroke-width="1.4"/>`); if (!back) M.deco.push(`<rect x="${CX - 15}" y="${y - 15}" width="30" height="30" rx="5" fill="none" stroke="${acc}" stroke-width="4"/>`); };
      const pockets = o => { if (!s.pockets) return; if (back) { for (const m of [1, -1]) M.deco.push(g === 'trousers' && s.fabric !== 'denim' ? ln(`M${CX + m * 34} ${yb + 44}H${CX + m * 78}`, 2.6, line) : sh(`M${CX + m * 32} ${yb + 30}H${CX + m * 80}V${yb + 74}L${CX + m * 56} ${yb + 86}L${CX + m * 32} ${yb + 74}Z`, 'none')); return; } for (const m of [1, -1]) M.deco.push(ln(`M${f1(CX + m * (o(yb) - 3))} ${yb + 3}Q${f1(CX + m * (o(yb) - 30))} ${yb + 22} ${f1(CX + m * (o(yb + 76) - 1))} ${yb + 76}`, 1.6, line)); };
      if (g === 'skirt') {
        const hemY = HEM[HEM[len] >= HEM.knee ? len : 'midi'], hipW = 104 + f * 4, fl = f < 0 ? -0.04 : f > 0 ? 0.5 : 0.24, hh = hemY - B.hip;
        Object.assign(D, { hi: hipW, flare: fl, hemY, he: hipW + hh * fl, hemDrop: f > 0 ? 18 : 8 });
        const P = new Pen(CX + wTop, top).C(CX + wTop + 2, top + 30, CX + hipW, B.hip - 40, CX + hipW, B.hip).C(CX + hipW, B.hip + hh * 0.4, CX + D.he - (D.he - hipW) * 0.3, hemY - hh * 0.3, CX + D.he, hemY);
        M.body = `M${f1(CX + wTop)} ${top}${P.fwd()}Q${CX} ${f1(hemY + 2 * D.hemDrop)} ${f1(CX - D.he)} ${f1(hemY)}${P.rev()}Z`;
        M.prof = P.poly(12); M.hemSideY = hemY; M.hemLow = hemY + D.hemDrop;
        M.p3.push({ id: 'body', type: 'rows', depth: 'dress', rows: rowsFrom(M.prof, top, hemY), hemDrop: D.hemDrop, flare: fl, fit: f });
        const o = y => widthAt(M.prof, y);
        M.deco.push(ln(`M${f1(CX - o(yb))} ${yb}H${f1(CX + o(yb))}`, 1.6, line), ln(`M${f1(CX - D.he + 3)} ${f1(hemY - 9)}Q${CX} ${f1(hemY + 2 * D.hemDrop - 9)} ${f1(CX + D.he - 3)} ${f1(hemY - 9)}`, 1.2, soft, ' stroke-dasharray="5 4"'));
        if (f > 0) for (const k of [-0.74, -0.45, -0.15, 0.15, 0.45, 0.74]) M.deco.push(ln(`M${f1(CX + k * o(yb))} ${yb + 3}L${f1(CX + k * D.he)} ${f1(hemY + D.hemDrop * (1 - k * k) - 4)}`, 1.1, soft));
        if (back) M.deco.push(ln(`M${CX} ${yb}V${yb + 130}`, 1.5, line), ln(`M${CX - 4} ${yb + 130}h8`, 2.4, line));
        else if (s.collar === 'tie') M.deco.push(ln(`M${f1(CX + o(yb) - 14)} ${yb}Q${CX + 30} ${f1((yb + hemY) / 2)} ${f1(CX + D.he * 0.42)} ${f1(hemY + D.hemDrop * 0.8)}`, 1.7, line), ln(`M${f1(CX - o(top + 8) + 6)} ${top + 8}q-22 12 -30 44M${f1(CX - o(top + 8) + 8)} ${top + 10}q-6 22 2 50`, 4.4, shade(fill, lite ? -0.14 : 0.16)), `<circle cx="${f1(CX - o(top + 8) + 7)}" cy="${top + 9}" r="7.5" fill="${shade(fill, lite ? -0.14 : 0.16)}" stroke="${line}" stroke-width="1.2"/>`);
        pockets(o); beltOn();
        M.stitch = [[[CX - wTop, top], [CX + wTop, top]], [[CX - wTop, top], [CX - hipW, B.hip], [CX - D.he, hemY]], [[CX + wTop, top], [CX + hipW, B.hip], [CX + D.he, hemY]], [[CX - D.he, hemY], [CX, M.hemLow], [CX + D.he, hemY]]];
        return M;
      }
      const jog = g === 'joggers', hemY = jog ? ({ knee: 806, midi: 956 }[len] || 1064) : ({ knee: 800, midi: 950, full: 1096 }[len] || 1072);
      const hipW = D.hi + (jog ? 2 : 0), [oK, iK, oA, iA] = jog ? [94 + f * 8, 12 - f * 3, 79 + f * 5, 24 - f * 3] : f < 0 ? [88, 14, 80, 24] : f > 0 ? [112, 6, 124, 4] : [96, 10, 94, 12];
      const sm = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }, mix = (a, b, t) => a + (b - a) * t;
      const o = y => (y <= B.hip ? mix(wTop, hipW, sm((y - top) / (B.hip - top))) : y <= B.knee ? mix(hipW, oK, sm((y - B.hip) / (B.knee - B.hip))) : mix(oK, oA, clamp((y - B.knee) / (B.ankle - B.knee), 0, 1.1)));
      const inn = y => (y <= B.crotch ? 3 : y <= B.knee ? mix(3, iK, Math.pow((y - B.crotch) / (B.knee - B.crotch), 0.6)) : mix(iK, iA, clamp((y - B.knee) / (B.ankle - B.knee), 0, 1.1)));
      const ys = []; for (let y = top; y < hemY; y += 10) ys.push(y); ys.push(hemY);
      const R = ys.map(y => [CX + o(y), y]), I = ys.filter(y => y > B.crotch).map(y => [CX + inn(y), y]).reverse(), mir = a => a.map(([x, y]) => [2 * CX - x, y]);
      const path = pts => pts.map(([x, y]) => `L${f1(x)} ${f1(y)}`).join('');
      M.body = `M${f1(CX + wTop)} ${top}${path(R.slice(1))}${path(I)}L${CX} ${B.crotch}${path(mir(I).reverse())}${path(mir(R).reverse())}Z`;
      Object.assign(D, { hi: hipW, he: o(hemY), hemY, legs: 'own' }); M.prof = R; M.hemSideY = hemY; M.hemLow = hemY;
      const w2 = y => f1(o(y));
      M.p3.push({ id: 'pelvis', type: 'rows', depth: 'round', fork: true, rows: [top, top + 5, top + 34, B.crotch - 60, B.crotch - 40, B.crotch - 22, B.crotch - 8, B.crotch + 8].map(y => [y, f1(CX - o(y)), f1(CX + o(y))]) });
      const rows = []; for (let y = B.crotch - 24; y < hemY; y += 8) rows.push([y, f1(CX + inn(y)), f1(CX + o(y))]); rows.push([hemY, f1(CX + inn(hemY)), f1(CX + o(hemY))]);
      M.p3.push({ id: 'legR', type: 'rows', depth: 'leg', rows }, { id: 'legL', type: 'rows', depth: 'leg', rows: rows.map(r => [r[0], f1(2 * CX - r[2]), f1(2 * CX - r[1])]) });
      /* details */
      M.deco.push(ln(`M${f1(CX - o(yb))} ${yb}H${f1(CX + o(yb))}`, 1.6, line));
      const cuffed = jog && hemY > 900;
      if (cuffed) for (const m of [1, -1]) { const y0 = hemY - 26; let d = ''; for (let x = inn(hemY) + 4; x < o(hemY) - 2; x += 7) d += `M${f1(CX + m * x)} ${y0 + 3}V${hemY - 2}`; M.deco.push(`<path d="M${f1(CX + m * o(y0))} ${y0}L${f1(CX + m * o(hemY))} ${hemY}H${f1(CX + m * inn(hemY))}L${f1(CX + m * inn(y0))} ${y0}Z" fill="${ribFill}" stroke="${line}" stroke-width="1.3"/>`, ln(d, 1, soft)); }
      else for (const m of [1, -1]) M.deco.push(ln(`M${f1(CX + m * (inn(hemY - 10) + 2))} ${hemY - 10}H${f1(CX + m * (o(hemY - 10) - 2))}`, 1.2, soft, ' stroke-dasharray="5 4"'));
      if (back) M.deco.push(ln(`M${CX} ${yb}V${B.crotch - 6}`, 1.4, soft));
      else if (jog) {
        const cord = lite ? shade(fill, -0.5) : shade(fill, 0.72);
        if (s.collar === 'drawstring') M.deco.push(`<circle cx="${CX - 9}" cy="${top + 11}" r="2.6" fill="none" stroke="${cord}" stroke-width="1.4"/><circle cx="${CX + 9}" cy="${top + 11}" r="2.6" fill="none" stroke="${cord}" stroke-width="1.4"/>`, ln(`M${CX - 9} ${top + 13}q-5 30 -11 52M${CX + 9} ${top + 13}q4 26 9 44`, 2.4, cord));
        let d = ''; for (let x = -o(top + 4) + 8; x < o(top + 4) - 6; x += 9) d += `M${f1(CX + x)} ${top + 4}v${wbH - 8}`; M.deco.push(ln(d, 1, soft));
      } else {
        M.deco.push(ln(`M${CX} ${yb}V${yb + 62}q-1 16 -15 20`, 1.4, soft), button(CX, top + wbH / 2, 4.4));
        for (const x of [34, 74]) for (const m of [1, -1]) M.deco.push(`<rect x="${CX + m * x - 3}" y="${top - 2}" width="6" height="${wbH + 4}" rx="1.5" fill="${shade(fill, lite ? -0.1 : 0.12)}" stroke="${line}" stroke-width=".9"/>`);
        if (s.collar === 'pleated') for (const m of [1, -1]) M.deco.push(ln(`M${CX + m * 30} ${yb + 2}v62M${CX + m * 48} ${yb + 2}v46`, 1.2, soft));
        if (hemY > 900) for (const m of [1, -1]) M.deco.push(ln(`M${f1(CX + m * (o(B.crotch + 40) + inn(B.crotch + 40)) / 2)} ${B.crotch + 40}L${f1(CX + m * (o(hemY) + inn(hemY)) / 2)} ${hemY - 6}`, 1.2, soft));
      }
      if (jog && s.accent && s.pattern === 'stripe') for (const m of [1, -1]) M.deco.push(ln(`M${f1(CX + m * (o(yb) - 7))} ${yb}L${f1(CX + m * (o(hemY - 30) - 7))} ${hemY - 30}`, 5, acc));
      pockets(o); beltOn();
      M.stitch = [[[CX - wTop, top], [CX + wTop, top]], [[CX - wTop, top], [CX - hipW, B.hip], [CX - w2(hemY), hemY]], [[CX + wTop, top], [CX + hipW, B.hip], [CX + +w2(hemY), hemY]], [[CX - 3, B.crotch], [CX - inn(hemY), hemY]], [[CX + 3, B.crotch], [CX + inn(hemY), hemY]]];
      return M;
    }
    function kaftanDetails() {
      if (back) { M.deco.push(ln(`M${CX - D.sh + 10} ${D.sp + 34}Q${CX} ${D.sp + 50} ${CX + D.sh - 10} ${D.sp + 34}`, 1.3, soft)); if (D.slit) slits(); return; }
      if (nk.type !== 'v') {
        const y0 = nc.bottom - 2, y1 = y0 + 168, hw = 15;
        M.placket = { y0, y1, hw };
        M.deco.push(ln(`M${CX - hw} ${f1(y0 + 4)}V${f1(y1)}H${CX + hw}V${f1(y0 + 4)}`, 1.5, line), ln(`M${CX - hw} ${f1(y1 - 20)}H${CX + hw}M${CX - hw} ${f1(y1 - 20)}L${CX + hw} ${f1(y1)}M${CX + hw} ${f1(y1 - 20)}L${CX - hw} ${f1(y1)}`, 1, soft));
        if (s.buttons) for (let i = 0; i < 4; i++) M.deco.push(button(CX, y0 + 22 + i * 36, 5));
      }
      if (s.pockets) M.deco.push(sh(`M${CX + 46} 372H${CX + 96}V416L${CX + 71} 430L${CX + 46} 416Z`, 'none'), ln(`M${CX + 46} 381H${CX + 96}`, 1, soft));
      if (D.slit) slits();
    }
    function slits() { for (const m of [1, -1]) M.deco.push(ln(`M${f1(CX + m * (widthAt(M.prof, hemSideY - 120) - 1))} ${f1(hemSideY - 120)}L${f1(CX + m * (D.he - 9))} ${f1(hemSideY + 1)}`, 1.6, line), ln(`M${f1(CX + m * (widthAt(M.prof, hemSideY - 120) - 8))} ${f1(hemSideY - 120)}h${m * 9}`, 2.4, line)); }
    function shirtDetails() {
      M.deco.push(`<g clip-path="url(#${E._id}-bc)">${ln(`M${f1(CX - D.he)} ${f1(hemSideY - 9)}Q${CX} ${f1(hemSideY + 2 * D.hemDrop - 9)} ${f1(CX + D.he)} ${f1(hemSideY - 9)}`, 1.2, soft, ' stroke-dasharray="5 4"')}</g>`);
      if (back) { M.deco.push(ln(`M${CX - D.sh + 8} ${D.sp + 30}Q${CX} ${D.sp + 46} ${CX + D.sh - 8} ${D.sp + 30}`, 1.4, soft), ln(`M${CX - 9} ${D.sp + 40}V${D.sp + 130}M${CX + 9} ${D.sp + 40}V${D.sp + 130}`, 1.1, soft)); return; }
      const y0 = s.collar === 'classic' || s.collar === 'mandarin' ? B.hps + 44 : nc.bottom, y1 = hemLow - 4;
      M.deco.push(ln(`M${CX - 12} ${f1(y0)}V${f1(y1)}M${CX + 12} ${f1(y0)}V${f1(y1)}`, 1.3, soft));
      const n = 6; for (let i = 0; i < n; i++) M.deco.push(button(CX, y0 + 22 + i * ((y1 - y0 - 50) / (n - 1)), 4.6));
      if (s.pockets) M.deco.push(sh(`M${CX + 46} 380H${CX + 94}V424L${CX + 70} 436L${CX + 46} 424Z`, 'none'), ln(`M${CX + 46} 389H${CX + 94}`, 1, soft));
    }
    function dressDetails() {
      const wa = widthAt(M.prof, B.waist);
      if (D.f >= 0) M.deco.push(ln(`M${f1(CX - wa)} ${B.waist}Q${CX} ${B.waist + 9} ${f1(CX + wa)} ${B.waist}`, 1.5, soft));
      if (back) { M.deco.push(ln(`M${CX} ${B.hps + 2 * backDip - 2}V${B.hip}`, 1.5, line), ln(`M${CX - 4} ${B.hip - 2}h8`, 2.4, line)); return; }
      if (D.f <= 0) for (const m of [1, -1]) M.deco.push(ln(`M${CX + m * 44} ${B.waist - 4}Q${CX + m * 48} ${B.waist - 70} ${CX + m * 50} ${B.bust + 34}`, 1.2, soft));
      if (s.collar === 'mandarin') { /* qipao: the front closes on a diagonal from the collar to the underarm, with knot buttons, and a slit at the hem */
        const x1 = -widthAt(M.prof, D.uaY + 8) + 3, y0 = B.hps + 46, knot = (x, y) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="4.2" fill="${acc}" stroke="${line}" stroke-width=".8"/>` + ln(`M${f1(x - 13)} ${f1(y + 4)}L${f1(x + 13)} ${f1(y - 4)}`, 2.2, acc);
        M.deco.push(ln(`M${CX} ${y0}C${CX - 30} ${y0 + 26} ${f1(CX + x1 + 40)} ${f1(D.uaY - 40)} ${f1(CX + x1)} ${f1(D.uaY + 8)}`, 1.7, line), knot(CX - 3, y0 + 3), knot(CX - 46, y0 + 40), knot(CX + x1 + 16, D.uaY - 6));
        if (D.f < 0 && hemSideY >= HEM.knee) { const m = -1; M.deco.push(ln(`M${f1(CX + m * (widthAt(M.prof, hemSideY - 150) - 1))} ${f1(hemSideY - 150)}L${f1(CX + m * (D.he - 9))} ${f1(hemSideY + 1)}`, 1.6, line)); }
      }
      if (s.buttons && nk.type !== 'off') { const y0 = nc.bottom + 16; M.deco.push(ln(`M${CX} ${f1(nc.bottom + 4)}V${B.waist - 4}`, 1.3, soft)); for (let y = y0; y < B.waist - 12; y += 34) M.deco.push(button(CX, y, 5)); }
      if (s.pockets) for (const m of [1, -1]) { const x = widthAt(M.prof, B.hip - 50); M.deco.push(ln(`M${f1(CX + m * (x - 2))} ${B.hip - 52}Q${f1(CX + m * (x - 34))} ${B.hip - 34} ${f1(CX + m * (x - 30))} ${B.hip + 26}`, 1.6, line)); }
    }
    function button(x, y, r) { return `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${lite ? shade(fill, -0.32) : shade(fill, 0.62)}" stroke="${line}" stroke-width=".9"/><circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r * 0.28)}" fill="${lite ? shade(fill, -0.6) : shade(fill, 0.2)}"/>`; }
    function suitFront() {
      const st = 522, hemY = hemSideY;
      if (back) {
        M.deco.push(sh(`M${CX - D.nw - 4} ${B.hps - 14}Q${CX} ${B.hps - 22} ${CX + D.nw + 4} ${B.hps - 14}L${CX + D.nw + 14} ${B.hps + 18}Q${CX} ${B.hps + 34} ${CX - D.nw - 14} ${B.hps + 18}Z`, shade(fill, -0.12)));
        M.deco.push(ln(`M${CX} ${B.hps + 32}V${hemY - 96}`, 1.4, soft), ln(`M${CX} ${hemY - 96}L${CX + 3} ${hemY + 4}`, 1.8, line));
        return;
      }
      /* shirt, tie, shirt collar inside the opening */
      M.deco.push(`<path d="M${CX - D.nw - 8} ${B.hps - 2}L${CX} ${st + 4}L${CX + D.nw + 8} ${B.hps - 2}Q${CX} ${B.hps + 30} ${CX - D.nw - 8} ${B.hps - 2}Z" fill="#F4F1EA"/>`);
      M.deco.push(`<path d="M${CX - 9} ${B.hps + 40}H${CX + 9}L${CX + 6} ${B.hps + 60}H${CX - 6}Z" fill="${shade(acc, -0.1)}"/><path d="M${CX - 6} ${B.hps + 60}H${CX + 6}L${CX + 15} ${st - 44}L${CX} ${st - 12}L${CX - 15} ${st - 44}Z" fill="${acc}"/>`);
      for (const m of [1, -1]) M.deco.push(`<path d="M${CX + m * (D.nw + 2)} ${B.hps - 18}L${CX + m * (D.nw + 8)} ${B.hps + 6}L${CX + m * 34} ${B.hps + 58}L${CX + m * 3} ${B.hps + 38}Q${CX + m * (D.nw - 14)} ${B.hps + 16} ${CX + m * (D.nw + 2)} ${B.hps - 18}Z" fill="#FBFAF6" stroke="rgba(0,0,0,.22)" stroke-width="1.2" stroke-linejoin="round"/>`);
      /* lapels */
      const lap = shade(fill, lite ? -0.08 : 0.07);
      for (const m of [1, -1]) {
        M.deco.push(s.collar === 'shawl'
          ? sh(`M${CX + m * (D.nw + 4)} ${B.hps - 10}C${CX + m * (D.nw + 50)} ${B.hps + 60} ${CX + m * 78} 410 ${CX + m * 5} ${st}L${CX + m * (D.nw - 2)} ${B.hps + 2}Z`, s.fabric === 'velvet' ? shade(fill, 0.14) : lap)
          : sh(`M${CX + m * (D.nw + 4)} ${B.hps - 10}L${CX + m * (D.nw + 38)} ${B.hps + 62}L${CX + m * (D.nw + 20)} ${B.hps + 78}L${CX + m * (D.nw + 50)} ${B.hps + 108}Q${CX + m * 58} 430 ${CX + m * 5} ${st}L${CX + m * (D.nw - 2)} ${B.hps + 2}Z`, lap));
      }
      /* front edge, cutaway, buttons, pockets */
      M.cuts.push(`M${CX} ${hemY - 52}Q${CX - 14} ${hemY - 2} ${CX - 60} ${hemY + 14}H${CX + 60}Q${CX + 14} ${hemY - 2} ${CX} ${hemY - 52}Z`);
      M.deco.push(ln(`M${CX + 5} ${st}L${CX + 2} ${hemY - 52}`, 1.6, line), ln(`M${CX - 46} ${B.waist - 30}Q${CX - 52} ${B.waist + 60} ${CX - 50} ${hemY - 30}M${CX + 46} ${B.waist - 30}Q${CX + 52} ${B.waist + 60} ${CX + 50} ${hemY - 30}`, 1.1, soft));
      M.deco.push(button(CX + 3, st + 6, 6.5), button(CX + 3, st + 52, 6.5));
      M.deco.push(ln(`M${CX + 52} 390L${CX + 96} 386`, 2.2, line), `<path d="M${CX + 56} 388L${CX + 62} 374L${CX + 72} 384L${CX + 80} 372L${CX + 90} 386Z" fill="${acc}" opacity=".95"/>`);
      if (s.pockets) for (const m of [1, -1]) M.deco.push(sh(`M${CX + m * 46} 602H${CX + m * 104}V620Q${CX + m * 75} 626 ${CX + m * 46} 620Z`, lap));
    }

    /* ── embroidery ── */
    function embroider() {
      const e = s.embroidery; if (e === 'none') return;
      const d = s.density, out = M.emb;
      const st = (p, w = 2.4, o = 1, extra = '') => out.push(`<path d="${p}" fill="none" stroke="${acc}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"${o < 1 ? ` opacity="${o}"` : ''}${extra}/>`);
      const spiral = (cx, cy, r, turns = 2.6) => { let p = ''; const n = Math.round(turns * 22); for (let i = 0; i <= n; i++) { const a = i / n * turns * Math.PI * 2, rr = r * i / n; p += `${i ? 'L' : 'M'}${f1(cx + Math.cos(a) * rr)} ${f1(cy + Math.sin(a) * rr)}`; } return p; };
      if (!back && g !== 'suit') {
        const rings = (g === 'agbada' ? 2 : 1) + d;
        for (let i = 0; i < rings; i++) st(neckCurve(nk, D, 11 + i * 8).d, i === 0 ? 3.2 : 2.1, 1 - i * 0.1);
        st(neckCurve(nk, D, 11 + rings * 8 + 3).d, 3.6, 0.9, ' stroke-dasharray="0.1 8.5"');
        if (e !== 'neck') {
          const top = neckCurve(nk, D, 11 + rings * 8).bottom + 8;
          if (g === 'agbada') {
            const L1 = 150 + 44 * d, L2 = 96 + 34 * d;
            st(`M${CX - 24} ${f1(top - 6)}L${CX} ${f1(top + L1)}L${CX + 24} ${f1(top - 6)}`, 2.8);
            st(`M${CX - 12} ${f1(top + 4)}L${CX} ${f1(top + L1 - 34)}L${CX + 12} ${f1(top + 4)}`, 1.6, 0.8);
            for (const m of [1, -1]) { st(`M${CX + m * 34} ${f1(top - 14)}L${CX + m * 60} ${f1(top + L2)}L${CX + m * 84} ${f1(top - 30)}`, 2.4); st(`M${CX + m * 50} ${f1(top - 10)}L${CX + m * 60} ${f1(top + L2 - 30)}L${CX + m * 70} ${f1(top - 18)}`, 1.4, 0.75); }
            const rx = CX + 104, ry = top + 96, rr = 26 + 4 * d;
            st(spiral(rx, ry, rr), 2.2); st(`M${rx + rr + 7} ${f1(ry)}A${rr + 7} ${rr + 7} 0 1 1 ${rx + rr + 7} ${f1(ry - 0.1)}`, 2, 0.9); st(`M${rx + rr + 14} ${f1(ry)}A${rr + 14} ${rr + 14} 0 1 1 ${rx + rr + 14} ${f1(ry - 0.1)}`, 3.2, 0.85, ' stroke-dasharray="0.1 8"');
            if (d === 3) { const lx = CX - 104; st(spiral(lx, ry, rr - 6), 2, 0.9); st(`M${lx + rr + 1} ${f1(ry)}A${rr + 1} ${rr + 1} 0 1 1 ${lx + rr + 1} ${f1(ry - 0.1)}`, 1.8, 0.85); }
          } else if (nk.type === 'v') {
            const k0 = 11 + rings * 8 + 10;
            for (let i = 0; i < d; i++) st(neckCurve(nk, D, k0 + i * 9).d, 2, 0.85 - i * 0.12);
            const py = neckCurve(nk, D, k0 + d * 9).bottom + 6, ph = 26 + 10 * d, pw = 11 + 3 * d;
            st(`M${CX} ${f1(py)}L${CX + pw} ${f1(py + ph / 2)}L${CX} ${f1(py + ph)}L${CX - pw} ${f1(py + ph / 2)}Z`, 2.4);
            st(`M${CX} ${f1(py + 8)}L${CX + pw - 6} ${f1(py + ph / 2)}L${CX} ${f1(py + ph - 8)}L${CX - pw + 6} ${f1(py + ph / 2)}Z`, 1.5, 0.8);
            if (d >= 2) for (const m of [1, -1]) st(spiral(CX + m * (pw + 16), py + ph / 2, 8, 1.6), 1.5, 0.85);
          } else if (nk.type !== 'off') {
            const pl = M.placket, y0 = pl ? pl.y0 + 6 : top, hw = 15 + 5 * d, y1 = Math.min(pl ? pl.y1 + 8 + 10 * d : y0 + 104 + 44 * d, B.waist + 40);
            st(`M${CX - hw} ${f1(y0)}V${f1(y1 - hw)}L${CX} ${f1(y1)}L${CX + hw} ${f1(y1 - hw)}V${f1(y0)}`, 2.6);
            if (!pl) st(`M${CX - hw} ${f1(y0)}H${CX + hw}`, 2.6);
            if (!(pl && s.buttons)) for (let y = y0 + 18; y < y1 - hw - 6; y += 24) st(`M${CX} ${f1(y - 9)}L${CX + hw - 7} ${f1(y)}L${CX} ${f1(y + 9)}L${CX - hw + 7} ${f1(y)}Z`, 1.6, 0.9);
            for (let i = 1; i <= d; i++) for (const m of [1, -1]) { const x = CX + m * (hw + 8 * i), ya = y0 + 8 * i, yb = y1 - hw - 16 * i; if (yb > ya + 20) st(`M${x} ${f1(yb)}V${f1(ya)}q${m * 2} -13 ${m * 13} -9`, 1.7, 0.85 - i * 0.12); }
            if (d >= 2) for (const m of [1, -1]) st(spiral(CX + m * (hw + 8 * d + 22), y0 + 16, 9, 1.6), 1.6, 0.85);
          }
        }
      }
      if (e === 'chest-hem' || e === 'full') {
        const o1 = 22, o2 = o1 + 16 + 5 * d;
        st(hemCurve(o1), 2.8); st(hemCurve(o2), 2.2, 0.85);
        let z = ''; const x0 = CX - D.he + 16, x1 = CX + D.he - 16, n = Math.max(6, Math.round((x1 - x0) / 20));
        for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; z += `${i ? 'L' : 'M'}${f1(x)} ${f1(hemYAt(x, i % 2 ? o1 + 5 : o2 - 5))}`; }
        st(z, 1.7, 0.85);
        if (d === 3) st(hemCurve(o2 + 9), 3.2, 0.8, ' stroke-dasharray="0.1 9"');
      }
      if (e === 'full' && SL) {
        const { L, O, I } = SL;
        for (const [t, w, o, x] of [[L - 12, 2.6, 1, ''], [L - 26 - 4 * d, 2, 0.85, ''], [L - 19 - 2 * d, 3, 0.85, ' stroke-dasharray="0.1 7.5"']]) { const a = O(t), b = I(t); for (const m of [1, -1]) st(`M${f1(CX + m * (a[0] - CX))} ${f1(a[1])}L${f1(CX + m * (b[0] - CX))} ${f1(b[1])}`, w, o, x); }
      }
    }
  }
  function rowsFrom(prof, y0, y1, step = 6) { const rows = []; for (let y = y0; y < y1; y += step) { const a = widthAt(prof, y); rows.push([y, f1(CX - a), f1(CX + a)]); } const a = widthAt(prof, y1); rows.push([y1, f1(CX - a), f1(CX + a)]); return rows; }

  /* ───────── cloth patterns (also used as the 3D fabric tile) ───────── */
  function patternDef(s, fill, acc) {
    const lite = lum(fill) > 0.6, ink = lite ? 'rgba(0,0,0,.15)' : 'rgba(255,255,255,.15)', ink2 = lite ? 'rgba(0,0,0,.075)' : 'rgba(255,255,255,.075)';
    switch (s.pattern === 'plain' ? s.fabric : s.pattern) {
      case 'ankara': return { w: 72, h: 72, body: `<circle cx="36" cy="36" r="19" fill="none" stroke="${ink}" stroke-width="5"/><circle cx="36" cy="36" r="10" fill="none" stroke="${ink2}" stroke-width="3"/><circle cx="36" cy="36" r="5.5" fill="${acc}" opacity=".6"/><path d="M0 36h11M61 36h11M36 0v11M36 61v11" stroke="${ink2}" stroke-width="4"/><circle cx="0" cy="0" r="8" fill="${ink2}"/><circle cx="72" cy="72" r="8" fill="${ink2}"/><circle cx="72" cy="0" r="8" fill="${ink2}"/><circle cx="0" cy="72" r="8" fill="${ink2}"/><circle cx="0" cy="0" r="3" fill="${acc}" opacity=".45"/><circle cx="72" cy="72" r="3" fill="${acc}" opacity=".45"/><circle cx="72" cy="0" r="3" fill="${acc}" opacity=".45"/><circle cx="0" cy="72" r="3" fill="${acc}" opacity=".45"/>` };
      case 'stripe': case 'aso-oke': return { w: 40, h: 34, body: `<rect width="40" height="6" fill="${ink}"/><rect y="14" width="40" height="2" fill="${acc}" opacity=".5"/><rect y="22" width="40" height="3" fill="${ink2}"/>` };
      case 'lace': return { w: 26, h: 26, body: `<circle cx="13" cy="13" r="7" fill="none" stroke="${ink}" stroke-width="1.6"/><circle cx="13" cy="13" r="2" fill="${ink2}"/><circle cx="0" cy="0" r="3" fill="${ink2}"/><circle cx="26" cy="26" r="3" fill="${ink2}"/><circle cx="26" cy="0" r="3" fill="${ink2}"/><circle cx="0" cy="26" r="3" fill="${ink2}"/>` };
      case 'wool': return { w: 12, h: 12, body: `<path d="M-3 3L3 -3M0 12L12 0M9 15L15 9" stroke="${ink2}" stroke-width="2.2"/>` };
      case 'jersey': return { w: 5, h: 8, body: `<rect width="1" height="8" fill="${ink2}"/><rect x="2.5" y="0" width=".8" height="8" fill="${ink2}" opacity=".5"/>` };
      case 'denim': return { w: 8, h: 8, body: `<path d="M-2 2L2 -2M0 8L8 0M6 10L10 6" stroke="${ink}" stroke-width="1.5"/><path d="M-2 6L6 -2M2 10L10 2" stroke="${ink2}" stroke-width="1"/>` };
      case 'linen': case 'cotton': return { w: 6, h: 6, body: `<rect width="6" height="1" fill="${ink2}"/><rect width="1" height="6" fill="${ink2}"/>` };
      case 'brocade': return { w: 60, h: 60, body: `<path d="M30 6Q44 30 30 54Q16 30 30 6Z" fill="none" stroke="${acc}" stroke-width="1.6" opacity=".5"/><path d="M6 30Q30 44 54 30Q30 16 6 30Z" fill="none" stroke="${ink}" stroke-width="1.4"/><circle cx="0" cy="0" r="4" fill="${ink2}"/><circle cx="60" cy="60" r="4" fill="${ink2}"/><circle cx="60" cy="0" r="4" fill="${ink2}"/><circle cx="0" cy="60" r="4" fill="${ink2}"/>` };
      case 'kente': return { w: 48, h: 48, body: `<rect width="24" height="10" fill="${acc}" opacity=".55"/><rect x="24" y="24" width="24" height="10" fill="${acc}" opacity=".55"/><rect y="12" width="24" height="4" fill="${ink}"/><rect x="24" y="36" width="24" height="4" fill="${ink}"/><rect x="24" width="4" height="24" fill="${ink2}"/><rect y="24" width="4" height="24" fill="${ink2}"/><rect x="34" y="4" width="10" height="10" fill="${ink}"/><rect x="8" y="30" width="10" height="10" fill="${ink}"/>` };
      case 'adire': { const a2 = lite ? 'rgba(20,30,80,.3)' : 'rgba(255,255,255,.42)'; return { w: 64, h: 64, body: `<circle cx="32" cy="32" r="22" fill="none" stroke="${a2}" stroke-width="3" stroke-dasharray="2 5"/><circle cx="32" cy="32" r="13" fill="none" stroke="${a2}" stroke-width="3" stroke-dasharray="2 4"/><circle cx="32" cy="32" r="4" fill="${a2}"/>${[[0, 0], [64, 0], [0, 64], [64, 64]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="${a2}" stroke-width="3" stroke-dasharray="2 4"/>`).join('')}` }; }
      case 'check': return { w: 36, h: 36, body: `<rect width="36" height="12" fill="${ink2}"/><rect width="12" height="36" fill="${ink2}"/><rect width="12" height="12" fill="${ink}"/><rect y="24" width="36" height="1.5" fill="${acc}" opacity=".5"/>` };
      case 'floral': { const pet = (n, rx, ry, off, col) => Array.from({ length: n }, (_, i) => `<ellipse rx="${rx}" ry="${ry}" transform="rotate(${i * 360 / n}) translate(0 ${-off})" fill="${col}"/>`).join(''); return { w: 56, h: 56, body: `<g transform="translate(28 28)"><circle r="4" fill="${acc}" opacity=".8"/>${pet(5, 5, 10, 11, ink)}</g>${[[0, 0], [56, 0], [0, 56], [56, 56]].map(([x, y]) => `<g transform="translate(${x} ${y}) scale(.6)">${pet(4, 5, 9, 10, ink2)}</g>`).join('')}` }; }
      default: return { w: 8, h: 8, body: '' };
    }
  }
  /** Seamless tile of the cloth: { svg, w, h, plain }. The 3D viewer repeats it across the garment. */
  E.tile = spec => { const s = E.normalize(spec), fill = hex(s.color), acc = hex(s.accent, ACCENTS), p = patternDef(s, fill, acc); return { w: p.w, h: p.h, plain: !p.body, color: fill, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${p.w} ${p.h}" width="${p.w * 4}" height="${p.h * 4}"><rect width="${p.w}" height="${p.h}" fill="${fill}"/>${p.body}</svg>` }; };

  /* ───────── sketch layer ─────────
     Strokes drawn by the user's finger in the 720×1150 frame: {c: colour, w: width, p: [x,y,x,y,…], m: mirror}. */
  E.strokePath = p => {
    if (p.length < 4) return p.length >= 2 ? `M${p[0]} ${p[1]}l0.1 0` : '';
    let d = `M${p[0]} ${p[1]}`;
    for (let i = 2; i < p.length - 2; i += 2) d += `Q${p[i]} ${p[i + 1]} ${(p[i] + p[i + 2]) / 2} ${(p[i + 1] + p[i + 3]) / 2}`;
    return d + `L${p[p.length - 2]} ${p[p.length - 1]}`;
  };
  const mirrorPts = p => p.map((v, i) => (i % 2 ? v : W - v));
  E.sketchPaths = strokes => cleanSketch(strokes).map(k => { const one = pts => `<path d="${E.strokePath(pts)}" fill="none" stroke="${k.c}" stroke-width="${k.w}" stroke-linecap="round" stroke-linejoin="round"/>`; return one(k.p) + (k.m ? one(mirrorPts(k.p)) : ''); }).join('');
  E.simplify = (p, min = 3) => { const out = [Math.round(p[0]), Math.round(p[1])]; for (let i = 2; i < p.length; i += 2) { const dx = p[i] - out[out.length - 2], dy = p[i + 1] - out[out.length - 1]; if (dx * dx + dy * dy >= min * min) out.push(Math.round(p[i]), Math.round(p[i + 1])); } if (out.length === 2 && p.length > 2) out.push(Math.round(p[p.length - 2]), Math.round(p[p.length - 1])); return out; };

  /* ───────── flat view ─────────
     opt: id (namespace for defs), view ('front'|'back'), bg (false = transparent, for try-on), viewBox (crop for tiles),
     sketch (false hides the sketch layer), live (true adds an empty <g class="live"> for drawing into) */
  E._id = 'ft';
  E.render = (spec, opt = {}) => {
    const id = (E._id = String(opt.id || 'ft').replace(/[^a-zA-Z0-9_-]/g, '') || 'ft');
    const view = opt.view === 'back' ? 'back' : 'front', bgOn = opt.bg !== false;
    const M = build(spec, view), { s, D, fill, acc, line } = M, pat = patternDef(s, fill, acc);
    const sheen = ['silk', 'velvet', 'chiffon'].includes(s.fabric);
    const parts = [...M.under, ...M.behind];
    const use = (pid, f, extra = '') => `<use href="#${id}-${pid}" fill="${f}"${extra}/>`;
    const dress = (pid, vol) => use(pid, `url(#${id}-g)`, ` stroke="${line}" stroke-width="1.8" stroke-linejoin="round"`) + (pat.body ? use(pid, `url(#${id}-fab)`, ' opacity=".94"') : '') + use(pid, `url(#${id}-${vol})`);
    const aMax = Math.max(D.he, D.hi, D.sh) + 6;
    const defs = `<defs>
<linearGradient id="${id}-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(fill, sheen ? 0.2 : 0.09)}"/><stop offset=".5" stop-color="${fill}"/><stop offset="1" stop-color="${shade(fill, -0.24)}"/></linearGradient>
<linearGradient id="${id}-vb" gradientUnits="userSpaceOnUse" x1="${CX - aMax}" y1="0" x2="${CX + aMax}" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".34"/><stop offset=".16" stop-color="#000" stop-opacity=".1"/><stop offset=".42" stop-color="#fff" stop-opacity="${sheen ? 0.1 : 0.05}"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset=".86" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".36"/></linearGradient>
<linearGradient id="${id}-vp"><stop offset="0" stop-color="#000" stop-opacity=".3"/><stop offset=".3" stop-color="#000" stop-opacity=".04"/><stop offset=".55" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
<linearGradient id="${id}-fold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#000" stop-opacity=".2"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
<linearGradient id="${id}-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101A3A"/><stop offset="1" stop-color="#0A1128"/></linearGradient>
<radialGradient id="${id}-floor"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<pattern id="${id}-fab" width="${pat.w}" height="${pat.h}" patternUnits="userSpaceOnUse">${pat.body}</pattern>
<path id="${id}-b" d="${M.body}"/>${parts.map(p => `<path id="${id}-${p.id}" d="${p.d}"/>`).join('')}
<mask id="${id}-cut" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>${M.cuts.map(c => `<path d="${c}" fill="#000"/>`).join('')}</mask>
<clipPath id="${id}-bc"><use href="#${id}-b"/></clipPath>
<clipPath id="${id}-nk"><rect width="${W}" height="${B.hps + 250}"/></clipPath>
<clipPath id="${id}-all"><use href="#${id}-b"/>${parts.map(p => `<use href="#${id}-${p.id}"/>`).join('')}</clipPath>
</defs>`;
    const hh = M.hemSideY - B.hip, foldXs = D.flare > 0.2 ? [-0.72, -0.4, -0.08, 0.3, 0.62] : D.wings ? [-0.6, -0.2, 0.25, 0.62] : D.jacket || s.garment === 'shirt' ? [] : [-0.45, 0.4];
    const folds = hh > 60 ? foldXs.map(k => `<rect x="${f1(CX + k * D.he - 20)}" y="${B.hip - 30}" width="40" height="${f1(hh + 80)}" fill="url(#${id}-fold)" opacity=".6" transform="skewX(${f1(-k * D.flare * 26)})" style="transform-origin:${f1(CX + k * D.he)}px ${B.hip}px"/>`).join('') : '';
    const floorY = (D.legs || M.hemLow > B.ankle - 40 ? Math.max(M.hemLow, B.ankle) : M.hemLow) + 30;
    const showSketch = opt.sketch !== false && view === 'front' && s.sketch.length;
    const clipAttr = s.sketchClip === false ? '' : ` clip-path="url(#${id}-all)"`;
    const title = (E.title ? E.title(s) : s.garment).replace(/[<>&"]/g, '');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${opt.viewBox || `0 0 ${W} ${H}`}" role="img" aria-label="${title}" data-view="${view}">${defs}
${bgOn ? `<rect width="${W}" height="${H}" fill="url(#${id}-bg)"/><ellipse cx="${CX}" cy="${f1(floorY)}" rx="${f1(Math.max(D.he, 110) + 90)}" ry="34" fill="url(#${id}-floor)"/>` : ''}
<g class="garment">${M.under.map(p => dress(p.id, 'vp')).join('')}
<g${M.cutBehind ? ` mask="url(#${id}-cut)"` : ''}>${M.behind.map(p => dress(p.id, 'vp')).join('')}</g>
${M.nk.type === 'off' ? '' : `<g clip-path="url(#${id}-nk)">${use('b', shade(fill, lum(fill) > 0.62 ? -0.3 : -0.5))}</g>`}
<g mask="url(#${id}-cut)">${dress('b', 'vb')}<g clip-path="url(#${id}-bc)">${folds}${sheen ? `<path d="M${CX - D.sh + 26} ${D.sp}L${CX - 54} ${M.hemLow}h44L${CX - D.sh + 70} ${D.sp}Z" fill="#fff" opacity=".06"/>` : ''}${view === 'back' ? `<rect width="${W}" height="${H}" fill="#000" opacity=".07"/>` : ''}</g></g>
${M.flatOnly.join('')}${M.deco.join('')}<g class="emb">${M.emb.join('')}</g>
${showSketch ? `<g class="sketch"${clipAttr}>${E.sketchPaths(s.sketch)}</g>` : ''}${opt.live ? `<g class="live"${clipAttr}></g>` : ''}</g></svg>`;
  };

  /** The detail layer alone (transparent): seams, collars, buttons, pockets, belt, embroidery and the sketch. Projected onto the 3D garment. */
  E.decoSvg = (spec, view = 'front', id = 'dk') => {
    E._id = id; const M = build(spec, view), s = M.s;
    const sk = view === 'front' && s.sketch.length ? `<g${s.sketchClip === false ? '' : ` clip-path="url(#${id}-all)"`}>${E.sketchPaths(s.sketch)}</g>` : '';
    const parts = [...M.under, ...M.behind];
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><path id="${id}-b" d="${M.body}"/>${parts.map(p => `<path id="${id}-${p.id}" d="${p.d}"/>`).join('')}<clipPath id="${id}-bc"><use href="#${id}-b"/></clipPath><clipPath id="${id}-all"><use href="#${id}-b"/>${parts.map(p => `<use href="#${id}-${p.id}"/>`).join('')}</clipPath></defs>${M.deco.join('')}${M.emb.join('')}${sk}</svg>`;
  };

  /** Everything the 3D viewer needs to build this garment on the mannequin. */
  E.build3d = spec => {
    const F = build(spec, 'front'), Bk = build(spec, 'back'), s = F.s;
    return { spec: s, parts: F.p3, cuts: { front: F.cuts, back: Bk.cuts }, cutSleeves: F.cutBehind, color: F.fill, accent: F.acc, fabric: s.fabric, pattern: s.pattern, hemLow: F.hemLow, hasLegs: !!F.D.legs, bottom: !!F.D.bottom, form: E.formOf(s), sleeveless: !F.SL && !F.D.wings, frame: E.FRAME };
  };

  /* Normalised (0..1) paths for the gold-thread animation drawn over the stage. */
  E.stitches = spec => {
    const M = build(spec, 'front'), D = M.D, n = (x, y) => [x / W, y / H], p = [];
    if (M.stitch) return M.stitch.map(l => l.map(([x, y]) => n(x, y)));
    const nb = M.neckBottom;
    p.push([n(CX - D.nw - 8, B.hps), n(CX, nb + 10), n(CX + D.nw + 8, B.hps)]);
    p.push([n(CX - D.sh, D.sp), n(CX - D.ch, D.uaY), n(CX - D.wa, B.waist), n(CX - D.he, M.hemSideY)]);
    p.push([n(CX + D.sh, D.sp), n(CX + D.ch, D.uaY), n(CX + D.wa, B.waist), n(CX + D.he, M.hemSideY)]);
    if (M.s.embroidery !== 'none') { const y0 = nb + 24; p.push([n(CX - 26, y0), n(CX - 26, y0 + 130), n(CX, y0 + 160), n(CX + 26, y0 + 130), n(CX + 26, y0)]); }
    p.push([n(CX - D.he, M.hemSideY), n(CX, M.hemLow), n(CX + D.he, M.hemSideY)]);
    return p;
  };
  E._build = build;
})();
