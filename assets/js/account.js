/**
 * The app shell on every page: account menu, notifications, message count, the phone tab bar, the sign-in sheet,
 * route guards, and the pieces product pages share (FTApp): cards, sheets, the 3D viewer mount, checkout,
 * reviews, reporting, likes / saves / follows.
 */
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const { $, $$ } = FT, A = window.FTApi, C = window.FT_CONFIG || {}, E = window.FTEngine, esc = FT.esc;
    FT.money = A.money;

    /* ═════════ shared helpers ═════════ */
    const App = (window.FTApp = {});
    App.esc = esc;
    App.date = (t, { time = false } = {}) => { if (!t) return ''; const d = new Date(t); if (isNaN(d)) return ''; return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) + (time ? ', ' + d.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' }) : ''); };
    App.ago = t => { const s = (Date.now() - new Date(t).getTime()) / 1000; if (!(s >= 0)) return App.date(t); if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; if (s < 7 * 86400) return Math.floor(s / 86400) + ' d ago'; return App.date(t); };
    App.count = n => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n || 0));
    App.plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
    App.PHASES = [
      ['concept_generated', 'Design approved', 'You designed it and approved the version to make.'],
      ['vendor_assigned', 'Tailor assigned', 'The tailor has your approved version, measurements and payment.'],
      ['tailoring', 'Fabric and tailoring', 'Fabric sourced; cutting, sewing and finishing in progress.'],
      ['delivered', 'Delivered to your door', 'Quality checked and delivered. Confirm you have it to release payment.'],
    ];
    App.phaseLabel = p => (App.PHASES.find(x => x[0] === p) || [])[1] || p;
    App.STATUS = { awaiting_payment: ['Awaiting payment', 'warn'], active: ['In production', 'gold'], balance_due: ['Balance due', 'warn'], delivered: ['Delivered', 'ok'], completed: ['Completed', 'ok'], cancelled: ['Cancelled', 'mute'], draft: ['Draft', 'mute'], requested: ['Quotes requested', 'gold'], ordered: ['In production', 'ok'], offered: ['Offered', 'gold'], accepted: ['Accepted', 'ok'], declined: ['Not chosen', 'mute'], withdrawn: ['Withdrawn', 'mute'], pending: ['Pending verification', 'warn'], verified: ['Verified', 'ok'], rejected: ['Rejected', 'bad'], suspended: ['Suspended', 'bad'], open: ['Open', 'gold'], closed: ['Closed', 'mute'], paid: ['Held', 'gold'], released: ['Released', 'ok'], refunded: ['Refunded', 'mute'], failed: ['Failed', 'bad'], new: ['New', 'gold'], approved: ['Approved', 'ok'], resolved: ['Resolved', 'mute'], published: ['Published', 'ok'] };
    /* commissions read differently from orders */
    App.CSTATUS = { requested: ['Request sent', 'gold'], offered: ['Offer waiting', 'warn'], active: ['Being designed', 'gold'], delivered: ['Ready to review', 'warn'], changes: ['Changes requested', 'gold'], approved: ['Approved', 'ok'], declined: ['Declined', 'mute'], cancelled: ['Cancelled', 'mute'] };
    App.badge = (s, map = App.STATUS) => { const [l, k] = map[s] || [String(s || '').replace(/_/g, ' '), 'mute']; return `<span class="badge ${k}">${esc(l)}</span>`; };
    App.avatar = (v, size = 40) => `<span class="vav" style="--h:${Number(v?.hue ?? 40) || 0};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px" aria-hidden="true">${esc((v?.name || '?').split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase())}</span>`;
    App.version = (d, n) => d.versions.find(v => v.n === (n ?? d.current)) || d.versions[d.versions.length - 1];
    let artSeq = 0;
    /** A flat drawing of a design. crop is one of FTEngine.CROP's keys. */
    App.art = (spec, { crop = null, view = 'front', bg = true } = {}) => E.render(spec, { id: 'a' + (artSeq++).toString(36), view, bg, sketch: true, ...(crop ? { viewBox: E.CROP[crop] || crop } : {}) });
    App.thumb = (design, cls = 'thumb') => `<div class="${cls}">${App.art(App.version(design).spec)}</div>`;
    App.units = m => (m.unit === 'in' ? 'in' : 'cm');
    App.stars = (n, size = 14) => { const v = Math.max(0, Math.min(5, Number(n) || 0)); return `<span class="stars" style="--v:${v};--s:${size}px" role="img" aria-label="${v.toFixed(1)} out of 5"></span>`; };
    App.ICON = {
      tryon: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="5.5" r="2.5" stroke="currentColor" stroke-width="1.6"/><path d="M6 21v-6l-2-4 4-2.5h8L20 11l-2 4v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      design: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM13 6l3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      order: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6zM3 6h18M16 10a4 4 0 0 1-8 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      tape: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 9h18v6H3zM7 9v3M11 9v2M15 9v3M19 9v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
      lock: '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.6"/></svg>',
      inbox: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 13l2-8h14l2 8v6H3zM3 13h5l2 3h4l2-3h5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
      heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.7c0 5.6-7.5 10.2-7.5 10.2z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
      mark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16l-6-4-6 4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
      chat: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
      bell: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4zM10 21h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      spark: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
      people: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="8" r="3.5" stroke="currentColor" stroke-width="1.7"/><path d="M2.5 20c.8-3.6 3.300-5.500 6.500-5.500s5.700 1.900 6.500 5.500M16 4.800a3.500 3.500 0 0 1 0 6.400M18.500 14.800c1.700.8 2.700 2.600 3 5.200" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
      user: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.7"/><path d="M4 21c1.500-4 4.500-6 8-6s6.500 2 8 6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
      plus: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
      cube: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3l8 4.500v9L12 21l-8-4.500v-9zM4 7.500l8 4.500 8-4.500M12 12v9" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
      remix: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 4L4 7l3 3M4 7h11a5 5 0 0 1 5 5M17 20l3-3-3-3M20 17H9a5 5 0 0 1-5-5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      share: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      flag: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 21V4h12l-2 4 2 4H5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    };
    App.empty = (icon, title, body, action) => `<div class="empty"><div class="ic">${icon}</div><h2>${title}</h2><p>${body}</p>${action || ''}</div>`;
    /* links that arrive as data (notifications) may only point inside the site */
    App.path = h => (typeof h === 'string' && /^\/(?![/\\])/.test(h) ? h : '#');
    /* under a price field: what the tailor or designer actually receives once the platform fee is taken */
    App.feeHints = async root => {
      const els = $$('[data-fee]', root); if (!els.length) return; const f = await A.features(); if (!f.feePercent) return;
      for (const el of els) { const input = el.closest('.field')?.querySelector('input'); if (!input) continue; const up = () => { const v = Math.round(+input.value || 0); el.textContent = v > 0 ? `You receive ${FT.money(v - Math.round(v * f.feePercent / 100))} after the ${f.feePercent}% platform fee.` : `Fashion Teller keeps ${f.feePercent}% as its platform fee.`; }; input.addEventListener('input', up); up(); }
    };
    App.mailbox = async () => {
      const list = await A.mailbox();
      App.sheet(`<h3>Demo mailbox</h3><p class="muted" style="margin-top:-6px">Built-in mode has no mail server, so the emails this site would send are kept here. With the backend connected they go to the real address.</p>
        <div class="mails">${list.length ? list.map(m => `<article class="mailrow"><div class="mailrow-h"><b>${esc(m.subject)}</b><time datetime="${esc(m.at)}">${App.ago(m.at)}</time></div><p class="muted small">To ${esc(m.to)}</p><p>${esc(m.text)}</p><a class="btn ink sm" href="${esc(App.path(m.link))}">${m.kind === 'reset' ? 'Choose a new password' : m.kind === 'verify' ? 'Confirm this address' : 'Open'}</a></article>`).join('') : '<p class="muted">No emails yet.</p>'}</div>`, { wide: true });
    };
    App.likeLabel = (name, n) => `Like${name ? ' ' + name : ''}, ${App.count(n)} ${n === 1 ? 'like' : 'likes'}`;
    App.skeleton = (n = 6, cls = 'dcard') => `<div class="feed-grid" aria-hidden="true">${Array.from({ length: n }, () => `<div class="${cls} sk"><div class="dcard-art"></div><div class="sk-l"></div><div class="sk-l short"></div></div>`).join('')}</div>`;

    /* ───── measurements (studio step 3 and the account page share the form) ───── */
    App.MEASURE_FIELDS = [
      ['height', 'Height', 'Standing straight, without shoes.'], ['neck', 'Neck', 'Around the base of the neck.'], ['shoulder', 'Shoulder', 'Across the back, shoulder point to shoulder point.'], ['chest', 'Chest / bust', 'Around the fullest part, tape level.'], ['waist', 'Waist', 'Around the natural waist, just above the navel.'], ['hips', 'Hips', 'Around the fullest part of the hips.'], ['sleeve', 'Sleeve', 'Shoulder point to the wrist bone, arm slightly bent.'], ['length', 'Garment length', 'From the shoulder to where you want the hem.'], ['inseam', 'Inseam', 'Crotch to the ankle bone (trousers).'], ['thigh', 'Thigh', 'Around the fullest part of the thigh.'],
    ];
    App.PRESETS = { S: { height: 165, neck: 36, shoulder: 42, chest: 88, waist: 74, hips: 92, sleeve: 58, length: 135, inseam: 76, thigh: 52 }, M: { height: 172, neck: 39, shoulder: 45, chest: 96, waist: 82, hips: 98, sleeve: 61, length: 140, inseam: 79, thigh: 57 }, L: { height: 178, neck: 41, shoulder: 48, chest: 104, waist: 90, hips: 104, sleeve: 64, length: 145, inseam: 82, thigh: 62 }, XL: { height: 182, neck: 43, shoulder: 50, chest: 112, waist: 100, hips: 112, sleeve: 66, length: 148, inseam: 84, thigh: 67 } };
    App.measureSummary = m => { const u = App.units(m); return ['chest', 'waist', 'hips'].filter(k => m.values[k]).map(k => `${k === 'chest' ? 'Chest' : k === 'waist' ? 'Waist' : 'Hips'} ${m.values[k]}${u}`).join(' · '); };
    App.measureForm = (root, { existing = null, onSave, onCancel, compact = false }) => {
      const m = existing || { label: '', unit: 'cm', values: {}, fit: 'regular', notes: '' };
      root.innerHTML = `<form class="form mform" novalidate>
        <div class="field"><label for="mf-label">Profile name</label><input id="mf-label" name="label" maxlength="40" placeholder="Me, Dad, Chidi…" value="${esc(m.label || '')}"><span class="msg"></span></div>
        <div class="field"><span class="lbl">Units</span><div class="seg sm" data-unit><button type="button" data-v="cm" aria-pressed="${m.unit !== 'in'}">cm</button><button type="button" data-v="in" aria-pressed="${m.unit === 'in'}">inches</button></div></div>
        <div class="field full"><span class="lbl">Start from a size <small class="muted">(then adjust)</small></span><div class="chips">${Object.keys(App.PRESETS).map(k => `<button class="chip" type="button" data-preset="${k}">${k}</button>`).join('')}</div></div>
        <div class="mgrid full">${App.MEASURE_FIELDS.map(([k, l, tip]) => `<div class="field"><label for="mf-${k}">${l}${k === 'chest' || k === 'waist' ? ' <i class="reqmark">required</i>' : ''}</label><div class="unitin"><input id="mf-${k}" name="${k}" inputmode="decimal" type="number" step="0.5" min="0" max="399" value="${esc(m.values[k] ?? '')}"><span class="u">${m.unit === 'in' ? 'in' : 'cm'}</span></div><small class="tip">${tip}</small></div>`).join('')}</div>
        <div class="field"><span class="lbl">How you like it to fit</span><div class="seg sm" data-fit><button type="button" data-v="slim" aria-pressed="${m.fit === 'slim' || m.fit === 'fitted'}">Slim</button><button type="button" data-v="regular" aria-pressed="${!m.fit || m.fit === 'regular'}">Regular</button><button type="button" data-v="relaxed" aria-pressed="${m.fit === 'relaxed'}">Relaxed</button></div></div>
        <div class="field"><label for="mf-notes">Notes for the tailor</label><input id="mf-notes" name="notes" maxlength="400" placeholder="Left arm slightly longer, prefers no shoulder pads…" value="${esc(m.notes || '')}"></div>
        <p class="err full" role="alert"></p>
        <div class="foot-row"><p>${compact ? 'Saved to your account; reuse it on every order.' : 'A tailor needs chest and waist at minimum. The rest makes the fit better.'}</p><div class="row-btns"><button class="btn ghost" type="button" data-cancel>${onCancel ? 'Cancel' : 'Clear'}</button><button class="btn ink" type="submit">Save profile</button></div></div>
      </form>`;
      const form = $('form', root); let unit = m.unit === 'in' ? 'in' : 'cm', fit = m.fit === 'fitted' ? 'slim' : m.fit || 'regular';
      FT.seg($('[data-unit]', form), v => { const from = unit; unit = v; $$('.u', form).forEach(u => (u.textContent = v)); if (from !== v) $$('.mgrid input', form).forEach(i => { if (i.value) i.value = (v === 'in' ? +i.value / 2.54 : +i.value * 2.54).toFixed(1).replace(/\.0$/, ''); }); });
      FT.seg($('[data-fit]', form), v => (fit = v));
      form.addEventListener('click', e => { const b = e.target.closest('[data-preset]'); if (!b) return; const p = App.PRESETS[b.dataset.preset]; $$('.mgrid input', form).forEach(i => (i.value = unit === 'in' ? (p[i.name] / 2.54).toFixed(1).replace(/\.0$/, '') : p[i.name])); $$('[data-preset]', form).forEach(x => x.setAttribute('aria-pressed', x === b)); });
      $('[data-cancel]', form).addEventListener('click', () => (onCancel ? onCancel() : form.reset()));
      form.addEventListener('submit', async e => {
        e.preventDefault(); const err = $('.err', form), btn = $('button[type="submit"]', form);
        const data = Object.fromEntries(new FormData(form)); const values = {}; App.MEASURE_FIELDS.forEach(([k]) => (values[k] = data[k]));
        btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Saving'; err.textContent = '';
        try { const saved = await A.saveMeasurement({ id: m.id, label: data.label, unit, values, fit, notes: data.notes }); FT.toast(`Measurements saved as “${saved.label}”`); onSave?.(saved); }
        catch (x) { err.textContent = x.message; }
        finally { btn.disabled = false; btn.textContent = 'Save profile'; }
      });
      return form;
    };

    /* ───── sheets ───── */
    let sheetEl = null, lastFocus = null;
    App.sheet = (html, { onClose, wide = false } = {}) => {
      App.closeSheet();
      lastFocus = document.activeElement;
      const bg = document.createElement('div'); bg.className = 'sheet-bg'; const s = document.createElement('div'); s.className = 'sheet app-sheet' + (wide ? ' wide' : ''); s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true'); s.tabIndex = -1;
      s.innerHTML = `<button class="sheet-x" type="button" aria-label="Close"><svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><div class="sheet-body">${html}</div>`;
      document.body.append(bg, s); sheetEl = { bg, s, onClose };
      const h = $('h3', s); if (h) { h.id = h.id || 'sheetH'; s.setAttribute('aria-labelledby', h.id); }
      requestAnimationFrame(() => { bg.classList.add('on'); s.classList.add('on'); s.focus({ preventScroll: true }); });
      bg.addEventListener('click', App.closeSheet); $('.sheet-x', s).addEventListener('click', App.closeSheet);
      s.addEventListener('keydown', e => { if (e.key !== 'Tab') return; const f = $$('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex="0"]', s).filter(x => x.offsetParent !== null); if (!f.length) return; const first = f[0], last = f[f.length - 1]; if (e.shiftKey && (document.activeElement === first || document.activeElement === s)) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } });
      return s;
    };
    App.closeSheet = () => { if (!sheetEl) return; const { bg, s, onClose } = sheetEl; sheetEl = null; bg.classList.remove('on'); s.classList.remove('on'); setTimeout(() => { bg.remove(); s.remove(); }, 700); try { lastFocus?.focus?.({ preventScroll: true }); } catch {} onClose?.(); };
    addEventListener('keydown', e => { if (e.key === 'Escape') { App.closeSheet(); Acc.close(); closePops(); } });
    App.confirm = (title, body, { ok = 'Confirm', no = 'Keep', danger = false } = {}) => new Promise(res => {
      const s = App.sheet(`<h3>${esc(title)}</h3><p class="muted">${body}</p><div class="row-btns" style="margin-top:18px"><button class="btn ghost" type="button" data-no>${esc(no)}</button><button class="btn ${danger ? 'danger' : 'ink'}" type="button" data-yes>${esc(ok)}</button></div>`, { onClose: () => res(false) });
      $('[data-yes]', s).addEventListener('click', () => { sheetEl.onClose = null; App.closeSheet(); res(true); });
      $('[data-no]', s).addEventListener('click', App.closeSheet);
    });
    /** A small form in a sheet. fields: [{name,label,type,value,placeholder,options,max,required,hint}]. Resolves with the values, or null. */
    App.ask = (title, intro, fields, { ok = 'Save', submit } = {}) => new Promise(res => {
      const f = fields.map(x => `<div class="field"><label for="ask-${x.name}">${esc(x.label)}${x.optional ? ' <small class="muted">optional</small>' : ''}</label>${x.type === 'textarea' ? `<textarea id="ask-${x.name}" name="${x.name}" maxlength="${x.max || 1000}" placeholder="${esc(x.placeholder || '')}" rows="4">${esc(x.value || '')}</textarea>` : x.type === 'select' ? `<select id="ask-${x.name}" name="${x.name}">${x.options.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${String(x.value ?? '') === String(v) ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}</select>` : x.type === 'stars' ? `<div class="starpick" data-stars="${x.name}">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-v="${n}" aria-label="${n} star${n === 1 ? '' : 's'}" aria-pressed="${n <= (x.value || 5)}">★</button>`).join('')}<input type="hidden" name="${x.name}" value="${x.value || 5}"></div>` : `<input id="ask-${x.name}" name="${x.name}" type="${x.type || 'text'}" value="${esc(x.value ?? '')}" maxlength="${x.max || 200}" placeholder="${esc(x.placeholder || '')}"${x.min != null ? ` min="${x.min}"` : ''}${x.step ? ` step="${x.step}"` : ''}${x.type === 'number' ? ' inputmode="numeric"' : ''}>`}${x.hint ? `<small class="tip">${esc(x.hint)}</small>` : ''}</div>`).join('');
      let done = false;
      const s = App.sheet(`<h3>${esc(title)}</h3>${intro ? `<p class="muted">${intro}</p>` : ''}<form class="form one" novalidate>${f}<p class="err" role="alert"></p><div class="row-btns"><button class="btn ghost" type="button" data-c>Cancel</button><button class="btn ink" type="submit">${esc(ok)}</button></div></form>`, { onClose: () => { if (!done) res(null); } });
      $$('[data-stars]', s).forEach(sp => sp.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; $('input', sp).value = b.dataset.v; $$('button', sp).forEach(x => x.setAttribute('aria-pressed', +x.dataset.v <= +b.dataset.v)); }));
      $('[data-c]', s).addEventListener('click', App.closeSheet);
      setTimeout(() => $('input:not([type=hidden]),textarea,select', s)?.focus(), 350);
      $('form', s).addEventListener('submit', async e => {
        e.preventDefault(); const data = Object.fromEntries(new FormData(e.target)), err = $('.err', s), btn = $('button[type="submit"]', s);
        if (!submit) { done = true; App.closeSheet(); return res(data); }
        btn.disabled = true; const label = btn.textContent; btn.innerHTML = '<span class="spin"></span>' + esc(label); err.textContent = '';
        try { const out = await submit(data); done = true; App.closeSheet(); res(out ?? data); } catch (x) { err.textContent = x.message || 'That did not go through.'; btn.disabled = false; btn.textContent = label; }
      });
    });
    App.tabs = (root, onChange, { hash = true, initial: init = null } = {}) => {
      const btns = $$('[data-tab]', root), ids = btns.map(b => b.dataset.tab);
      const show = (id, fire = true) => { btns.forEach(b => { const on = b.dataset.tab === id; b.setAttribute('aria-selected', on); b.classList.toggle('on', on); b.tabIndex = on ? 0 : -1; }); $$('[data-panel]').filter(p => ids.includes(p.dataset.panel)).forEach(p => (p.hidden = p.dataset.panel !== id)); if (fire) onChange?.(id); if (hash) { try { history.replaceState(null, '', location.pathname + location.search + '#' + id); } catch {} } reveal(id); };
      /* a strip wider than its space scrolls sideways: keep the chosen tab in view and fade the edge that has more */
      const edge = () => { const more = root.scrollWidth - root.clientWidth; root.classList.toggle('more-r', more - root.scrollLeft > 6); root.classList.toggle('more-l', root.scrollLeft > 6); };
      const reveal = id => { const on = btns.find(b => b.dataset.tab === id); if (on && root.scrollWidth > root.clientWidth + 1) root.scrollLeft += on.getBoundingClientRect().left - root.getBoundingClientRect().left - (root.clientWidth - on.offsetWidth) / 2; edge(); };
      root.addEventListener('scroll', edge, { passive: true }); if (window.ResizeObserver) new ResizeObserver(edge).observe(root);
      btns.forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
      root.addEventListener('keydown', e => { if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return; const vis = btns.filter(b => !b.hidden), i = vis.indexOf(document.activeElement); if (i < 0) return; e.preventDefault(); const n = vis[(i + (e.key === 'ArrowRight' ? 1 : vis.length - 1)) % vis.length]; n.focus(); show(n.dataset.tab); });
      const initial = init || (hash ? location.hash.slice(1) : ''); show(btns.some(b => b.dataset.tab === initial) ? initial : btns[0].dataset.tab, !init);
      const current = () => btns.find(b => b.classList.contains('on'))?.dataset.tab;
      /* a link to another tab of the page you are already on (menu → Account → Measurements) changes only the hash */
      if (hash) addEventListener('hashchange', () => { const h = location.hash.slice(1); if (ids.includes(h) && h !== current()) show(h); });
      return { show, current };
    };
    App.share = async ({ title = 'Fashion Teller', text = '', url = location.href } = {}) => { if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch (e) { if (e?.name === 'AbortError') return; } } try { await navigator.clipboard.writeText(url); FT.toast('Link copied'); } catch { App.sheet(`<h3>Share</h3><p class="muted">Copy this link:</p><div class="field"><input readonly value="${esc(url)}" onfocus="this.select()"></div>`); } };
    /** Shrink a photo in the browser before it is stored or sent (longest side `max` px, JPEG). */
    App.photo = (file, max = 720, q = 0.7) => new Promise((ok, no) => { if (!file || !/^image\//.test(file.type)) return no(new Error('Choose a photo.')); const url = URL.createObjectURL(file), img = new Image(); img.onload = () => { const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL('image/jpeg', q)); }; img.onerror = () => { URL.revokeObjectURL(url); no(new Error('That photo could not be read.')); }; img.src = url; });

    /* ───── the 3D viewer, with the flat drawing as a fallback ───── */
    let v3dLoading = null;
    App.load3d = () => v3dLoading || (v3dLoading = new Promise(ok => { if (window.FT3D) return ok(true); const s = document.createElement('script'); s.src = '/assets/js/viewer3d.js'; s.onload = () => ok(!!window.FT3D); s.onerror = () => ok(false); document.head.appendChild(s); }));
    App.viewer = async (el, spec, opt = {}) => {
      el.classList.add('v3d'); let cur = 'front', s = spec;
      const flat = () => { el.classList.add('is-flat'); el.innerHTML = `<div class="v3d-flat">${App.art(s, { view: cur, bg: false })}</div>`; };
      const fallback = { flat: true, setSpec(n) { s = n; flat(); return Promise.resolve(); }, face(v) { cur = v === 'back' ? 'back' : 'front'; flat(); }, spin: () => false, spinning: false, zoom() {}, setTone() {}, tones: [], tone: 0, snapshot: () => null, resize() {}, dispose() {} };
      if (!(await App.load3d()) || !window.FT3D.supported()) { flat(); return fallback; }
      el.insertAdjacentHTML('beforeend', '<div class="v3d-load"><span class="spin"></span><span>Building it in 3D</span></div>');
      try { const v = await window.FT3D.mount(el, { spin: !!opt.spin, yaw: opt.yaw }); await v.setSpec(s); $('.v3d-load', el)?.remove(); el.addEventListener('v3d:error', () => { v.dispose(); flat(); Object.assign(v, fallback); }, { once: true }); return v; }
      catch (e) { console.warn('Fashion Teller: 3D is not available here, showing the flat drawing.', e); $('.v3d-load', el)?.remove(); $('canvas', el)?.remove(); flat(); return fallback; }
    };

    /* ───── cards ───── */
    const byline = (p, size = 26) => `<a class="byline" href="/designer?id=${encodeURIComponent(p.id)}">${App.avatar(p, size)}<span><b>${esc(p.name)}</b>${p.handle ? `<small>@${esc(p.handle)}</small>` : ''}</span></a>`;
    App.byline = byline;
    const lazy = new Map(); let lazyIO = null, lazySeq = 0;
    const lazyBox = (spec, crop) => { const k = 'lz' + lazySeq++; lazy.set(k, [spec, crop]); return `<span class="lz" data-lz="${k}"></span>`; };
    /** Draw the cards' art as they come near the screen, so a long feed stays light. */
    App.hydrate = root => {
      lazyIO ||= 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (!e.isIntersecting) return; lazyIO.unobserve(e.target); fill(e.target); }), { rootMargin: '500px 0px' }) : null;
      const fill = el => { const v = lazy.get(el.dataset.lz); if (!v) return; lazy.delete(el.dataset.lz); el.outerHTML = App.art(v[0], { crop: v[1] }); };
      $$('.lz', root).forEach(el => (lazyIO ? lazyIO.observe(el) : fill(el)));
    };
    /** A published design, as shown in Discover, on profiles and on the home page. */
    App.dcard = (d, { rank = null } = {}) => `<article class="dcard" data-id="${esc(d.id)}">
      <a class="dcard-art" href="/design?id=${encodeURIComponent(d.id)}" tabindex="-1" aria-hidden="true">${lazyBox(d.spec, 'template')}<span class="dcard-g">${esc(E.vocab.GARMENTS[d.garment]?.label || d.garment)}</span>${rank ? `<span class="dcard-r">#${rank}</span>` : ''}</a>
      <div class="dcard-t"><h3><a href="/design?id=${encodeURIComponent(d.id)}">${esc(d.title)}</a></h3><button class="likebtn" type="button" data-like="${esc(d.id)}" data-name="${esc(d.title)}" aria-pressed="${!!d.liked}" aria-label="${esc(App.likeLabel(d.title, d.likes))}">${App.ICON.heart}<b>${App.count(d.likes)}</b></button></div>
      <div class="dcard-m">${byline(d.by, 22)}${d.remixes ? `<span class="muted">${App.plural(d.remixes, 'remix', 'remixes')}</span>` : ''}</div>
    </article>`;
    /** A designer, as shown in the directory and on the home page. */
    App.pcard = p => `<article class="pcard" data-id="${esc(p.id)}">
      <a class="pcard-top" href="/designer?id=${encodeURIComponent(p.id)}">${App.avatar(p, 56)}<span><b>${esc(p.name)}</b><small>@${esc(p.handle)} · ${esc([p.city, p.country].filter(Boolean).join(', '))}</small></span></a>
      <p>${esc(p.bio)}</p>
      <div class="chips">${p.specialties.slice(0, 3).map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>
      <dl class="pcard-s"><div><dt>Rating</dt><dd>${p.rating ? p.rating.toFixed(1) + ' ★' : 'New'}</dd></div><div><dt>Followers</dt><dd>${App.count(p.followers)}</dd></div><div><dt>From</dt><dd>${FT.money(p.feeFrom, { compact: true })}</dd></div></dl>
      <div class="row-btns compact"><a class="btn ink sm" href="/designer?id=${encodeURIComponent(p.id)}">View profile</a>${p.mine ? '' : `<button class="btn ghost sm" type="button" data-follow="${esc(p.id)}" aria-pressed="${!!p.following}">${p.following ? 'Following' : 'Follow'}</button>`}${p.open ? '<span class="badge ok">Open to commissions</span>' : '<span class="badge mute">Booked</span>'}</div>
    </article>`;
    App.reviews = list => list?.length ? `<ol class="revs">${list.map(r => `<li>${App.avatar(r.by, 32)}<div><p class="rev-h"><b>${esc(r.by?.name || 'Customer')}</b>${App.stars(r.rating)}<small>${App.ago(r.createdAt)}</small></p>${r.text ? `<p>${esc(r.text)}</p>` : ''}</div></li>`).join('')}</ol>` : '<p class="muted small">No written reviews yet.</p>';

    /* tailor profile sheet */
    App.vendorSheet = async v => {
      const s = App.sheet(`<div class="vprof">${App.avatar(v, 56)}<div><h3>${esc(v.name)}${v.verified ? FT.STAR : ''}</h3><p class="muted">${esc([v.city, v.country].filter(Boolean).join(', '))}${v.since ? ` · since ${Number(v.since) || ''}` : ''}</p></div></div>
        <div class="vstats"><div><b>${v.rating ? v.rating.toFixed(1) + ' ★' : 'New'}</b><span>${App.plural(v.reviews || 0, 'review')}</span></div><div><b>${v.ordersDone || 0}</b><span>orders made</span></div><div><b>${v.verified ? 'Verified' : 'Pending'}</b><span>${v.verifiedAt ? App.date(v.verifiedAt) : 'verification'}</span></div></div>
        <p class="body" style="max-width:none">${esc(v.bio || '')}</p>
        <div class="chips">${(v.specialties || []).map(x => `<span class="tag">${esc(x)}</span>`).join('')}</div>
        <h4 class="h4" style="margin-top:22px">Reviews</h4><div data-revs><div class="loading sm"><span class="spin"></span></div></div>
        <p class="muted small" style="margin-top:14px">Verified tailors have had their workshop, identity and sample work checked by Fashion Teller. Payments are held until you confirm delivery.</p>`);
      try { const full = await A.getVendor(v.id); $('[data-revs]', s).innerHTML = App.reviews(full.reviewList); } catch { $('[data-revs]', s).innerHTML = App.reviews([]); }
      return s;
    };

    /* ───── checkout used outside the studio (commissions): card, bank transfer or Paystack ───── */
    App.checkout = ({ title, amount, lines = [], note = '', pay, paystackTarget = null }) => new Promise(resolve => {
      const hasPaystack = !!C.payments?.paystackPublicKey; let method = hasPaystack ? 'paystack' : 'card', done = false;
      const s = App.sheet(`<h3>${esc(title)}</h3><dl class="summary">${lines.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}<dt>To pay now</dt><dd><b>${FT.money(amount)}</b></dd></dl>
        <div class="tabs" role="tablist" style="margin:18px 0 14px">${hasPaystack ? '<button type="button" role="tab" data-m="paystack">Paystack</button>' : ''}<button type="button" role="tab" data-m="card">Card</button><button type="button" role="tab" data-m="transfer">Bank transfer</button></div>
        <div data-p="card" class="paybox"><div class="form two"><div class="field full"><label for="ck-num">Card number</label><input id="ck-num" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000" maxlength="19"></div><div class="field"><label for="ck-exp">Expiry</label><input id="ck-exp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" maxlength="5"></div><div class="field"><label for="ck-cvv">CVV</label><input id="ck-cvv" inputmode="numeric" autocomplete="cc-csc" placeholder="123" maxlength="4" type="password"></div></div><p class="muted small">Test checkout: 4084 0840 8408 4081, any future expiry, any CVV. CVV 000 simulates a declined card.</p></div>
        <div data-p="transfer" class="paybox" hidden><dl class="summary bank"><dt>Bank</dt><dd>Providus Bank</dd><dt>Account number</dt><dd><b>9901 0023 45</b></dd><dt>Account name</dt><dd>Fashion Teller Escrow</dd><dt>Amount</dt><dd>${FT.money(amount)}</dd></dl></div>
        <div data-p="paystack" class="paybox" hidden><p class="body small">You will pay with Paystack by card, bank, USSD or transfer, then come straight back here.</p></div>
        ${note ? `<p class="muted small" style="margin-top:12px">${note}</p>` : ''}<p class="err" role="alert"></p><button class="btn cta" type="button" data-pay><span>Pay ${FT.money(amount)}</span></button>`, { onClose: () => { if (!done) resolve(null); } });
      const num = $('#ck-num', s), exp = $('#ck-exp', s);
      num.addEventListener('input', () => { num.value = num.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '); });
      exp.addEventListener('input', () => { let v = exp.value.replace(/\D/g, '').slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + '/' + v.slice(2); exp.value = v; });
      const setM = m => { method = m; $$('[data-m]', s).forEach(b => b.setAttribute('aria-selected', b.dataset.m === m)); $$('[data-p]', s).forEach(p => (p.hidden = p.dataset.p !== m)); $('[data-pay] span', s).textContent = `${m === 'transfer' ? 'I have sent' : 'Pay'} ${FT.money(amount)}`; };
      $$('[data-m]', s).forEach(b => b.addEventListener('click', () => setM(b.dataset.m))); setM(method);
      $('[data-pay]', s).addEventListener('click', async () => {
        const btn = $('[data-pay]', s), err = $('.err', s); btn.disabled = true; btn.insertAdjacentHTML('afterbegin', '<span class="spin"></span>'); err.textContent = '';
        try {
          let out;
          if (method === 'paystack') out = await App.paystack({ amount, target: paystackTarget, verify: reference => pay({ method: 'paystack', reference }) });
          else out = await pay(method === 'card' ? { method, card: { number: num.value, expiry: exp.value, cvv: $('#ck-cvv', s).value } } : { method });
          done = true; App.closeSheet(); resolve(out);
        } catch (x) { err.textContent = x.message || 'The payment did not go through.'; btn.disabled = false; $('.spin', btn)?.remove(); }
      });
    });
    /** Paystack inline. The backend creates the reference and verifies it afterwards. */
    App.paystack = ({ amount, target, kind, verify }) => new Promise(async (resolve, reject) => {
      try {
        if (!window.PaystackPop) await new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://js.paystack.co/v2/inline.js'; sc.onload = ok; sc.onerror = () => no(new Error('Paystack could not load. Check your connection.')); document.head.appendChild(sc); });
        const init = await A.initPayment(target, kind);
        new window.PaystackPop().newTransaction({ key: C.payments.paystackPublicKey, email: A.me().email, amount: Math.round((init.amount || amount) * 100), currency: 'NGN', reference: init.reference, onSuccess: async t => { try { resolve(await verify(t.reference)); } catch (e) { reject(e); } }, onCancel: () => reject(new Error('Payment cancelled.')) });
      } catch (e) { reject(e); }
    });
    App.report = (kind, id) => App.ask('Report this', 'Tell us what is wrong. A person at Fashion Teller reviews every report.', [{ name: 'reason', label: 'Reason', type: 'select', options: kind === 'design' ? ['Copied from someone else', 'Offensive or inappropriate', 'Spam or advertising', 'Something else'] : ['Abusive or harassing', 'Spam or scam', 'Pretending to be someone else', 'Something else'] }, { name: 'note', label: 'Details', type: 'textarea', optional: true, max: 500 }], { ok: 'Send report', submit: d => A.reportContent({ kind, id, ...d }) }).then(r => { if (r) FT.toast('Thank you. We will look at it.'); });
    App.review = (kind, id, name) => App.ask(`Review ${name}`, 'Your review is public and helps other customers choose.', [{ name: 'rating', label: 'Your rating', type: 'stars', value: 5 }, { name: 'text', label: 'What was it like?', type: 'textarea', optional: true, max: 600, placeholder: 'Fit, finishing, communication, timing…' }], { ok: 'Post review', submit: d => A.addReview({ kind, id, rating: Number(d.rating), text: d.text }) });

    /* ═════════ account menu, notifications and message count in the nav ═════════ */
    const Acc = (window.FTAccount = {});
    /** Signed in? If not, open the sign-in sheet. Resolves with the user or null. */
    Acc.ensure = async (o = {}) => A.me() || Acc.open({ mode: 'up', ...o });
    function renderNav() {
      const u = A.me();
      document.body.classList.toggle('signed-in', !!u);
      $$('[data-auth]').forEach(el => { el.hidden = el.dataset.auth === 'in' ? !u : !!u; });
      $$('[data-role]').forEach(el => { if (!u) return; const r = el.dataset.role; el.hidden = !(r === 'designer' ? u.designer : r === 'member' ? u.role !== 'admin' : u.role === r); });
      if (u) {
        $$('.ini').forEach(i => (i.textContent = (u.name || u.email || '?')[0].toUpperCase()));
        $$('.acct-name').forEach(n => (n.textContent = u.name)); $$('.acct-email').forEach(n => (n.textContent = u.email)); $$('.acct-role').forEach(n => (n.textContent = u.role === 'admin' ? 'Admin' : u.role === 'tailor' ? 'Tailor account' : u.designer ? 'Designer · @' + u.handle : 'Customer'));
        $$('.menu-who').forEach(n => (n.textContent = `Signed in as ${u.name}`));
        $$('[data-me-href]').forEach(a => (a.href = u.role === 'tailor' ? '/workshop' : u.role === 'admin' ? '/admin' : '/designs'));
      }
      const page = document.body.dataset.page; $$('.tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tb === page || (a.dataset.tb === 'me' && ['designs', 'workshop', 'admin', 'account', 'orders', 'commissions'].includes(page))));
    }
    const menuBtn = $('#acctBtn'), menu = $('#acctMenu'), bellBtn = $('#bellBtn'), bellPop = $('#bellPop');
    const closePops = () => { if (menu && !menu.hidden) { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); } if (bellPop && !bellPop.hidden) { bellPop.hidden = true; bellBtn.setAttribute('aria-expanded', 'false'); } };
    menuBtn?.addEventListener('click', e => { e.stopPropagation(); const open = menu.hidden; closePops(); menu.hidden = !open; menuBtn.setAttribute('aria-expanded', open); });
    document.addEventListener('click', e => { if (!e.target.closest('.acct') && !e.target.closest('.bell')) closePops(); });
    document.addEventListener('click', async e => { if (!e.target.closest('[data-signout]')) return; await A.logout(); FT.toast('Signed out'); document.dispatchEvent(new CustomEvent('ft:auth', { detail: { user: null } })); const pg = document.body.dataset.page; if (!['home', 'studio', 'signin', 'discover', 'designers', 'designer', 'design', 'how', 'tailors', 'about'].includes(pg)) FT.go('/'); else if (pg === 'signin') location.reload(); else renderNav(); });

    const NKIND = { quote: 'tape', order: 'order', commission: 'spark', message: 'chat', like: 'heart', remix: 'remix', follow: 'people', review: 'spark', publish: 'design', payment: 'order', workshop: 'tape', request: 'inbox', moderation: 'flag' };
    async function renderBell() {
      let list = []; try { list = await A.listNotifications(); } catch { list = []; }
      bellPop.innerHTML = `<div class="pop-h"><b>Notifications</b>${list.some(n => !n.read) ? '<button type="button" data-readall>Mark all read</button>' : ''}</div>${list.length ? `<ol class="nlist">${list.slice(0, 20).map(n => `<li><a href="${esc(App.path(n.href))}" data-n="${esc(n.id)}" class="${n.read ? '' : 'new'}"><span class="n-ic">${App.ICON[NKIND[n.kind]] || App.ICON.bell}</span><span><b>${esc(n.title)}</b>${n.body ? `<small>${esc(n.body)}</small>` : ''}<i>${App.ago(n.at)}</i></span></a></li>`).join('')}</ol>` : '<p class="pop-e">Nothing yet. Quotes, order updates, messages and likes show up here.</p>'}`;
    }
    bellBtn?.addEventListener('click', async e => { e.stopPropagation(); const open = bellPop.hidden; closePops(); if (!open) return; bellPop.hidden = false; bellBtn.setAttribute('aria-expanded', 'true'); bellPop.innerHTML = '<div class="loading sm"><span class="spin"></span></div>'; await renderBell(); });
    bellPop?.addEventListener('click', async e => {
      if (e.target.closest('[data-readall]')) { e.preventDefault(); try { await A.markNotifications('all'); } catch {} await renderBell(); return refreshCounts(); }
      const a = e.target.closest('[data-n]'); if (!a) return; e.preventDefault(); try { await A.markNotifications([a.dataset.n]); } catch {} const href = a.getAttribute('href'); closePops(); if (href && href !== '#') FT.go(href);
    });
    let countT = null, lastCounts = { notifications: 0, messages: 0 };
    async function refreshCounts() {
      if (!A.me()) { $$('[data-count]').forEach(el => { el.textContent = ''; el.hidden = true; }); return; }
      try { const c = await A.unread(); const fresh = c.notifications > lastCounts.notifications || c.messages > lastCounts.messages; lastCounts = c; $$('[data-count]').forEach(el => { const n = c[el.dataset.count] || 0; el.textContent = n > 9 ? '9+' : n || ''; el.hidden = !n; const host = el.closest('[aria-label]'); if (host) { host.dataset.label = host.dataset.label || host.getAttribute('aria-label'); host.setAttribute('aria-label', n ? `${host.dataset.label}, ${el.textContent} unread` : host.dataset.label); } }); if (fresh) document.dispatchEvent(new CustomEvent('ft:inbox', { detail: c })); } catch {}
    }
    App.refreshCounts = refreshCounts;
    const queueCounts = () => { clearTimeout(countT); countT = setTimeout(refreshCounts, 200); };
    setInterval(() => { if (!document.hidden) refreshCounts(); }, A.pollMs * 2);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) queueCounts(); });

    async function renderStreak() {
      const el = $('#navStreak'), u = A.me(); if (!el) return;
      if (!u || u.role !== 'customer') { el.hidden = true; return; }
      try { const g = await A.game(); el.hidden = false; $('b', el).textContent = g.streak; el.classList.toggle('lit', g.doneToday); el.classList.toggle('risk', g.atRisk && !g.doneToday); el.title = g.doneToday ? `${g.streak}-day streak. Kept for today.` : g.atRisk ? `${g.streak}-day streak. Save a design today to keep it.` : 'Save a design today to start a streak'; el.setAttribute('aria-label', el.title); } catch { el.hidden = true; }
    }
    App.renderStreak = renderStreak;
    renderNav(); renderStreak(); refreshCounts();
    A.onChange(() => { renderNav(); queueCounts(); });
    document.addEventListener('ft:game', renderStreak);
    document.addEventListener('ft:auth', () => { renderNav(); renderStreak(); lastCounts = { notifications: 0, messages: 0 }; refreshCounts(); });
    addEventListener('ft:storage-full', () => FT.toast('This browser’s storage is full. Older activity was trimmed to make room.'));

    /* ───── likes, saves, follows, messages: the same everywhere ───── */
    document.addEventListener('click', async e => {
      const like = e.target.closest('[data-like]'), sv = e.target.closest('[data-save]'), fol = e.target.closest('[data-follow]'), msg = e.target.closest('[data-msg]'), rep = e.target.closest('[data-report]');
      if (!like && !sv && !fol && !msg && !rep) return;
      e.preventDefault();
      const btn = like || sv || fol || msg || rep; if (btn.dataset.busy) return;
      if (!(await Acc.ensure({ title: 'Join Fashion Teller', message: 'Create a free account to like and save designs, follow designers and message them.' }))) return;
      btn.dataset.busy = '1';
      try {
        if (like) { const on = like.getAttribute('aria-pressed') !== 'true'; like.setAttribute('aria-pressed', on); if (on) { like.classList.remove('pop'); void like.offsetWidth; like.classList.add('pop'); } const r = await A.like(like.dataset.like, on); $$(`[data-like="${CSS.escape(like.dataset.like)}"]`).forEach(b => { b.setAttribute('aria-pressed', r.liked); const n = $('b', b); if (n) n.textContent = App.count(r.likes); b.setAttribute('aria-label', App.likeLabel(b.dataset.name, r.likes)); }); }
        else if (sv) { const on = sv.getAttribute('aria-pressed') !== 'true'; const r = await A.saveForLater(sv.dataset.save, on); sv.setAttribute('aria-pressed', r.saved); const t = $('span', sv); if (t) t.textContent = r.saved ? 'Saved' : 'Save'; FT.toast(r.saved ? 'Saved. Find it under Discover → Saved.' : 'Removed from saved'); }
        else if (fol) { const on = fol.getAttribute('aria-pressed') !== 'true'; const r = await A.follow(fol.dataset.follow, on); $$(`[data-follow="${CSS.escape(fol.dataset.follow)}"]`).forEach(b => { b.setAttribute('aria-pressed', r.following); b.textContent = r.following ? 'Following' : 'Follow'; }); document.dispatchEvent(new CustomEvent('ft:follow', { detail: { id: fol.dataset.follow, ...r } })); }
        else if (msg) { const th = await A.openThread(msg.dataset.msg.startsWith('order:') ? { orderId: msg.dataset.msg.slice(6) } : msg.dataset.msg.startsWith('commission:') ? { commissionId: msg.dataset.msg.slice(11) } : { userId: msg.dataset.msg }); FT.go('/messages?t=' + encodeURIComponent(th.id)); }
        else if (rep) { const [kind, id] = rep.dataset.report.split(':'); await App.report(kind, id); }
      } catch (x) { FT.toast(x.message || 'That did not go through.'); if (like) like.setAttribute('aria-pressed', like.getAttribute('aria-pressed') !== 'true'); }
      finally { delete btn.dataset.busy; }
    });

    /* ═════════ sign-in sheet ═════════ */
    const COUNTRIES = ['Nigeria', 'Gabon', 'Ghana', 'Senegal', "Côte d'Ivoire", 'Cameroon', 'Kenya', 'South Africa', 'Brazil', 'Mexico', 'Colombia', 'United Kingdom', 'United States', 'Other'];
    App.COUNTRIES = COUNTRIES;
    Acc.formHtml = ({ mode = 'in', role = 'customer', standalone = false } = {}) => `
      <div class="tabs auth-tabs" role="tablist"><button type="button" role="tab" data-mode="in" aria-selected="${mode === 'in'}">Sign in</button><button type="button" role="tab" data-mode="up" aria-selected="${mode === 'up'}">Create account</button></div>
      <form class="form two auth-form" data-mode="${mode}" novalidate>
        <div class="field full" data-up><span class="lbl">I am here to</span><div class="seg sm" data-rolepick><button type="button" data-v="customer" aria-pressed="${role !== 'tailor'}">Design and wear</button><button type="button" data-v="tailor" aria-pressed="${role === 'tailor'}">Make clothes (tailor)</button></div></div>
        <div class="field full" data-up><label for="au-name">Full name</label><input id="au-name" name="name" autocomplete="name" maxlength="80"></div>
        <div class="field full"><label for="au-email">Email</label><input id="au-email" name="email" type="email" autocomplete="${mode === 'in' ? 'username' : 'email'}" inputmode="email" placeholder="you@example.com" maxlength="120"></div>
        <div class="field full"><label for="au-pass">Password</label><input id="au-pass" name="password" type="password" autocomplete="current-password" minlength="8" maxlength="128"><small class="tip" data-up>At least 8 characters.</small><button class="linkbtn auth-forgot" type="button" data-forgot>Forgot your password?</button></div>
        <div class="field" data-up><label for="au-city">City</label><input id="au-city" name="city" autocomplete="address-level2" maxlength="60"></div>
        <div class="field" data-up><label for="au-country">Country</label><select id="au-country" name="country">${COUNTRIES.map(c => `<option${c === 'Nigeria' ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
        <p class="err full" role="alert"></p>
        <div class="full row-btns"><button class="btn gold" type="submit" data-submit>Sign in</button>${standalone ? '' : '<button class="btn ghost" type="button" data-cancel>Not now</button>'}</div>
        ${C.demoAccounts ? `<div class="full demo-accts"><span>Try a demo account</span><div class="chips"><button class="chip" type="button" data-demo="customer">Customer</button><button class="chip" type="button" data-demo="designer">Designer</button><button class="chip" type="button" data-demo="tailor">Tailor</button><button class="chip" type="button" data-demo="admin">Admin</button></div></div>` : ''}
        ${A.local ? '<p class="full muted" style="font-size:13px;margin:0">Accounts are kept in this browser until the backend is connected. Your password is hashed before it is saved.</p>' : ''}
      </form>`;
    const DEMO = A.DEMO || { customer: { email: 'customer@demo.fashionteller', password: 'fashion2026' }, designer: { email: 'designer@demo.fashionteller', password: 'fashion2026' }, tailor: { email: 'tailor@demo.fashionteller', password: 'fashion2026' }, admin: { email: 'admin@demo.fashionteller', password: 'fashion2026' } };
    Acc.bindForm = (root, { onDone, mode = 'in', role = 'customer' }) => {
      const form = $('.auth-form', root); let m = mode, r = role;
      const setMode = x => { m = x; form.dataset.mode = x; $$('.auth-tabs [data-mode]', root).forEach(b => b.setAttribute('aria-selected', b.dataset.mode === x)); $('[data-submit]', form).textContent = x === 'in' ? 'Sign in' : r === 'tailor' ? 'Create tailor account' : 'Create account'; $('#au-pass', form).autocomplete = x === 'in' ? 'current-password' : 'new-password'; $('.err', form).textContent = ''; };
      $$('[data-mode]', root).forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
      const rp = $('[data-rolepick]', form); if (rp) FT.seg(rp, v => { r = v; setMode(m); });
      setMode(m);
      form.addEventListener('click', e => { if (e.target.closest('[data-forgot]')) { location.href = '/signin?forgot=' + encodeURIComponent($('#au-email', form).value.trim()); return; } const d = e.target.closest('[data-demo]'); if (!d) return; const acct = DEMO[d.dataset.demo]; $('#au-email', form).value = acct.email; $('#au-pass', form).value = acct.password; setMode('in'); form.requestSubmit(); });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form)), err = $('.err', form), btn = $('[data-submit]', form);
        if (!data.email?.trim() || !data.password) { err.textContent = 'Enter your email and password.'; return; }
        if (m === 'up' && !data.name?.trim()) { err.textContent = 'Enter your name.'; return; }
        btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + (m === 'in' ? 'Signing in' : 'Creating account'); err.textContent = '';
        try {
          const u = m === 'in' ? await A.login(data.email, data.password) : await A.register({ ...data, role: r });
          document.dispatchEvent(new CustomEvent('ft:auth', { detail: { user: u } }));
          FT.toast(m === 'in' ? `Welcome back, ${u.name.split(' ')[0]}` : `Welcome, ${u.name.split(' ')[0]}`);
          onDone?.(u);
        } catch (x) { err.textContent = x.message || 'That did not go through.'; }
        finally { btn.disabled = false; setMode(m); }
      });
      return { setMode };
    };
    let authEl = null, after = null;
    Acc.open = ({ mode = 'in', role = 'customer', title, message } = {}) => new Promise(resolve => {
      Acc.close(); after = resolve;
      const bg = document.createElement('div'); bg.className = 'sheet-bg'; const s = document.createElement('div'); s.className = 'sheet auth-sheet'; s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true'); s.setAttribute('aria-labelledby', 'authH');
      s.innerHTML = `<h3 id="authH">${esc(title || 'Enter your workspace')}</h3><p>${esc(message || 'Sign in to save designs, add your measurements and have them made.')}</p>${Acc.formHtml({ mode, role })}`;
      document.body.append(bg, s); authEl = { bg, s };
      requestAnimationFrame(() => { bg.classList.add('on'); s.classList.add('on'); setTimeout(() => $(mode === 'up' ? '#au-name' : '#au-email', s)?.focus(), 350); });
      bg.addEventListener('click', () => Acc.close()); $('[data-cancel]', s)?.addEventListener('click', () => Acc.close());
      Acc.bindForm(s, { mode, role, onDone: u => { Acc.close(u); } });
    });
    Acc.close = (u = null) => { if (!authEl) return; const { bg, s } = authEl; authEl = null; bg.classList.remove('on'); s.classList.remove('on'); setTimeout(() => { bg.remove(); s.remove(); }, 700); const fn = after; after = null; fn?.(u); };
    /** Page guard: resolves with the user, or shows a gate card inside `root` and resolves null. */
    Acc.require = async (root, { role = null, title, message } = {}) => {
      let u = A.me();
      if (u && !A.local) u = (await A.refreshMe()) || null;
      const ok = x => x && (!role || x.role === role || x.role === 'admin');
      if (ok(u)) return u;
      if (u && !ok(u)) { root.innerHTML = App.empty(App.ICON.lock, 'This area is for ' + (role === 'tailor' ? 'tailor accounts' : role === 'admin' ? 'Fashion Teller staff' : 'customers'), `You are signed in as ${esc(u.name)} (${esc(u.role)}). Switch accounts to continue.`, `<div class="row-btns"><button class="btn ghost" type="button" data-out>Sign out</button><a class="btn ink" href="/">Home</a></div>`); $('[data-out]', root).addEventListener('click', async () => { await A.logout(); location.reload(); }); return null; }
      const gate = () => { root.innerHTML = App.empty(App.ICON.lock, title || 'Sign in to continue', message || 'This page is part of your workspace.', `<div class="row-btns"><button class="btn gold" type="button" data-open>Sign in</button><a class="btn ghost" href="/signin?mode=up${role === 'tailor' ? '&role=tailor' : ''}">Create account</a></div>`); $('[data-open]', root).addEventListener('click', run); };
      const run = async () => { u = await Acc.open({ role: role || 'customer', title, message }); if (ok(u)) location.reload(); else gate(); };
      gate(); u = await Acc.open({ role: role || 'customer', title, message }); if (ok(u)) { location.reload(); return null; } gate(); return null;
    };
  });
})();
