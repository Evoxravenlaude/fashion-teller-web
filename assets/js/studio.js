/**
 * Studio — the product. Port of FashionTellerProductView + FashionTellerProductScreen,
 * split into four steps: Describe, Refine, Choose tailor, Track.
 * State is kept in sessionStorage so leaving the page and coming back resumes where you were.
 */
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const { $, $$, reduced } = FT;
    const A = window.FTApi;
    const KEY = 'ft.studio';
    const PHASES = [
      ['AI Concept Generated', 'Your description became a design.'],
      ['Vendor Assigned', 'The tailor has your approved version and quote.'],
      ['Fabric Sourcing & Tailoring', 'Fabric sourced; cutting and embroidery in progress.'],
      ['Doorstep Quality Delivery', 'Quality checked and delivered to your door.'],
    ];
    const fresh = () => ({ step: 1, prompt: '', garment: 'Kaftan', fabric: 'Silk', accent: 'Gold', design: null, vendors: [], sort: 'match', vendorId: null, order: null, view: null });
    let S = (() => { try { return { ...fresh(), ...JSON.parse(sessionStorage.getItem(KEY)) }; } catch { return fresh(); } })();
    const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
    let busy = null, poll = null, thread = null, vendorsLoading = false;

    // A prompt handed over from the home page starts a new design.
    const handed = new URLSearchParams(location.search).get('prompt');
    if (handed) { S = { ...fresh(), prompt: handed }; sessionStorage.removeItem('ft.sample.design'); history.replaceState(null, '', location.pathname); save(); }

    const stage = $('#stage'), video = $('#stVideo'), canvas = $('#stThread');
    const approved = () => !!S.order;
    const phase = () => (S.order ? A.phaseIndex(S.order.phase) : 0);
    const cur = () => S.vendors.find(v => v.id === S.vendorId) || S.vendors[0];
    $('#stSample').hidden = !A.sample;
    document.addEventListener('visibilitychange', () => { if (document.hidden) video.pause(); else if (S.design) video.play().catch(() => {}); });

    /* ───────── stage ───────── */
    const setVideo = () => {
      const src = FT.videoSrc(S.design?.videoUrl || '/assets/media/kaftan.mp4');
      if (video.getAttribute('src') !== src) video.setAttribute('src', src);
      video.play().catch(() => {});
    };
    const conceptTitle = () => `${S.garment} in ${S.fabric.toLowerCase()}, ${S.accent.toLowerCase()} accents`;
    function renderStage() {
      stage.classList.toggle('has', !!S.design);
      if (S.design) setVideo();
      $('#stVer').textContent = 'v' + (S.design?.version ?? 1);
      const refs = S.design?.refinements || [];
      const versions = [S.prompt || conceptTitle(), ...refs];
      const view = S.view == null ? versions.length - 1 : Math.min(S.view, versions.length - 1);
      $('#stTitle').textContent = S.design ? (view === 0 ? versions[0] : versions[view]) : '';
      const ol = $('#stVersions');
      if (!S.design) { ol.innerHTML = ''; return; }
      if (ol.children.length !== versions.length) {
        ol.innerHTML = versions.map((t, i) => `<li><button type="button" data-v="${i}" title="${FT.esc(t)}">v${i + 1}</button></li>`).join('');
        ol.scrollLeft = ol.scrollWidth;
      }
      $$('button', ol).forEach(b => b.setAttribute('aria-current', +b.dataset.v === view));
    }
    $('#stVersions').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.view = +b.dataset.v; renderStage(); });

    const genUI = (on, cls = 'gen') => stage.classList.toggle(cls, on);
    async function stitch(ms, steps) {
      thread?.clear(); canvas.classList.remove('fade');
      thread = FT.thread(canvas, { paths: FT.PATH_EMB, duration: ms, width: 1.8 });
      const text = $('#stGenText'), bar = $('#stGenBar'); const t0 = performance.now();
      const tick = () => {
        const p = Math.min(1, (performance.now() - t0) / ms);
        bar.style.width = p * 100 + '%';
        text.textContent = steps[Math.min(steps.length - 1, Math.floor(p * steps.length))];
        if (p < 1) requestAnimationFrame(tick);
      };
      tick();
      await thread.done; await FT.wait(reduced ? 0 : 250);
    }
    const fadeThread = () => { canvas.classList.add('fade'); setTimeout(() => thread?.clear(), 900); };

    /* ───────── stepper + panes ───────── */
    const reachable = n => (approved() ? n === 4 : n === 1 || (n <= 3 && !!S.design));
    function go(n, { force } = {}) {
      if (!force && !reachable(n)) return;
      const back = n < S.step; S.step = n; save();
      $$('.pane').forEach(p => {
        const on = +p.dataset.pane === n;
        if (on && !p.classList.contains('on')) { p.classList.add('on', 'enter'); p.classList.toggle('back', back); p.addEventListener('animationend', () => p.classList.remove('enter', 'back'), { once: true }); p.scrollTop = 0; }
        if (!on) p.classList.remove('on');
      });
      render();
      if (n === 3 && S.design && !S.vendors.length) loadQuotes();
      if (matchMedia('(max-width: 980px)').matches) $('.st-panel').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
    $('#stepper').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) go(+b.dataset.go); });

    /* ───────── step 1: describe ───────── */
    const prompt = $('#prompt');
    prompt.value = S.prompt;
    $$('[data-pick]').forEach(g => {
      const key = g.dataset.pick;
      const sync = () => $$('button', g).forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S[key]));
      g.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || approved()) return; S[key] = b.dataset.v; sync(); save(); });
      sync();
    });
    prompt.addEventListener('input', () => { S.prompt = prompt.value; $('#err1').textContent = ''; save(); });
    prompt.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(); });

    async function generate() {
      const text = prompt.value.trim();
      if (!text) { $('#err1').textContent = 'Describe the garment first. One sentence is enough.'; prompt.focus(); return; }
      if (busy || approved()) return;
      if (!A.signedIn()) { openLogin(generate); return; }
      busy = 'gen'; S.prompt = text; render(); genUI(true);
      if (matchMedia('(max-width: 980px)').matches) stage.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      const full = `${text} (${S.garment}, ${S.fabric}, ${S.accent} accents)`;
      const req = A.createDesign(full); req.catch(() => {});
      try {
        await stitch(2800, ['Reading your description', 'Drafting the silhouette', `Placing the ${S.accent.toLowerCase()} embroidery`, 'Finishing concept v1']);
        S.design = await req; S.vendors = []; S.vendorId = null; S.view = null; save();
        genUI(false); renderStage(); fadeThread();
        FT.toast('Concept v1 is ready');
        setTimeout(() => go(2), 500);
      } catch (e) {
        genUI(false); thread?.clear();
        $('#err1').textContent = e.message || 'The concept was not generated. Try again.';
      } finally { busy = null; render(); }
    }
    $('#genBtn').addEventListener('click', generate);

    /* ───────── step 2: refine ───────── */
    const refine = $('#refine');
    $('#refChips').addEventListener('click', e => { const b = e.target.closest('[data-fill]'); if (!b || approved()) return; refine.value = b.dataset.fill; refine.focus(); render(); });
    refine.addEventListener('input', () => { $('#err2').textContent = ''; render(); });
    refine.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); applyRefinement(); } });
    async function applyRefinement() {
      const text = refine.value.trim();
      if (!text || busy || approved() || !S.design) return;
      busy = 'ref'; render(); genUI(true, 'ref');
      const req = A.refineDesign(S.design.id, text); req.catch(() => {});
      try {
        const next = S.design.version + 1;
        await stitch(1500, ['Reading the change', `Rendering concept v${next}`]);
        S.design = await req; S.view = null; refine.value = ''; save();
        const badge = $('#stBadge'); badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump');
        FT.toast(`Refinement applied. Concept v${S.design.version}`);
      } catch (e) {
        $('#err2').textContent = e.message || 'The refinement was not saved. Try again.';
      } finally { genUI(false, 'ref'); fadeThread(); busy = null; render(); renderStage(); }
    }
    $('#refBtn').addEventListener('click', applyRefinement);
    $('#toTailors').addEventListener('click', () => go(3));

    /* ───────── step 3: tailors ───────── */
    const vlist = $('#vlist'); const els = new Map();
    async function loadQuotes() {
      vendorsLoading = true; render();
      try {
        S.vendors = await A.listQuotes(S.design.id);
        S.vendorId = S.vendorId && S.vendors.some(v => v.id === S.vendorId) ? S.vendorId : FT.sortVendors(S.vendors, 'match')[0]?.id;
        save();
      } catch (e) { $('#err3').textContent = e.message || 'Quotes did not load. Try again.'; }
      finally { vendorsLoading = false; render(); }
    }
    function renderVendors(animate) {
      if (!S.vendors.length) {
        els.clear();
        vlist.innerHTML = `<p class="body" style="font-size:15px">${vendorsLoading ? '<span class="spin" style="display:inline-block;vertical-align:-3px;margin-right:8px"></span>Finding verified tailors for this design…' : 'No verified tailor has quoted on this design yet. Check back shortly.'}</p>`;
        return;
      }
      if (!els.size) vlist.innerHTML = '';
      const apply = () => FT.sortVendors(S.vendors, S.sort).forEach(v => {
        let el = els.get(v.id);
        if (!el) { el = FT.vendorEl(v); els.set(v.id, el); }
        FT.vendorFill(el, v, FT.vendorTags(v, S.vendors));
        const on = v.id === cur()?.id;
        el.classList.toggle('on', on); el.setAttribute('aria-checked', on); el.setAttribute('aria-disabled', approved());
        vlist.appendChild(el);
      });
      animate ? FT.flip(() => [...vlist.children], apply) : apply();
    }
    const seg = FT.seg($('#sortSeg'), by => { S.sort = by; save(); renderVendors(true); });
    seg.set(S.sort);
    vlist.addEventListener('click', e => { const b = e.target.closest('.vendor'); if (!b || approved() || busy) return; S.vendorId = b.dataset.id; save(); render(); });

    async function approve() {
      const v = cur(); if (!v || busy || approved()) return;
      if (!A.signedIn()) { openLogin(approve); return; }
      busy = 'approve'; $('#err3').textContent = ''; render();
      try {
        const o = await A.createOrder(S.design.id, v.id);
        S.order = { ...o, vendorName: v.name, deliveryDays: v.deliveryDays, version: S.design.version, createdAt: Date.now() };
        save(); burst();
        FT.toast('Production initiated with ' + v.name);
        startPoll();
        setTimeout(() => go(4, { force: true }), 900);
      } catch (e) { $('#err3').textContent = e.message || 'Production was not started. Try again.'; }
      finally { busy = null; render(); }
    }
    $('#ctaBtn').addEventListener('click', approve);
    function burst() {
      if (reduced) return;
      const paths = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return [[0.5 + Math.cos(a) * 0.06, 0.42 + Math.sin(a) * 0.04], [0.5 + Math.cos(a) * 0.42, 0.42 + Math.sin(a) * 0.28]]; });
      thread?.clear(); canvas.classList.remove('fade');
      thread = FT.thread(canvas, { paths, duration: 900, width: 1.4 });
      thread.done.then(() => setTimeout(fadeThread, 300));
    }

    /* ───────── step 4: track ───────── */
    function startPoll() {
      clearInterval(poll);
      if (!S.order || S.order.phase === 'delivered') return;
      poll = setInterval(async () => {
        try {
          const o = await A.getOrder(S.order.id);
          if (o.phase !== S.order.phase) { S.order.phase = o.phase; save(); render(); if (o.phase === 'delivered') FT.toast('Delivered. Enjoy wearing it.'); }
          if (o.phase === 'delivered') clearInterval(poll);
        } catch {}
      }, A.pollMs);
    }
    function renderTrack() {
      const p = phase();
      $('#trkTitle').textContent = p >= 3 ? 'Delivered to your door' : 'Production is under way';
      $('#trkHint').textContent = S.order ? (A.sample ? 'Sample mode moves the order one phase every 12 seconds.' : 'The tracker checks for updates every 30 seconds.') : '';
      $('#trkV').innerHTML = PHASES.map(([t, d], i) => `<li class="${i < p || (i === p && p === 3) ? 'done' : i === p ? 'now' : ''}"><span class="dot"><i></i></span><div><h3>${t}</h3><p>${d}</p></div></li>`).join('');
      if (!S.order) { $('#summary').innerHTML = ''; return; }
      $('#summary').innerHTML = `<dt>Order</dt><dd>${FT.esc(S.order.id)}</dd><dt>Tailor</dt><dd>${FT.esc(S.order.vendorName || '')}</dd><dt>Design</dt><dd>Concept v${S.order.version}</dd><dt>Delivery</dt><dd>${S.order.deliveryDays} days</dd><dt>Total</dt><dd>${FT.money(S.order.total)}</dd>`;
    }
    $('#shareBtn').addEventListener('click', () => {
      const url = location.origin + '/studio', text = 'I designed this on Fashion Teller.';
      if (navigator.share) navigator.share({ title: 'Fashion Teller', text, url }).catch(() => {});
      else navigator.clipboard?.writeText(url).then(() => FT.toast('Link copied')).catch(() => FT.toast(url));
    });
    $('#newBtn').addEventListener('click', () => {
      clearInterval(poll); thread?.clear();
      S = fresh(); sessionStorage.removeItem('ft.sample.design'); sessionStorage.removeItem('ft.sample.orderAt'); save();
      prompt.value = ''; refine.value = ''; els.clear(); vlist.innerHTML = '';
      $$('[data-pick]').forEach(g => $$('button', g).forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S[g.dataset.pick])));
      video.pause(); render(); renderStage(); go(1, { force: true }); prompt.focus();
    });

    /* ───────── sign in (only when a backend is configured) ───────── */
    let after = null;
    const openLogin = fn => { after = fn; $('#sheetBg').classList.add('on'); $('#login').classList.add('on'); setTimeout(() => $('#email').focus(), 300); };
    const closeLogin = () => { $('#sheetBg').classList.remove('on'); $('#login').classList.remove('on'); };
    $('#sheetBg').addEventListener('click', closeLogin); $('#loginCancel').addEventListener('click', closeLogin);
    addEventListener('keydown', e => { if (e.key === 'Escape') closeLogin(); });
    $('#loginForm').addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#email').value.trim(), pass = $('#pass').value, err = $('#loginErr'), b = $('#loginBtn');
      if (!email || !pass) { err.textContent = 'Enter your email and password.'; return; }
      b.disabled = true; b.innerHTML = '<span class="spin"></span>Entering'; err.textContent = '';
      try { await A.login(email, pass); closeLogin(); const fn = after; after = null; fn?.(); }
      catch (x) { err.textContent = x.message || 'Sign in did not go through. Try again.'; }
      finally { b.disabled = false; b.textContent = 'Enter workspace'; }
    });

    /* ───────── render ───────── */
    function render() {
      $$('#stepper [data-go]').forEach(b => {
        const n = +b.dataset.go;
        b.classList.toggle('cur', n === S.step);
        b.classList.toggle('done', n < S.step || (approved() && n < 4) || (n === 1 && !!S.design && S.step !== 1));
        b.disabled = !reachable(n);
        if (n === S.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
      // step 1
      prompt.disabled = approved() || busy === 'gen';
      const gb = $('#genBtn');
      gb.disabled = !!busy || approved();
      gb.innerHTML = busy === 'gen' ? '<span class="spin"></span>Generating' : S.design ? 'Generate a new concept' : 'Generate concept';
      // step 2
      refine.disabled = approved() || busy === 'ref';
      const rb = $('#refBtn');
      rb.disabled = !refine.value.trim() || approved() || !!busy;
      rb.innerHTML = busy === 'ref' ? '<span class="spin"></span>Applying' : 'Apply refinement';
      const refs = S.design?.refinements || [];
      const hist = $('#hist');
      if (hist.children.length !== refs.length) hist.innerHTML = refs.map((r, i) => `<li><b>v${i + 2}</b><span>${FT.esc(r)}</span></li>`).reverse().join('');
      // step 3 + drawer
      renderVendors(false);
      const v = cur(); const drawer = $('#drawer');
      drawer.hidden = !(S.step === 3 || S.step === 4) || !S.design;
      $('#priceNote').textContent = v ? `${v.name}, ${v.deliveryDays} days` : vendorsLoading ? 'Loading quotes' : 'Choose a tailor';
      $('#price').textContent = S.order ? FT.money(S.order.total) : v ? FT.money(v.price) : '—';
      const cta = $('#ctaBtn');
      cta.classList.toggle('done', approved());
      cta.disabled = approved() || !v || !!busy;
      $('#ctaIcon').style.display = approved() || busy === 'approve' ? 'none' : '';
      $('#ctaText').textContent = approved() ? 'Production initiated' : busy === 'approve' ? 'Starting production' : 'Approve design & initiate production';
      if (busy === 'approve' && !$('#ctaBtn .spin')) cta.insertAdjacentHTML('afterbegin', '<span class="spin"></span>');
      if (busy !== 'approve') $('#ctaBtn .spin')?.remove();
      // step 4
      renderTrack();
    }

    /* ───────── boot ───────── */
    renderStage();
    if (approved()) { S.step = 4; startPoll(); }
    else if (S.step > 1 && !S.design) S.step = 1;
    go(S.step, { force: true });
    if (S.step === 3 && S.design && !S.vendors.length) loadQuotes();
    FT.ready.then(() => { if (!S.design && !handed) prompt.focus({ preventScroll: true }); if (handed) FT.wait(400).then(generate); });
  });
})();
