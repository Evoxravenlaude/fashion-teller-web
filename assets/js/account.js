/**
 * Accounts on every page: the sign-in / create-account sheet, the account menu in the nav,
 * route guards for signed-in pages, and small helpers shared by the product pages (FTApp).
 */
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const { $, $$ } = FT, A = window.FTApi, C = window.FT_CONFIG || {};
    FT.money = A.money;

    /* ═════════ shared helpers ═════════ */
    const App = (window.FTApp = {});
    App.esc = FT.esc;
    App.date = (t, { time = false } = {}) => { if (!t) return ''; const d = new Date(t); return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) + (time ? ', ' + d.toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit' }) : ''); };
    App.ago = t => { const s = (Date.now() - new Date(t).getTime()) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; if (s < 7 * 86400) return Math.floor(s / 86400) + ' d ago'; return App.date(t); };
    App.PHASES = [
      ['concept_generated', 'AI concept generated', 'Your description became a design.'],
      ['vendor_assigned', 'Vendor assigned', 'The tailor has your approved version, measurements and payment.'],
      ['tailoring', 'Fabric sourcing & tailoring', 'Fabric sourced; cutting, sewing and embroidery in progress.'],
      ['delivered', 'Doorstep quality delivery', 'Quality checked and delivered to your door.'],
    ];
    App.phaseLabel = p => (App.PHASES.find(x => x[0] === p) || [])[1] || p;
    App.STATUS = { awaiting_payment: ['Awaiting payment', 'warn'], active: ['In production', 'gold'], balance_due: ['Balance due', 'warn'], delivered: ['Delivered', 'ok'], cancelled: ['Cancelled', 'mute'], draft: ['Draft', 'mute'], requested: ['Quotes requested', 'gold'], ordered: ['In production', 'ok'], offered: ['Offered', 'gold'], accepted: ['Accepted', 'ok'], declined: ['Not chosen', 'mute'], withdrawn: ['Withdrawn', 'mute'], pending: ['Pending verification', 'warn'], verified: ['Verified', 'ok'], rejected: ['Rejected', 'bad'], suspended: ['Suspended', 'bad'], open: ['Open', 'gold'], closed: ['Closed', 'mute'], paid: ['Paid', 'ok'], refunded: ['Refunded', 'mute'], failed: ['Failed', 'bad'], new: ['New', 'gold'], approved: ['Approved', 'ok'] };
    App.badge = s => { const [l, k] = App.STATUS[s] || [s, 'mute']; return `<span class="badge ${k}">${FT.esc(l)}</span>`; };
    App.avatar = (v, size = 40) => `<span class="vav" style="--h:${v?.hue ?? 40};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.4)}px" aria-hidden="true">${FT.esc((v?.name || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase())}</span>`;
    App.thumb = (design, cls = 'thumb') => { const v = design.versions.find(x => x.n === design.current) || design.versions[design.versions.length - 1]; return `<div class="${cls}">${FTEngine.render(v.spec, { id: 't' + design.id + v.n })}</div>`; };
    App.version = (d, n) => d.versions.find(v => v.n === (n ?? d.current)) || d.versions[d.versions.length - 1];
    App.units = (m) => m.unit === 'in' ? 'in' : 'cm';
    App.MEASURE_FIELDS = [
      ['height', 'Height', 'Standing straight, without shoes.'], ['neck', 'Neck', 'Around the base of the neck.'], ['shoulder', 'Shoulder', 'Across the back, shoulder point to shoulder point.'], ['chest', 'Chest / bust', 'Around the fullest part, tape level.'], ['waist', 'Waist', 'Around the natural waist, just above the navel.'], ['hips', 'Hips', 'Around the fullest part of the hips.'], ['sleeve', 'Sleeve', 'Shoulder point to the wrist bone, arm slightly bent.'], ['length', 'Garment length', 'From the shoulder to where you want the hem.'], ['inseam', 'Inseam', 'Crotch to the ankle bone (trousers).'], ['thigh', 'Thigh', 'Around the fullest part of the thigh.'],
    ];
    App.PRESETS = { S: { height: 165, neck: 36, shoulder: 42, chest: 88, waist: 74, hips: 92, sleeve: 58, length: 135, inseam: 76, thigh: 52 }, M: { height: 172, neck: 39, shoulder: 45, chest: 96, waist: 82, hips: 98, sleeve: 61, length: 140, inseam: 79, thigh: 57 }, L: { height: 178, neck: 41, shoulder: 48, chest: 104, waist: 90, hips: 104, sleeve: 64, length: 145, inseam: 82, thigh: 62 }, XL: { height: 182, neck: 43, shoulder: 50, chest: 112, waist: 100, hips: 112, sleeve: 66, length: 148, inseam: 84, thigh: 67 } };
    App.measureSummary = m => { const u = App.units(m); return ['chest', 'waist', 'hips'].filter(k => m.values[k]).map(k => `${k === 'chest' ? 'Chest' : k === 'waist' ? 'Waist' : 'Hips'} ${m.values[k]}${u}`).join(' · '); };

    /* Measurement form (studio step 3 and the account page share it). */
    App.measureForm = (root, { existing = null, onSave, onCancel, compact = false }) => {
      const m = existing || { label: '', unit: 'cm', values: {}, fit: 'regular', notes: '' };
      root.innerHTML = `<form class="form mform" novalidate>
        <div class="field"><label for="mf-label">Profile name</label><input id="mf-label" name="label" placeholder="Me, Dad, Chidi…" value="${FT.esc(m.label || '')}"><span class="msg"></span></div>
        <div class="field"><span class="lbl">Units</span><div class="seg sm" data-unit><button type="button" data-v="cm" aria-pressed="${m.unit !== 'in'}">cm</button><button type="button" data-v="in" aria-pressed="${m.unit === 'in'}">inches</button></div></div>
        <div class="field full"><span class="lbl">Start from a size <small class="muted">(then adjust)</small></span><div class="chips">${Object.keys(App.PRESETS).map(k => `<button class="chip" type="button" data-preset="${k}">${k}</button>`).join('')}</div></div>
        <div class="mgrid full">${App.MEASURE_FIELDS.map(([k, l, tip]) => `<div class="field"><label for="mf-${k}">${l}${k === 'chest' || k === 'waist' ? ' <i class="reqmark">required</i>' : ''}</label><div class="unitin"><input id="mf-${k}" name="${k}" inputmode="decimal" type="number" step="0.5" min="0" value="${m.values[k] ?? ''}"><span class="u">${m.unit === 'in' ? 'in' : 'cm'}</span></div><small class="tip">${tip}</small></div>`).join('')}</div>
        <div class="field"><span class="lbl">How you like it to fit</span><div class="seg sm" data-fit><button type="button" data-v="fitted" aria-pressed="${m.fit === 'fitted'}">Fitted</button><button type="button" data-v="regular" aria-pressed="${!m.fit || m.fit === 'regular'}">Regular</button><button type="button" data-v="relaxed" aria-pressed="${m.fit === 'relaxed'}">Relaxed</button></div></div>
        <div class="field"><label for="mf-notes">Notes for the tailor</label><input id="mf-notes" name="notes" placeholder="Left arm slightly longer, prefers no shoulder pads…" value="${FT.esc(m.notes || '')}"></div>
        <p class="err full" role="alert"></p>
        <div class="foot-row"><p>${compact ? 'Saved to your account; reuse it on every order.' : 'A tailor needs chest and waist at minimum. The rest makes the fit better.'}</p><div class="row-btns"><button class="btn ghost" type="button" data-cancel>${onCancel ? 'Cancel' : 'Clear'}</button><button class="btn ink" type="submit">Save profile</button></div></div>
      </form>`;
      const form = $('form', root); let unit = m.unit === 'in' ? 'in' : 'cm', fit = m.fit || 'regular';
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

    /* Vendor profile sheet */
    App.vendorSheet = v => {
      const el = App.sheet(`<div class="vprof">${App.avatar(v, 56)}<div><h3>${FT.esc(v.name)}${v.verified ? FT.STAR : ''}</h3><p class="muted">${FT.esc([v.city, v.country].filter(Boolean).join(', '))}${v.since ? ` · since ${v.since}` : ''}</p></div></div>
        <div class="vstats"><div><b>${v.rating ? v.rating.toFixed(1) + ' ★' : 'New'}</b><span>${v.reviews || 0} reviews</span></div><div><b>${v.ordersDone || 0}</b><span>orders made</span></div><div><b>${v.verified ? 'Verified' : 'Pending'}</b><span>${v.verifiedAt ? App.date(v.verifiedAt) : 'verification'}</span></div></div>
        <p class="body" style="max-width:none">${FT.esc(v.bio || '')}</p>
        <div class="chips">${(v.specialties || []).map(s => `<span class="tag">${FT.esc(s)}</span>`).join('')}</div>
        <p class="muted" style="font-size:14px;margin-top:4px">Verified tailors have had their workshop, identity and sample work checked by Fashion Teller. Payments are held until your order is delivered.</p>`);
      return el;
    };
    /* Generic modal sheet */
    let sheetEl = null;
    App.sheet = (html, { onClose } = {}) => {
      App.closeSheet();
      const bg = document.createElement('div'); bg.className = 'sheet-bg'; const s = document.createElement('div'); s.className = 'sheet app-sheet'; s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true');
      s.innerHTML = `<button class="sheet-x" type="button" aria-label="Close"><svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><div class="sheet-body">${html}</div>`;
      document.body.append(bg, s); sheetEl = { bg, s, onClose };
      requestAnimationFrame(() => { bg.classList.add('on'); s.classList.add('on'); });
      bg.addEventListener('click', App.closeSheet); $('.sheet-x', s).addEventListener('click', App.closeSheet);
      return s;
    };
    App.closeSheet = () => { if (!sheetEl) return; const { bg, s, onClose } = sheetEl; sheetEl = null; bg.classList.remove('on'); s.classList.remove('on'); setTimeout(() => { bg.remove(); s.remove(); }, 700); onClose?.(); };
    addEventListener('keydown', e => { if (e.key === 'Escape') { App.closeSheet(); Acc.close(); } });
    App.confirm = (title, body, { ok = 'Confirm', danger = false } = {}) => new Promise(res => {
      const s = App.sheet(`<h3>${FT.esc(title)}</h3><p class="muted">${body}</p><div class="row-btns" style="margin-top:18px"><button class="btn ghost" type="button" data-no>Keep</button><button class="btn ${danger ? 'danger' : 'ink'}" type="button" data-yes>${FT.esc(ok)}</button></div>`, { onClose: () => res(false) });
      $('[data-yes]', s).addEventListener('click', () => { sheetEl.onClose = null; App.closeSheet(); res(true); });
      $('[data-no]', s).addEventListener('click', App.closeSheet);
    });
    App.tabs = (root, onChange, { hash = true, initial: init = null } = {}) => {
      const btns = $$('[data-tab]', root);
      const show = (id, fire = true) => { btns.forEach(b => { const on = b.dataset.tab === id; b.setAttribute('aria-selected', on); b.classList.toggle('on', on); }); $$('[data-panel]').forEach(p => (p.hidden = p.dataset.panel !== id)); if (fire) onChange?.(id); if (hash) { try { history.replaceState(null, '', '#' + id); } catch {} } };
      btns.forEach(b => b.addEventListener('click', () => show(b.dataset.tab)));
      const initial = init || (hash ? location.hash.slice(1) : ''); show(btns.some(b => b.dataset.tab === initial) ? initial : btns[0].dataset.tab, !init);
      return { show };
    };
    App.empty = (icon, title, body, action) => `<div class="empty"><div class="ic">${icon}</div><h3>${title}</h3><p>${body}</p>${action || ''}</div>`;
    App.ICON = { design: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20l4-1 11-11-3-3L5 16l-1 4zM13 6l3 3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>', order: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4H6zM3 6h18M16 10a4 4 0 0 1-8 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>', tape: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 9h18v6H3zM7 9v3M11 9v2M15 9v3M19 9v2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>', lock: '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="1.6"/></svg>', inbox: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 13l2-8h14l2 8v6H3z M3 13h5l2 3h4l2-3h5" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>' };

    /* ═════════ account menu in the nav ═════════ */
    const Acc = (window.FTAccount = {});
    function renderNav() {
      const u = A.me();
      $$('[data-auth]').forEach(el => { el.hidden = el.dataset.auth === 'in' ? !u : !!u; });
      $$('[data-role]').forEach(el => { if (!u) return; const r = el.dataset.role; el.hidden = !(u.role === r || (u.role === 'admin' && r === 'customer')); });
      if (u) {
        $$('.ini').forEach(i => (i.textContent = (u.name || u.email)[0].toUpperCase()));
        $$('.acct-name').forEach(n => (n.textContent = u.name)); $$('.acct-email').forEach(n => (n.textContent = u.email)); $$('.acct-role').forEach(n => (n.textContent = u.role === 'admin' ? 'Admin' : u.role === 'tailor' ? 'Tailor account' : 'Customer'));
        $$('.menu-who').forEach(n => (n.textContent = `Signed in as ${u.name}`));
      }
    }
    const menuBtn = $('#acctBtn'), menu = $('#acctMenu');
    menuBtn?.addEventListener('click', e => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; menuBtn.setAttribute('aria-expanded', open); });
    document.addEventListener('click', e => { if (menu && !menu.hidden && !e.target.closest('.acct')) { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('click', async e => { if (!e.target.closest('[data-signout]')) return; await A.logout(); FT.toast('Signed out'); document.dispatchEvent(new CustomEvent('ft:auth', { detail: { user: null } })); if (!['home', 'studio', 'signin'].includes(document.body.dataset.page)) FT.go('/'); else if (document.body.dataset.page === 'signin') location.reload(); else renderNav(); });
    renderNav();
    A.onChange(() => renderNav());
    document.addEventListener('ft:auth', renderNav);
    if (!A.local) A.refreshMe().then(renderNav);

    /* ═════════ sign-in sheet ═════════ */
    const COUNTRIES = ['Nigeria', 'Gabon', 'Ghana', 'Senegal', "Côte d'Ivoire", 'Cameroon', 'Kenya', 'South Africa', 'Brazil', 'Mexico', 'Colombia', 'United Kingdom', 'United States', 'Other'];
    Acc.formHtml = ({ mode = 'in', role = 'customer', standalone = false } = {}) => `
      <div class="tabs auth-tabs" role="tablist"><button type="button" role="tab" data-mode="in" aria-selected="${mode === 'in'}">Sign in</button><button type="button" role="tab" data-mode="up" aria-selected="${mode === 'up'}">Create account</button></div>
      <form class="form two auth-form" data-mode="${mode}" novalidate>
        <div class="field full" data-up><span class="lbl">I am here to</span><div class="seg sm" data-rolepick><button type="button" data-v="customer" aria-pressed="${role !== 'tailor'}">Have clothes made</button><button type="button" data-v="tailor" aria-pressed="${role === 'tailor'}">Make clothes (tailor)</button></div></div>
        <div class="field full" data-up><label for="au-name">Full name</label><input id="au-name" name="name" autocomplete="name"></div>
        <div class="field full"><label for="au-email">Email</label><input id="au-email" name="email" type="email" autocomplete="${mode === 'in' ? 'username' : 'email'}" inputmode="email" placeholder="you@example.com"></div>
        <div class="field full"><label for="au-pass">Password</label><input id="au-pass" name="password" type="password" autocomplete="current-password" minlength="8"><small class="tip" data-up>At least 8 characters.</small></div>
        <div class="field" data-up><label for="au-city">City</label><input id="au-city" name="city" autocomplete="address-level2"></div>
        <div class="field" data-up><label for="au-country">Country</label><select id="au-country" name="country">${COUNTRIES.map(c => `<option${c === 'Nigeria' ? ' selected' : ''}>${c}</option>`).join('')}</select></div>
        <p class="err full" role="alert"></p>
        <div class="full row-btns"><button class="btn gold" type="submit" data-submit>Sign in</button>${standalone ? '' : '<button class="btn ghost" type="button" data-cancel>Not now</button>'}</div>
        ${C.demoAccounts && A.local ? `<div class="full demo-accts"><span>Try a demo account</span><div class="chips"><button class="chip" type="button" data-demo="customer">Customer</button><button class="chip" type="button" data-demo="tailor">Tailor</button><button class="chip" type="button" data-demo="admin">Admin</button></div></div>` : ''}
        ${A.local ? '<p class="full muted" style="font-size:13px;margin:0">Accounts are stored in this browser until the backend is connected. Your password is hashed before it is saved.</p>' : ''}
      </form>`;
    Acc.bindForm = (root, { onDone, mode = 'in', role = 'customer' }) => {
      const form = $('.auth-form', root); let m = mode, r = role;
      const setMode = x => { m = x; form.dataset.mode = x; $$('[data-mode]', root).forEach(b => b.setAttribute('aria-selected', b.dataset.mode === x)); $('[data-submit]', form).textContent = x === 'in' ? 'Sign in' : r === 'tailor' ? 'Create tailor account' : 'Create account'; $('#au-pass', form).autocomplete = x === 'in' ? 'current-password' : 'new-password'; $('.err', form).textContent = ''; };
      $$('[data-mode]', root).forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
      const rp = $('[data-rolepick]', form); if (rp) FT.seg(rp, v => { r = v; setMode(m); });
      setMode(m);
      form.addEventListener('click', async e => {
        const d = e.target.closest('[data-demo]'); if (!d) return;
        const acct = A.DEMO[d.dataset.demo]; $('#au-email', form).value = acct.email; $('#au-pass', form).value = acct.password; setMode('in'); form.requestSubmit();
      });
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
      s.innerHTML = `<h3 id="authH">${FT.esc(title || 'Enter your workspace')}</h3><p>${FT.esc(message || 'Sign in to save designs, add your measurements and start production.')}</p>${Acc.formHtml({ mode, role })}`;
      document.body.append(bg, s); authEl = { bg, s };
      requestAnimationFrame(() => { bg.classList.add('on'); s.classList.add('on'); setTimeout(() => $('#au-email', s)?.focus(), 350); });
      bg.addEventListener('click', () => Acc.close()); $('[data-cancel]', s)?.addEventListener('click', () => Acc.close());
      Acc.bindForm(s, { mode, role, onDone: u => { Acc.close(u); } });
    });
    Acc.close = (u = null) => { if (!authEl) return; const { bg, s } = authEl; authEl = null; bg.classList.remove('on'); s.classList.remove('on'); setTimeout(() => { bg.remove(); s.remove(); }, 700); const fn = after; after = null; fn?.(u); };
    /** Page guard: resolves with the user, or shows a gate card inside `root` and resolves null. */
    Acc.require = async (root, { role = null, title, message } = {}) => {
      let u = A.me();
      const ok = x => x && (!role || x.role === role || x.role === 'admin');
      if (ok(u)) return u;
      if (u && !ok(u)) { root.innerHTML = App.empty(App.ICON.lock, 'This area is for ' + (role === 'tailor' ? 'tailor accounts' : role === 'admin' ? 'Fashion Teller staff' : 'customers'), `You are signed in as ${FT.esc(u.name)} (${u.role}). Switch accounts to continue.`, `<div class="row-btns"><button class="btn ghost" type="button" data-signout>Sign out</button><a class="btn ink" href="/">Home</a></div>`); $('[data-signout]', root).addEventListener('click', async () => { await A.logout(); location.reload(); }); return null; }
      const gate = () => { root.innerHTML = App.empty(App.ICON.lock, title || 'Sign in to continue', message || 'This page is part of your workspace.', `<div class="row-btns"><button class="btn gold" type="button" data-open>Sign in</button><a class="btn ghost" href="/signin?mode=up${role === 'tailor' ? '&role=tailor' : ''}">Create account</a></div>`); $('[data-open]', root).addEventListener('click', run); };
      const run = async () => { u = await Acc.open({ role: role || 'customer', title, message }); if (ok(u)) location.reload(); else gate(); };
      gate(); u = await Acc.open({ role: role || 'customer', title, message }); if (ok(u)) { location.reload(); return null; } gate(); return null;
    };
  });
})();
