/**
 * Fashion Teller fit engine: puts the 3D garment on a real body.
 *
 * Two halves:
 *   FTFit.tracker()  finds the body. Google's MediaPipe Pose runs in the browser (WebAssembly, loaded from
 *                    /assets/vendor/mediapipe on demand), so camera frames, photos and videos never leave the device.
 *   FTFit.create()   wears the garment. It takes the same garment the 3D viewer builds (FT3D.kit) and re-shapes every
 *                    part onto the tracked body each frame:
 *                      - the body of the garment follows the shoulders and hips (it turns, leans and twists with them)
 *                      - sleeves and trouser legs follow the arms and legs and bend at the elbow and knee
 *                      - skirts and robes follow the legs and stay hanging; agbada wings rise with the arms
 *                      - loose cloth lags and sways behind the movement (a spring per point, more at hems)
 *                      - an invisible body, head and hands sit inside it, so a hand in front of the chest covers the
 *                        cloth and you see the wearer's neck through the neckline, not the inside of the garment
 *
 * Coordinates: joints are in media pixels (x right, y down, z towards the camera). Inside, y is flipped to point up.
 *
 *   const track = await FTFit.tracker({ onProgress });      const pose = await track.image(img) | track.video(video)
 *   const fit = await FTFit.create({ width, height });      await fit.setSpec(spec)
 *   fit.setPose(pose)  fit.step(dtMs)  fit.canvas  fit.adjust.width = 1.1  fit.joints() / fit.setJoint('ls', x, y)
 */
