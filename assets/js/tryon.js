/**
 * Try it on: the design on a real body, three ways.
 *   Camera  live. The garment stays on you and moves with you; take a picture or record a clip.
 *   Photo   a picture of anyone. Found automatically; drag the body points if it missed. Save the result.
 *   Video   a clip. The garment follows the person through it; save it with the garment in.
 * The body is found on this device (assets/js/fit.js), so nothing is uploaded. The one exception is "Photoreal",
 * offered only when the backend has an AI try-on service connected: it says so and asks before sending a photo.
 *
 *   /try-on?design=ID      a saved or published design        /try-on?draft=1   the design open in the studio
 *   &src=camera|photo|video  start there                      ?delegate=cpu&model=lite|full   for testing
 */
(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $, $$ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount, E = window.FTEngine, esc = FT.esc, Fit = window.FTFit;
    const qs = new URLSearchParams(location.search);
    const view = $('#toView'), ctx = view.getContext('2d'), video = $('#toVideo'), pts = $('#toPts');
    const S = { src: null, spec: null, design: null, fit: null, track: null, mirror: true, facing: 'user', raf: 0, stream: null, img: null, url: null, w: 0, h: 0, rec: null, chunks: [], recT: 0,
      detectMs: 50, lastFrame: 0, miss: 0, points: false, paused: false, gl: 1, slow: 0, ticking: false, lightT: 0, exporting: false, booting: null };
    const NAMES = { ls: 'Left shoulder', rs: 'Right shoulder', le: 'Left elbow', re: 'Right elbow', lw: 'Left wrist', rw: 'Right wrist', lh: 'Left hip', rh: 'Right hip', lk: 'Left knee', rk: 'Right knee', la: 'Left ankle', ra: 'Right ankle' };
    const BONES = [['ls', 'rs'], ['ls', 'le'], ['le', 'lw'], ['rs', 're'], ['re', 'rw'], ['ls', 'lh'], ['rs', 'rh'], ['lh', 'rh'], ['lh', 'lk'], ['lk', 'la'], ['rh', 'rk'], ['rk', 'ra']];
    const canRecord = !!(window.MediaRecorder && view.captureStream);
    const show = (el, on) => { el.toggleAttribute('hidden', !on); };     // works for the SVG layer too
    const msg = (t, ms = 0) => { const m = $('#toMsg'); clearTimeout(msg.t); m.textContent = t || ''; m.hidden = !t; if (t && ms) msg.t = setTimeout(() => { m.hidden = true; }, ms); };
    const loading = (on, title, sub) => { show($('#toLoad'), on); if (title) $('#toLoadT').textContent = title; if (sub != null) $('#toLoadS').textContent = sub; if (!on) $('#toProg').style.width = '0%'; };

    /* ───── which design ───── */
    async function loadSpec() {
      const id = qs.get('design');
      if (id) { try { const d = await A.getDesign(id); S.design = d; return App.version(d).spec; } catch { FT.toast('That design could not be opened. Showing a sample instead.'); } }
      if (qs.get('draft')) { try { const d = JSON.parse(localStorage.getItem('ft.draft')); if (d && d.spec) { S.draft = d; return E.normalize(d.spec); } } catch {} }
      const t = E.TEMPLATES.find(x => x.id === qs.get('template')) || E.TEMPLATES[0]; return E.normalize(t.spec || t);
    }
    S.spec = await loadSpec(); A.features();                // also learns whether Photoreal is switched on
    const title = () => S.design?.title || E.title(S.spec);
    $('#toName').textContent = title();
    $('#toBack').href = S.design ? `/design?id=${encodeURIComponent(S.design.id)}` : '/studio';
    $('#toArt').innerHTML = App.art(S.spec, { bg: false });
    $('#toFine').textContent = Fit.supported() ? '' : 'This browser cannot run the fitting room. Try a recent Chrome, Safari, Edge or Firefox.';

    /* ───── the rail of garments ───── */
    const ward = [{ id: 'now', title: title(), spec: S.spec }];
    (async () => {
      try { if (A.me()) for (const d of (await A.listDesigns()).slice(0, 8)) if (d.id !== S.design?.id) ward.push({ id: d.id, title: d.title, spec: App.version(d).spec }); } catch {}
      for (const t of E.TEMPLATES) ward.push({ id: 't:' + t.id, title: t.name || E.title(E.normalize(t.spec || t)), spec: E.normalize(t.spec || t) });
      $('#toWard').innerHTML = ward.slice(0, 22).map((w, i) => `<button type="button" class="to-g${i ? '' : ' on'}" data-g="${i}" aria-pressed="${!i}" aria-label="${esc(w.title)}" title="${esc(w.title)}">${App.art(w.spec, { bg: false })}</button>`).join('');
    })();
    $('#toWard').addEventListener('click', async e => {
      const b = e.target.closest('[data-g]'); if (!b || !S.fit) return; const w = ward[+b.dataset.g]; if (!w) return;
      $$('#toWard .to-g').forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
      S.spec = w.spec; $('#toName').textContent = w.title; b.classList.add('wait');
      try { await S.fit.setSpec(w.spec); } finally { b.classList.remove('wait'); }
      if (S.src === 'photo') still();
    });

    /* ───── the engine: body tracker + garment, loaded the first time a source is picked ───── */
    function boot() {
      if (S.fit) return Promise.resolve(true);
      if (S.booting) return S.booting;
      if (!Fit.supported()) { msg('This browser cannot run the fitting room. Try a recent Chrome, Safari, Edge or Firefox.'); return Promise.resolve(false); }
      loading(true, 'Getting the fitting room ready', 'A one-time download. It is kept for next time.');
      S.booting = (async () => {
        try {
          const [track, fit] = await Promise.all([Fit.tracker({ onProgress: p => { $('#toProg').style.width = Math.round(p * 100) + '%'; }, delegate: qs.get('delegate') === 'cpu' ? 'CPU' : undefined, model: qs.get('model') || undefined }), Fit.create({})]);
          S.track = track; S.fit = fit; fit.sway = $('#toSway').checked; await fit.setSpec(S.spec); return true;
        } catch (e) { console.warn('Fashion Teller try-on:', e); msg('The fitting room could not start on this device. ' + (navigator.onLine === false ? 'You seem to be offline.' : 'Try again, or use a different browser.')); return false; }
        finally { loading(false); S.booting = null; }
      })();
      return S.booting;
    }

    /* ───── sizes ───── */
    function size(w, h, cap) {
      const k = Math.min(1, cap / Math.max(w, h)); S.w = Math.max(2, Math.round(w * k)); S.h = Math.max(2, Math.round(h * k));
      view.width = S.w; view.height = S.h; S.fit.setSize(S.w, S.h, S.gl);
      pts.setAttribute('viewBox', `0 0 ${S.w} ${S.h}`);
    }
    const draw = (media, garment) => {
      ctx.save(); if (S.mirror && S.src === 'camera') { ctx.translate(S.w, 0); ctx.scale(-1, 1); }
      ctx.drawImage(media, 0, 0, S.w, S.h); if (garment) ctx.drawImage(S.fit.canvas, 0, 0, S.w, S.h); ctx.restore();
    };
    /* match the cloth to the light in the picture */
    const probe = document.createElement('canvas'); probe.width = probe.height = 8; const pctx = probe.getContext('2d', { willReadFrequently: true });
    function light(media) { try { pctx.drawImage(media, 0, 0, 8, 8); const d = pctx.getImageData(0, 0, 8, 8).data; let l = 0; for (let i = 0; i < d.length; i += 4) l += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; S.fit.light(Math.pow(l / (64 * 255), 0.8)); } catch {} }

    /* ───── live: camera and video ───── */
    /* Each turn takes one frame, finds the body in that frame, and shows that same frame with the garment on it.
       The picture and the garment are therefore always from the same instant: the cloth never trails the person. */
    const frame = document.createElement('canvas'), fctx = frame.getContext('2d', { alpha: false });
    async function tick(now) {
      if (S.ticking || !S.fit || video.readyState < 2) return; S.ticking = true;
      try {
        const dt = S.lastFrame ? Math.min(1000, now - S.lastFrame) : 0; S.lastFrame = now;
        if (!S.paused) {
          if (frame.width !== S.w || frame.height !== S.h) { frame.width = S.w; frame.height = S.h; }
          fctx.drawImage(video, 0, 0, S.w, S.h);
          const t0 = performance.now(), pose = await S.track.video(frame); S.detectMs = S.detectMs * 0.8 + (performance.now() - t0) * 0.2;
          if (pose) { pose.w = S.w; pose.h = S.h; }
          if (pose && S.fit.setPose(pose, { smooth: true })) { if (S.miss > 10) msg(''); S.miss = 0; }
          else if (++S.miss === 12) { S.fit.reset(); msg(S.src === 'camera' ? 'Step back until your shoulders and hips are in view.' : 'No one in view in this part of the video.'); }
          if (now - S.lightT > 900) { S.lightT = now; light(frame); }
        }
        const t1 = performance.now(), on = S.fit.step(S.paused ? 0 : dt); draw(frame, on);
        /* a phone that cannot keep up gets a lighter garment layer rather than a stutter */
        const cost = performance.now() - t1; S.slow = cost > 30 ? S.slow + 1 : Math.max(0, S.slow - 2);
        if (S.slow > 45 && S.gl > 0.5) { S.gl = Math.max(0.5, S.gl * 0.75); S.fit.setSize(S.w, S.h, S.gl); S.slow = 0; }
        S.frames = (S.frames || 0) + 1; S.drawMs = (S.drawMs || cost) * 0.85 + cost * 0.15; if (S.tickAt) S.gapMs = (S.gapMs || now - S.tickAt) * 0.9 + (now - S.tickAt) * 0.1; S.tickAt = now;
        if (S.meter && now - (S.meterAt || 0) > 400) S.meterAt = now, S.meter.textContent = `${S.gapMs ? Math.round(1000 / S.gapMs) : '–'} fps\nfind the body ${S.detectMs.toFixed(0)} ms\ndress and draw ${S.drawMs.toFixed(0)} ms\n${S.w}×${S.h}  garment layer ×${S.gl.toFixed(2)}\n${S.track.model} model on ${S.track.delegate}`;
      } catch (e) { console.warn('Fashion Teller try-on:', e); } finally { S.ticking = false; }
    }
    const loop = now => { S.raf = requestAnimationFrame(loop); tick(now); };
    function run() { cancelAnimationFrame(S.raf); S.lastFrame = 0; S.miss = 0; S.tickAt = 0; S.raf = requestAnimationFrame(loop); }
    /* ?fps=1 shows what this device manages: the numbers to read out when checking a real phone */
    try { if (qs.get('fps') === '1') sessionStorage.setItem('ft.fps', '1'); else if (qs.get('fps') === '0') sessionStorage.removeItem('ft.fps'); if (sessionStorage.getItem('ft.fps')) { S.meter = document.createElement('pre'); S.meter.className = 'v3d-meter'; S.meter.setAttribute('aria-hidden', 'true'); S.meter.textContent = 'waiting for the camera or a video'; $('#toStage').appendChild(S.meter); } } catch {}

    async function camera() {
      if (!navigator.mediaDevices?.getUserMedia) { msg('This browser cannot open the camera here. Use a photo instead.'); return home(); }
      try { S.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: S.facing, width: { ideal: 1280 }, height: { ideal: 720 } } }); }
      catch (e) { msg(e?.name === 'NotAllowedError' || e?.name === 'SecurityError' ? 'The camera is blocked for this site. Allow it in your browser settings, or use a photo.' : e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError' ? 'No camera was found on this device. Use a photo or a video instead.' : 'The camera could not be started. Use a photo or a video instead.'); return home(); }
      if (S.src !== 'camera') { S.stream.getTracks().forEach(t => t.stop()); S.stream = null; return; }
      video.srcObject = S.stream; video.muted = true; try { await video.play(); } catch {}
      if (!video.videoWidth) await new Promise(r => video.addEventListener('loadedmetadata', r, { once: true }));
      S.mirror = $('#toMirror').checked && S.facing === 'user'; size(video.videoWidth, video.videoHeight, 1280); stageOn(); run();
      msg('Stand back so the camera sees you from the hips up.', 4200);
    }
    async function clip(file) {
      if (S.url) URL.revokeObjectURL(S.url); S.url = URL.createObjectURL(file);
      video.srcObject = null; video.src = S.url; video.loop = true; video.muted = true;
      try { await new Promise((ok, no) => { video.addEventListener('loadeddata', ok, { once: true }); video.addEventListener('error', () => no(new Error('bad video')), { once: true }); }); }
      catch { msg('That video could not be opened. Try an MP4 or MOV from your phone.'); return home(); }
      size(video.videoWidth, video.videoHeight, 1280); S.paused = false; stageOn(); try { await video.play(); } catch {} run(); play(true);
    }

    /* ───── a still photo ───── */
    async function photo(file) {
      let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { try { bmp = await createImageBitmap(file); } catch { msg('That picture could not be opened. Try a JPG or PNG.'); return home(); } }
      const c = document.createElement('canvas'), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); bmp.close?.();
      S.img = c; size(c.width, c.height, 1600); light(c);
      loading(true, 'Finding you in the picture', '');
      let pose = null; try { pose = await S.track.image(c); } catch (e) { console.warn(e); } loading(false);
      if (pose) { pose.w = S.w; pose.h = S.h; }
      if (pose && S.fit.setPose(pose)) { points(false); msg(pose.people > 1 ? 'Dressed the person who fills most of the picture. Drag the points to choose someone else.' : 'Use Adjust to tune the fit, or Move points if it sits wrong.', 5200); }
      else { S.fit.reset(); S.fit.startFrom(S.w, S.h); points(true); msg('No body was found in this picture. Drag the points onto the shoulders, elbows, wrists, hips, knees and ankles.'); }
      stageOn(); still();
    }
    function still() { if (!S.fit || !S.img) return; const on = S.fit.step(0); S.mirror = false; ctx.drawImage(S.img, 0, 0, S.w, S.h); if (on) ctx.drawImage(S.fit.canvas, 0, 0, S.w, S.h); if (S.points) drawPts(); }

    /* ───── body points you can drag (photos) ───── */
    function points(on) { S.points = on; show(pts, on && S.src === 'photo'); $('#toPoints').setAttribute('aria-pressed', on); if (on) drawPts(); }
    function drawPts() {
      const J = S.fit.joints(); if (!J) return; const r = Math.max(9, Math.round(Math.max(S.w, S.h) / 62));
      pts.innerHTML = BONES.map(([a, b]) => `<line x1="${J[a][0]}" y1="${J[a][1]}" x2="${J[b][0]}" y2="${J[b][1]}"/>`).join('') +
        Object.keys(NAMES).map(k => `<circle data-k="${k}" cx="${J[k][0]}" cy="${J[k][1]}" r="${r}" tabindex="0" role="button" aria-label="${NAMES[k]}. Arrow keys move it."><title>${NAMES[k]}</title></circle>`).join('');
    }
    const svgPoint = e => { const m = pts.getScreenCTM(); if (!m) return null; const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); return [Math.max(0, Math.min(S.w, p.x)), Math.max(0, Math.min(S.h, p.y))]; };
    let dragK = null;
    pts.addEventListener('pointerdown', e => { const c = e.target.closest('circle'); if (!c) return; dragK = c.dataset.k; c.setPointerCapture(e.pointerId); c.classList.add('on'); e.preventDefault(); });
    pts.addEventListener('pointermove', e => { if (!dragK) return; const p = svgPoint(e); if (!p) return; S.fit.setJoint(dragK, p[0], p[1]); still(); pts.querySelector(`[data-k="${dragK}"]`)?.classList.add('on'); });
    const drop = () => { dragK = null; };
    pts.addEventListener('pointerup', drop); pts.addEventListener('pointercancel', drop);
    pts.addEventListener('keydown', e => {
      const c = e.target.closest('circle'), d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!c || !d) return; e.preventDefault();
      const J = S.fit.joints(), k = c.dataset.k, st = Math.max(2, S.w / 120) * (e.shiftKey ? 4 : 1); S.fit.setJoint(k, J[k][0] + d[0] * st, J[k][1] + d[1] * st); still(); pts.querySelector(`[data-k="${k}"]`)?.focus();
    });
    $('#toPoints').addEventListener('click', () => { points(!S.points); if (!S.points) still(); });

    /* ───── adjust the fit ───── */
    const fmt = { width: v => v + '%', ease: v => v + '%', length: v => v + '%', dx: v => (v > 0 ? '+' : '') + v, dy: v => (v > 0 ? '+' : '') + v };
    function adjust(el) {
      const k = el.dataset.adj, v = +el.value; $('#' + el.id + 'O').textContent = fmt[k](v); el.style.setProperty('--p', ((v - el.min) / (el.max - el.min) * 100) + '%');
      if (!S.fit) return; S.fit.adjust[k] = k === 'dx' ? v / 100 : k === 'dy' ? v / 100 : v / 100; if (S.src === 'photo') still();
    }
    $$('#toPanel [data-adj]').forEach(el => { el.addEventListener('input', () => adjust(el)); adjust(el); });
    /* on a phone the panel shows one slider at a time, picked from a row of chips, so the picture stays in view */
    const SHORT = { width: 'Width', ease: 'Loose', length: 'Length', dy: 'Up/down', dx: 'Left/right' };
    $('#toChips').innerHTML = $$('#toPanel [data-adj]').map((el, i) => `<button type="button" data-chip="${el.dataset.adj}" aria-pressed="${!i}">${SHORT[el.dataset.adj]}</button>`).join('');
    const chip = k => { $$('#toChips [data-chip]').forEach(b => b.setAttribute('aria-pressed', b.dataset.chip === k)); $$('#toPanel .slider').forEach(s => s.classList.toggle('on', s.querySelector('[data-adj]').dataset.adj === k)); };
    $('#toChips').addEventListener('click', e => { const b = e.target.closest('[data-chip]'); if (b) chip(b.dataset.chip); }); chip('width');
    $('#toReset').addEventListener('click', () => { $$('#toPanel [data-adj]').forEach(el => { el.value = el.dataset.adj.startsWith('d') ? 0 : 100; adjust(el); }); });
    $('#toSway').addEventListener('change', e => { if (S.fit) S.fit.sway = e.target.checked; });
    $('#toMirror').addEventListener('change', e => { S.mirror = e.target.checked && S.facing === 'user'; });
    $('#toAdjust').addEventListener('click', () => { const p = $('#toPanel'), on = p.hidden; p.hidden = !on; $('#toAdjust').setAttribute('aria-expanded', on); });

    /* ───── what the bar shows for each source ───── */
    function stageOn() {
      show($('#toStart'), false); show(view, true); show($('#toBar'), true);
      const s = S.src; show($('#toFlip'), s === 'camera'); show($('#toRec'), s === 'camera' && canRecord); show($('#toPlay'), s === 'video'); show($('#toExport'), s === 'video' && canRecord);
      show($('#toPoints'), s === 'photo'); show($('#toNew'), s !== 'camera'); $('#toNewT').textContent = s === 'video' ? 'New video' : 'New photo';
      show($('#toReal'), s === 'photo' && !!A.ai?.tryOn); show($('#toMirrorL'), s === 'camera'); show($('#toSwayL'), s !== 'photo');
      $('#toShot').setAttribute('aria-label', s === 'photo' ? 'Save this picture' : 'Take a picture');
      $$('.to-seg [data-src]').forEach(b => b.setAttribute('aria-pressed', b.dataset.src === s));
    }
    function home() { stop(); S.src = null; show($('#toStart'), true); show(view, false); show($('#toBar'), false); show($('#toPanel'), false); show(pts, false); $$('.to-seg [data-src]').forEach(b => b.setAttribute('aria-pressed', false)); }
    function stop() {
      cancelAnimationFrame(S.raf); S.raf = 0; if (S.rec && S.rec.state !== 'inactive') { S.rec.onstop = null; try { S.rec.stop(); } catch {} } S.rec = null; show($('#toRecDot'), false);
      if (S.stream) { S.stream.getTracks().forEach(t => t.stop()); S.stream = null; } video.pause(); video.srcObject = null; if (video.getAttribute('src')) { video.removeAttribute('src'); video.load(); }
      S.fit?.reset(); S.paused = false; S.exporting = false; points(false);
    }
    async function start(src, file) {
      stop(); S.src = src; $$('.to-seg [data-src]').forEach(b => b.setAttribute('aria-pressed', b.dataset.src === src)); show($('#toStart'), false); msg('');
      if (!(await boot())) return home();
      if (S.src !== src) return;
      if (src === 'camera') await camera(); else if (src === 'photo') await photo(file); else await clip(file);
    }
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-src]'); if (!b || !$('#main').contains(b)) return; const s = b.dataset.src;
      if (s === 'camera') start('camera'); else (s === 'photo' ? $('#toFile') : $('#toVFile')).click();     // the file picker has to open inside the tap itself
    });
    $('#toFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) start('photo', f); });
    $('#toVFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) start('video', f); });
    $('#toNew').addEventListener('click', () => (S.src === 'video' ? $('#toVFile') : $('#toFile')).click());
    $('#toFlip').addEventListener('click', () => { S.facing = S.facing === 'user' ? 'environment' : 'user'; start('camera'); });
    function play(on) { S.paused = !on; if (on) video.play().catch(() => {}); else video.pause(); const b = $('#toPlay'); b.setAttribute('aria-pressed', on); b.querySelector('span').textContent = on ? 'Pause' : 'Play'; b.querySelector('svg').innerHTML = on ? '<path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' : '<path d="M8 5l11 7-11 7V5z" fill="currentColor"/>'; }
    $('#toPlay').addEventListener('click', () => play(S.paused));

    /* ───── keeping it: a picture, a recording, a whole video ───── */
    function result(kind, blob, real) {
      const url = URL.createObjectURL(blob), ext = kind === 'image' ? 'jpg' : /mp4/.test(blob.type) ? 'mp4' : 'webm', name = `fashion-teller-${(title() || 'try-on').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'try-on'}.${ext}`;
      const file = new File([blob], name, { type: blob.type }), canShare = !!navigator.canShare?.({ files: [file] });
      const sh = App.sheet(`<h3>${real ? 'Your photoreal picture' : kind === 'image' ? 'Your picture' : 'Your video'}</h3><div class="to-result">${kind === 'image' ? `<img src="${url}" alt="You wearing ${esc(title())}">` : `<video src="${url}" controls playsinline loop></video>`}</div>
        <div class="row-btns" style="margin-top:16px"><a class="btn gold" href="${url}" download="${esc(name)}">Save to this device</a>${canShare ? '<button class="btn ghost" type="button" data-share>Share</button>' : ''}</div>
        <p class="muted small" style="margin-top:12px">${real ? 'Drawn by our AI partner from the photo you sent. It is a likeness, not a fitting: the tailor works from your measurements.' : (kind === 'image' ? 'The garment is part of the picture.' : 'The garment is part of the video.') + ' Nothing was uploaded.'}</p>`, { onClose: () => setTimeout(() => URL.revokeObjectURL(url), 4000) });
      sh.querySelector('[data-share]')?.addEventListener('click', () => navigator.share({ files: [file], title: title() }).catch(() => {}));
    }
    $('#toShot').addEventListener('click', () => {
      if (!S.src || !S.w) return; if (S.src === 'photo') { const was = S.points; S.points = false; still(); S.points = was; }
      view.toBlob(b => { if (b) result('image', b); if (S.src === 'photo' && S.points) still(); }, 'image/jpeg', 0.93);
      view.classList.remove('flash'); void view.offsetWidth; view.classList.add('flash');
    });
    const MIME = canRecord ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '' : '';
    function recStart(audio = []) {
      const stream = view.captureStream(30); audio.forEach(t => stream.addTrack(t)); S.chunks = [];
      S.rec = new MediaRecorder(stream, MIME ? { mimeType: MIME, videoBitsPerSecond: 6_000_000 } : undefined);
      S.rec.ondataavailable = e => { if (e.data && e.data.size) S.chunks.push(e.data); };
      S.rec.onstop = () => { const b = new Blob(S.chunks, { type: S.rec?.mimeType || MIME || 'video/webm' }); S.chunks = []; show($('#toRecDot'), false); clearInterval(S.recT); if (b.size) result('video', b); else FT.toast('Nothing was recorded.'); };
      S.rec.start(250); const t0 = Date.now(); show($('#toRecDot'), true); $('#toRecT').textContent = '0:00';
      S.recT = setInterval(() => { const s = Math.floor((Date.now() - t0) / 1000); $('#toRecT').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (S.src === 'camera' && s >= 60) recStop(); }, 500);
    }
    function recStop() { if (S.rec && S.rec.state !== 'inactive') S.rec.stop(); $('#toRec').setAttribute('aria-pressed', false); $('#toRec span').textContent = 'Record'; }
    $('#toRec').addEventListener('click', () => { if (S.rec && S.rec.state === 'recording') return recStop(); recStart(); $('#toRec').setAttribute('aria-pressed', true); $('#toRec span').textContent = 'Stop'; });
    $('#toExport').addEventListener('click', async () => {
      if (S.exporting) { video.pause(); recStop(); return; }
      S.exporting = true; $('#toExport span').textContent = 'Stop'; play(false); video.loop = false;
      await new Promise(r => { video.addEventListener('seeked', r, { once: true }); video.currentTime = 0; setTimeout(r, 1500); });
      S.fit.reset(); let audio = []; try { const cs = video.captureStream ? video.captureStream() : video.mozCaptureStream ? video.mozCaptureStream() : null; audio = cs ? cs.getAudioTracks() : []; } catch {}
      recStart(audio); msg('Saving the video with the garment in. Keep this page open until it reaches the end.');
      const done = () => { video.removeEventListener('ended', done); recStop(); S.exporting = false; $('#toExport span').textContent = 'Save video'; video.loop = true; msg(''); play(true); };
      video.addEventListener('ended', done); S.rec.addEventListener('stop', () => { if (S.exporting) done(); }, { once: true }); play(true);
    });

    /* ───── photoreal: an AI service redraws the photo with the garment on (backend only, asks first) ───── */
    $('#toReal').addEventListener('click', async () => {
      if (!A.ai?.tryOn || !S.img) return;
      if (!A.me()) { FT.toast('Sign in to use Photoreal.'); return Acc?.open?.(); }
      if (!S.design) { FT.toast('Save the design first, then open Try it on from its page.'); return; }
      const ok = await App.confirm('Send this photo to make a photoreal picture?', 'Photoreal sends this photo and a picture of the garment to our AI partner, who draws you wearing it. It usually takes under a minute. The live try-on you see now never leaves your device.', { ok: 'Send and make it', no: 'Not now' });
      if (!ok) return;
      loading(true, 'Making your photoreal picture', 'Usually under a minute.');
      try {
        const k = Math.min(1, 1280 / Math.max(S.img.width, S.img.height)), p = document.createElement('canvas'); p.width = Math.round(S.img.width * k); p.height = Math.round(S.img.height * k); p.getContext('2d').drawImage(S.img, 0, 0, p.width, p.height);
        const g = await new Promise((res, rej) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = 864; c.height = Math.round(864 * E.FRAME.H / E.FRAME.W); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.92)); }; im.onerror = () => rej(new Error('The garment picture could not be made.')); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(E.render(S.spec, { id: 'tor', view: 'front', bg: false })); });
        let job = await A.tryOnStart(S.design.id, { image: p.toDataURL('image/jpeg', 0.9), garment: g, garmentType: S.spec.garment });
        for (let i = 0; i < 60 && job.status !== 'done' && job.status !== 'failed'; i++) { await new Promise(r => setTimeout(r, 2500)); job = await A.tryOnStatus(job.id); }
        if (job.status !== 'done' || !job.image) throw new Error(job.error || 'The picture took too long. Try again in a moment.');
        const m = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/.exec(job.image);
        if (m) { const bin = atob(m[2]), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); result('image', new Blob([u8], { type: m[1] }), true); }
        else if (/^https:\/\//.test(job.image)) App.sheet(`<h3>Your photoreal picture</h3><div class="to-result"><img src="${esc(job.image)}" alt="You wearing ${esc(title())}"></div><div class="row-btns" style="margin-top:16px"><a class="btn gold" href="${esc(job.image)}" target="_blank" rel="noopener">Open to save</a></div>`);
        else throw new Error('The picture came back in a form this page cannot show.');
      } catch (e) { FT.toast(e.message || 'Photoreal could not be made.'); } finally { loading(false); }
    });

    /* ───── housekeeping ───── */
    addEventListener('pagehide', stop);
    document.addEventListener('visibilitychange', () => { if (document.hidden && S.src === 'camera' && S.rec?.state === 'recording') recStop(); });
    window.FTTryOn = S;                                    // for the tests
    const first = qs.get('src'); if (first === 'camera') start('camera');
  });
})();
