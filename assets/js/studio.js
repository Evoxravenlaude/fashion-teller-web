/**
 * Studio — the product. Six steps: Describe → Refine → Measure → Tailors → Pay → Track.
 * Designs, versions, measurements, quotes, orders and payments all live in the account (FTApi);
 * only the position in the flow is kept in sessionStorage so a reload resumes where you were.
 */
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const { $, $$, reduced } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount, E = window.FTEngine, C = window.FT_CONFIG || {};
    const KEY = 'ft.studio';
    const fresh = () => ({ step: 1, prompt: '', garment: 'Kaftan', fabric: 'Silk', accent: 'Gold', designId: null, view: null, sort: 'match', quoteId: null, picked: false, orderId: null, plan: 'full', method: 'card', measurementId: null, notes: '', deadline: '', requested: false });
    let S = (() => { try { return { ...fresh(), ...JSON.parse(sessionStorage.getItem(KEY)) }; } catch { return fresh(); } })();
    const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
    let design = null, quotes = [], order = null, measurements = [], busy = null, poll = null, thread = null, quotesLoading = false, lastQuoteCount = -1;

    const qs = new URLSearchParams(location.search);
    const handed = qs.get('prompt'), openDesign = qs.get('design'), openOrder = qs.get('order'), wantPay = qs.get('pay') === '1';
    if (handed) { S = { ...fresh(), prompt: handed }; save(); }
    if (openDesign) { S = { ...fresh(), designId: openDesign, step: 2 }; save(); }
    if (openOrder) { S = { ...fresh(), orderId: openOrder, step: 6 }; save(); }
    if (handed || openDesign || openOrder) history.replaceState(null, '', location.pathname);

    const stage = $('#stage'), art = $('#stArt'), canvas = $('#stThread');
    const approved = () => !!order && order.status !== 'awaiting_payment' && order.status !== 'cancelled';
    const phase = () => (order ? A.phaseIndex(order.phase) : 0);
    const curVersion = () => design && App.version(design, S.view ?? design.current);
    const curQuote = () => quotes.find(q => q.id === S.quoteId) || FT.sortVendors(quotes.map(qv), S.sort)[0] && quotes.find(q => q.id === FT.sortVendors(quotes.map(qv), S.sort)[0].id);
    const qv = q => ({ id: q.id, name: q.vendor.name, city: q.vendor.city, rating: q.vendor.rating, verified: q.vendor.verified, price: q.price, deliveryDays: q.deliveryDays, note: q.note, vendor: q.vendor });
    $('#stSample').hidden = !A.local;
    const narrow = () => matchMedia('(max-width: 759px)').matches;

    /* ───────── stage ───────── */
    let artKey = '';
    function renderStage() {
      stage.classList.toggle('has', !!design);
      const v = curVersion();
      if (!design || !v) { art.innerHTML = ''; artKey = ''; $('#stTitle').textContent = ''; $('#stSub').textContent = ''; $('#stVersions').innerHTML = ''; $('#stRestore').hidden = true; return; }
      const key = design.id + ':' + v.n;
      if (key !== artKey) { artKey = key; art.innerHTML = E.render(v.spec, { id: 'st' }); art.classList.remove('in'); void art.offsetWidth; art.classList.add('in'); }
      $('#stVer').textContent = 'v' + v.n;
      $('#stTitle').textContent = v.n === 1 ? design.prompt : v.instruction;
      $('#stSub').textContent = v.n === 1 ? E.title(v.spec) : v.changes.length ? v.changes.join(' · ') : 'Noted for the tailor';
      const ol = $('#stVersions');
      if (ol.children.length !== design.versions.length) { ol.innerHTML = design.versions.map(x => `<li><button type="button" data-v="${x.n}" title="${FT.esc(x.instruction || design.prompt)}">v${x.n}</button></li>`).join(''); ol.scrollLeft = ol.scrollWidth; }
      $$('button', ol).forEach(b => b.setAttribute('aria-current', +b.dataset.v === v.n));
      $('#stRestore').hidden = v.n === design.current || design.status === 'ordered';
    }
    $('#stVersions').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.view = +b.dataset.v; save(); renderStage(); render(); });
    $('#stRestore').addEventListener('click', async () => {
      if (!design || busy) return; const n = S.view; busy = 'restore';
      try { design = await A.restoreVersion(design.id, n); S.view = null; save(); FT.toast(`Version ${n} restored as v${design.current}`); } catch (e) { FT.toast(e.message); }
      finally { busy = null; renderStage(); render(); }
    });

    const genUI = (on, cls = 'gen') => stage.classList.toggle(cls, on);
    async function stitch(ms, steps, paths) {
      thread?.clear(); canvas.classList.remove('fade');
      thread = FT.thread(canvas, { paths, duration: ms, width: 1.8 });
      const text = $('#stGenText'), bar = $('#stGenBar'); const t0 = performance.now();
      const tick = () => { const p = Math.min(1, (performance.now() - t0) / ms); bar.style.width = p * 100 + '%'; text.textContent = steps[Math.min(steps.length - 1, Math.floor(p * steps.length))]; if (p < 1) requestAnimationFrame(tick); };
      tick(); await thread.done; await FT.wait(reduced ? 0 : 250);
    }
    const fadeThread = () => { canvas.classList.add('fade'); setTimeout(() => thread?.clear(), 900); };

    /* ───────── stepper + panes ───────── */
    const reachable = n => {
      if (approved()) return n === 6 || n === 1;
      if (n === 1) return true;
      if (n === 2 || n === 3) return !!design;
      if (n === 4) return !!design && S.requested;
      if (n === 5) return !!order && order.status === 'awaiting_payment';
      return false;
    };
    function go(n, { force } = {}) {
      if (!force && !reachable(n)) return;
      const back = n < S.step; S.step = n; save();
      $$('.pane').forEach(p => {
        const on = +p.dataset.pane === n;
        if (on && !p.classList.contains('on')) { p.classList.add('on', 'enter'); p.classList.toggle('back', back); p.addEventListener('animationend', () => p.classList.remove('enter', 'back'), { once: true }); p.scrollTop = 0; }
        if (!on) p.classList.remove('on');
      });
      render();
      if (n === 3) loadMeasurements();
      if (n === 4) startQuotePoll(); else stopQuotePoll();
      if (n === 6) startOrderPoll();
      if (narrow()) $('.st-panel').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
    $('#stepper').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) go(+b.dataset.go); });

    /* ───────── step 1: describe ───────── */
    const prompt = $('#prompt'); prompt.value = S.prompt;
    $$('[data-pick]').forEach(g => {
      const key = g.dataset.pick; const sync = () => $$('button', g).forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S[key]));
      g.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S[key] = b.dataset.v; sync(); save(); }); sync();
    });
    prompt.addEventListener('input', () => { S.prompt = prompt.value; $('#err1').textContent = ''; save(); });
    prompt.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate(); });
    async function generate() {
      const text = prompt.value.trim();
      if (!text) { $('#err1').textContent = 'Describe the garment first. One sentence is enough.'; prompt.focus(); return; }
      if (busy) return;
      if (!A.signedIn()) { const u = await Acc.open({ message: 'Sign in so your concept and its versions are saved to your account.' }); if (!u) return; }
      busy = 'gen'; S.prompt = text; render(); genUI(true);
      if (narrow()) stage.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      const hints = { garment: S.garment, fabric: S.fabric, accent: S.accent };
      const preview = E.parse(text, hints);
      const req = A.createDesign({ prompt: text, hints }); req.catch(() => {});
      try {
        await stitch(2800, ['Reading your description', 'Drafting the silhouette', `Placing the ${preview.accent} ${preview.embroidery === 'none' ? 'details' : 'embroidery'}`, 'Finishing concept v1'], E.stitches(preview));
        design = await req; order = null; quotes = []; S = { ...S, designId: design.id, view: null, quoteId: null, orderId: null, requested: false }; save();
        genUI(false); artKey = ''; renderStage(); fadeThread();
        FT.toast('Concept v1 is ready and saved');
        setTimeout(() => go(2), 500);
      } catch (e) { genUI(false); thread?.clear(); $('#err1').textContent = e.message || 'The concept was not generated. Try again.'; }
      finally { busy = null; render(); }
    }
    $('#genBtn').addEventListener('click', generate);

    /* ───────── step 2: refine ───────── */
    const refine = $('#refine');
    $('#refChips').addEventListener('click', e => { const b = e.target.closest('[data-fill]'); if (!b || locked()) return; refine.value = b.dataset.fill; refine.focus(); render(); });
    refine.addEventListener('input', () => { $('#err2').textContent = ''; render(); });
    refine.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); applyRefinement(); } });
    const locked = () => !design || design.status === 'ordered' || approved();
    async function applyRefinement() {
      const text = refine.value.trim(); if (!text || busy || locked()) return;
      busy = 'ref'; render(); genUI(true, 'ref');
      const base = App.version(design, design.current).spec, preview = E.refine(base, text);
      const req = A.refineDesign(design.id, text); req.catch(() => {});
      try {
        await stitch(1500, ['Reading the change', preview.changes.length ? preview.changes[0] : 'Noting it for the tailor', `Rendering concept v${design.versions.length + 1}`], E.stitches(preview.spec));
        design = await req; S.view = null; refine.value = ''; save();
        const badge = $('#stBadge'); badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump');
        const v = App.version(design); FT.toast(v.changes.length ? `v${v.n}: ${v.changes.join(', ')}` : `v${v.n} saved. "${text}" noted for the tailor`);
      } catch (e) { $('#err2').textContent = e.message || 'The refinement was not saved. Try again.'; }
      finally { genUI(false, 'ref'); fadeThread(); busy = null; render(); renderStage(); }
    }
    $('#refBtn').addEventListener('click', applyRefinement);
    $('#toMeasure').addEventListener('click', () => go(3));

    /* ───────── step 3: measurements ───────── */
    async function loadMeasurements() { try { measurements = await A.listMeasurements(); if (!S.measurementId || !measurements.some(m => m.id === S.measurementId)) S.measurementId = measurements[0]?.id || null; } catch { measurements = []; } renderMeasurements(); }
    function renderMeasurements() {
      const list = $('#mlist');
      list.innerHTML = measurements.length ? measurements.map(m => `<button type="button" class="mcard${m.id === S.measurementId ? ' on' : ''}" role="radio" aria-checked="${m.id === S.measurementId}" data-id="${m.id}"><span class="mn">${FT.esc(m.label)}</span><span class="ms">${FT.esc(App.measureSummary(m))} · ${FT.esc(m.fit)} fit</span><span class="me" data-edit="${m.id}">Edit</span></button>`).join('')
        : `<p class="body small">No measurements yet. Add a profile once and reuse it on every order.</p>`;
      $('#mNew').hidden = !$('#mformWrap').hidden;
    }
    $('#mlist').addEventListener('click', e => {
      const ed = e.target.closest('[data-edit]'); if (ed) { e.stopPropagation(); openMeasureForm(measurements.find(m => m.id === ed.dataset.edit)); return; }
      const b = e.target.closest('.mcard'); if (!b) return; S.measurementId = b.dataset.id; save(); renderMeasurements();
    });
    function openMeasureForm(existing) {
      const w = $('#mformWrap'); w.hidden = false; $('#mNew').hidden = true;
      App.measureForm(w, { existing, compact: true, onSave: m => { w.hidden = true; S.measurementId = m.id; save(); loadMeasurements(); }, onCancel: () => { w.hidden = true; renderMeasurements(); } });
      w.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
    }
    $('#mNew').addEventListener('click', () => openMeasureForm(null));
    $('#reqNotes').value = S.notes; $('#reqNotes').addEventListener('input', e => { S.notes = e.target.value; save(); });
    $('#reqDeadline').value = S.deadline; $('#reqDeadline').min = new Date().toISOString().slice(0, 10); $('#reqDeadline').addEventListener('change', e => { S.deadline = e.target.value; save(); });
    async function requestQuotes() {
      if (busy || !design) return;
      if (!S.measurementId) { $('#err3').textContent = 'Add or choose a measurement profile first.'; if (!measurements.length) openMeasureForm(null); return; }
      busy = 'req'; $('#err3').textContent = ''; render();
      try { await A.requestQuotes(design.id, { measurementId: S.measurementId, notes: S.notes, deadline: S.deadline || null }); S.requested = true; S.picked = false; quotes = []; lastQuoteCount = -1; save(); FT.toast('Sent to verified tailors'); go(4); }
      catch (e) { $('#err3').textContent = e.message; }
      finally { busy = null; render(); }
    }
    $('#reqBtn').addEventListener('click', requestQuotes);

    /* ───────── step 4: quotes ───────── */
    const vlist = $('#vlist'); const els = new Map(); let quotePoll = null;
    async function loadQuotes() {
      if (!design) return;
      try {
        const next = await A.listQuotes(design.id);
        const changed = next.length !== quotes.length || next.some((q, i) => q.id !== quotes[i]?.id || q.price !== quotes[i]?.price);
        quotes = next;
        if (!S.picked || !S.quoteId || !quotes.some(q => q.id === S.quoteId)) { S.quoteId = FT.sortVendors(quotes.map(qv), 'match')[0]?.id || null; if (!quotes.some(q => q.id === S.quoteId)) S.picked = false; }
        if (changed) { if (lastQuoteCount >= 0 && quotes.length > lastQuoteCount) FT.toast(`${quotes[quotes.length - 1].vendor.name} sent a quote`); save(); renderVendors(true); render(); }
        lastQuoteCount = quotes.length;
      } catch (e) { $('#err4').textContent = e.message; }
    }
    function startQuotePoll() { stopQuotePoll(); quotesLoading = !quotes.length; renderVendors(false); loadQuotes().then(() => { quotesLoading = false; renderVendors(false); render(); }); quotePoll = setInterval(loadQuotes, A.pollMs); }
    function stopQuotePoll() { clearInterval(quotePoll); quotePoll = null; }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.step === 4) loadQuotes(); });
    function quoteEl(q) {
      const el = document.createElement('button'); el.type = 'button'; el.className = 'vendor quote'; el.dataset.id = q.id; el.setAttribute('role', 'radio');
      el.innerHTML = `<span class="vn"><span></span>${q.vendor.verified ? FT.STAR : ''}</span><span class="vp"></span><span class="vm"></span><span class="vd"></span><span class="vq"></span><span class="vt"></span><span class="vlink" data-profile="${q.vendor.id}">Profile</span>`;
      return el;
    }
    function renderVendors(animate) {
      const list = quotes.map(qv);
      if (!list.length) {
        els.clear();
        vlist.innerHTML = `<div class="waiting"><span class="spin"></span><div><b>${quotesLoading ? 'Loading quotes…' : 'Waiting for tailors to quote'}</b><p>Verified tailors who make this kind of garment are looking at your design, measurements and notes. Quotes usually arrive within minutes${A.local ? ' (a few seconds here)' : ''}.</p></div></div>`;
        return;
      }
      if (!els.size) vlist.innerHTML = '';
      const apply = () => FT.sortVendors(list, S.sort).forEach(v => {
        let el = els.get(v.id); if (!el) { el = quoteEl(quotes.find(q => q.id === v.id)); els.set(v.id, el); }
        FT.vendorFill(el, v, FT.vendorTags(v, list));
        $('.vq', el).textContent = v.note || '';
        const on = v.id === curQuote()?.id; el.classList.toggle('on', on); el.setAttribute('aria-checked', on); el.setAttribute('aria-disabled', approved());
        vlist.appendChild(el);
      });
      animate ? FT.flip(() => [...vlist.children], apply) : apply();
      $('#qHint').textContent = `${quotes.length} quote${quotes.length === 1 ? '' : 's'} so far · fabric included · prices in naira`;
    }
    const seg = FT.seg($('#sortSeg'), by => { S.sort = by; save(); renderVendors(true); render(); }); seg.set(S.sort);
    vlist.addEventListener('click', e => {
      const p = e.target.closest('[data-profile]'); if (p) { e.stopPropagation(); App.vendorSheet(quotes.find(q => q.vendor.id === p.dataset.profile).vendor); return; }
      const b = e.target.closest('.vendor'); if (!b || approved() || busy) return; S.quoteId = b.dataset.id; S.picked = true; save(); render();
    });
    async function approve() {
      const q = curQuote(); if (!q || busy || approved()) return;
      busy = 'approve'; $('#errD').textContent = ''; render();
      try { order = await A.createOrder(q.id, { plan: S.plan }); S.orderId = order.id; save(); stopQuotePoll(); go(5, { force: true }); }
      catch (e) { $('#errD').textContent = e.message; }
      finally { busy = null; render(); }
    }
    $('#ctaBtn').addEventListener('click', approve);

    /* ───────── step 5: pay ───────── */
    const pct = (C.payments?.depositPercent || 50) / 100;
    const amountDue = () => { if (!order) return 0; if (order.status === 'balance_due') return order.total - order.paid; return S.plan === 'deposit' ? Math.round(order.total * pct) : order.total; };
    const payKind = () => (order?.status === 'balance_due' ? 'balance' : S.plan === 'deposit' ? 'deposit' : 'full');
    $('#plan').addEventListener('click', e => { const b = e.target.closest('.planopt'); if (!b || busy) return; S.plan = b.dataset.v; save(); render(); });
    const payTabs = App.tabs($('#payTabs'), id => { S.method = id; save(); render(); }, { hash: false, initial: S.method });
    if (C.payments?.paystackPublicKey) $('#payTabPaystack').hidden = false;
    const cardNum = $('#cardNum'), cardExp = $('#cardExp');
    cardNum.addEventListener('input', () => { cardNum.value = cardNum.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '); });
    cardExp.addEventListener('input', () => { let v = cardExp.value.replace(/\D/g, '').slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2); cardExp.value = v; });
    async function pay() {
      if (!order || busy) return;
      const kind = payKind(), amount = amountDue(), err = $('#err5'); err.textContent = '';
      busy = 'pay'; render();
      try {
        let result;
        if (S.method === 'paystack') result = await paystack(amount, kind);
        else if (S.method === 'card') result = await A.pay(order.id, { method: 'card', kind, card: { name: $('#cardName').value, number: cardNum.value, expiry: cardExp.value, cvv: $('#cardCvv').value } });
        else result = await A.pay(order.id, { method: 'transfer', kind });
        order = result.order; save(); burst();
        FT.toast(kind === 'balance' ? 'Balance paid. Thank you.' : `Payment received. ${order.vendor?.name || 'Your tailor'} is starting.`);
        $('#cardCvv').value = '';
        setTimeout(() => go(6, { force: true }), 700);
      } catch (e) { err.textContent = e.message || 'The payment did not go through.'; }
      finally { busy = null; render(); }
    }
    $('#payBtn').addEventListener('click', pay);
    function paystack(amount, kind) {
      return new Promise(async (resolve, reject) => {
        try {
          if (!window.PaystackPop) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://js.paystack.co/v2/inline.js'; s.onload = ok; s.onerror = () => no(new Error('Paystack could not load. Check your connection.')); document.head.appendChild(s); });
          const init = await A.initPayment(order.id, kind);
          const pop = new PaystackPop();
          pop.newTransaction({ key: C.payments.paystackPublicKey, email: A.me().email, amount: Math.round((init.amount || amount) * 100), currency: 'NGN', reference: init.reference, onSuccess: async t => { try { resolve(await A.pay(order.id, { method: 'paystack', kind, reference: t.reference })); } catch (e) { reject(e); } }, onCancel: () => reject(new Error('Payment cancelled.')) });
        } catch (e) { reject(e); }
      });
    }
    function burst() {
      if (reduced) return;
      const paths = Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2; return [[0.5 + Math.cos(a) * 0.06, 0.42 + Math.sin(a) * 0.04], [0.5 + Math.cos(a) * 0.42, 0.42 + Math.sin(a) * 0.28]]; });
      thread?.clear(); canvas.classList.remove('fade'); thread = FT.thread(canvas, { paths, duration: 900, width: 1.4 }); thread.done.then(() => setTimeout(fadeThread, 300));
    }

    /* ───────── step 6: track ───────── */
    function startOrderPoll() {
      clearInterval(poll); if (!order || ['delivered', 'cancelled'].includes(order.status)) return;
      poll = setInterval(async () => {
        try {
          const o = await A.getOrder(order.id);
          if (o.events.length !== order.events.length || o.phase !== order.phase || o.status !== order.status) { const was = order.phase; order = o; render(); if (o.phase !== was) FT.toast(o.phase === 'delivered' ? 'Delivered. Enjoy wearing it.' : App.phaseLabel(o.phase)); }
          if (['delivered', 'cancelled'].includes(o.status)) clearInterval(poll);
        } catch {}
      }, A.pollMs);
    }
    function renderTrack() {
      const p = phase();
      $('#trkTitle').textContent = order?.status === 'cancelled' ? 'Order cancelled' : p >= 3 ? 'Delivered to your door' : 'Production is under way';
      $('#trkHint').textContent = order ? (order.eta && p < 3 ? `Expected by ${App.date(order.eta)}. ` : '') + (A.local ? 'Updates appear here as the tailor posts them.' : 'The tracker checks for updates every 30 seconds.') : '';
      $('#trkV').innerHTML = App.PHASES.map(([, t, d], i) => `<li class="${i < p || (i === p && p === 3) ? 'done' : i === p ? 'now' : ''}"><span class="dot"><i></i></span><div><h3>${t}</h3><p>${d}</p></div></li>`).join('');
      if (!order) { $('#summary').innerHTML = ''; $('#feed').innerHTML = ''; $('#balance').hidden = true; return; }
      $('#summary').innerHTML = `<dt>Order</dt><dd>${FT.esc(order.id)}</dd><dt>Tailor</dt><dd>${FT.esc(order.vendor?.name || '')}</dd><dt>Design</dt><dd>Concept v${order.versionN}</dd><dt>Delivery</dt><dd>${order.deliveryDays || '—'} days</dd><dt>Total</dt><dd>${FT.money(order.total)}</dd><dt>Paid</dt><dd>${FT.money(order.paid)}</dd>`;
      $('#balance').hidden = !(order.status === 'balance_due' || (order.plan === 'deposit' && order.paid < order.total && order.status === 'active'));
      $('#balAmt').textContent = FT.money(order.total - order.paid) + (order.status === 'balance_due' ? ' · due now' : ' · after delivery');
      $('#balBtn').hidden = order.status !== 'balance_due';
      $('#feed').innerHTML = [...order.events].reverse().map(e => `<li><span class="when">${App.ago(e.at)}</span><b>${FT.esc(e.title)}</b>${e.body ? `<p>${FT.esc(e.body)}</p>` : ''}</li>`).join('');
    }
    $('#balBtn').addEventListener('click', () => { S.plan = 'full'; save(); go(5, { force: true }); });
    $('#shareBtn').addEventListener('click', () => {
      const url = location.origin + '/studio', text = design ? `I designed "${design.title}" on Fashion Teller.` : 'I designed this on Fashion Teller.';
      if (navigator.share) navigator.share({ title: 'Fashion Teller', text, url }).catch(() => {}); else navigator.clipboard?.writeText(url).then(() => FT.toast('Link copied')).catch(() => FT.toast(url));
    });
    function resetAll() {
      clearInterval(poll); stopQuotePoll(); thread?.clear();
      S = fresh(); design = null; order = null; quotes = []; save();
      prompt.value = ''; refine.value = ''; els.clear(); vlist.innerHTML = ''; artKey = '';
      $$('[data-pick]').forEach(g => $$('button', g).forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S[g.dataset.pick])));
      render(); renderStage(); go(1, { force: true }); prompt.focus();
    }
    $('#newBtn').addEventListener('click', resetAll);

    /* ───────── render ───────── */
    function render() {
      const v = design && App.version(design);
      $$('#stepper [data-go]').forEach(b => {
        const n = +b.dataset.go;
        b.classList.toggle('cur', n === S.step);
        b.classList.toggle('done', (approved() && n < 6) || (!approved() && (n < S.step || (n === 1 && !!design && S.step !== 1))));
        b.disabled = !reachable(n);
        if (n === S.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
      // 1
      prompt.disabled = busy === 'gen';
      const gb = $('#genBtn'); gb.disabled = !!busy; gb.innerHTML = busy === 'gen' ? '<span class="spin"></span>Generating' : design ? 'Generate a new concept' : 'Generate concept';
      // 2
      refine.disabled = locked() || busy === 'ref'; refine.placeholder = locked() && design ? 'This design is in production. Duplicate it from My designs to keep refining.' : 'e.g. add deeper gold trim, mandarin collar, make it emerald…';
      const rb = $('#refBtn'); rb.disabled = !refine.value.trim() || locked() || !!busy; rb.innerHTML = busy === 'ref' ? '<span class="spin"></span>Applying' : 'Apply refinement';
      $('#spec').innerHTML = v ? `<span class="lbl">Concept v${v.n}</span><div class="chips">${E.summary(v.spec).map(t => `<span class="tag">${FT.esc(t)}</span>`).join('')}</div>${v.spec.notes?.length ? `<p class="small muted">Noted for the tailor: ${v.spec.notes.map(FT.esc).join('; ')}</p>` : ''}` : '';
      const hist = $('#hist');
      if (design) hist.innerHTML = [...design.versions].reverse().map(x => `<li class="${x.n === (S.view ?? design.current) ? 'cur' : ''}" data-v="${x.n}"><b>v${x.n}</b><span><span class="hi">${FT.esc(x.instruction || 'Generated from your description')}</span>${x.changes?.length ? `<span class="hc">${x.changes.map(FT.esc).join(' · ')}</span>` : x.n > 1 && x.noted ? '<span class="hc">Noted for the tailor</span>' : ''}</span></li>`).join(''); else hist.innerHTML = '';
      // 3
      const qb = $('#reqBtn'); qb.disabled = !!busy || !design; qb.innerHTML = busy === 'req' ? '<span class="spin"></span>Sending to tailors' : S.requested ? 'Request quotes again' : 'Request quotes from verified tailors';
      // 4 + drawer
      renderVendors(false);
      const q = curQuote(); const drawer = $('#drawer');
      drawer.hidden = S.step !== 4 || !design;
      $('#priceNote').textContent = q ? `${q.vendor.name}, ${q.deliveryDays} days` : quotes.length ? 'Choose a tailor' : 'Waiting for quotes';
      $('#price').textContent = q ? FT.money(q.price) : '—';
      const cta = $('#ctaBtn'); cta.disabled = !q || !!busy; $('#ctaIcon').style.display = busy === 'approve' ? 'none' : '';
      $('#ctaText').textContent = busy === 'approve' ? 'Creating your order' : 'Approve design & continue to payment';
      if (busy === 'approve' && !$('#ctaBtn .spin')) cta.insertAdjacentHTML('afterbegin', '<span class="spin"></span>'); if (busy !== 'approve') $('#ctaBtn .spin')?.remove();
      // 5
      if (order) {
        const due = amountDue(), kind = payKind();
        $('#paySummary').innerHTML = `<dt>Order</dt><dd>${FT.esc(order.id)}</dd><dt>Tailor</dt><dd>${FT.esc(order.vendor?.name || '')}</dd><dt>Design</dt><dd>${FT.esc(design?.title || order.design?.title || '')} · v${order.versionN}</dd><dt>Delivery</dt><dd>${order.deliveryDays} days</dd><dt>Total</dt><dd>${FT.money(order.total)}</dd>${order.paid ? `<dt>Paid so far</dt><dd>${FT.money(order.paid)}</dd>` : ''}`;
        $('#planFull').textContent = FT.money(order.total) + ' now'; $('#planDep').textContent = `${FT.money(Math.round(order.total * pct))} now, ${FT.money(order.total - Math.round(order.total * pct))} on delivery`;
        $$('.planopt').forEach(b => { b.setAttribute('aria-checked', b.dataset.v === S.plan); b.disabled = kind === 'balance' || !!busy; });
        $('#plan').closest('.grp').hidden = kind === 'balance';
        $('#bankAmt').textContent = FT.money(due);
        $('#cardNote').textContent = A.local ? 'Test checkout: any valid card number works, e.g. 4084 0840 8408 4081, any future expiry, any CVV. CVV 000 simulates a declined card.' : 'Your card details go straight to the payment processor; Fashion Teller never stores them.';
        const pb = $('#payBtn'); pb.disabled = !!busy; $('#payText').textContent = busy === 'pay' ? (S.method === 'transfer' ? 'Confirming transfer' : 'Processing payment') : `${S.method === 'transfer' ? 'I have sent' : 'Pay'} ${FT.money(due)}${kind === 'deposit' ? ' deposit' : kind === 'balance' ? ' balance' : ''}`;
        if (busy === 'pay' && !$('#payBtn .spin')) pb.insertAdjacentHTML('afterbegin', '<span class="spin"></span>'); if (busy !== 'pay') $('#payBtn .spin')?.remove();
      }
      // 6
      renderTrack();
    }

    /* ───────── boot ───────── */
    (async () => {
      if (S.orderId) { try { order = await A.getOrder(S.orderId); if (order.design) design = order.design; S.designId = order.designId; if (order.status === 'cancelled') { order = null; S.orderId = null; } } catch { order = null; S.orderId = null; } }
      if (S.designId && !design) { try { design = await A.getDesign(S.designId); } catch { design = null; S.designId = null; S.requested = false; } }
      if (design && !S.prompt) S.prompt = design.prompt, prompt.value = S.prompt;
      if (design && !order) { try { const r = await A.getRequest(design.id); if (r && r.status !== 'closed') S.requested = true; } catch {} }
      if (order && order.status === 'awaiting_payment') S.step = 5; else if (order && order.status === 'balance_due' && wantPay) { S.plan = 'full'; S.step = 5; } else if (approved()) S.step = 6; else if (!design) S.step = 1; else if (S.step > 4 || (S.step === 4 && !S.requested)) S.step = S.requested ? 4 : 2;
      save(); renderStage(); go(S.step, { force: true });
      if (S.step === 6) startOrderPoll();
      FT.ready.then(() => { if (!design && !handed) prompt.focus({ preventScroll: true }); if (handed) FT.wait(400).then(generate); });
    })();
    document.addEventListener('ft:auth', e => { if (!e.detail.user) { resetAll(); } });
  });
})();