(() => {
  const E = window.FTEngine, { CX, B, ARM } = E.FRAME, FLOOR = B.floor, U = 0.01;
  const SIN = Math.sin(ARM.a), COS = Math.cos(ARM.a);
  /* where the tracker's landmarks sit on the rest body (frame px): shoulder joints, hip joints, leg centre lines */
  const R = { sh: ARM.jx, shY: ARM.jy, hip: 70, hipY: 639, leg: 50, kneeY: B.knee, ankleY: B.ankle, len: ARM.len, elbow: ARM.len * 0.55 };
  const TL = R.hipY - R.shY, THIGH = R.kneeY - R.hipY, SHIN = R.ankleY - R.kneeY;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v)), lerp = (a, b, t) => a + (b - a) * t, smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const vlen = a => Math.hypot(a[0], a[1], a[2]), norm = (a, fb = [0, 1, 0]) => { const l = vlen(a); return l > 1e-6 ? [a[0] / l, a[1] / l, a[2] / l] : fb.slice(); };
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  const perp = (ref, d, alt) => { let p = sub(ref, mul(d, dot(ref, d))); if (vlen(p) < 0.22) p = sub(alt, mul(d, dot(alt, d))); return norm(p, [0, 0, 1]); };

  const supported = () => !!(window.FT3D && FT3D.supported() && window.WebAssembly);

  /* ───────── finding the body ───────── */
  const VENDOR = '/assets/vendor/mediapipe';
  const NAMES = { ls: 11, rs: 12, le: 13, re: 14, lw: 15, rw: 16, lh: 23, rh: 24, lk: 25, rk: 26, la: 27, ra: 28, li: 19, ri: 20 };
  const KEYS = Object.keys(NAMES);
  /* download with progress, so a first visit shows how far along it is (the files are cached after that) */
  function fetchAll(urls, onProgress) {
    const got = urls.map(() => 0), all = urls.map(() => 0);
    const tell = () => { const t = all.reduce((a, b) => a + b, 0); if (onProgress && t) onProgress(Math.min(1, got.reduce((a, b) => a + b, 0) / t)); };
    return Promise.all(urls.map((u, i) => new Promise((ok, no) => {
      const x = new XMLHttpRequest(); x.open('GET', u); x.responseType = 'arraybuffer';
      x.onprogress = e => { got[i] = e.loaded; if (e.lengthComputable) all[i] = e.total; tell(); };
      x.onload = () => (x.status >= 200 && x.status < 300 ? ok(new Uint8Array(x.response)) : no(new Error('Could not load the fitting room.')));
      x.onerror = () => no(new Error('Could not load the fitting room.')); x.send();
    })));
  }
  let shared = null;
  async function tracker(o = {}) {
    if (shared) return shared;
    const C = (window.FT_CONFIG || {}).tryOn || {}, dev = (window.FT_RENDER || {}).device;
    const model = o.model || (C.model && C.model !== 'auto' ? C.model : (dev === 'phone' || dev === 'tablet') ? 'lite' : 'full');
    const want = o.delegate || C.delegate || 'GPU';
    const boot = (async () => {
      /* both big files are fetched once, here, so progress can be shown; the engine is handed over as a blob */
      const [wasm, buf] = await fetchAll([`${VENDOR}/wasm/vision_wasm_internal.wasm`, `${VENDOR}/pose_landmarker_${model}.task`], o.onProgress);
      const mp = await import(`${VENDOR}/vision_bundle.mjs`);
      const files = { wasmLoaderPath: `${VENDOR}/wasm/vision_wasm_internal.js`, wasmBinaryPath: URL.createObjectURL(new Blob([wasm], { type: 'application/wasm' })) };
      const make = delegate => mp.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetBuffer: buf, delegate }, runningMode: 'IMAGE', numPoses: 4, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
      let pl, delegate = want;
      try { pl = await make(delegate); } catch (e) { if (delegate === 'CPU') throw e; delegate = 'CPU'; pl = await make('CPU'); }
      let mode = 'IMAGE', clock = 0;
      /* with several people in a picture, dress the one who fills most of it */
      const out = (r, w, h) => {
        if (!r || !r.landmarks || !r.landmarks.length) return null; let best = 0, top = -1;
        for (let i = 0; i < r.landmarks.length; i++) { const l = r.landmarks[i], v = Math.min(l[11].visibility ?? 1, l[12].visibility ?? 1), sc = Math.hypot((l[11].x - l[12].x) * w, (l[11].y - l[12].y) * h) * v * (0.6 + 0.4 * Math.min(l[23].visibility ?? 1, l[24].visibility ?? 1)); if (sc > top) { top = sc; best = i; } }
        return { lm: r.landmarks[best], world: r.worldLandmarks[best], w, h, people: r.landmarks.length };
      };
      const size = el => [el.videoWidth || el.naturalWidth || el.width, el.videoHeight || el.naturalHeight || el.height];
      return {
        model, delegate,
        /** one still picture */
        async image(el) { if (mode !== 'IMAGE') { await pl.setOptions({ runningMode: 'IMAGE', numPoses: 4 }); mode = 'IMAGE'; } const [w, h] = size(el); return out(pl.detect(el), w, h); },
        /** the current frame of a playing video or camera; keeps track from frame to frame */
        async video(el) { if (mode !== 'VIDEO') { await pl.setOptions({ runningMode: 'VIDEO', numPoses: 1 }); mode = 'VIDEO'; } const [w, h] = size(el); clock = Math.max(clock + 1, Math.round(performance.now())); return out(pl.detectForVideo(el, clock), w, h); },
        close() { try { pl.close(); } catch {} shared = null; },
      };
    })();
    shared = boot; boot.catch(() => { shared = null; });
    return boot;
  }

  /* ───────── from landmarks to joints ───────── */
  const PAIRS = [[11, 12], [23, 24], [11, 23], [12, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [24, 26], [25, 27], [26, 28]];
  /** joints in media pixels, depth in the same pixels (towards the camera is positive) */
  function toJoints(pose) {
    const { lm, world, w, h } = pose, vis = i => lm[i].visibility ?? 1;
    /* pixels per metre: the picture gives positions, the metric skeleton gives depth; this ties the two together */
    const ratios = [];
    for (const [a, b] of PAIRS) { const m = Math.hypot(world[a].x - world[b].x, world[a].y - world[b].y); if (m > 0.07 && vis(a) > 0.5 && vis(b) > 0.5) ratios.push(Math.hypot((lm[a].x - lm[b].x) * w, (lm[a].y - lm[b].y) * h) / m); }
    if (ratios.length < 2) for (const [a, b] of PAIRS.slice(0, 4)) { const m = Math.hypot(world[a].x - world[b].x, world[a].y - world[b].y); if (m > 0.05) ratios.push(Math.hypot((lm[a].x - lm[b].x) * w, (lm[a].y - lm[b].y) * h) / m); }
    ratios.sort((a, b) => a - b); const ppm = ratios.length ? ratios[ratios.length >> 1] : w * 0.5;
    const z0 = (world[23].z + world[24].z) / 2, pt = i => [lm[i].x * w, lm[i].y * h, -(world[i].z - z0) * ppm];
    const J = { w, h, ppm, vis: {} };
    for (const k of KEYS) { J[k] = pt(NAMES[k]); J.vis[k] = vis(NAMES[k]); }
    const le = pt(7), re = pt(8), nose = pt(0), ear = Math.hypot(world[7].x - world[8].x, world[7].y - world[8].y, world[7].z - world[8].z) * ppm;
    J.head = [(le[0] + re[0]) / 2, (le[1] + re[1]) / 2, (le[2] + re[2]) / 2]; J.headR = clamp(ear, 0, w) * 0.62 || vlen(sub(J.ls, J.rs)) * 0.3; J.nose = nose;
    J.ok = J.vis.ls > 0.5 && J.vis.rs > 0.5 && Math.hypot(J.ls[0] - J.rs[0], J.ls[1] - J.rs[1], J.ls[2] - J.rs[2]) > 10;
    return J;
  }
  /** a standing figure to start from when no body was found, or for placing by hand */
  function defaultJoints(w, h) {
    const sw = Math.min(w * 0.3, h * 0.19), cx = w / 2, sy = h * 0.3, k = sw / (2 * R.sh), P = (x, y) => [cx + x * k, sy + (y - R.shY) * k, 0];
    const J = { w, h, ppm: sw / 0.36, vis: {}, manual: true, ok: true };
    Object.assign(J, { ls: P(R.sh, R.shY), rs: P(-R.sh, R.shY), le: P(R.sh + SIN * R.elbow, R.shY + COS * R.elbow), re: P(-R.sh - SIN * R.elbow, R.shY + COS * R.elbow), lw: P(R.sh + SIN * R.len, R.shY + COS * R.len), rw: P(-R.sh - SIN * R.len, R.shY + COS * R.len),
      lh: P(R.hip, R.hipY), rh: P(-R.hip, R.hipY), lk: P(R.leg + 4, R.kneeY), rk: P(-R.leg - 4, R.kneeY), la: P(R.leg + 4, R.ankleY), ra: P(-R.leg - 4, R.ankleY) });
    J.li = P(R.sh + SIN * (R.len + 60), R.shY + COS * (R.len + 60)); J.ri = P(-R.sh - SIN * (R.len + 60), R.shY + COS * (R.len + 60));
    J.head = P(0, 138); J.headR = 52 * k; for (const n of KEYS) J.vis[n] = 1;
    return J;
  }
  /* One Euro filter: steady when still, quick when moving */
  class Euro {
    constructor(min, beta) { this.min = min; this.beta = beta; this.x = null; this.dx = 0; }
    f(x, dt) {
      if (this.x == null || !(dt > 0)) { this.x = x; this.dx = 0; return x; }
      const a = c => { const tau = 1 / (2 * Math.PI * c); return 1 / (1 + tau / dt); };
      const dx = (x - this.x) / dt; this.dx = lerp(this.dx, dx, a(1)); const c = this.min + this.beta * Math.abs(this.dx);
      return (this.x = lerp(this.x, x, a(c)));
    }
  }

  /* ───────── wearing the garment ───────── */
  const T_TORSO = 0, T_SKIRT = 1, T_ARM = 2, T_LEG = 3, T_WING = 4, T_SEAT = 5;
  async function create(o = {}) {
    const kit = FT3D.kit; await kit.load(); const THREE = kit.three();
    const RQ = window.FT_RENDER || {}, lite = RQ.quality === 'lite', phone = RQ.device === 'phone';
    const renderer = new THREE.WebGLRenderer({ antialias: !lite, alpha: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1); renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene(); scene.environment = kit.softEnv(renderer);
    const cam = new THREE.OrthographicCamera(0, 1, 0, -1, 0.1, 80); cam.position.set(0, 0, 40);
    scene.add(new THREE.HemisphereLight(0xeef2ff, 0x2a2f45, 0.85));
    const key = new THREE.DirectionalLight(0xfff4e4, 2.1); key.position.set(3, 8, 9); const fill = new THREE.DirectionalLight(0xdfe8ff, 0.7); fill.position.set(-7, 3, 6);
    scene.add(key, fill);
    const holder = new THREE.Group(); holder.visible = false; scene.add(holder);
    /* the invisible body: writes depth only, so cloth behind it is hidden and the real person shows instead */
    const hide = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
    const body = kit.buildMannequin(hide), occ = []; let headMesh = null;
    for (const m of [...body.children]) {
      const k = m.userData.kind; m.castShadow = m.receiveShadow = false; m.renderOrder = -1; m.frustumCulled = false;
      if (k === 'foot') { body.remove(m); m.geometry.dispose(); continue; }
      if (k === 'head') { headMesh = m; continue; }
      occ.push(bind(m.geometry, k === 'torso' ? { kind: 'torso' } : { kind: k, side: m.userData.side }, 0.93));
    }
    holder.add(body);
    let W = 2, H = 2, built = null, bound = [], token = 0, disposed = false, Q = null, J = null, snap = true;
    const adjust = { width: 1, ease: 1, length: 1, dx: 0, dy: 0 };
    const filters = {}; let ppmF = null, lastT = 0, flips = 0;

    /* w, h: the picture in pixels. scale < 1 draws the garment layer smaller (it is stretched back over the picture) for slow devices */
    function setSize(w, h, scale = 1) { W = Math.max(2, Math.round(w)); H = Math.max(2, Math.round(h)); renderer.setSize(Math.max(2, Math.round(W * scale)), Math.max(2, Math.round(H * scale)), false); cam.left = 0; cam.right = W * U; cam.top = 0; cam.bottom = -H * U; cam.updateProjectionMatrix(); }
    setSize(o.width || 640, o.height || 480);

    /* each point of a part remembers where it sits on the rest body, so it can be put back on the moving one */
    function bind(g, info, shrink = 1) {
      const pos = g.attributes.position, n = pos.count, type = new Uint8Array(n), p = new Float32Array(n * 3), loose = new Float32Array(n);
      const part = info.part, kind = info.kind || (part.type === 'tube' ? 'arm' : part.type === 'band' ? 'torso' : part.depth === 'leg' ? 'leg' : part.depth === 'panel' ? 'wing' : part.depth === 'round' ? 'seat' : 'body');
      let side = info.side || 0, xo = 0, lastY = 0, firstY = 1e9;
      const fx = i => pos.getX(i) / U + CX, fy = i => FLOOR - pos.getY(i) / U, fz = i => pos.getZ(i) / U;
      if (!side && part) { if (part.type === 'tube') side = part.side; else if (part.rows) { const m = part.rows[part.rows.length >> 1]; side = (m[1] + m[2]) / 2 >= CX ? 1 : -1; } }
      for (let i = 0; i < n; i++) { xo = Math.max(xo, Math.abs(fx(i) - CX)); lastY = Math.max(lastY, fy(i)); firstY = Math.min(firstY, fy(i)); }
      const base = part ? ({ dress: part.flare > 0.2 ? 1 : 0.85, robe: 1, torso: 0.65, jacket: 0.2 }[part.depth] ?? 0.5) : 0;
      for (let i = 0; i < n; i++) {
        const x = fx(i), y = fy(i), z = fz(i), q = i * 3;
        if (kind === 'arm') {
          const jx = CX + side * ARM.jx, rx = x - jx, ry = y - ARM.jy, t = rx * side * SIN + ry * COS, a = rx * side * COS - ry * SIN;
          type[i] = T_ARM; p[q] = t; p[q + 1] = a * shrink; p[q + 2] = z * shrink;
          if (part) { const w = Math.hypot(a, z); loose[i] = 0.55 * smooth(t / R.len) * clamp((w - 24) / 22, 0.15, 1); }
        } else if (kind === 'leg') {
          type[i] = T_LEG; p[q] = (x - (CX + side * R.leg)) * shrink; p[q + 1] = y; p[q + 2] = z * shrink;
          if (part) loose[i] = 0.18 * smooth((y - R.kneeY) / 180);
        } else if (kind === 'wing') {
          type[i] = T_WING; p[q] = x - CX; p[q + 1] = y; p[q + 2] = z; loose[i] = 0.3 + 0.7 * smooth((y - 300) / 320);
        } else {
          const nk = !part && y < 262 ? 1.42 : 1;
          type[i] = kind === 'seat' ? T_SEAT : y > R.hipY ? T_SKIRT : T_TORSO; p[q] = (x - CX) * shrink * nk; p[q + 1] = y; p[q + 2] = z * shrink * nk;
          if (part && kind === 'body') loose[i] = base * smooth((y - (B.waist - 30)) / Math.max(60, lastY - B.waist + 30));
        }
      }
      return { g, type, p, loose, side, xo, n, cur: new Float32Array(n * 3), vel: new Float32Array(n * 3), live: false, part, grid: g.userData.grid, drape: !!part && kind === 'body' };
    }

    async function setSpec(spec) {
      const my = ++token;
      const b = await kit.buildGarment(spec, { seg: lite ? 16 : phone ? 20 : 26, texScale: lite ? 1 : phone ? 1.25 : 1.5, lite, aniso: renderer.capabilities.getMaxAnisotropy(), alive: () => my === token && !disposed });
      if (!b) return;
      b.group.traverse(m => { if (m.isMesh) { m.frustumCulled = false; m.castShadow = m.receiveShadow = false; } });
      if (built) { holder.remove(built.group); kit.disposeBuilt(built); }
      built = b; bound = b.parts.map(x => bind(x.geometry, { part: x.part })); holder.add(b.group); snap = true;
    }

    /* ── the pose: frames and scales for every part of the body ── */
    function solve(Jn) {
      const T = k => [Jn[k][0], -Jn[k][1], Jn[k][2]];
      let LS = T('ls'), RS = T('rs'), LH = T('lh'), RH = T('rh');
      const mS0 = mul(add(LS, RS), 0.5), mH0 = mul(add(LH, RH), 0.5), wd = adjust.width;
      LS = add(mS0, mul(sub(LS, mS0), wd)); RS = add(mS0, mul(sub(RS, mS0), wd)); LH = add(mH0, mul(sub(LH, mH0), wd)); RH = add(mH0, mul(sub(RH, mH0), wd));
      const mS = mS0, mH = mH0, up = norm(sub(mS, mH));
      const Xc = norm(sub(LS, RS), [1, 0, 0]), Zc = norm(cross(Xc, up), [0, 0, 1]), Yc = cross(Zc, Xc);
      const hv = smooth((Math.min(Jn.vis.lh ?? 1, Jn.vis.rh ?? 1) - 0.15) / 0.45);          // how far to trust the hips
      const Xp = norm(mix(Xc, norm(sub(LH, RH), Xc), hv), Xc), Zp = norm(cross(Xp, up), Zc), Yp = cross(Zp, Xp);
      const g = vlen(sub(LS, RS)) / (2 * R.sh), gp = clamp(lerp(g, vlen(sub(LH, RH)) / (2 * R.hip), hv), g * 0.72, g * 1.45);
      const sy = clamp(vlen(sub(mS, mH)) / TL, g * 0.55, g * 1.7), gz = (g + gp) / 2 * adjust.ease;
      const q = { mS, mH, Xc, Yc, Zc, Xp, Yp, Zp, g, gp, gz, sy, sUp: g * 0.62, arms: [], legs: [], sw: vlen(sub(LS, RS)) };
      for (const [i, s, a, b, c, f] of [[0, 1, 'le', 'lw', 'li', LS], [1, -1, 're', 'rw', 'ri', RS]]) {
        const S = f, El = T(a), Wr = T(b), In = Jn[c] ? T(c) : null;
        const d1 = norm(sub(El, S), [s * SIN, -COS, 0]), d2 = norm(sub(Wr, El), d1), d3 = In && vlen(sub(In, Wr)) > 2 ? norm(sub(In, Wr), d2) : d2;
        const Nb1 = perp(Zc, d1, Yc), Nb2 = perp(Zc, d2, Yc), Nb3 = perp(Zc, d3, Yc);
        const rest = [s * SIN, -COS, 0], local = [dot(d1, Xc), dot(d1, Yc), dot(d1, Zc)], raise = smooth((Math.acos(clamp(dot(local, rest), -1, 1)) - 0.12) / 0.6);
        q.arms[i] = { S, E: El, W: Wr, d1, d2, d3, Nb1, Nb2, Nb3, Na1: mul(cross(Nb1, d1), s), Na2: mul(cross(Nb2, d2), s), Na3: mul(cross(Nb3, d3), s), k1: vlen(sub(El, S)) / R.elbow, k2: vlen(sub(Wr, El)) / (R.len - R.elbow), ga: g * adjust.ease, raise, s };
      }
      let low = 0;
      for (const [i, s, a, b, hj] of [[0, 1, 'lk', 'la', LH], [1, -1, 'rk', 'ra', RH]]) {
        const Tp = add(mH, mul(sub(hj, mH), R.leg / R.hip)), Kn = T(a), An = T(b);
        const d1 = norm(sub(Kn, Tp), [0, -1, 0]), d2 = norm(sub(An, Kn), d1);
        const Nb1 = perp(Zp, d1, Yp), Nb2 = perp(Zp, d2, Yp), u1 = mul(d1, -1), u2 = mul(d2, -1);
        const k1 = vlen(sub(Kn, Tp)) / THIGH, k2 = vlen(sub(An, Kn)) / SHIN; low += k1;
        q.legs[i] = { T: Tp, K: Kn, A: An, d1, d2, Nb1, Nb2, Na1: cross(u1, Nb1), Na2: cross(u2, Nb2), k1, k2, gl: (g + gp) / 2 * adjust.ease, s };
      }
      q.sLow = clamp(low / 2, g * 0.5, g * 2);
      const off = add(mul([1, 0, 0], adjust.dx * q.sw), mul([0, 1, 0], adjust.dy * q.sw)); q.off = off;
      q.head = T('head'); q.headR = Jn.headR;
      return q;
    }

    /* ── where one rest point goes; results land in ox, oy, oz ── */
    let ox = 0, oy = 0, oz = 0;
    const lenY = y => (y > B.waist ? B.waist + (y - B.waist) * adjust.length : y);
    function chestPt(x, y, z) {
      const q = Q, vy = y <= R.shY ? (R.shY - y) * q.sUp : (R.shY - y) * q.sy, a = x * q.g, c = z * q.gz;
      ox = q.mS[0] + q.Xc[0] * a + q.Yc[0] * vy + q.Zc[0] * c; oy = q.mS[1] + q.Xc[1] * a + q.Yc[1] * vy + q.Zc[1] * c; oz = q.mS[2] + q.Xc[2] * a + q.Yc[2] * vy + q.Zc[2] * c;
    }
    function pelvisPt(x, y, z) {
      const q = Q, vy = y >= R.hipY ? (R.hipY - y) * q.sLow : (R.hipY - y) * q.sy, a = x * q.gp, c = z * q.gz;
      ox = q.mH[0] + q.Xp[0] * a + q.Yp[0] * vy + q.Zp[0] * c; oy = q.mH[1] + q.Xp[1] * a + q.Yp[1] * vy + q.Zp[1] * c; oz = q.mH[2] + q.Xp[2] * a + q.Yp[2] * vy + q.Zp[2] * c;
    }
    function torsoPt(x, y, z) {
      const t = (y - R.shY) / TL;
      if (t <= 0) return chestPt(x, y, z);
      if (t >= 1) return pelvisPt(x, y, z);
      chestPt(x, y, z); const ax = ox, ay = oy, az = oz; pelvisPt(x, y, z); const w = smooth(t);
      ox = lerp(ax, ox, w); oy = lerp(ay, oy, w); oz = lerp(az, oz, w);
    }
    /* centre line of a leg at rest height y */
    let cx = 0, cy = 0, cz = 0;
    function legLine(L, y) {
      if (y <= R.kneeY) { const u = (y - R.hipY) / THIGH; cx = lerp(L.T[0], L.K[0], u); cy = lerp(L.T[1], L.K[1], u); cz = lerp(L.T[2], L.K[2], u); }
      else { const u = (y - R.kneeY) / SHIN; cx = lerp(L.K[0], L.A[0], u); cy = lerp(L.K[1], L.A[1], u); cz = lerp(L.K[2], L.A[2], u); }
    }
    function legPt(i, a, y, b) {
      const L = Q.legs[i]; y = y > R.kneeY ? R.kneeY + (y - R.kneeY) * adjust.length : y; legLine(L, y);
      const w = smooth((y - (R.kneeY - 34)) / 68); let nax = lerp(L.Na1[0], L.Na2[0], w), nay = lerp(L.Na1[1], L.Na2[1], w), naz = lerp(L.Na1[2], L.Na2[2], w), nbx = lerp(L.Nb1[0], L.Nb2[0], w), nby = lerp(L.Nb1[1], L.Nb2[1], w), nbz = lerp(L.Nb1[2], L.Nb2[2], w);
      const la = Math.hypot(nax, nay, naz) || 1, lb = Math.hypot(nbx, nby, nbz) || 1, A = a * L.gl / la, Bz = b * L.gl / lb;
      ox = cx + nax * A + nbx * Bz; oy = cy + nay * A + nby * Bz; oz = cz + naz * A + nbz * Bz;
    }
    /* cloth that hangs over the legs: it goes where the legs go but keeps hanging (it is moved, not turned) */
    function skirtPt(x, y, z, reach, top) {
      const q = Q; y = lenY(y); pelvisPt(x, y, z); const px = ox, py = oy, pz = oz, f = top * smooth((y - R.hipY) / reach);
      if (f <= 0.001) return;
      const c = z * q.gz; let sx = 0, sy2 = 0, sz = 0; const wl = smooth((x + 44) / 88);
      for (let i = 0; i < 2; i++) { const L = q.legs[i], a = (x - L.s * R.leg) * q.gp, w = i ? 1 - wl : wl; legLine(L, y); sx += w * (cx + q.Xp[0] * a + q.Zp[0] * c); sy2 += w * (cy + q.Xp[1] * a + q.Zp[1] * c); sz += w * (cz + q.Xp[2] * a + q.Zp[2] * c); }
      ox = lerp(px, sx, f); oy = lerp(py, sy2, f); oz = lerp(pz, sz, f);
      overLegs();
    }
    /* Cloth lies over the legs, never through them. The front of a garment stays in front of each leg and the back
       behind it, so a knee that comes forward lifts the cloth smoothly instead of poking through it. */
    let zs = 0;                                            // which half the point belongs to: front (+) or back (-)
    function overLegs() {
      const q = Q;
      for (let i = 0; i < 2; i++) { const L = q.legs[i]; for (let sg = 0; sg < 2; sg++) {
        const A = sg ? L.K : L.T, Bq = sg ? L.A : L.K, N = sg ? L.Nb2 : L.Nb1, abx = Bq[0] - A[0], aby = Bq[1] - A[1], abz = Bq[2] - A[2], u = clamp(((ox - A[0]) * abx + (oy - A[1]) * aby + (oz - A[2]) * abz) / (abx * abx + aby * aby + abz * abz || 1), 0, 1);
        const dx = ox - (A[0] + abx * u), dy = oy - (A[1] + aby * u), dz = oz - (A[2] + abz * u), df = dx * N[0] + dy * N[1] + dz * N[2], lat2 = dx * dx + dy * dy + dz * dz - df * df;
        const r = (sg ? lerp(33, 21, u) : lerp(47, 32, u)) * L.gl * 1.12 + 6 * q.g;
        if (lat2 < r * r) { const need = Math.sqrt(r * r - lat2), sgn = zs > 0 ? 1 : zs < 0 ? -1 : df >= 0 ? 1 : -1; if (sgn * df < need) { const m = sgn * need - df; ox += N[0] * m; oy += N[1] * m; oz += N[2] * m; } }
      } }
    }
    /* centre line and frame of an arm at rest distance t from the shoulder */
    let nax = 0, nay = 0, naz = 0, nbx = 0, nby = 0, nbz = 0;
    function armLine(A, t) {
      if (t <= R.elbow) { const u = t / R.elbow; cx = A.S[0] + (A.E[0] - A.S[0]) * u; cy = A.S[1] + (A.E[1] - A.S[1]) * u; cz = A.S[2] + (A.E[2] - A.S[2]) * u; }
      else if (t <= R.len) { const u = (t - R.elbow) / (R.len - R.elbow); cx = lerp(A.E[0], A.W[0], u); cy = lerp(A.E[1], A.W[1], u); cz = lerp(A.E[2], A.W[2], u); }
      else { const u = (t - R.len) * A.ga; cx = A.W[0] + A.d3[0] * u; cy = A.W[1] + A.d3[1] * u; cz = A.W[2] + A.d3[2] * u; }
    }
    function armPt(i, t, a, b) {
      const A = Q.arms[i]; if (t > 0) t *= 1 + (adjust.length - 1) * 0.5;
      if (t < 0) { cx = A.S[0] + A.d1[0] * t * A.ga; cy = A.S[1] + A.d1[1] * t * A.ga; cz = A.S[2] + A.d1[2] * t * A.ga; } else armLine(A, t);
      const w = smooth((t - (R.elbow - 30)) / 60), h = smooth((t - R.len) / 30);
      nax = lerp(lerp(A.Na1[0], A.Na2[0], w), A.Na3[0], h); nay = lerp(lerp(A.Na1[1], A.Na2[1], w), A.Na3[1], h); naz = lerp(lerp(A.Na1[2], A.Na2[2], w), A.Na3[2], h);
      nbx = lerp(lerp(A.Nb1[0], A.Nb2[0], w), A.Nb3[0], h); nby = lerp(lerp(A.Nb1[1], A.Nb2[1], w), A.Nb3[1], h); nbz = lerp(lerp(A.Nb1[2], A.Nb2[2], w), A.Nb3[2], h);
      const la = Math.hypot(nax, nay, naz) || 1, lb = Math.hypot(nbx, nby, nbz) || 1, P = a * A.ga / la, D = b * A.ga / lb;
      ox = cx + nax * P + nbx * D; oy = cy + nay * P + nby * D; oz = cz + naz * P + nbz * D;
    }
    /* a draped panel (agbada wing): hangs from the shoulder line; where the arm goes, that part of the cloth goes too */
    function wingPt(bd, x, y, z) {
      const q = Q, i = bd.side > 0 ? 0 : 1, A = q.arms[i]; y = lenY(y);
      const lx = x * q.g, ly = (R.shY - y) * (y <= R.shY ? q.sUp : q.sy), lz = z * q.gz;
      const u = clamp((Math.abs(x) - R.sh * 0.55) / Math.max(40, bd.xo - R.sh * 0.55), 0, 1), t = u * R.len;
      armLine(A, t); const rx = cx - q.mS[0], ry = cy - q.mS[1], rz = cz - q.mS[2];
      const ax = rx * q.Xc[0] + ry * q.Xc[1] + rz * q.Xc[2], ay = rx * q.Yc[0] + ry * q.Yc[1] + rz * q.Yc[2], az = rx * q.Zc[0] + ry * q.Zc[1] + rz * q.Zc[2];
      const restY = -COS * t * q.sy, r = A.raise;
      const X2 = lerp(lx, ax, r * Math.min(1, u * 3)), Y2 = ly + (ay - restY), Z2 = lz + az * Math.min(1, u * 3);
      ox = q.mS[0] + q.Xc[0] * X2 + q.Yc[0] * Y2 + q.Zc[0] * Z2; oy = q.mS[1] + q.Xc[1] * X2 + q.Yc[1] * Y2 + q.Zc[1] * Z2; oz = q.mS[2] + q.Xc[2] * X2 + q.Yc[2] * Y2 + q.Zc[2] * Z2;
    }
    function place(bd, i) {
      const q = i * 3, p = bd.p; zs = p[q + 2];
      switch (bd.type[i]) {
        case T_TORSO: torsoPt(p[q], p[q + 1], p[q + 2]); if (bd.drape && p[q + 1] > B.waist - 30) overLegs(); break;
        case T_SKIRT: skirtPt(p[q], p[q + 1], p[q + 2], 150, 0.92); break;
        case T_SEAT: if (p[q + 1] > R.hipY) skirtPt(p[q], p[q + 1], p[q + 2], 46, 1); else torsoPt(p[q], p[q + 1], p[q + 2]); break;
        case T_ARM: armPt(bd.side > 0 ? 0 : 1, p[q], p[q + 1], p[q + 2]); break;
        case T_LEG: legPt(bd.side > 0 ? 0 : 1, p[q], p[q + 1], p[q + 2]); break;
        default: wingPt(bd, p[q], p[q + 1], p[q + 2]);
      }
    }
    /* move every point of a part; loose cloth chases its place on a spring, so it lags, sways and settles */
    function shape(bd, dt, garment) {
      const pos = bd.g.attributes.position.array, cur = bd.cur, vel = bd.vel, sway = garment && dt > 0 && dt <= 0.3 && bd.live && !snap && api.sway;     // frames further apart than that show no motion to sway with: the cloth simply hangs in place
      const offx = garment ? Q.off[0] : 0, offy = garment ? Q.off[1] : 0, maxOff = Q.sw * 0.42, h = dt, calm = sway ? 1 - smooth((dt - 0.1) / 0.2) : 0;   // h: the real time between frames, so a slow device does not get slow-motion cloth; calm: and less swing the fewer frames there are to show it with
      for (let i = 0; i < bd.n; i++) {
        place(bd, i); const q = i * 3, tx = ox + offx, ty = oy + offy, tz = oz, l = bd.loose[i] * calm;
        if (sway && l > 0.02) {
          /* a damped spring towards its place, stepped implicitly so it stays steady at any frame rate */
          const k = lerp(520, 55, l), c = lerp(38, 7.5, l), den = 1 + h * c + h * h * k;
          let vx = (vel[q] + h * k * (tx - cur[q])) / den, vy = (vel[q + 1] + h * (k * (ty - cur[q + 1]) - 240 * l * Q.g)) / den, vz = (vel[q + 2] + h * k * (tz - cur[q + 2])) / den;
          let nx = cur[q] + vx * h, ny = cur[q + 1] + vy * h, nz = cur[q + 2] + vz * h;
          const dx = nx - tx, dy = ny - ty, dz = nz - tz, d = Math.hypot(dx, dy, dz), m = maxOff * l;
          if (d > m) { const f = m / d; nx = tx + dx * f; ny = ty + dy * f; nz = tz + dz * f; vx *= 0.6; vy *= 0.6; vz *= 0.6; }
          cur[q] = nx; cur[q + 1] = ny; cur[q + 2] = nz; vel[q] = vx; vel[q + 1] = vy; vel[q + 2] = vz;
        } else { cur[q] = tx; cur[q + 1] = ty; cur[q + 2] = tz; vel[q] = vel[q + 1] = vel[q + 2] = 0; }
        pos[q] = cur[q] * U; pos[q + 1] = cur[q + 1] * U; pos[q + 2] = cur[q + 2] * U;
      }
      bd.live = true; bd.g.attributes.position.needsUpdate = true;
      if (garment) { bd.g.computeVertexNormals(); if (bd.grid) kit.weld(bd.g, bd.grid.rows, bd.grid.cols); }
    }

    function setPose(pose, opt = {}) {
      if (!pose) { J = null; Q = null; return null; }
      let Jn = pose.lm ? toJoints(pose) : pose;
      if (!Jn.ok) { J = null; Q = null; return null; }
      const now = performance.now(), dt = lastT ? (now - lastT) / 1000 : 0; lastT = now;
      /* Nobody turns from front to back between two frames. When the shoulders swap sides at full width, the tracker has lost
         which way the body faces (it happens when the face is hidden): keep the last pose and only believe it if it lasts. */
      let turned = false;
      if (opt.smooth && J && dt < 0.5) { const a = Jn.ls[0] - Jn.rs[0], b = J.ls[0] - J.rs[0]; if (a * b < 0 && Math.abs(b) > 24 && Math.abs(a) > Math.abs(b) * 0.5) { if (++flips <= 4) return J; turned = true; } else flips = 0; } else flips = 0;
      if (opt.smooth && J && dt < 0.5 && !turned) {
        const sc = 220 / Math.max(40, vlen(sub(Jn.ls, Jn.rs)));     // filter in body units, so it behaves the same near and far
        const out = { ...Jn }; ppmF = lerp(ppmF ?? Jn.ppm, Jn.ppm, 0.15);
        for (const k of [...KEYS, 'head']) { const v = Jn[k], f = filters[k] || (filters[k] = [new Euro(1.4, 0.03), new Euro(1.4, 0.03), new Euro(0.5, 0.008)]); out[k] = [f[0].f(v[0] * sc, dt) / sc, f[1].f(v[1] * sc, dt) / sc, f[2].f(v[2] * sc, dt) / sc]; }
        out.headR = lerp(J.headR, Jn.headR, 0.2); Jn = out;
      } else { for (const k in filters) delete filters[k]; snap = true; ppmF = Jn.ppm; }
      J = Jn; return J;
    }
    const joints = () => (J ? Object.fromEntries([...KEYS.filter(k => !['li', 'ri'].includes(k)), 'head'].map(k => [k, [J[k][0], J[k][1]]])) : null);
    function setJoint(name, x, y) { if (!J || !J[name]) return; J = { ...J, [name]: [x, y, J[name][2]] }; if (name === 'lw' || name === 'rw') { const i = name === 'lw' ? 'li' : 'ri', e = name === 'lw' ? 'le' : 're', d = norm([x - J[e][0], y - J[e][1], 0]); J[i] = [x + d[0] * J.headR, y + d[1] * J.headR, J[name][2]]; } snap = true; }

    /** shape everything for the current pose and draw. dt in milliseconds (0 = a still). */
    function step(dtMs = 0) {
      if (disposed) return false;
      if (!J || !built) { if (holder.visible) { holder.visible = false; renderer.render(scene, cam); } return false; }
      Q = solve(J); const dt = dtMs / 1000;
      for (const bd of occ) shape(bd, 0, false);
      if (headMesh) { const r = Q.headR; headMesh.position.set(Q.head[0] * U, (Q.head[1] - r * 0.05) * U, Q.head[2] * U); headMesh.scale.set(r * 0.86 * U, r * 1.18 * U, r * U); }
      for (const bd of bound) shape(bd, dt, true);
      snap = false; holder.visible = true; renderer.render(scene, cam); return true;
    }

    const api = {
      canvas: renderer.domElement, adjust, sway: true, setSize, setSpec, setPose, joints, setJoint, step,
      get size() { return [W, H]; }, get has() { return !!J; }, get ready() { return !!built; },
      /** match the cloth's brightness to the picture (0 dark … 1 bright) */
      light(l) { renderer.toneMappingExposure = lerp(0.72, 1.28, clamp(l, 0, 1)); },
      reset() { J = null; Q = null; snap = true; for (const k in filters) delete filters[k]; },
      startFrom(w, h) { J = defaultJoints(w, h); snap = true; return J; },
      dispose() { disposed = true; if (built) kit.disposeBuilt(built); body.traverse(m => { if (m.geometry) m.geometry.dispose(); }); hide.dispose(); scene.environment?.dispose(); renderer.dispose(); },
    };
    return api;
  }

  window.FTFit = { supported, tracker, create, toJoints, defaultJoints, KEYS };
})();
