/**
 * Studio — the product. The customer designs the garment themselves, like building an avatar:
 *   1 Design   templates, style, colour palettes per style + fabric, parts, embroidery, details and a finger-sketch layer
 *   2 See it   the design built in real 3D on a mannequin (assets/js/viewer3d.js), and try-on on the user's own photo
 *   3 Measure → 4 Tailors → 5 Pay → 6 Track
 * Every save is a version and counts towards the daily streak. "Describe it" is an optional shortcut that sets the parts from a sentence.
 * The working design (draft) survives reloads; designs, versions, orders and payments live in the account.
 */
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const { $, $$, reduced } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount, E = window.FTEngine, C = window.FT_CONFIG || {};
    const KEY = 'ft.studio', DRAFT = 'ft.draft';
    const fresh = () => ({ step: 1, tab: 'templates', view: 'flat', tplFilter: 'all', designId: null, baseN: null, sort: 'match', quoteId: null, picked: false, orderId: null, plan: 'full', method: 'card', measurementId: null, notes: '', deadline: '', requested: false, brush: { c: '#D4AF37', w: 8, m: true } });
    let S = (() => { try { return { ...fresh(), ...JSON.parse(sessionStorage.getItem(KEY)) }; } catch { return fresh(); } })();
    const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
    let design = null, quotes = [], order = null, measurements = [], busy = null, poll = null, thread = null, quotesLoading = false, lastQuoteCount = -1;
    let draft = null, dirty = false; const undo = [], redo = [];
    const clone = o => JSON.parse(JSON.stringify(o));
    const isDirty = () => { if (!design) return true; const b = design.versions.find(v => v.n === S.baseN); return !b || E.diff(b.spec, draft).length > 0; };
    const persistDraft = () => { try { localStorage.setItem(DRAFT, JSON.stringify({ spec: draft, designId: design?.id || null, baseN: S.baseN, dirty })); } catch {} };

    const qs = new URLSearchParams(location.search);
    const handed = qs.get('prompt'), openDesign = qs.get('design'), openOrder = qs.get('order'), wantPay = qs.get('pay') === '1', openTpl = qs.get('template'), wantChallenge = qs.get('challenge') === '1', openStep = Math.min(4, Math.max(0, +qs.get('step') || 0));
    if (openDesign) { S = { ...fresh(), designId: openDesign, step: openStep || 1, requested: openStep >= 4 }; save(); }
    if (openOrder) { S = { ...fresh(), orderId: openOrder, step: 6 }; save(); }
    if (handed || openTpl) { S = { ...fresh() }; save(); }
    if (handed || openDesign || openOrder || openTpl || wantChallenge) history.replaceState(null, '', location.pathname);

    const stage = $('#stage'), art = $('#stArt'), canvas = $('#stThread');
    const approved = () => !!order && order.status !== 'awaiting_payment' && order.status !== 'cancelled';
    const phase = () => (order ? A.phaseIndex(order.phase) : 0);
    const curQuote = () => quotes.find(q => q.id === S.quoteId) || FT.sortVendors(quotes.map(qv), S.sort)[0] && quotes.find(q => q.id === FT.sortVendors(quotes.map(qv), S.sort)[0].id);
    const qv = q => ({ id: q.id, name: q.vendor.name, city: q.vendor.city, rating: q.vendor.rating, verified: q.vendor.verified, price: q.price, deliveryDays: q.deliveryDays, note: q.note, vendor: q.vendor });
    $('#stSample').hidden = !A.local;
    const narrow = () => matchMedia('(max-width: 759px)').matches;

    /* ═════════ draft + history ═════════ */
    function setDraft(spec, { history = true, dirty: d = true, animate = false } = {}) {
      if (history && draft) { undo.push(clone(draft)); if (undo.length > 60) undo.shift(); redo.length = 0; }
      draft = clone(spec); dirty = d; persistDraft(); scheduleStage(animate); renderBuilder(); renderBar();
    }
    const edit = fn => { if (!draft) return; const next = clone(draft); fn(next); setDraft(next); };
    $('#undoBtn').addEventListener('click', () => { if (!undo.length) return; redo.push(clone(draft)); draft = undo.pop(); dirty = isDirty(); persistDraft(); scheduleStage(); renderBuilder(); renderBar(); });
    $('#redoBtn').addEventListener('click', () => { if (!redo.length) return; undo.push(clone(draft)); draft = redo.pop(); dirty = isDirty(); persistDraft(); scheduleStage(); renderBuilder(); renderBar(); });
    $('#shuffleBtn').addEventListener('click', () => { setDraft(E.shuffle(draft), { animate: true }); FT.toast('Surprise! Undo if you prefer the last one.'); });
    addEventListener('keydown', e => { if (S.step !== 1 || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return; if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); (e.shiftKey ? $('#redoBtn') : $('#undoBtn')).click(); } });

    /* ═════════ stage ═════════ */
    let stageQueued = false, stageMode = 'edit';
    function scheduleStage(animate) { if (animate) stitchIn(); if (stageQueued) return; stageQueued = true; requestAnimationFrame(() => { stageQueued = false; renderStage(); }); }
    function renderStage() {
      if (!draft) return;
      stage.classList.add('has');
      stage.classList.toggle('drawing', stageMode === 'edit' && S.step === 1 && S.tab === 'sketch');
      if (stageMode === 'edit') art.innerHTML = E.render(draft, { id: 'st', live: true });
      else if (stageMode === '3d') show3d();
      else if (stageMode === 'try') renderTry();
      const est = E.estimate(draft); $('#stEst').innerHTML = `<small>Likely cost to make</small><b>${FT.money(est.low, { compact: true })} – ${FT.money(est.high, { compact: true })} · ${est.daysLow}–${est.daysHigh} days</b>`;
      $('#stNext').innerHTML = design ? `<a href="/design?id=${encodeURIComponent(design.id)}" title="Versions, sharing, publishing and the tailor’s spec sheet">${App.ICON.cube}Design room</a>` : '';
      const v = design && design.versions.find(x => x.n === S.baseN);
      $('#stVerLbl').textContent = design ? (dirty ? 'Editing' : 'Version') : dirty || !draft?.template ? 'New design' : 'Template';
      $('#stVer').textContent = design ? `v${S.baseN || design.current}${dirty ? ' •' : ''}` : '';
      $('#stTitle').textContent = design ? design.title : E.title(draft);
      $('#stSub').textContent = dirty ? (design ? (E.diff(v?.spec, draft).slice(0, 3).join(' · ') || 'Unsaved changes') : 'Not saved yet') : v ? (v.instruction || '') : '';
      const ol = $('#stVersions');
      if (!design) ol.innerHTML = '';
      else {
        if (ol.children.length !== design.versions.length) { ol.innerHTML = design.versions.map(x => `<li><button type="button" data-v="${x.n}" title="${FT.esc(x.instruction || '')}">v${x.n}</button></li>`).join(''); ol.scrollLeft = ol.scrollWidth; }
        $$('button', ol).forEach(b => b.setAttribute('aria-current', +b.dataset.v === S.baseN));
      }
    }
    $('#stVersions').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b || !design) return; const v = design.versions.find(x => x.n === +b.dataset.v); if (!v) return;
      S.baseN = v.n; save(); setDraft(v.spec, { dirty: false }); FT.toast(`Editing from v${v.n}. Saving makes a new version.`);
      if (S.step > 2 && !approved()) go(1);
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
    function stitchIn() { if (reduced || !draft) return; thread?.clear(); canvas.classList.remove('fade'); thread = FT.thread(canvas, { paths: E.stitches(draft), duration: 700, width: 1.5, linger: 300 }); thread.done.then(() => setTimeout(fadeThread, 150)); }

    /* ═════════ sketch: draw on the garment ═════════ */
    let stroke = null, livePath = null, mirrorPath = null;
    const toSvg = (svg, e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const m = svg.getScreenCTM(); if (!m) return null; const r = pt.matrixTransform(m.inverse()); return [Math.round(r.x), Math.round(r.y)]; };
    art.addEventListener('pointerdown', e => {
      if (!(stageMode === 'edit' && S.step === 1 && S.tab === 'sketch')) return;
      const svg = $('svg', art), live = $('.live', art); if (!svg || !live) return;
      e.preventDefault(); art.setPointerCapture(e.pointerId);
      const p = toSvg(svg, e); if (!p) return;
      const b = S.brush; stroke = { c: b.c, w: b.w, m: !!b.m, p: [...p] };
      const NS = 'http://www.w3.org/2000/svg', mk = () => { const el = document.createElementNS(NS, 'path'); el.setAttribute('fill', 'none'); el.setAttribute('stroke', b.c); el.setAttribute('stroke-width', b.w); el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round'); live.appendChild(el); return el; };
      livePath = mk(); mirrorPath = b.m ? mk() : null; $('#drawHint').classList.add('gone');
    });
    art.addEventListener('pointermove', e => {
      if (!stroke) return; const svg = $('svg', art), p = toSvg(svg, e); if (!p) return;
      stroke.p.push(p[0], p[1]); livePath.setAttribute('d', E.strokePath(stroke.p));
      if (mirrorPath) mirrorPath.setAttribute('d', E.strokePath(stroke.p.map((v, i) => (i % 2 ? v : E.FRAME.W - v))));
    });
    const endStroke = () => { if (!stroke) return; const k = { ...stroke, p: E.simplify(stroke.p) }; stroke = null; edit(d => { d.sketch = [...(d.sketch || []), k]; }); };
    art.addEventListener('pointerup', endStroke); art.addEventListener('pointercancel', endStroke);

    /* ═════════ builder ═════════ */
    const body = $('#bldBody');
    const tile = (spec, label, on, crop, data) => `<button type="button" class="tile${on ? ' on' : ''}" aria-pressed="${!!on}" ${data}><span class="tile-art">${E.render(spec, { id: 'tl' + Math.random().toString(36).slice(2, 7), viewBox: crop, sketch: false })}</span><span class="tile-l">${FT.esc(label)}</span></button>`;
    const sw = (hex, on, data, label) => `<button type="button" class="swatch${on ? ' on' : ''}" style="--c:${hex}" aria-label="${FT.esc(label || E.colorName(hex))}" aria-pressed="${!!on}" ${data}></button>`;
    const toggle = (key, label, on) => `<button type="button" class="tgl" role="switch" aria-checked="${!!on}" data-toggle="${key}"><i></i>${label}</button>`;
    const seg = (key, opts, cur) => `<div class="seg sm segpick" data-seg="${key}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`;
    const sameHex = (a, b) => String(E.colorHex(a)).toLowerCase() === String(E.colorHex(b)).toLowerCase();
    const GARMENT_FILTERS = [['all', 'All'], ...E.OPTIONS.garment];
    function renderBuilder() {
      if (!draft) return;
      const O = E.OPTIONS, g0 = draft.garment, off = { length: !O.lengthFor[g0].length, sleeves: !O.sleevesFor[g0].length, fit: !O.fitFor[g0] };
      if (off[S.tab]) S.tab = 'style';
      $$('#bldTabs [data-bt]').forEach(b => { const on = b.dataset.bt === S.tab; b.setAttribute('aria-selected', on); b.classList.toggle('on', on); b.tabIndex = on ? 0 : -1; b.hidden = !!off[b.dataset.bt]; });
      const d = draft, t = S.tab; let h = '';
      if (t === 'templates') {
        const list = E.TEMPLATES.filter(x => S.tplFilter === 'all' || x.garment === S.tplFilter);
        h = `<div class="chips filt">${GARMENT_FILTERS.map(([v, l]) => `<button class="chip" type="button" data-tf="${v}" aria-pressed="${S.tplFilter === v}">${l}</button>`).join('')}</div>
          <div class="tiles tpl">${list.map(x => tile(x.spec, x.name, d.template === x.id, E.CROP.template, `data-tpl="${x.id}"`).replace('</span></button>', `</span><span class="tile-tag">${FT.esc(x.tag)}</span></button>`)).join('')}</div>`;
      } else if (t === 'style') {
        h = `<p class="bld-hint">Switching style keeps your colours, fabric and sketch.</p><div class="tiles">${E.OPTIONS.garment.map(([v, l]) => tile(E.switchGarment(d, v), l, d.garment === v, E.CROP.garment, `data-garment="${v}"`)).join('')}</div>`;
      } else if (t === 'colours') {
        const pals = E.palettes(d.garment, d.fabric), cur = pals.find(p => p.id === d.palette) || pals[0];
        h = `<p class="bld-hint">Palettes picked for ${FT.esc((l => l + (l.endsWith('s') ? 'es' : 's'))(E.vocab.GARMENTS[d.garment].label.toLowerCase()))} in ${FT.esc(E.vocab.FABRICS[d.fabric]?.label || d.fabric)}.</p>
          <div class="chips">${pals.map(p => `<button class="chip pal" type="button" data-pal="${p.id}" aria-pressed="${p.id === cur.id}"><span class="dots">${p.base.slice(0, 4).map(c => `<i style="background:${c}"></i>`).join('')}</span>${FT.esc(p.name)}</button>`).join('')}</div>
          <div class="grp"><span>Main colour</span><div class="swatches">${cur.base.map(c => sw(c, sameHex(d.color, c), `data-color="${c}"`)).join('')}<label class="swatch custom" title="Your own colour"><input type="color" data-custom="color" value="${E.colorHex(d.color)}" aria-label="Custom main colour"></label></div></div>
          <div class="grp"><span>Accent (embroidery, trims, buttons)</span><div class="swatches">${cur.accents.map(c => sw(c, sameHex(d.accent, c), `data-accent="${c}"`)).join('')}<label class="swatch custom" title="Your own accent"><input type="color" data-custom="accent" value="${E.accentHex(d.accent)}" aria-label="Custom accent colour"></label></div></div>`;
      } else if (t === 'fabric') {
        h = `<div class="grp"><span>Texture</span><div class="tiles sq">${E.OPTIONS.fabric.map(([v, l]) => tile({ ...d, fabric: v }, l, d.fabric === v, E.CROP.fabric, `data-fabric="${v}"`)).join('')}</div></div>
          <div class="grp"><span>Pattern</span><div class="tiles sq">${E.OPTIONS.pattern.map(([v, l]) => tile({ ...d, pattern: v }, l, (d.pattern || 'plain') === v, E.CROP.pattern, `data-pattern="${v}"`)).join('')}</div></div>`;
      } else if (t === 'collar') {
        const ok = E.OPTIONS.collarFor[d.garment];
        h = `<div class="tiles">${E.OPTIONS.collar.filter(([v]) => ok.includes(v)).map(([v, l]) => tile({ ...d, collar: v }, l, d.collar === v, E.CROP.collar, `data-set="collar" data-v="${v}"`)).join('')}</div>`;
      } else if (t === 'sleeves') {
        h = `<div class="tiles">${E.OPTIONS.sleeves.filter(([v]) => O.sleevesFor[d.garment].includes(v)).map(([v, l]) => tile({ ...d, sleeves: v }, l, d.sleeves === v, E.CROP.sleeves, `data-set="sleeves" data-v="${v}"`)).join('')}</div>${d.garment !== 'suit' && d.sleeves !== 'sleeveless' ? `<div class="tgls">${toggle('puff', 'Puff sleeves', d.puff)}</div>` : ''}`;
      } else if (t === 'length') {
        h = `<div class="tiles">${E.OPTIONS.length.filter(([v]) => O.lengthFor[d.garment].includes(v)).map(([v, l]) => tile({ ...d, length: v }, l, d.length === v, E.CROP.length, `data-set="length" data-v="${v}"`)).join('')}</div>`;
      } else if (t === 'fit') {
        h = `<div class="tiles">${E.OPTIONS.fit.map(([v, l]) => tile({ ...d, fit: v }, l, d.fit === v, E.CROP.fit, `data-set="fit" data-v="${v}"`)).join('')}</div>`;
      } else if (t === 'embroidery') {
        h = `<div class="tiles">${E.OPTIONS.embroidery.map(([v, l]) => tile({ ...d, embroidery: v }, l, d.embroidery === v, E.CROP.embroidery, `data-set="embroidery" data-v="${v}"`)).join('')}</div>
          ${d.embroidery !== 'none' ? `<div class="grp"><span>Weight</span>${seg('density', [[1, 'Light'], [2, 'Medium'], [3, 'Heavy']], d.density)}</div><div class="grp"><span>Thread colour</span><div class="swatches">${(E.palettes(d.garment, d.fabric)[0].accents).map(c => sw(c, sameHex(d.accent, c), `data-accent="${c}"`)).join('')}</div></div>` : ''}`;
      } else if (t === 'details') {
        const can = O.detailsFor[d.garment];
        h = `${can.length ? `<div class="tgls">${[['pockets', 'Pockets'], ['buttons', 'Buttons'], ['belt', 'Belt']].filter(([k]) => can.includes(k)).map(([k, l]) => toggle(k, l, d[k])).join('')}</div>` : `<p class="bld-hint">${FT.esc(E.vocab.GARMENTS[d.garment].label)} sets come complete. Add anything special as a note for the tailor.</p>`}
          <div class="grp"><label for="tnote"><span>Note for the tailor</span></label><div class="notein"><input id="tnote" maxlength="120" placeholder="e.g. hidden zip at the back, lining in cream"><button class="btn ghost sm" type="button" id="addNote">Add</button></div>${(d.notes || []).length ? `<ul class="notes">${d.notes.map((n, i) => `<li>${FT.esc(n)}<button type="button" data-rmnote="${i}" aria-label="Remove note">×</button></li>`).join('')}</ul>` : ''}</div>`;
      } else if (t === 'sketch') {
        const pal = E.palettes(d.garment, d.fabric)[0], cols = [...new Set([...pal.accents, '#FFFFFF', '#16181C', E.accentHex(d.accent)])];
        h = `<p class="bld-hint">Draw straight onto the garment on the ${narrow() ? 'preview above' : 'stage'}: motifs, trims, panels, anything. Mirror draws both sides at once.</p>
          <div class="grp"><span>Thread</span><div class="swatches">${cols.map(c => sw(c, S.brush.c.toLowerCase() === c.toLowerCase(), `data-brush="${c}"`)).join('')}<label class="swatch custom"><input type="color" data-custom="brush" value="${S.brush.c}" aria-label="Custom thread colour"></label></div></div>
          <div class="grp"><span>Brush</span>${seg('brushw', [[4, 'Fine'], [8, 'Medium'], [16, 'Bold']], S.brush.w)}</div>
          <div class="tgls">${toggle('brushm', 'Mirror', S.brush.m)}${toggle('sketchClip', 'Stay on the garment', d.sketchClip !== false)}</div>
          <div class="row-btns compact"><button class="btn ghost sm" type="button" id="skUndo" ${d.sketch?.length ? '' : 'disabled'}>Undo stroke</button><button class="btn ghost sm" type="button" id="skClear" ${d.sketch?.length ? '' : 'disabled'}>Clear sketch</button></div>
          <p class="muted small">${d.sketch?.length || 0} stroke${d.sketch?.length === 1 ? '' : 's'} · the tailor gets your sketch with the design.</p>`;
      }
      body.innerHTML = h;
      stage.classList.toggle('drawing', stageMode === 'edit' && S.step === 1 && S.tab === 'sketch');
      $('#drawHint').classList.toggle('gone', !!draft.sketch?.length);
    }
    $('#bldTabs').addEventListener('click', e => { const b = e.target.closest('[data-bt]'); if (!b) return; S.tab = b.dataset.bt; save(); if (S.tab === 'sketch' && stageMode !== 'edit') setStageMode('edit'); renderBuilder(); b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced ? 'auto' : 'smooth' }); });
    body.addEventListener('click', e => {
      const t = e.target.closest('button'); if (!t) return; const x = t.dataset;
      if (x.tf) { S.tplFilter = x.tf; save(); renderBuilder(); return; }
      if (x.tpl) { const tp = E.template(x.tpl); if (!tp) return; setDraft({ ...tp.spec, sketch: [] }, { animate: true }); FT.toast(`${tp.name} loaded. Make it yours.`); return; }
      if (x.garment) return edit(d => Object.assign(d, E.switchGarment(d, x.garment)));
      if (x.pal) { const p = E.palettes(draft.garment, draft.fabric).find(q => q.id === x.pal); return edit(d => { d.palette = p.id; d.color = p.base[0]; d.accent = p.accents[0]; }); }
      if (x.color) return edit(d => { d.color = x.color; d.customColor = false; d.palette ||= E.palettes(d.garment, d.fabric)[0].id; });
      if (x.accent) return edit(d => { d.accent = x.accent; });
      if (x.fabric) return edit(d => { d.fabric = x.fabric; });
      if (x.pattern) return edit(d => { d.pattern = x.pattern; });
      if (x.set) return edit(d => { d[x.set] = x.v; });
      if (x.toggle) {
        if (x.toggle === 'brushm') { S.brush.m = !S.brush.m; save(); renderBuilder(); return; }
        return edit(d => { d[x.toggle] = x.toggle === 'sketchClip' ? d.sketchClip === false : !d[x.toggle]; });
      }
      if (x.brush) { S.brush.c = x.brush; save(); renderBuilder(); return; }
      if (t.closest('[data-seg]')) { const k = t.closest('[data-seg]').dataset.seg; if (k === 'brushw') { S.brush.w = +x.v; save(); renderBuilder(); return; } return edit(d => { d[k] = +x.v; }); }
      if (t.id === 'skUndo') return edit(d => { d.sketch = (d.sketch || []).slice(0, -1); });
      if (t.id === 'skClear') return edit(d => { d.sketch = []; });
      if (t.id === 'addNote') { const i = $('#tnote'), v = i.value.trim(); if ((draft.notes || []).length >= 12) { FT.toast('Twelve notes is the most a design can carry.'); return; } if (v) edit(d => { d.notes = [...(d.notes || []), v]; }); return; }
      if (x.rmnote != null) return edit(d => { d.notes.splice(+x.rmnote, 1); });
    });
    body.addEventListener('keydown', e => { if (e.target.id === 'tnote' && e.key === 'Enter') { e.preventDefault(); $('#addNote').click(); } });
    let pickT = null;
    body.addEventListener('input', e => {
      const k = e.target.dataset.custom; if (!k) return; const v = e.target.value;
      if (k === 'brush') { S.brush.c = v; save(); return; }
      // colour pickers fire continuously: preview live, record one history step when it settles
      if (!pickT) undo.push(clone(draft));
      draft[k] = v; if (k === 'color') draft.customColor = true; dirty = true; scheduleStage();
      clearTimeout(pickT); pickT = setTimeout(() => { pickT = null; redo.length = 0; persistDraft(); renderBuilder(); renderBar(); }, 350);
    });

    /* AI assist (optional): describe it, and the builder sets the parts for you to adjust. */
    $('#aiBtn').addEventListener('click', () => {
      const s = App.sheet(`<h3>Describe it</h3><p class="muted">A shortcut. Write what you have in mind and the builder sets the style, fabric, colours and parts it recognises. You can change everything after.</p><textarea class="ta" id="aiText" rows="3" maxlength="600" aria-label="Describe the garment" placeholder="An ivory agbada with gold embroidery on the chest, mandarin collar"></textarea><div class="row-btns" style="margin-top:14px"><button class="btn ghost" type="button" data-c>Cancel</button><button class="btn ink" type="button" data-go>Build it</button></div>`);
      const ta = $('#aiText', s); setTimeout(() => ta.focus(), 300);
      $('[data-c]', s).addEventListener('click', App.closeSheet);
      $('[data-go]', s).addEventListener('click', async () => {
        const text = ta.value.trim(); if (!text) { ta.focus(); return; }
        App.closeSheet(); const spec = { ...E.parse(text, { garment: draft.garment }), sketch: draft.sketch || [], template: null };
        genUI(true); await stitch(1400, ['Reading your description', 'Choosing the parts', 'Setting colours'], E.stitches(spec)); genUI(false); fadeThread();
        setDraft(spec); FT.toast('Built from your description. Tweak anything.');
      });
    });

    /* ═════════ save + rewards ═════════ */
    const NEXT = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    function renderNexts() {
      const el = $('#nexts'); if (!design || dirty || design.status === 'ordered') { el.innerHTML = ''; return; }
      const card = (attr, icon, t, d) => `<${attr.startsWith('href') ? 'a' : 'button type="button"'} class="next-card" ${attr}><span class="ic">${icon}</span><span><b>${t}</b><small>${d}</small></span>${NEXT}</${attr.startsWith('href') ? 'a' : 'button'}>`;
      el.innerHTML = `<p class="kicker" style="margin:6px 0 0">Saved. What next?</p>`
        + card('data-next="make"', App.ICON.tape, 'Get it made', 'Add measurements and compare quotes from verified tailors.')
        + card(`href="/design?id=${encodeURIComponent(design.id)}#publish"`, App.ICON.spark, design.published ? 'Published on Discover' : 'Publish it', design.published ? 'See likes and remixes in the design room.' : 'Show it on Discover and let others like and remix it.')
        + card('href="/designers"', App.ICON.people, 'Ask a designer', 'Hire a designer to refine it or design the next one for you.');
    }
    $('#nexts').addEventListener('click', e => { if (e.target.closest('[data-next="make"]')) $('#toMeasure').click(); });
    function renderBar() {
      renderNexts();
      $('#undoBtn').disabled = !undo.length; $('#redoBtn').disabled = !redo.length;
      const sb = $('#saveBtn'); sb.disabled = busy === 'save' || (!dirty && !!design);
      sb.innerHTML = busy === 'save' ? '<span class="spin"></span>Saving' : !design ? 'Save design' : dirty ? `Save v${Math.max(...design.versions.map(v => v.n)) + 1}` : 'Saved';
    }
    async function saveDesign({ quiet = false } = {}) {
      if (busy) return false;
      if (!A.signedIn()) { const u = await Acc.open({ mode: 'up', title: 'Save your design', message: 'Create a free account to save designs, keep every version and start your daily streak.' }); if (!u) return false; }
      if (design && !dirty) return true;
      if (design && design.status !== 'ordered') { const base = design.versions.find(v => v.n === S.baseN); if (base && !E.diff(base.spec, draft).length) { dirty = false; persistDraft(); renderBar(); renderStage(); return true; } }
      busy = 'save'; renderBar(); $('#err1').textContent = '';
      try {
        let res;
        const forkFromOrdered = design && (design.status === 'ordered');
        if (!design || forkFromOrdered) {
          res = await A.createDesign({ spec: draft, title: forkFromOrdered ? design.title + ' (new)' : '' });
          if (forkFromOrdered) { FT.toast('Saved as a new design. The original is in production.'); order = null; quotes = []; Object.assign(S, { orderId: null, quoteId: null, requested: false }); }
        } else res = await A.saveVersion(design.id, draft, '', S.baseN);
        design = res; S.designId = design.id; S.baseN = design.current; dirty = false; save(); persistDraft();
        const badge = $('#stBadge'); badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump');
        if (res.reward) showReward(res.reward); else if (!quiet) FT.toast(`Saved v${design.current}`);
        refreshGame();
        return true;
      } catch (e) { $('#err1').textContent = e.message; if (!quiet) FT.toast(e.message); return false; }
      finally { busy = null; renderBar(); renderStage(); render(); }
    }
    $('#saveBtn').addEventListener('click', () => saveDesign());
    function showReward(r) {
      const el = $('#reward'); if (!r || !r.xp) return;
      el.innerHTML = `<b>+${r.xp} XP</b>${r.streakUp ? `<span class="flame">${FLAME}${r.streak}-day streak</span>` : ''}${r.challenge ? `<span>Challenge done: ${FT.esc(r.challenge)}</span>` : ''}${r.badges.length ? `<span class="rw-b">${r.badges.length === 1 ? 'Badge' : 'Badges'}: ${r.badges.map(FT.esc).join(', ')}</span>` : ''}${r.levelUp ? `<span class="lvl">Level up: ${FT.esc(r.levelUp)}</span>` : ''}`;
      el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); clearTimeout(showReward.t); showReward.t = setTimeout(() => el.classList.remove('on'), 3200);
      if (r.streakUp || r.challenge || r.badges.length || r.levelUp) burst();
      document.dispatchEvent(new CustomEvent('ft:game'));
    }
    const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-4-1-6 1-9.5z" fill="currentColor"/></svg>';

    /* Daily challenge + streak card */
    let game = null;
    async function refreshGame() { if (A.signedIn()) { try { game = await A.game(); } catch { game = null; } } else game = null; renderDaily(); }
    function renderDaily() {
      const ch = game?.challenge || (() => { const c = E.challengeFor(); return { ...c, done: false }; })();
      $('#daily').innerHTML = `<div class="dc"><span class="dc-k">Today’s challenge</span><b>${FT.esc(ch.title)}</b><span class="dc-t">${FT.esc(ch.text)}</span></div>
        ${ch.done ? '<span class="dc-done">Done ✓</span>' : `<button class="btn gold sm" type="button" id="dcGo">+50 XP</button>`}
        ${game ? `<a class="dc-streak${game.doneToday ? ' lit' : ''}" href="/designs" title="${game.doneToday ? 'Streak kept today' : game.atRisk ? 'Save a design today to keep your streak' : 'Save a design to start a streak'}">${FLAME}<b>${game.streak}</b></a>` : ''}`;
      $('#dcGo')?.addEventListener('click', () => {
        if (ch.template) { const tp = E.template(ch.template); setDraft({ ...tp.spec, sketch: [] }, { animate: true }); }
        if (ch.tab) { S.tab = ch.tab; save(); if (ch.tab === 'sketch') setStageMode('edit'); renderBuilder(); }
        FT.toast(`${ch.text} Save it to complete the challenge.`);
      });
    }
    document.addEventListener('ft:auth', () => refreshGame());

    /* ═════════ step 2: see it — 3D turnaround + try-on ═════════ */
    function setStageMode(m) {
      stageMode = m; if (m !== '3d') viewer?.spin?.(false);
      art.hidden = m !== 'edit'; turn.hidden = m !== '3d'; bar.hidden = m !== '3d'; $('#stTry').hidden = m !== 'try';
      stage.classList.toggle('mode-3d', m === '3d'); stage.classList.toggle('mode-try', m === 'try');
      $$('#stTools [data-view]').forEach(b => b.setAttribute('aria-pressed', (b.dataset.view === '3d') === (m === '3d')));
      $('#stTools').hidden = m === 'try';
      renderStage(); if (m === '3d') requestAnimationFrame(() => viewer?.resize?.());
    }
    /* The design in real 3D. The viewer is built the first time it is asked for; where WebGL is missing it shows the flat front and back instead. */
    const turn = $('#stTurn'), bar = $('#v3dBar'); let viewer = null, viewerP = null, v3dKey = '', v3dT = null, flatView = 'front';
    function show3d() {
      if (!draft) return; const key = JSON.stringify(draft);
      if (!viewerP) { v3dKey = key; viewerP = App.viewer(turn, draft).then(v => { viewer = v; renderV3d(); if (JSON.stringify(draft) !== v3dKey) { v3dKey = JSON.stringify(draft); v.setSpec(draft); } return v; }); return; }
      if (!viewer || key === v3dKey) return;
      clearTimeout(v3dT); v3dT = setTimeout(() => { if (!draft) return; v3dKey = JSON.stringify(draft); viewer.setSpec(draft); }, 200);
    }
    function renderV3d() {
      if (!viewer) return;
      bar.innerHTML = viewer.flat ? `<button type="button" data-face="front" aria-pressed="${flatView === 'front'}">Front</button><button type="button" data-face="back" aria-pressed="${flatView === 'back'}">Back</button>`
        : `<button type="button" data-face="front">Front</button><button type="button" data-face="side">Side</button><button type="button" data-face="back">Back</button><span class="sep"></span><button type="button" data-spin aria-pressed="${!!viewer.spinning}">Spin</button>`;
      $('#toneGrp').hidden = viewer.flat; $('#snapBtn').hidden = viewer.flat;
      if (viewer.flat) $('#v3dNote').textContent = 'This device cannot draw 3D, so here are the flat front and back views. The tailor works from the same pattern.';
      $('#tones').innerHTML = viewer.tones.map((t, i) => `<button type="button" class="swatch${i === viewer.tone ? ' on' : ''}" style="--c:${t[1]}" data-tone="${i}" aria-label="${t[0]} mannequin" aria-pressed="${i === viewer.tone}"></button>`).join('');
    }
    bar.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !viewer) return; if (b.dataset.face) { flatView = b.dataset.face === 'back' ? 'back' : 'front'; viewer.face(b.dataset.face); } else viewer.spin(); renderV3d(); });
    $('#tones').addEventListener('click', e => { const b = e.target.closest('[data-tone]'); if (!b || !viewer) return; viewer.setTone(+b.dataset.tone); renderV3d(); });
    $('#stTools').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; const want = b.dataset.view === '3d' ? '3d' : 'edit'; if (S.step === 1) { S.view = b.dataset.view; save(); if (want === '3d' && S.tab === 'sketch') { S.tab = 'style'; renderBuilder(); } } setStageMode(want); });
    $('#snapBtn').addEventListener('click', () => {
      const url = viewer?.snapshot?.(); if (!url) return;
      const c = document.createElement('canvas'), img = new Image();
      img.onload = () => { c.width = img.width; c.height = img.height; const x = c.getContext('2d'), g = x.createRadialGradient(c.width / 2, c.height * 0.2, 10, c.width / 2, c.height * 0.4, c.height); g.addColorStop(0, '#1B2757'); g.addColorStop(1, '#0A1128'); x.fillStyle = g; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0); x.font = `600 ${Math.round(c.width / 34)}px Jost, sans-serif`; x.fillStyle = 'rgba(255,255,255,.8)'; x.fillText('FASHION TELLER', c.width * 0.04, c.height * 0.97);
        c.toBlob(async blob => { if (!blob) return; const file = new File([blob], 'fashion-teller-design.png', { type: 'image/png' }); if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: design?.title || 'My design' }); return; } catch {} } const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); FT.toast('Picture saved to your device'); }, 'image/png'); };
      img.src = url;
    });
    $('#roomBtn').addEventListener('click', async () => { if (await saveDesign({ quiet: true })) FT.go('/design?id=' + encodeURIComponent(design.id)); });

    /* try-on: the user's photo with the garment laid over it */
    const T = { x: 50, y: 12, w: 78, rot: 0, op: 0, has: false };
    let photoUrl = null;
    function renderTry() {
      $('#tryEmpty').hidden = T.has; $('#tryPhoto').hidden = !T.has; $('#tryControls').hidden = !T.has;
      const g = $('#tryGarm'); g.hidden = !T.has; if (!T.has) return;
      const key = JSON.stringify(draft).length; if (g.dataset.key !== String(key)) { g.innerHTML = E.render(draft, { id: 'try', bg: false }); g.dataset.key = key; }
      g.style.left = T.x + '%'; g.style.top = T.y + '%'; g.style.width = T.w + '%'; g.style.transform = `translateX(-50%) rotate(${T.rot}deg)`; g.style.opacity = (1 - T.op / 100).toFixed(2);
      $('#trySize').value = Math.round(T.w / 0.78); $('#trySizeOut').textContent = Math.round(T.w / 0.78) + '%'; $('#tryRot').value = T.rot; $('#tryRotOut').textContent = T.rot + '°'; $('#tryOp').value = T.op; $('#tryOpOut').textContent = T.op + '%';
    }
    const loadPhoto = file => {
      if (!file || !file.type.startsWith('image/')) return;
      if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = URL.createObjectURL(file);
      const img = $('#tryPhoto'); img.onload = () => { T.has = true; Object.assign(T, { x: 50, y: 14, w: 74, rot: 0, op: 0 }); renderTry(); FT.toast('Drag the garment onto your shoulders'); }; img.src = photoUrl;
    };
    $('#tryFile').addEventListener('change', e => loadPhoto(e.target.files[0]));
    $('#tryCam').addEventListener('change', e => loadPhoto(e.target.files[0]));
    if (!matchMedia('(pointer: coarse)').matches) $('#tryCamLbl').hidden = true;
    $('#trySize').addEventListener('input', e => { T.w = +e.target.value * 0.78; renderTry(); });
    $('#tryRot').addEventListener('input', e => { T.rot = +e.target.value; renderTry(); });
    $('#tryOp').addEventListener('input', e => { T.op = +e.target.value; renderTry(); });
    $('#tryClear').addEventListener('click', () => { T.has = false; if (photoUrl) URL.revokeObjectURL(photoUrl); photoUrl = null; $('#tryPhoto').removeAttribute('src'); renderTry(); });
    { // drag + pinch on the garment
      const g = $('#tryGarm'), frame = $('#frame'), pts = new Map(); let start = null;
      g.addEventListener('pointerdown', e => { g.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); start = { ...T, pts: new Map(pts) }; });
      g.addEventListener('pointermove', e => {
        if (!pts.has(e.pointerId) || !start) return; pts.set(e.pointerId, [e.clientX, e.clientY]); const r = frame.getBoundingClientRect();
        if (pts.size === 1) { const [x0, y0] = start.pts.get(e.pointerId) || [e.clientX, e.clientY]; T.x = start.x + (e.clientX - x0) / r.width * 100; T.y = start.y + (e.clientY - y0) / r.height * 100; }
        else if (pts.size === 2 && start.pts.size === 2) { const dist = m => { const [a, b] = [...m.values()]; return Math.hypot(a[0] - b[0], a[1] - b[1]); }; T.w = Math.max(30, Math.min(140, start.w * dist(pts) / dist(start.pts))); }
        renderTry();
      });
      const up = e => { pts.delete(e.pointerId); start = pts.size ? { ...T, pts: new Map(pts) } : null; };
      g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
    }
    function renderTryFit() {
      const b = $('#tryFit');
      b.innerHTML = A.ai.tryOn ? 'Fit to my body' : 'Centre on me';
      $('#tryNote').textContent = A.ai.tryOn ? 'Fit to my body sends your photo to Fashion Teller to place the garment on you. Placing it by hand keeps the photo on your device.' : 'Your photo stays on this device and is never uploaded.';
    }
    $('#tryFit').addEventListener('click', async () => {
      if (!T.has) return;
      if (!A.ai.tryOn) { Object.assign(T, { x: 50, y: 13, w: 74, rot: 0 }); renderTry(); return; }
      const b = $('#tryFit'); b.disabled = true; b.innerHTML = '<span class="spin"></span>Fitting';
      try {
        if (!(await saveDesign({ quiet: true }))) return;
        const c = document.createElement('canvas'), img = $('#tryPhoto'), sc = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight)); c.width = img.naturalWidth * sc; c.height = img.naturalHeight * sc; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const r = await A.tryOnFit(design.id, c.toDataURL('image/jpeg', 0.85));
        if (r.imageUrl && /^https:\/\//.test(r.imageUrl)) App.sheet(`<h3>On you</h3><img src="${FT.esc(r.imageUrl)}" alt="Your try-on" style="width:100%;border-radius:14px">`);
        else if (r.x != null) { Object.assign(T, { x: r.x, y: r.y, w: r.width ?? T.w, rot: r.rotation ?? 0 }); renderTry(); }
      } catch (e) { FT.toast(e.message); Object.assign(T, { x: 50, y: 13, w: 74, rot: 0 }); renderTry(); }
      finally { renderTryFit(); b.disabled = false; }
    });
    $('#trySave').addEventListener('click', async () => {
      const frame = $('#frame').getBoundingClientRect(), img = $('#tryPhoto'), W = 720, H = Math.round(720 * frame.height / frame.width);
      const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
      const s = Math.max(W / img.naturalWidth, H / img.naturalHeight); x.drawImage(img, (W - img.naturalWidth * s) / 2, (H - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
      const svg = E.render(draft, { id: 'sv', bg: false }), url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      const g = new Image(); await new Promise((ok, no) => { g.onload = ok; g.onerror = no; g.src = url; });
      const gw = W * T.w / 100, gh = gw * 1150 / 720; x.save(); x.globalAlpha = 1 - T.op / 100; x.translate(W * T.x / 100, H * T.y / 100); x.rotate(T.rot * Math.PI / 180); x.drawImage(g, -gw / 2, 0, gw, gh); x.restore(); URL.revokeObjectURL(url);
      x.font = '600 18px Jost, sans-serif'; x.fillStyle = 'rgba(255,255,255,.85)'; x.fillText('FASHION TELLER', 18, H - 20);
      c.toBlob(async blob => {
        const file = new File([blob], 'fashion-teller-look.png', { type: 'image/png' });
        if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: 'My Fashion Teller look' }); return; } catch {} }
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); FT.toast('Look saved to your device');
      }, 'image/png');
    });

    App.tabs($('#pvTabs'), id => { setStageMode(id === 'pv3d' ? '3d' : id === 'pvtry' ? 'try' : 'edit'); if (id === 'pvvers') renderVersions(); }, { hash: false, initial: 'pv3d' });
    function renderVersions() {
      const g = $('#vgrid');
      if (!design) { g.innerHTML = '<li class="muted small">Save your design to start keeping versions. Every save is a new version you can go back to.</li>'; return; }
      g.innerHTML = [...design.versions].reverse().map(v => `<li><button type="button" class="vcard${v.n === S.baseN ? ' on' : ''}" data-vn="${v.n}"><span class="tile-art">${E.render(v.spec, { id: 'vg' + v.n, viewBox: E.CROP.template })}</span><span><b>v${v.n}</b> ${FT.esc(v.instruction || '')}<small>${App.ago(v.createdAt)}</small></span></button></li>`).join('');
    }
    $('#vgrid').addEventListener('click', e => { const b = e.target.closest('[data-vn]'); if (!b) return; const v = design.versions.find(x => x.n === +b.dataset.vn); S.baseN = v.n; save(); setDraft(v.spec, { dirty: false }); renderVersions(); FT.toast(`Showing v${v.n}`); });
    $('#backToDesign').addEventListener('click', () => go(1));
    $('#toPreview').addEventListener('click', () => go(2));
    $('#toMeasure').addEventListener('click', async () => { if (await saveDesign({ quiet: true })) go(3, { force: true }); });

    /* ═════════ stepper + panes ═════════ */
    const reachable = n => {
      if (approved()) return n === 6 || n === 1 || n === 2;
      if (n <= 2) return true;
      if (n === 3) return !!design && !dirty;
      if (n === 4) return !!design && S.requested && !dirty;
      if (n === 5) return !!order && order.status === 'awaiting_payment';
      return false;
    };
    function go(n, { force } = {}) {
      if (!force && !reachable(n)) { if (n === 3 && draft) $('#toMeasure').click(); return; }
      const back = n < S.step; S.step = n; save();
      $$('.pane').forEach(p => {
        const on = +p.dataset.pane === n;
        if (on && !p.classList.contains('on')) { p.classList.add('on', 'enter'); p.classList.toggle('back', back); p.addEventListener('animationend', () => p.classList.remove('enter', 'back'), { once: true }); p.scrollTop = 0; }
        if (!on) p.classList.remove('on');
      });
      document.querySelector('.studio').classList.toggle('building', n <= 2);
      if (n === 2) { const cur = $$('#pvTabs [data-tab]').find(b => b.classList.contains('on'))?.dataset.tab || 'pv3d'; setStageMode(cur === 'pv3d' ? '3d' : cur === 'pvtry' ? 'try' : 'edit'); renderTryFit(); if (cur === 'pvvers') renderVersions(); }
      else setStageMode(n === 1 && S.view === '3d' && S.tab !== 'sketch' ? '3d' : 'edit');
      render();
      if (n === 3) loadMeasurements();
      if (n === 4) startQuotePoll(); else stopQuotePoll();
      if (n === 6) startOrderPoll();
      if (narrow() && n !== 1 && n !== 2) $('.st-panel').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
    $('#stepper').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) go(+b.dataset.go); });

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
    const sortSeg = FT.seg($('#sortSeg'), by => { S.sort = by; save(); renderVendors(true); render(); }); sortSeg.set(S.sort);
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
    App.tabs($('#payTabs'), id => { S.method = id; save(); render(); }, { hash: false, initial: S.method });
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
        order = result.order; save(); burst(); if (result.reward) showReward(result.reward);
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
      clearInterval(poll); if (!order || ['completed', 'cancelled'].includes(order.status)) return;
      poll = setInterval(async () => {
        try {
          const o = await A.getOrder(order.id);
          if (o.events.length !== order.events.length || o.phase !== order.phase || o.status !== order.status) { const was = order.phase; order = o; render(); if (o.phase !== was) FT.toast(o.phase === 'delivered' ? 'Delivered. Confirm when you have it.' : App.phaseLabel(o.phase)); }
          if (['completed', 'cancelled'].includes(o.status)) clearInterval(poll);
        } catch {}
      }, A.pollMs);
    }
    function renderTrack() {
      const p = phase();
      $('#trkTitle').textContent = order?.status === 'cancelled' ? 'Order cancelled' : order?.status === 'completed' ? 'Yours to wear' : p >= 3 ? 'Delivered to your door' : 'Production is under way';
      $('#trkHint').textContent = order ? (order.eta && p < 3 ? `Expected by ${App.date(order.eta)}. ` : '') + 'Updates appear here as the tailor posts them.' : '';
      $('#trkV').innerHTML = App.PHASES.map(([, t, d], i) => `<li class="${i < p || (i === p && p === 3) ? 'done' : i === p ? 'now' : ''}"><span class="dot"><i></i></span><div><h3>${t}</h3><p>${d}</p></div></li>`).join('');
      if (!order) { $('#summary').innerHTML = ''; $('#feed').innerHTML = ''; $('#trkActs').innerHTML = ''; $('#balance').hidden = true; return; }
      $('#summary').innerHTML = `<dt>Order</dt><dd>${FT.esc(order.id)}</dd><dt>Tailor</dt><dd>${FT.esc(order.vendor?.name || '')}</dd><dt>Design</dt><dd>Version ${order.versionN}</dd><dt>Delivery</dt><dd>${order.deliveryDays || '—'} days</dd><dt>Total</dt><dd>${FT.money(order.total)}</dd><dt>Paid</dt><dd>${FT.money(order.paid)}</dd>`;
      $('#balance').hidden = !(order.status === 'balance_due' || (order.plan === 'deposit' && order.paid < order.total && order.status === 'active'));
      $('#balAmt').textContent = FT.money(order.total - order.paid) + (order.status === 'balance_due' ? ' · due now' : ' · after delivery');
      $('#balBtn').hidden = order.status !== 'balance_due';
      $('#feed').innerHTML = [...order.events].reverse().map(e => `<li><span class="when">${App.ago(e.at)}</span><b>${FT.esc(e.title)}</b>${e.body ? `<p>${FT.esc(e.body)}</p>` : ''}${e.photos?.length ? `<div class="photos">${e.photos.filter(p => /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(p)).map(p => `<img src="${p}" alt="Photo from the tailor" loading="lazy">`).join('')}</div>` : ''}</li>`).join('');
      const acts = [];
      if (order.status === 'delivered' && order.issue?.status !== 'open') acts.push(`<button type="button" class="btn gold" data-act="confirm">I have it: release payment</button>`);
      if (['active', 'balance_due', 'delivered', 'completed'].includes(order.status)) acts.push(`<a class="btn ghost" href="/orders?id=${encodeURIComponent(order.id)}">Order page: message, review, report</a>`);
      $('#trkActs').innerHTML = acts.join('');
    }
    $('#balBtn').addEventListener('click', () => { S.plan = 'full'; save(); go(5, { force: true }); });
    $('#trkActs').addEventListener('click', async e => { if (!e.target.closest('[data-act="confirm"]') || !order) return; if (!(await App.confirm('You have the garment?', `Confirming releases ${FT.money(order.paid)} to ${FT.esc(order.vendor?.name || 'the tailor')}. If something is wrong, report a problem from the order page instead.`, { ok: 'Yes, release payment', no: 'Not yet' }))) return; try { order = await A.confirmDelivery(order.id); render(); FT.toast('Thank you. Enjoy wearing it.'); } catch (x) { FT.toast(x.message); } });
    $('#shareBtn').addEventListener('click', () => {
      const pub = design?.published; App.share({ title: 'Fashion Teller', text: design ? `I designed "${design.title}" on Fashion Teller.` : 'I designed this on Fashion Teller.', url: location.origin + (pub ? '/design?id=' + encodeURIComponent(design.id) : '/studio') });
      if (design && !pub) FT.toast('Publish it from the design room to share the design itself.');
    });
    function resetAll() {
      clearInterval(poll); stopQuotePoll(); thread?.clear();
      S = fresh(); design = null; order = null; quotes = []; els.clear(); vlist.innerHTML = '';
      setDraft(E.blank('kaftan'), { history: false, dirty: false }); undo.length = 0; redo.length = 0; S.tab = 'templates'; save();
      render(); go(1, { force: true });
    }
    $('#newBtn').addEventListener('click', resetAll);

    /* ───────── render ───────── */
    function render() {
      $$('#stepper [data-go]').forEach(b => {
        const n = +b.dataset.go;
        b.classList.toggle('cur', n === S.step);
        b.classList.toggle('done', (approved() && n < 6) || (!approved() && (n < S.step || (n === 1 && !!design && !dirty && S.step !== 1))));
        b.disabled = !reachable(n) && !(n === 3 && draft);
        if (n === S.step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
      renderBar();
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
      let seed = null;
      if (S.designId && !design) { try { design = await A.getDesign(S.designId); } catch { design = null; S.designId = null; S.requested = false; } }
      if (design && design.view && design.view !== 'owner') { seed = App.version(design).spec; design = null; S.designId = null; S.requested = false; }
      let stored = null; try { stored = JSON.parse(localStorage.getItem(DRAFT)); } catch {}
      if (openTpl && E.template(openTpl)) { design = null; S.designId = null; draft = clone(E.template(openTpl).spec); dirty = true; }
      else if (handed) { design = null; S.designId = null; draft = { ...E.parse(handed), template: null }; dirty = true; }
      else if (design) {
        if (order) S.baseN = order.versionN; if (!S.baseN || !design.versions.some(v => v.n === S.baseN)) S.baseN = design.current;
        const useStored = stored && stored.designId === design.id && stored.dirty && !openDesign && !order;
        draft = useStored ? stored.spec : clone(design.versions.find(v => v.n === S.baseN).spec); dirty = !!useStored;
      } else if (seed) { draft = clone(seed); dirty = true; }
      else if (stored && !stored.designId && stored.spec) { draft = stored.spec; dirty = stored.dirty !== false; }
      else { draft = clone(E.template('royal-kaftan').spec); dirty = false; }
      draft = E.normalize(draft);
      if (design && !order) { try { const r = await A.getRequest(design.id); if (r && r.status !== 'closed') S.requested = true; } catch {} }
      if (order && order.status === 'awaiting_payment') S.step = 5; else if (order && order.status === 'balance_due' && wantPay) { S.plan = 'full'; S.step = 5; } else if (approved()) S.step = S.step <= 2 ? S.step : 6; else if (!design || dirty) S.step = Math.min(S.step, 2); else if (S.step > 4 || (S.step === 4 && !S.requested)) S.step = S.requested ? 4 : 1;
      if (wantChallenge) S.step = 1;
      persistDraft(); save(); renderBuilder(); go(S.step, { force: true });
      if (S.step === 6) startOrderPoll();
      refreshGame();
      if (wantChallenge) FT.ready.then(() => $('#dcGo')?.click());
    })();
    document.addEventListener('ft:auth', e => { if (!e.detail.user) { resetAll(); } });
  });
})();
