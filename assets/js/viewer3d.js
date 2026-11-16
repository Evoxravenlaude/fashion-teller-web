/**
 * Fashion Teller 3D viewer.
 *
 * Builds the garment on a mannequin in real 3D (WebGL, three.js) from the same measured parts the flat
 * illustration uses (FTEngine.build3d), so the two always match:
 *   - body, trousers and draped panels are lofted from their outlines around the mannequin, with ease and drape folds
 *   - sleeves are tubes on the arm
 *   - the cloth is a seamless tile of the colour + pattern, wrapped around each part, with a woven bump per fabric
 *     and a sheen for silk and velvet
 *   - seams, collars, buttons, pockets, embroidery and the hand sketch are projected on from the front and back
 *   - necklines and openings are cut out, so you see into the garment
 *
 *   const v = await FT3D.mount(element, { spin: true });
 *   v.setSpec(spec)   v.face('front'|'back')   v.spin(true|false)   v.setTone(i)   v.snapshot()   v.dispose()
 *
 * three.js is loaded on demand (assets/vendor/three.ft.min.js). FT3D.supported() is false where WebGL is missing;
 * callers fall back to the flat front/back views.
 */
(() => {
  const E = window.FTEngine, { W, H, CX, B, ARM } = E.FRAME;
  const S = 0.01, FLOOR = B.floor;                    // frame px -> world units; y up from the floor
  const X = fx => (fx - CX) * S, Y = fy => (FLOOR - fy) * S;
  const SIN = Math.sin(ARM.a), COS = Math.cos(ARM.a);
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const TONES = [['Bronze', '#8E5B3E'], ['Espresso', '#4E3122'], ['Sand', '#C9A27E'], ['Porcelain', '#E4D8CB'], ['Graphite', '#4A4E57']];

  let THREE = null, loading = null;
  const load = () => loading || (loading = import('/assets/vendor/three.ft.min.js').then(m => (THREE = m)));
  const supported = () => { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; } };

  /* mannequin torso profile: y, half-width, half-depth */
  const MAN = [[194, 30, 32], [224, 32, 34], [244, 50, 38], [260, 92, 43], [276, 108, 50], [300, 110, 57], [356, 98, 66], [430, 86, 60], [505, 76, 54], [560, 88, 60], [615, 98, 66], [664, 96, 62]];
  const manAt = y => { if (y <= MAN[0][0]) return MAN[0]; for (let i = 1; i < MAN.length; i++) if (y <= MAN[i][0]) { const a = MAN[i - 1], b = MAN[i], t = smooth((y - a[0]) / (b[0] - a[0])); return [y, lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; } return MAN[MAN.length - 1]; };

  /* mannequin leg profile: y, centre offset from the middle, half-width, half-depth, depth offset */
  const LEG = [[630, 52, 45, 49, 0], [700, 52, 42, 45, 0], [800, 51, 36, 38, 0], [B.knee, 50, 31, 33, 2], [930, 50, 32, 34, -3], [1020, 50, 24, 26, -4], [B.ankle, 50, 19, 21, -2], [1100, 50, 20, 23, 0]];
  const legAt = y => { if (y <= LEG[0][0]) return LEG[0]; for (let i = 1; i < LEG.length; i++) if (y <= LEG[i][0]) { const a = LEG[i - 1], b = LEG[i], t = (y - a[0]) / (b[0] - a[0]); return a.map((v, k) => lerp(v, b[k], t)); } return LEG[LEG.length - 1]; };
  const armX = y => ARM.jx + (y - ARM.jy) * Math.tan(ARM.a);           // arm centre line, as an offset from the middle
  const armR = y => { const t = (y - ARM.jy) / COS; return [t > ARM.len ? 21 : lerp(31, 18, clamp(t / ARM.len, 0, 1)), smooth((t + 40) / 40) * (1 - smooth((t - ARM.len - 70) / 50))]; }; // radius, how much of the arm is there

  /* ───────── textures ───────── */
  const rasterize = (svg, w, h) => new Promise((res, rej) => {
    const img = new Image(); img.decoding = 'async';
    img.onload = () => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); res(c); };
    img.onerror = () => rej(new Error('svg raster failed'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  /* woven height map per fabric (grey), used as a bump */
  const weaveCache = {};
  function weave(fabric) {
    const kind = { silk: 'fine', chiffon: 'fine', velvet: 'pile', wool: 'twill', linen: 'slub', lace: 'lace', brocade: 'fine' }[fabric] || 'plain';
    if (weaveCache[kind]) return weaveCache[kind];
    const n = 128, c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'), im = x.createImageData(n, n), d = im.data;
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let v = 0.5;
      if (kind === 'plain') v = 0.5 + 0.22 * Math.sin(i * Math.PI / 2) * Math.sin(j * Math.PI / 2) + 0.1 * (((i >> 1) + (j >> 1)) % 2 ? 1 : -1) + (rnd() - 0.5) * 0.12;
      else if (kind === 'slub') v = 0.5 + 0.26 * (((i >> 2) + (j >> 2)) % 2 ? 1 : -1) * Math.abs(Math.sin(i * Math.PI / 4)) + (rnd() - 0.5) * 0.3;
      else if (kind === 'twill') v = 0.5 + 0.3 * Math.sin((i + j) * Math.PI / 4) + (rnd() - 0.5) * 0.18;
      else if (kind === 'pile') v = 0.5 + (rnd() - 0.5) * 0.5;
      else if (kind === 'lace') { const a = (i % 32) - 16, b = (j % 32) - 16, r = Math.sqrt(a * a + b * b); v = 0.5 + 0.4 * Math.cos(r * 0.9) + (rnd() - 0.5) * 0.1; }
      else v = 0.5 + 0.08 * Math.sin(j * Math.PI / 2) + (rnd() - 0.5) * 0.08;
      const g = clamp(Math.round(v * 255), 0, 255), o = (j * n + i) * 4; d[o] = d[o + 1] = d[o + 2] = g; d[o + 3] = 255;
    }
    x.putImageData(im, 0, 0); return (weaveCache[kind] = c);
  }
  const LOOK = { // roughness, sheen, sheenRoughness, bump, env
    silk: [0.5, 0.8, 0.32, 0.25, 0.5], chiffon: [0.58, 0.4, 0.4, 0.2, 0.4], velvet: [0.96, 1, 0.55, 0.5, 0.25], wool: [0.92, 0.35, 0.7, 0.9, 0.2], linen: [0.94, 0.1, 0.8, 1.1, 0.15],
    cotton: [0.86, 0.12, 0.8, 0.7, 0.2], ankara: [0.8, 0.15, 0.7, 0.6, 0.25], 'aso-oke': [0.72, 0.35, 0.5, 0.9, 0.35], lace: [0.8, 0.2, 0.7, 1.2, 0.2], brocade: [0.58, 0.55, 0.4, 0.6, 0.45],
  };

  /* ───────── geometry ───────── */
  function geo(pos, uv, uv1, idx) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (uv1) g.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    return g;
  }
  /* weld the normals where the front half meets the back half, so the side seam does not show as a crease */
  function weld(g, rows, cols) {
    const n = g.attributes.normal, per = cols * 2;
    for (let i = 0; i < rows; i++) for (const [a, b] of [[i * per, i * per + per - 1], [i * per + cols - 1, i * per + cols]]) {
      const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
      n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
    }
  }
  function gridIndex(rows, cols) {
    const per = cols * 2, idx = new Uint32Array((rows - 1) * (cols - 1) * 12); let k = 0;
    for (let i = 0; i < rows - 1; i++) for (let h = 0; h < 2; h++) for (let j = 0; j < cols - 1; j++) {
      const a = i * per + h * cols + j, b = a + 1, c = a + per, d = c + 1;
      idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c;
    }
    return idx;
  }
  function depthOf(part, y, a, ctx) {
    const kind = part.depth, [, mw, md] = manAt(Math.min(y, B.crotch));
    if (kind === 'leg') return Math.max(a * 0.96, legAt(y)[3] + 5);
    if (kind === 'round') return lerp(Math.max(a * 0.68, md + 5), 30, smooth((y - (B.crotch - 4)) / 36));   // the seat closes into the rise between the legs
    const k = kind === 'robe' ? 0.12 : kind === 'jacket' ? 0.3 : kind === 'dress' ? 0.36 : 0.4;
    const top = y2 => { const m = manAt(Math.min(y2, B.crotch)); return Math.min(Math.max(ctx.aAt(y2) * 0.94, m[2] + 4), m[2] + 9 + k * Math.max(0, ctx.aAt(y2) - m[1])); };
    if (y <= B.hip) return Math.min(Math.max(a * 0.94, md + 4), md + 9 + k * Math.max(0, a - mw));
    const ah = ctx.aAt(B.hip), bh = top(B.hip), target = part.flare > 0.2 ? 0.9 : kind === 'robe' ? 0.66 : 0.74;
    return a * lerp(bh / ah, target, smooth((y - B.hip) / Math.max(1, ctx.lastY - B.hip)));
  }
  /** Loft a part given as horizontal slices [[y, xLeft, xRight], ...] into a tube with a front and a back half. */
  function loftRows(part, tile, seg) {
    const rows = part.rows, n = rows.length, cols = seg + 1, per = cols * 2, lastY = rows[n - 1][0];
    const aAt = y => { for (let i = 1; i < n; i++) if (y <= rows[i][0]) { const p = rows[i - 1], q = rows[i], t = (y - p[0]) / Math.max(1e-6, q[0] - p[0]); return lerp((p[2] - p[1]) / 2, (q[2] - q[1]) / 2, t); } return (rows[n - 1][2] - rows[n - 1][1]) / 2; };
    const ctx = { aAt, lastY };
    const pos = new Float32Array(n * per * 3), uv = new Float32Array(n * per * 2), uv1 = new Float32Array(n * per * 2);
    const body = ['torso', 'dress', 'robe', 'jacket'].includes(part.depth), drop = part.hemDrop || 0;
    const fMax = !body ? 0 : part.depth === 'jacket' ? 0 : part.flare > 0.3 ? 0.085 : part.flare > 0.15 ? 0.055 : part.depth === 'robe' ? 0.045 : part.fit < 0 ? 0.012 : 0.03;
    const lobes = part.flare > 0.15 ? 12 : part.depth === 'panel' ? 11 : 9, phase = part.depth === 'panel' ? 1.1 : 0.6;
    const ring = new Float32Array(cols * 2), K = Math.min(10, n - 1), panel = part.depth === 'panel', leg = part.depth === 'leg';
    const mid0 = rows[n >> 1], side = (mid0[1] + mid0[2]) / 2 >= CX ? 1 : -1;
    for (let i = 0; i < n; i++) {
      let [y, xl, xr] = rows[i];
      if (leg) { const m = legAt(y), lc = CX + side * m[1]; xl = Math.min(xl, lc - m[2] - 4); xr = Math.max(xr, lc + m[2] + 4); }
      const a = (xr - xl) / 2, cx = (xl + xr) / 2, b = panel ? 0 : depthOf(part, y, a, ctx), zc = leg ? legAt(y)[4] : 0;
      const fold = fMax * smooth((y - (B.hip - 60)) / Math.max(1, lastY - B.hip + 60));
      const hw = i >= n - 1 - K ? Math.pow((i - (n - 1 - K)) / K, 2) : 0;
      for (let h = 0; h < 2; h++) {
        let s = 0, px = 0, pz = 0;
        for (let j = 0; j < cols; j++) {
          const th = (h + j / seg) * Math.PI, c = Math.cos(th), sn = Math.sin(th);
          const k = 1 + fold * (Math.sin(lobes * th + phase) + 0.45 * Math.sin(lobes * 2.3 * th + 1.7));
          let wx = cx + a * c * k, wz = b * sn * k + zc;
          if (panel) { // a draped panel: thin cloth that tents over the arm and hangs in folds below it
            wx = cx + a * c; const off = Math.abs(wx - CX), [r, there] = armR(y), edge = Math.pow(Math.abs(sn), 0.42);
            const tent = there * (r + 9) * Math.exp(-Math.pow((off - armX(y)) / (r * 1.5), 2));
            const hang = smooth((y - (ARM.jy + (off - ARM.jx) / Math.tan(ARM.a)) - 16) / 170), wave = 15 * hang * (Math.sin(off * 0.083 + 1.1) + 0.45 * Math.sin(off * 0.19 + 2.3));
            wz = wave * edge + (h ? -1 : 1) * (7 + tent) * edge;
          }
          if (j) s += Math.hypot(wx - px, wz - pz); px = wx; pz = wz; ring[j] = s;
          const fx = cx + a * c, fy = y + hw * drop * sn * sn, o = i * per + h * cols + j;
          pos[o * 3] = X(wx); pos[o * 3 + 1] = Y(fy); pos[o * 3 + 2] = wz * S;
          uv1[o * 2] = h === 0 ? fx / W * 0.5 : 0.5 + (W - fx) / W * 0.5; uv1[o * 2 + 1] = 1 - fy / H;
          uv[o * 2 + 1] = -fy / tile.h;
        }
        const mid = ring[cols - 1] / 2;
        for (let j = 0; j < cols; j++) uv[(i * per + h * cols + j) * 2] = (mid - ring[j]) / tile.w + (cx - CX) / tile.w * (h ? -1 : 1);
      }
    }
    const g = geo(pos, uv, uv1, gridIndex(n, cols)); weld(g, n, cols); return g;
  }
  /** A sleeve: rings around the arm axis, from a closed cap inside the shoulder to an open cuff. */
  function loftTube(part, tile, seg) {
    const cap = 6, ws = part.w, w0 = ws[0][1], list = [];
    for (let i = 0; i < cap; i++) { const u = i / cap; list.push([-(1 - u) * w0 * 0.9, lerp(Math.max(w0, 40), w0, u) * Math.sqrt(1 - Math.pow(1 - u, 2)) + 0.5]); }
    for (const p of ws) list.push(p);
    const n = list.length, cols = seg + 1, per = cols * 2, side = part.side;
    const pos = new Float32Array(n * per * 3), uv = new Float32Array(n * per * 2), uv1 = new Float32Array(n * per * 2);
    for (let i = 0; i < n; i++) {
      const [t, w] = list[i];
      for (let h = 0; h < 2; h++) for (let j = 0; j < cols; j++) {
        const ph = (h + j / seg) * Math.PI, c = Math.cos(ph), sn = Math.sin(ph), o = i * per + h * cols + j;
        const fx = part.j[0] + side * (SIN * t + COS * w * c), fy = part.j[1] + COS * t - SIN * w * c;
        pos[o * 3] = X(fx); pos[o * 3 + 1] = Y(fy); pos[o * 3 + 2] = w * 0.9 * sn * S;
        uv1[o * 2] = h === 0 ? fx / W * 0.5 : 0.5 + (W - fx) / W * 0.5; uv1[o * 2 + 1] = 1 - fy / H;
        uv[o * 2] = side * (Math.PI / 2 - (ph % Math.PI)) * w / tile.w * (h ? -1 : 1); uv[o * 2 + 1] = -t / tile.h;
      }
    }
    const idx = gridIndex(n, cols); if (side < 0) for (let k = 0; k < idx.length; k += 3) { const t = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = t; }
    const g = geo(pos, uv, uv1, idx); weld(g, n, cols); return g;
  }
  /* simple lofts for the mannequin: rings [[cx, cy, cz, rx, rz], ...] in frame px */
  function loftRings(rings, seg = 28, capTop = false, capBottom = false) {
    const list = [...rings];
    if (capTop) { const r = list[0]; list.unshift([r[0], r[1] - r[3] * 0.25, r[2], r[3] * 0.55, r[4] * 0.55], [r[0], r[1] - r[3] * 0.12, r[2], r[3] * 0.85, r[4] * 0.85]); list.unshift([r[0], r[1] - r[3] * 0.3, r[2], 0.01, 0.01]); }
    if (capBottom) { const r = list[list.length - 1]; list.push([r[0], r[1] + r[3] * 0.12, r[2], r[3] * 0.85, r[4] * 0.85], [r[0], r[1] + r[3] * 0.25, r[2], r[3] * 0.55, r[4] * 0.55], [r[0], r[1] + r[3] * 0.3, r[2], 0.01, 0.01]); }
    const n = list.length, cols = seg + 1, pos = new Float32Array(n * cols * 3), idx = new Uint32Array((n - 1) * seg * 6); let k = 0;
    for (let i = 0; i < n; i++) for (let j = 0; j < cols; j++) { const th = j / seg * Math.PI * 2, r = list[i], o = (i * cols + j) * 3; pos[o] = X(r[0] + r[3] * Math.cos(th)); pos[o + 1] = Y(r[1]); pos[o + 2] = (r[2] + r[4] * Math.sin(th)) * S; }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) { const a = i * cols + j, b = a + 1, c = a + cols, d = c + 1; idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    const nn = g.attributes.normal; for (let i = 0; i < n; i++) { const a = i * cols, b = a + seg; const x = nn.getX(a) + nn.getX(b), y = nn.getY(a) + nn.getY(b), z = nn.getZ(a) + nn.getZ(b), l = Math.hypot(x, y, z) || 1; nn.setXYZ(a, x / l, y / l, z / l); nn.setXYZ(b, x / l, y / l, z / l); }
    return g;
  }
  function limb(j, dir, samples, seg = 20) { // tube along a slanted axis: samples [[t, r], ...]
    const n = samples.length, cols = seg + 1, pos = new Float32Array(n * cols * 3), idx = new Uint32Array((n - 1) * seg * 6); let k = 0;
    const nx = dir[1], ny = -dir[0];
    for (let i = 0; i < n; i++) for (let jx = 0; jx < cols; jx++) { const th = jx / seg * Math.PI * 2, [t, r] = samples[i], o = (i * cols + jx) * 3, c = Math.cos(th); pos[o] = X(j[0] + dir[0] * t + nx * r * c); pos[o + 1] = Y(j[1] + dir[1] * t + ny * r * c); pos[o + 2] = r * 0.94 * Math.sin(th) * S; }
    for (let i = 0; i < n - 1; i++) for (let jx = 0; jx < seg; jx++) { const a = i * cols + jx, b = a + 1, c = a + cols, d = c + 1; idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals(); return g;
  }
  function buildMannequin(mat) {
    const G = new THREE.Group(), add = g => { const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; G.add(m); return m; };
    const rings = []; for (let y = MAN[0][0]; y <= B.crotch; y += 8) { const m = manAt(y); rings.push([CX, y, y < 250 ? -4 : 0, m[1], m[2]]); }
    rings.push([CX, B.crotch + 10, 0, 86, 38], [CX, B.crotch + 22, 0, 66, 12]); add(loftRings(rings, 36, false, false));
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), mat); head.scale.set(0.44, 0.6, 0.5); head.position.set(0, Y(138), -0.02); head.castShadow = true; G.add(head);
    for (const side of [1, -1]) {
      const j = [CX + side * (ARM.jx - 2), ARM.jy], dir = [side * SIN, COS];
      add(limb(j, dir, [[-34, 3], [-30, 14], [-22, 23], [-10, 29], [0, 30.5], [60, 29], [170, 24], [190, 25], [260, 22], [ARM.len, 16], [ARM.len + 10, 17], [ARM.len + 40, 19], [ARM.len + 66, 13], [ARM.len + 78, 4]]));
      const lx = CX + side * 50; add(loftRings(LEG.map(r => [CX + side * r[1], r[0], r[4], r[2], r[3]]), 24, false, false));
      const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat); foot.scale.set(0.26, 0.17, 0.56); foot.position.set(X(lx - side * 2), Y(1112), 0.22); foot.castShadow = true; G.add(foot);
    }
    return G;
  }
  function softEnv(renderer) {
    const sc = new THREE.Scene(), box = (w, h, d, x, y, z, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ color: new THREE.Color(i, i, i * 0.97) })); m.position.set(x, y, z); sc.add(m); };
    const room = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshBasicMaterial({ color: 0x1a1d2b, side: THREE.BackSide })); sc.add(room);
    box(14, 0.5, 14, 0, 19, 0, 5); box(0.5, 16, 10, 19, 4, 6, 7); box(0.5, 12, 8, -19, 2, -4, 2.2); box(12, 10, 0.5, -4, 4, 19, 3.2); box(10, 6, 0.5, 6, 6, -19, 1.6);
    const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromScene(sc, 0.05); pm.dispose();
    sc.traverse(o => { if (o.geometry) { o.geometry.dispose(); o.material.dispose(); } });
    return rt.texture;
  }

  /* ───────── the viewer ───────── */
  async function mount(el, opt = {}) {
    if (!supported()) throw new Error('WebGL is not available');
    await load();
    const R = window.FT_RENDER || {}, lite = R.quality === 'lite', phone = R.device === 'phone';
    const renderer = new THREE.WebGLRenderer({ antialias: !lite, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    const dprMax = lite ? 1 : phone ? 1.75 : 2;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, dprMax));
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = !lite; renderer.shadowMap.type = THREE.PCFShadowMap;
    const cv = renderer.domElement; cv.className = 'v3d-canvas'; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', '3D view of your design. Drag to turn it.'); cv.style.touchAction = 'pan-y pinch-zoom';
    el.appendChild(cv);
    const scene = new THREE.Scene(); scene.environment = softEnv(renderer);
    const cam = new THREE.PerspectiveCamera(26, 1, 0.5, 120);
    scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a1f33, 0.75));
    const key = new THREE.DirectionalLight(0xfff1dd, 2.5); key.position.set(3.4, 17, 10); key.castShadow = !lite;
    key.shadow.mapSize.set(phone ? 1024 : 2048, phone ? 1024 : 2048); Object.assign(key.shadow.camera, { left: -8, right: 8, top: 12, bottom: -8, near: 1, far: 48 }); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03; key.shadow.radius = 6;
    const rim = new THREE.DirectionalLight(0x9fb6ff, 1.5); rim.position.set(-7, 9, -9);
    const fill = new THREE.DirectionalLight(0xffffff, 0.55); fill.position.set(-8, 5, 8);
    scene.add(key, rim, fill);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(18, 48), new THREE.ShadowMaterial({ opacity: 0.24 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 4, 64, 64, 64); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); const blob = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 4.2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })); blob.rotation.x = -Math.PI / 2; blob.position.y = 0.004; scene.add(blob); }
    const pivot = new THREE.Group(); scene.add(pivot);
    let tone = 0; try { tone = clamp(parseInt(localStorage.getItem('ft.tone') || '0', 10) || 0, 0, TONES.length - 1); } catch {}
    const manMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(TONES[tone][1]), roughness: 0.62, metalness: 0, envMapIntensity: 0.5 });
    const man = buildMannequin(manMat); pivot.add(man);
    let garment = null, token = 0, disposed = false;

    /* camera: fit the whole figure, orbit around it */
    const CY = 5.25; // look-at height: leaves room under the feet for the controls
    const st = { yaw: opt.yaw ?? -0.5, pitch: 0.06, zoom: 1, ty: CY, vy: 0, spin: !!opt.spin, drag: false, dirty: true, dist: 26 };
    let target = opt.spin || opt.yaw != null ? null : { yaw: 0.35 };
    function fit() {
      const w = el.clientWidth || 300, h = el.clientHeight || 400; renderer.setSize(w, h, false); cam.aspect = w / h;
      const t = Math.tan(cam.fov * Math.PI / 360), dH = 6.45 / t, dW = 4.3 / (t * cam.aspect); st.dist = Math.max(dH, dW); cam.updateProjectionMatrix(); st.dirty = true;
    }
    function place() {
      const d = st.dist / st.zoom, cy = lerp(CY, st.ty, clamp((st.zoom - 1) / 0.5, 0, 1));
      cam.position.set(Math.sin(st.pitch * 0) * 0, cy + Math.sin(st.pitch) * d, Math.cos(st.pitch) * d); cam.lookAt(0, cy, 0); pivot.rotation.y = st.yaw;
    }
    const ro = new ResizeObserver(() => fit()); ro.observe(el); fit();
    let raf = 0, last = performance.now(), visible = true;
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) kick(); }); io.observe(el);
    function frame(now) {
      raf = 0; if (disposed) return; const dt = Math.min(50, now - last); last = now;
      let moving = false;
      if (st.spin && !st.drag) { st.yaw += dt * 0.00055; moving = true; }
      else if (target && !st.drag) { const d = target.yaw - st.yaw; if (Math.abs(d) > 0.002) { st.yaw += d * Math.min(1, dt * 0.006); moving = true; } else { st.yaw = target.yaw; target = null; } }
      if (!st.drag && Math.abs(st.vy) > 0.00005) { st.yaw += st.vy * dt; st.vy *= Math.pow(0.994, dt); moving = true; }
      if (moving || st.dirty) { place(); renderer.render(scene, cam); st.dirty = false; }
      if ((moving || st.drag) && visible && !document.hidden) raf = requestAnimationFrame(frame);
    }
    const kick = () => { st.dirty = true; if (!raf && !disposed) { last = performance.now(); raf = requestAnimationFrame(frame); } };
    /* pointer: drag to turn, drag up/down to tilt (or to move along the body when zoomed), pinch or wheel to zoom */
    const pts = new Map(); let pinch = 0, moved = 0;
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY, performance.now()]); st.drag = true; st.vy = 0; target = null; moved = 0; if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]) / st.zoom; } el.classList.add('grabbing'); kick(); });
    cv.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return; const dx = e.clientX - p[0], dy = e.clientY - p[1], now = performance.now(), dt = Math.max(1, now - p[2]); pts.set(e.pointerId, [e.clientX, e.clientY, now]);
      if (pts.size === 1) { st.yaw += dx * 0.009; st.vy = dx * 0.009 / dt; moved += Math.abs(dx) + Math.abs(dy); if (st.zoom > 1.12) st.ty = clamp(st.ty + dy * 0.02 / st.zoom, 1.2, 9.6); else st.pitch = clamp(st.pitch + dy * 0.004, -0.12, 0.5); }
      else if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()]; st.zoom = clamp(Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch, 1, 2.6); }
      kick();
    });
    const up = e => { pts.delete(e.pointerId); if (!pts.size) { st.drag = false; el.classList.remove('grabbing'); if (moved > 6) el.dispatchEvent(new CustomEvent('v3d:turned')); } pinch = 0; kick(); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { if (!e.ctrlKey && Math.abs(e.deltaY) < 4) return; e.preventDefault(); st.zoom = clamp(st.zoom * (e.deltaY < 0 ? 1.08 : 0.926), 1, 2.6); kick(); }, { passive: false });
    cv.addEventListener('dblclick', () => { st.zoom = st.zoom > 1.2 ? 1 : 1.9; st.ty = 7.4; kick(); });
    cv.tabIndex = 0;
    cv.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') st.yaw -= 0.2; else if (e.key === 'ArrowRight') st.yaw += 0.2; else if (e.key === '+' || e.key === '=') st.zoom = clamp(st.zoom * 1.15, 1, 2.6); else if (e.key === '-') st.zoom = clamp(st.zoom / 1.15, 1, 2.6); else return; e.preventDefault(); kick(); });

    function disposeGarment(g) { if (!g) return; pivot.remove(g.group); g.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); for (const m of g.mats) m.dispose(); for (const t of g.texs) t.dispose(); }

    async function setSpec(spec) {
      const my = ++token;
      const m = E.build3d(spec), tile = E.tile(spec), look = LOOK[m.fabric] || LOOK.cotton;
      const seg = lite ? 16 : phone ? 22 : 28, texScale = lite ? 1 : phone ? 1.25 : 1.5, AW = Math.round(W * texScale), AH = Math.round(H * texScale);
      const [tileC, df, db] = await Promise.all([rasterize(tile.svg, tile.w * 4, tile.h * 4), rasterize(E.decoSvg(spec, 'front', 'd3f'), AW, AH), rasterize(E.decoSvg(spec, 'back', 'd3b'), AW, AH)]);
      if (my !== token || disposed) return;
      const texs = [], mats = [], tex = (c, repeat) => { const t = new THREE.CanvasTexture(c); if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); texs.push(t); return t; };
      const tTile = tex(tileC, true); tTile.colorSpace = THREE.SRGBColorSpace;
      const tBump = tex(weave(m.fabric), true); tBump.repeat.set(tile.w / 22, tile.h / 22);
      const atlas = document.createElement('canvas'); atlas.width = AW * 2; atlas.height = AH; { const x = atlas.getContext('2d'); x.drawImage(df, 0, 0); x.drawImage(db, AW, 0); }
      const tDeco = tex(atlas); tDeco.colorSpace = THREE.SRGBColorSpace; tDeco.channel = 1;
      const mk = document.createElement('canvas'); mk.width = AW * 2; mk.height = AH; { const x = mk.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, mk.width, mk.height); x.fillStyle = '#000'; x.save(); x.scale(texScale, texScale); for (const c of m.cuts.front) x.fill(new Path2D(c)); x.restore(); x.save(); x.translate(AW, 0); x.scale(texScale, texScale); for (const c of m.cuts.back) x.fill(new Path2D(c)); x.restore(); }
      const tMask = tex(mk); tMask.channel = 1;
      const base = { map: tTile, bumpMap: tBump, bumpScale: look[3], roughness: look[0], metalness: 0, sheen: look[1], sheenRoughness: look[2], sheenColor: new THREE.Color(E.shade(m.color, 0.45)), envMapIntensity: look[4] };
      const cloth = new THREE.MeshPhysicalMaterial({ ...base, alphaMap: tMask, alphaTest: 0.5, side: THREE.FrontSide }); cloth.alphaToCoverage = !lite;
      const inner = new THREE.MeshStandardMaterial({ map: tTile, color: 0x6a6a6a, roughness: 1, metalness: 0, alphaMap: tMask, alphaTest: 0.5, side: THREE.BackSide, envMapIntensity: 0.1 });
      const plain = new THREE.MeshPhysicalMaterial({ ...base, side: THREE.DoubleSide });
      const deco = new THREE.MeshStandardMaterial({ map: tDeco, transparent: true, depthWrite: false, roughness: 0.55, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, envMapIntensity: 0.5 });
      const white = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: 0.8, side: THREE.DoubleSide });
      const styling = new THREE.MeshStandardMaterial({ color: E.lum(m.color) < 0.22 ? 0x8d8a84 : 0x23262d, roughness: 0.9, bumpMap: tBump, bumpScale: 0.5, side: THREE.DoubleSide, envMapIntensity: 0.2 });
      mats.push(cloth, inner, plain, deco, white, styling);
      const group = new THREE.Group();
      for (const p of m.parts) {
        if (p.type === 'band') { const r0 = p.r + 9, g = loftRings([[CX, p.y0, -3, r0 - 4, r0 * 0.84], [CX, (p.y0 + p.y1) / 2, -2, r0 - 1, r0 * 0.88], [CX, p.y1, 0, r0 + 4, r0 * 0.94]], 32); const mesh = new THREE.Mesh(g, p.tone === 'white' ? white : new THREE.MeshStandardMaterial({ color: new THREE.Color(E.shade(m.color, E.lum(m.color) > 0.62 ? -0.06 : 0.1)), roughness: look[0], side: THREE.DoubleSide })); if (p.tone !== 'white') mats.push(mesh.material); mesh.castShadow = true; group.add(mesh); continue; }
        const cut = p.id === 'body' || (m.cutSleeves && p.type === 'tube');
        const g = p.type === 'tube' ? loftTube(p, tile, Math.max(10, seg - 10)) : loftRows(p, tile, p.depth === 'leg' ? Math.max(10, seg - 10) : seg);
        const a = new THREE.Mesh(g, p.styling ? styling : cut ? cloth : plain); a.castShadow = true; a.receiveShadow = true; group.add(a);
        if (p.styling) continue;
        if (cut) { const b = new THREE.Mesh(g, inner); group.add(b); }
        const d = new THREE.Mesh(g, deco); d.renderOrder = 2; group.add(d);
      }
      const old = garment; garment = { group, mats, texs }; pivot.add(group); disposeGarment(old);
      el.classList.add('ready'); kick();
    }

    const api = {
      el, tones: TONES, get tone() { return tone; },
      setSpec: spec => setSpec(spec).catch(e => { console.warn('Fashion Teller 3D:', e); el.dispatchEvent(new CustomEvent('v3d:error')); }),
      face(side) { st.spin = false; st.vy = 0; const want = side === 'back' ? Math.PI : side === 'side' ? Math.PI / 2 : 0; const k = Math.round((st.yaw - want) / (Math.PI * 2)); target = { yaw: want + k * Math.PI * 2 }; kick(); },
      spin(on) { st.spin = on ?? !st.spin; if (st.spin) target = null; kick(); return st.spin; },
      get spinning() { return st.spin; },
      zoom(z) { st.zoom = clamp(z, 1, 2.6); kick(); },
      setTone(i) { tone = clamp(i | 0, 0, TONES.length - 1); manMat.color.set(TONES[tone][1]); try { localStorage.setItem('ft.tone', String(tone)); } catch {} kick(); },
      resize: fit,
      snapshot(type = 'image/png') { place(); renderer.render(scene, cam); return cv.toDataURL(type, 0.92); },
      dispose() { disposed = true; cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); disposeGarment(garment); man.traverse(o => { if (o.geometry) o.geometry.dispose(); }); manMat.dispose(); scene.environment?.dispose(); renderer.dispose(); cv.remove(); },
    };
    if (opt.spec) await api.setSpec(opt.spec);
    kick();
    return api;
  }

  window.FT3D = { supported, mount, load, TONES };
})();
