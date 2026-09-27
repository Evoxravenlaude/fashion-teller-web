/**
 * Fashion Teller — shared runtime for every page.
 * Loader (first visit per tab), gold page wipe between pages, gold-thread canvas,
 * cursor, magnetic buttons, split-text headlines, reveals, FLIP reordering, accordions, forms.
 */
(() => {
  const FT = (window.FT = {});
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer: fine)').matches;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const ss = {
    get: k => { try { return sessionStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} },
  };
  Object.assign(FT, { $, $$, reduced, fine, wait, ss });
  FT.money = n => '$' + Number(n).toFixed(2);
  FT.esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ───────── ready: resolves once the loader (if any) has lifted ───────── */
  let readyResolve;
  FT.ready = new Promise(r => (readyResolve = r));

  /* ───────── toast ───────── */
  let toastT;
  FT.toast = msg => {
    let t = $('#ft-toast');
    if (!t) { t = document.createElement('div'); t.id = 'ft-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2800);
  };

  /* ═════════ Gold thread ═════════
     Draws glowing gold stitches along normalised paths ([[x,y],...] in 0..1 of the canvas box),
     throwing off sparks at the needle like the embroidery in the concept video. */
  function fit(canvas) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr);
    const ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }
  function stroke(ctx, ax, ay, bx, by, width, light) {
    ctx.lineCap = 'round';
    ctx.shadowColor = light ? 'rgba(212,175,55,.55)' : 'rgba(255,190,70,.95)';
    ctx.shadowBlur = light ? 8 : 16;
    ctx.strokeStyle = light ? '#C9A02F' : '#F2CF72';
    ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = light ? 'rgba(255,236,170,.9)' : 'rgba(255,250,230,.95)';
    ctx.lineWidth = width * 0.38;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  function drawSparks(ctx, sparks, light) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx; s.y += s.vy; s.vy += 0.03; s.life -= s.decay;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, s.life);
      ctx.fillStyle = light ? '#D4AF37' : '#FFE3A0';
      ctx.shadowColor = 'rgba(255,200,90,.9)'; ctx.shadowBlur = light ? 0 : 8;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }
  const spark = (x, y, k = 1) => ({ x, y, vx: (Math.random() - 0.5) * 1.8 * k, vy: (Math.random() - 0.65) * 1.8 * k, r: Math.random() * 1.3 + 0.4, life: 1, decay: 0.012 + Math.random() * 0.02 });

  FT.thread = (canvas, { paths, duration = 1800, width = 2, light = false, glints = 0.35 } = {}) => {
    let { ctx, w, h } = fit(canvas);
    const segs = []; let total = 0;
    for (const p of paths) for (let i = 1; i < p.length; i++) {
      const len = Math.hypot((p[i][0] - p[i - 1][0]) * w, (p[i][1] - p[i - 1][1]) * h);
      segs.push({ a: p[i - 1], b: p[i], len, start: total }); total += len;
    }
    const sparks = []; let raf, t0 = null, resolved = false, stopped = false, res;
    const done = new Promise(r => (res = r));
    const paint = L => {
      let tip = null;
      for (const s of segs) {
        if (L <= s.start) break;
        const k = Math.min(1, (L - s.start) / s.len);
        const ax = s.a[0] * w, ay = s.a[1] * h;
        const bx = ax + (s.b[0] * w - ax) * k, by = ay + (s.b[1] * h - ay) * k;
        stroke(ctx, ax, ay, bx, by, width, light); tip = [bx, by];
      }
      return tip;
    };
    if (reduced) { paint(total); res(); return { done, stop() {}, clear() { ctx.clearRect(0, 0, w, h); } }; }
    const frame = ts => {
      if (stopped) return;
      if (t0 == null) t0 = ts;
      const p = Math.min(1, (ts - t0) / duration);
      const e = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      ctx.clearRect(0, 0, w, h);
      const tip = paint(e * total);
      if (tip && p < 1) for (let i = 0; i < 3; i++) sparks.push(spark(tip[0], tip[1]));
      if (p >= 1 && Math.random() < glints) { // idle twinkles along the finished stitch
        const s = segs[(Math.random() * segs.length) | 0], k = Math.random();
        if (s) sparks.push({ ...spark(s.a[0] * w + (s.b[0] - s.a[0]) * w * k, s.a[1] * h + (s.b[1] - s.a[1]) * h * k, 0.4), decay: 0.02 });
      }
      drawSparks(ctx, sparks, light);
      if (p >= 1 && !resolved) { resolved = true; res(); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return { done, stop() { stopped = true; cancelAnimationFrame(raf); }, clear() { stopped = true; cancelAnimationFrame(raf); ctx.clearRect(0, 0, w, h); } };
  };

  /* A gold thread that trails the pointer across a host element; drifts on its own when idle. */
  FT.trail = (canvas, host) => {
    if (reduced) return;
    let { ctx, w, h } = fit(canvas);
    new ResizeObserver(() => ({ ctx, w, h } = fit(canvas))).observe(host);
    const pts = []; const sparks = []; let last = 0, visible = true;
    new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(host);
    host.addEventListener('pointermove', e => {
      const r = host.getBoundingClientRect();
      pts.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() }); last = performance.now();
    });
    const loop = now => {
      requestAnimationFrame(loop);
      if (!visible) return;
      if (now - last > 1800) { // idle: a slow figure-eight so touch screens see it too
        const t = now / 1400;
        pts.push({ x: w * (0.5 + 0.28 * Math.sin(t)), y: h * (0.34 + 0.12 * Math.sin(t * 2)), t: now });
      }
      while (pts.length && now - pts[0].t > 520) pts.shift();
      ctx.clearRect(0, 0, w, h);
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], age = (now - b.t) / 520;
        ctx.globalAlpha = Math.max(0, 1 - age);
        stroke(ctx, a.x, a.y, b.x, b.y, 2.2 * (1 - age * 0.6), false);
      }
      ctx.globalAlpha = 1;
      const head = pts[pts.length - 1];
      if (head && Math.random() < 0.7) sparks.push(spark(head.x, head.y, 0.9));
      drawSparks(ctx, sparks, false);
    };
    requestAnimationFrame(loop);
  };

  /* Brand path: the two ribbons of the F mark. */
  FT.PATH_F = [
    [[0.22, 0.9], [0.22, 0.34], [0.3, 0.16], [0.84, 0.16], [0.76, 0.28], [0.36, 0.28]],
    [[0.36, 0.5], [0.44, 0.42], [0.8, 0.42], [0.72, 0.53], [0.46, 0.53]],
    [[0.46, 0.53], [0.46, 0.92]],
  ];
  /* Embroidery laid over the kaftan's chest in the concept frame. */
  FT.PATH_EMB = (() => {
    const p = [[[0.34, 0.17], [0.5, 0.31], [0.66, 0.17]], [[0.4, 0.17], [0.5, 0.26], [0.6, 0.17]], [[0.08, 0.34], [0.92, 0.34]], [[0.08, 0.365], [0.92, 0.365]]];
    for (let i = 0; i < 15; i++) { const x = 0.12 + i * 0.054; p.push([[x, 0.385], [x, 0.435]]); }
    p.push([[0.12, 0.455], [0.88, 0.455]]);
    return p;
  })();

  /* ═════════ Loader ═════════ */
  function loader() {
    const L = $('#ft-loader');
    if (!L || document.documentElement.classList.contains('seen') || reduced) { L?.remove(); ss.set('ft.seen', '1'); return Promise.resolve(); }
    ss.set('ft.seen', '1');
    const art = $('.ld-art', L), bar = $('.ld-bar i', L), pct = $('.ld-pct', L);
    const th = FT.thread($('canvas', L), { paths: FT.PATH_F, duration: 1500, width: 3, light: true, glints: 0 });
    let loaded = document.readyState === 'complete';
    addEventListener('load', () => (loaded = true), { once: true });
    const t0 = performance.now();
    return new Promise(resolve => {
      const tick = () => {
        const el = performance.now() - t0;
        const target = loaded || el > 3200 ? 100 : Math.min(92, el / 18);
        const cur = Math.min(target, Number(pct.dataset.v || 0) + 3 + Math.random() * 4);
        pct.dataset.v = cur; pct.textContent = String(Math.round(cur)).padStart(2, '0');
        bar.style.transform = `scaleX(${cur / 100})`;
        if (cur >= 100 && el > 1500) {
          art.classList.add('show');
          setTimeout(() => { L.classList.add('lift'); setTimeout(() => { th.stop(); L.remove(); }, 1000); resolve(); }, 650);
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  /* ═════════ Page wipe between pages ═════════ */
  FT.go = url => {
    if (reduced) { location.href = url; return; }
    const w = $('#ft-wipe');
    ss.set('ft.wipe', '1');
    w.classList.remove('reveal'); void w.offsetWidth; w.classList.add('cover');
    setTimeout(() => (location.href = url), 560);
  };
  function wipeIn() {
    const html = document.documentElement, w = $('#ft-wipe');
    if (!html.classList.contains('wiping')) return Promise.resolve();
    ss.set('ft.wipe', null);
    return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => {
      w.classList.add('reveal');
      setTimeout(r, 220);
      setTimeout(() => { html.classList.remove('wiping'); w.classList.remove('reveal', 'cover'); }, 760);
    })));
  }
  addEventListener('pageshow', e => { if (e.persisted) { $('#ft-wipe')?.classList.remove('cover', 'reveal'); document.documentElement.classList.remove('wiping', 'menu-open'); } });
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) {
      if (url.hash) { document.documentElement.classList.remove('menu-open'); return; } // in-page anchor
      e.preventDefault(); document.documentElement.classList.remove('menu-open'); scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' }); return;
    }
    e.preventDefault(); FT.go(url.href);
  });

  /* ═════════ Nav: active page, hide on scroll down, mobile menu ═════════ */
  function nav() {
    const page = document.body.dataset.page;
    $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === page));
    const n = $('.nav'); let lastY = scrollY;
    addEventListener('scroll', () => {
      const y = scrollY;
      n.classList.toggle('scrolled', y > 8);
      const open = document.documentElement.classList.contains('menu-open');
      if (!open && document.body.dataset.page !== 'studio') n.classList.toggle('hide', y > lastY && y > 320);
      lastY = y;
    }, { passive: true });
    const btn = $('.menu-btn');
    btn?.addEventListener('click', () => {
      const open = document.documentElement.classList.toggle('menu-open');
      btn.setAttribute('aria-expanded', open); btn.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
    });
    addEventListener('keydown', e => { if (e.key === 'Escape') document.documentElement.classList.remove('menu-open'); });
  }

  /* ═════════ Cursor + magnetic buttons ═════════ */
  function cursor() {
    if (!fine || reduced) return;
    const c = $('#ft-cursor'); if (!c) return;
    let x = -100, y = -100, cx = -100, cy = -100;
    addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; c.classList.add('on'); }, { passive: true });
    document.addEventListener('pointerleave', () => c.classList.remove('on'));
    const loop = () => { cx += (x - cx) * 0.2; cy += (y - cy) * 0.2; c.style.transform = `translate3d(${cx}px,${cy}px,0)`; requestAnimationFrame(loop); };
    loop();
    const hot = 'a,button,.vendor,input,textarea,select,label[for]';
    document.addEventListener('pointerover', e => { if (e.target.closest(hot)) c.classList.add('big'); });
    document.addEventListener('pointerout', e => { if (e.target.closest(hot)) c.classList.remove('big'); });
  }
  FT.magnetic = (root = document) => {
    if (!fine || reduced) return;
    $$('.mag', root).forEach(b => {
      if (b.dataset.mag) return; b.dataset.mag = '1';
      b.addEventListener('pointermove', e => {
        const r = b.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) / r.width, dy = (e.clientY - (r.top + r.height / 2)) / r.height;
        b.style.transition = 'transform .15s'; b.style.transform = `translate(${dx * 12}px,${dy * 9}px)`;
      });
      b.addEventListener('pointerleave', () => { b.style.transition = 'transform .7s cubic-bezier(.22,1.4,.36,1)'; b.style.transform = ''; });
    });
  };

  /* ═════════ Split-text headlines + reveals ═════════ */
  function split(el) {
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.className = 'w';
            const s = document.createElement('span'); s.textContent = part; s.style.setProperty('--i', i++);
            w.appendChild(s); frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el); el.classList.add('ready');
  }
  function reveals() {
    $$('.split').forEach(split);
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in'); io.unobserve(e.target);
      e.target.dispatchEvent(new CustomEvent('ft:in'));
    }), { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    $$('.split,.rv,[data-inview]').forEach(el => io.observe(el));
  }
  FT.onView = (el, cb, threshold = 0.3) => {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { cb(e.target); io.disconnect(); } }), { threshold });
    io.observe(el);
  };

  /* ═════════ FLIP: animate list reorders ═════════ */
  FT.flip = (getItems, mutate) => {
    const first = new Map(getItems().map(el => [el, el.getBoundingClientRect()]));
    mutate();
    if (reduced) return;
    getItems().forEach(el => {
      const f = first.get(el);
      if (!f) { el.animate([{ opacity: 0, transform: 'scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.16,1,.3,1)' }); return; }
      const l = el.getBoundingClientRect(), dx = f.left - l.left, dy = f.top - l.top;
      if (dx || dy) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.22,1.15,.36,1)' });
    });
  };

  /* ═════════ Segmented control ═════════ */
  FT.seg = (root, onChange) => {
    const ind = document.createElement('span'); ind.className = 'ind'; root.prepend(ind);
    const btns = $$('button', root);
    const place = b => { ind.style.width = b.offsetWidth + 'px'; ind.style.transform = `translateX(${b.offsetLeft - 4}px)`; };
    const set = (b, fire) => { btns.forEach(x => x.setAttribute('aria-pressed', x === b)); place(b); if (fire) onChange?.(b.dataset.v); };
    btns.forEach(b => b.addEventListener('click', () => set(b, true)));
    const cur = btns.find(b => b.getAttribute('aria-pressed') === 'true') || btns[0];
    requestAnimationFrame(() => set(cur, false));
    new ResizeObserver(() => place(btns.find(b => b.getAttribute('aria-pressed') === 'true') || btns[0])).observe(root);
    return { set: v => { const b = btns.find(x => x.dataset.v === v); if (b) set(b, false); } };
  };

  /* ═════════ Vendor ranking + card (shared by home, studio, tailors) ═════════ */
  FT.score = (v, all) => {
    const r = all.map(x => x.rating), p = all.map(x => x.price), d = all.map(x => x.deliveryDays);
    const n = (x, arr) => { const lo = Math.min(...arr), hi = Math.max(...arr); return hi === lo ? 1 : (x - lo) / (hi - lo); };
    return 0.5 * n(v.rating, r) + 0.3 * (1 - n(v.price, p)) + 0.2 * (1 - n(v.deliveryDays, d));
  };
  FT.sortVendors = (list, by) => {
    const a = [...list];
    if (by === 'price') a.sort((x, y) => x.price - y.price || y.rating - x.rating);
    else if (by === 'fast') a.sort((x, y) => x.deliveryDays - y.deliveryDays || y.rating - x.rating);
    else if (by === 'rating') a.sort((x, y) => y.rating - x.rating || x.price - y.price);
    else a.sort((x, y) => FT.score(y, list) - FT.score(x, list));
    return a;
  };
  FT.vendorTags = (v, all) => {
    const t = [];
    if (v.price === Math.min(...all.map(x => x.price))) t.push('Lowest price');
    if (v.deliveryDays === Math.min(...all.map(x => x.deliveryDays))) t.push('Fastest');
    if (v.rating === Math.max(...all.map(x => x.rating))) t.push('Top rated');
    return t;
  };
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  FT.STAR = STAR;
  FT.vendorEl = (v, { tag = 'button' } = {}) => {
    const el = document.createElement(tag); el.className = 'vendor'; el.dataset.id = v.id;
    if (tag === 'button') { el.type = 'button'; el.setAttribute('role', 'radio'); }
    el.innerHTML = `<span class="vn"><span></span>${v.verified ? STAR : ''}</span><span class="vp"></span><span class="vm"></span><span class="vd"></span><span class="vt"></span>`;
    FT.vendorFill(el, v); return el;
  };
  FT.vendorFill = (el, v, tags = []) => {
    $('.vn span', el).textContent = v.name;
    $('.vp', el).textContent = '$' + Math.round(v.price);
    $('.vm', el).textContent = `${v.rating.toFixed(1)} ★${v.verified ? ' (Verified)' : ''}${v.city ? ', ' + v.city : ''}`;
    $('.vd', el).textContent = `${v.deliveryDays} days`;
    $('.vt', el).innerHTML = tags.map(t => `<span class="tag${t === 'You' ? ' ink' : ''}">${FT.esc(t)}</span>`).join('');
  };

  /* ═════════ Accordion ═════════ */
  function accordions() {
    $$('.acc-q').forEach(q => q.addEventListener('click', () => {
      const item = q.closest('.acc-item'), open = !item.classList.contains('open');
      item.classList.toggle('open', open); q.setAttribute('aria-expanded', open);
    }));
  }

  /* ═════════ Marquee ═════════ */
  function marquees() {
    $$('.marquee .track').forEach(t => { t.innerHTML += t.innerHTML; });
  }

  /* ═════════ Forms (tailor application, contact) ═════════ */
  FT.form = (form, { kind, rules, done }) => {
    const set = (name, msg) => {
      const f = form.querySelector(`[name="${name}"]`)?.closest('.field'); if (!f) return;
      f.classList.toggle('bad', !!msg); const m = $('.msg', f); if (m) m.textContent = msg || '';
    };
    form.addEventListener('input', e => { if (e.target.name) set(e.target.name, ''); });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      $$('[data-multi]', form).forEach(g => (data[g.dataset.multi] = $$('[aria-pressed="true"]', g).map(b => b.dataset.v)));
      let firstBad = null;
      for (const [name, check] of Object.entries(rules)) {
        const msg = check(data[name], data); set(name, msg);
        if (msg && !firstBad) firstBad = form.querySelector(`[name="${name}"]`);
      }
      if (firstBad) { firstBad.focus(); return; }
      const btn = $('button[type="submit"]', form), label = btn.innerHTML;
      btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Sending';
      const endpoint = (window.FT_CONFIG || {}).formEndpoint;
      try {
        if (endpoint) {
          const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ kind, ...data }) });
          if (!r.ok) throw new Error();
        } else {
          await wait(700);
          const k = 'ft.' + kind; const prev = JSON.parse(localStorage.getItem(k) || '[]');
          prev.push({ ...data, at: new Date().toISOString() }); localStorage.setItem(k, JSON.stringify(prev));
        }
        done?.(data);
      } catch {
        FT.toast('That did not send. Check your connection and try again.');
      } finally { btn.disabled = false; btn.innerHTML = label; }
    });
  };

  /* ═════════ Boot ═════════ */
  document.addEventListener('DOMContentLoaded', async () => {
    const yr = $('[data-year]'); if (yr) yr.textContent = new Date().getFullYear();
    nav(); cursor(); FT.magnetic(); accordions(); marquees();
    await Promise.all([loader(), wipeIn()]);
    reveals();
    readyResolve();
  });
})();
