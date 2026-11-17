/** Account: your details and emails, measurement profiles, designer profile, payouts, password. */
(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $, $$ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount, esc = FT.esc;
    const root = $('#aRoot');
    let u = await Acc.require(root, { title: 'Sign in to manage your account' }); if (!u) return;
    $('#aSub').textContent = `${u.email} · ${u.role === 'admin' ? 'Admin' : u.role === 'tailor' ? 'Tailor account' : u.designer ? 'Designer' : 'Customer'}`;
    if (u.role !== 'customer') { $('[data-tab="measurements"]').hidden = u.role === 'tailor'; $('[data-tab="designer"]').hidden = true; }
    const earner = u.role === 'tailor' || u.designer; $('[data-tab="payouts"]').hidden = !earner;
    App.tabs($('#aTabs'));

    /* confirm the email address */
    let mailOn = true;                                       // a backend with no email provider cannot send the link, so it does not ask for one
    function verifyBar() {
      $('#aVerify').innerHTML = u.emailVerified || !mailOn ? '' : `<div class="notice gold" role="status"><b>Confirm your email.</b> We sent a link to ${esc(u.email)}. ${earner ? 'You need it before you can be paid.' : 'It is how we reach you about orders.'} <button class="linkbtn" type="button" data-resend>Send it again</button>${A.local ? ' · <button class="linkbtn" type="button" data-mailbox>Open the demo mailbox</button>' : ''}</div>`;
    }
    verifyBar(); A.features().then(f => { if (f.mail === 'off') { mailOn = false; verifyBar(); } });
    $('#aVerify').addEventListener('click', async e => {
      if (e.target.closest('[data-mailbox]')) return App.mailbox();
      const b = e.target.closest('[data-resend]'); if (!b) return; b.disabled = true;
      try { await A.sendVerification(); FT.toast('Sent. Check your inbox.'); } catch (x) { FT.toast(x.message); } finally { b.disabled = false; }
    });
    A.onChange(() => { const now = A.me(); if (now && now.emailVerified !== u.emailVerified) { u = now; verifyBar(); } });

    /* which emails */
    $$('#prefs [data-pref]').forEach(c => { c.checked = (u.emailPrefs || {})[c.dataset.pref] !== false; });
    $('#prefs').addEventListener('change', async () => {
      const emailPrefs = Object.fromEntries($$('#prefs [data-pref]').map(c => [c.dataset.pref, c.checked]));
      try { u = await A.updateProfile({ emailPrefs }); FT.toast('Saved'); } catch (x) { FT.toast(x.message); }
    });

    /* profile */
    $('#p-country').innerHTML = [...new Set([...App.COUNTRIES, u.country].filter(Boolean))].map(c => `<option${c === (u.country || 'Nigeria') ? ' selected' : ''}>${esc(c)}</option>`).join('');
    $('#p-name').value = u.name; $('#p-email').value = u.email; $('#p-phone').value = u.phone || ''; $('#p-city').value = u.city || '';
    $('#p-role').textContent = u.role === 'tailor' ? 'Workshop details are edited in your Workshop page.' : 'Member since ' + App.date(u.createdAt);
    const pf = $('#profileForm');
    pf.addEventListener('submit', async e => {
      e.preventDefault(); const btn = $('button[type="submit"]', pf), err = $('.err', pf); btn.disabled = true; err.textContent = '';
      try { const was = u.email; u = await A.updateProfile(Object.fromEntries(new FormData(pf))); FT.toast(u.email !== was ? 'Saved. Confirm your new address from the email we sent.' : 'Profile saved'); verifyBar(); document.dispatchEvent(new CustomEvent('ft:auth', { detail: { user: A.me() } })); } catch (x) { err.textContent = x.message; } finally { btn.disabled = false; }
    });

    /* measurements */
    let list = [];
    const mList = $('#mList'), mForm = $('#mForm');
    const TRASH = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    async function loadM() { try { list = await A.listMeasurements(); } catch (e) { mList.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; } renderM(); }
    function renderM() {
      mList.innerHTML = list.length ? list.map(m => `<div class="mcard static" data-id="${esc(m.id)}"><div><span class="mn">${esc(m.label)}</span><span class="ms">${esc(App.measureSummary(m))} · ${esc(m.fit)} fit · ${esc(m.unit)}</span><span class="ms muted">${App.MEASURE_FIELDS.filter(([k]) => m.values[k]).map(([k, l]) => `${l} ${esc(m.values[k])}`).join(' · ')}</span></div><div class="row-btns"><button class="btn ghost sm" type="button" data-edit>Edit</button><button class="iconbtn" type="button" data-del aria-label="Delete ${esc(m.label)}">${TRASH}</button></div></div>`).join('')
        : App.empty(App.ICON.tape, 'No measurement profiles', 'Add one for yourself, and one for anyone you order for.');
    }
    const openForm = existing => { mForm.hidden = false; App.measureForm(mForm, { existing, onSave: () => { mForm.hidden = true; loadM(); }, onCancel: () => { mForm.hidden = true; } }); mForm.scrollIntoView({ behavior: FT.reduced ? 'auto' : 'smooth', block: 'start' }); };
    $('#mAdd').addEventListener('click', () => openForm(null));
    mList.addEventListener('click', async e => {
      const card = e.target.closest('.mcard'); if (!card) return; const m = list.find(x => x.id === card.dataset.id); if (!m) return;
      if (e.target.closest('[data-edit]')) openForm(m);
      else if (e.target.closest('[data-del]') && (await App.confirm('Delete this profile?', `“${esc(m.label)}” will be removed. Orders already placed keep their measurements.`, { ok: 'Delete', danger: true }))) { try { await A.deleteMeasurement(m.id); loadM(); } catch (x) { FT.toast(x.message); } }
    });
    if (u.role !== 'tailor') loadM();

    /* designer profile */
    if (u.role === 'customer') {
      const SPECS = ['Kaftans', 'Senator sets', 'Agbada', 'Boubou', 'Dresses', 'Bridal', 'Suits', 'Shirts', 'Embroidery', 'Ankara', 'Kente', 'Wedding parties'];
      const df = $('#designerForm'); let open = true, prof = null;
      try { prof = await A.myDesigner(); } catch {}
      const fill = () => {
        $('#dgSpecs').innerHTML = SPECS.map(s => `<button class="chip" type="button" data-v="${s}" aria-pressed="${!!prof?.specialties.includes(s)}">${s}</button>`).join('');
        if (prof) { $('#dg-handle').value = prof.handle; $('#dg-bio').value = prof.bio; $('#dg-fee').value = prof.feeFrom; $('#dg-days').value = prof.turnaroundDays; open = prof.open; $('#dgTitle').textContent = 'Your designer profile'; $('#dgIntro').textContent = 'This is what clients see before they send you a brief.'; $('#dgSide').innerHTML = `<div class="vstats" style="margin-top:18px"><div><b>${prof.rating ? prof.rating.toFixed(1) + ' ★' : 'New'}</b><span>${App.plural(prof.reviews, 'review')}</span></div><div><b>${App.count(prof.followers)}</b><span>followers</span></div><div><b>${prof.completed}</b><span>commissions</span></div></div><div class="row-btns"><a class="btn ghost" href="/designer?id=${encodeURIComponent(prof.id)}">View my public profile</a><a class="btn ghost" href="/commissions">Commissions</a></div>`; }
        $$('[data-open] button', df).forEach(b => b.setAttribute('aria-pressed', !!b.dataset.v === !!open));
      };
      fill();
      FT.seg($('[data-open]', df), v => (open = !!v));
      $('#dgSpecs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const on = b.getAttribute('aria-pressed') !== 'true'; if (on && $$('#dgSpecs [aria-pressed="true"]').length >= 6) { FT.toast('Pick up to six.'); return; } b.setAttribute('aria-pressed', on); });
      df.addEventListener('submit', async e => {
        e.preventDefault(); const d = Object.fromEntries(new FormData(df)), err = $('.err', df), btn = $('button[type="submit"]', df); btn.disabled = true; err.textContent = '';
        try { const fresh = !prof; prof = await A.saveDesignerProfile({ handle: d.handle, bio: d.bio, feeFrom: d.feeFrom, turnaroundDays: d.turnaroundDays, open, specialties: $$('#dgSpecs [aria-pressed="true"]').map(b => b.dataset.v) }); fill(); FT.toast(fresh ? 'You are a designer on Fashion Teller. Publish a design next.' : 'Designer profile saved'); document.dispatchEvent(new CustomEvent('ft:auth', { detail: { user: A.me() } })); }
        catch (x) { err.textContent = x.message; } finally { btn.disabled = false; }
      });
    }

    /* payouts: bank details, what is on its way, what has been paid */
    if (earner) {
      const po = $('#poRoot'), ST = { pending: ['Waiting', 'warn'], processing: ['On its way', 'gold'], paid: ['Paid', 'ok'], failed: ['Failed', 'bad'], reversed: ['Returned', 'bad'] };
      let banks = [], editing = false;
      async function payouts() {
        let e; try { [e, banks] = await Promise.all([A.earnings(), banks.length ? banks : A.listBanks()]); } catch (x) { po.innerHTML = `<p class="err">${esc(x.message)}</p>`; return; }
        const both = !!(u.vendorId && u.designer) && e.fees && e.fees.order !== e.fees.commission;
        $('#poFee').textContent = (e.ownFee != null ? `Your platform fee is ${e.ownFee}%, agreed with Fashion Teller.`
          : both ? `Fashion Teller keeps ${e.fees.order}% of tailoring orders and ${e.fees.commission}% of design commissions as its platform fee.`
          : `Fashion Teller keeps ${e.feePercent}% of each payment as its platform fee.`) + ' Each job is paid at the rate in force when you quoted or made the offer. The amounts here are what reaches you.';
        const acc = e.account, form = !acc || editing;
        po.innerHTML = `<div class="earn"><div><b>${FT.money(e.heldNet)}</b><span>Held until the customer confirms</span></div><div><b>${FT.money(e.pending + e.processing)}</b><span>${e.pending && !acc ? 'Waiting for your bank details' : 'On its way to you'}</span></div><div><b>${FT.money(e.paid)}</b><span>Paid out</span></div></div>
          ${form ? `<form class="form" id="bankForm" novalidate><div class="field full"><label for="bk-bank">Bank</label><select id="bk-bank" name="bankCode"><option value="">Choose your bank</option>${banks.map(b => `<option value="${esc(b.code)}"${acc && acc.bankCode === b.code ? ' selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
              <div class="field full"><label for="bk-num">Account number</label><input id="bk-num" name="number" inputmode="numeric" autocomplete="off" maxlength="10" pattern="[0-9]{10}" placeholder="10 digits"><small class="tip">The account must be in your name or your workshop's. We check the name with the bank.</small></div>
              <p class="err full" role="alert"></p><div class="foot-row"><p>${u.emailVerified || !mailOn ? '' : 'Confirm your email first.'}</p><div class="row-btns compact">${acc ? '<button class="btn ghost" type="button" data-cancel>Cancel</button>' : ''}<button class="btn ink mag" type="submit">Save bank details</button></div></div></form>`
            : `<div class="bankcard"><div><b>${esc(acc.bankName)} ••${esc(acc.last4)}</b><span>${esc(acc.accountName)}</span></div><button class="btn ghost sm" type="button" data-change>Change</button></div>`}
          <h3 class="h4" style="margin:8px 0 12px">Payouts</h3>
          ${e.payouts.length ? `<div class="table" style="--cols:4"><div class="tr th"><span>For</span><span>You receive</span><span>Status</span><span>When</span></div>${e.payouts.map(x => `<div class="tr"><span data-l="For">${esc(x.title)}<br><small class="muted">${FT.money(x.gross)} less ${FT.money(x.fee)} fee${x.feePercent != null ? ` (${x.feePercent}%)` : ''}</small></span><span data-l="You receive"><b>${FT.money(x.net)}</b></span><span data-l="Status">${App.badge(x.status, ST)}${x.status === 'failed' && x.note ? `<br><small class="muted">${esc(x.note)}</small>` : ''}</span><span data-l="When">${App.date(x.paidAt || x.createdAt)}</span></div>`).join('')}</div>` : `<p class="muted">Nothing yet. Your first payout appears here when a payment is released to you.</p>`}`;
        if (e.processing) setTimeout(() => { if (!$('[data-panel="payouts"]').hidden && !editing) payouts(); }, 4000);
      }
      po.addEventListener('click', e => { if (e.target.closest('[data-change]')) { editing = true; payouts(); } else if (e.target.closest('[data-cancel]')) { editing = false; payouts(); } });
      po.addEventListener('submit', async e => {
        const f = e.target.closest('#bankForm'); if (!f) return; e.preventDefault(); const d = Object.fromEntries(new FormData(f)), err = $('.err', f), btn = $('button[type="submit"]', f); btn.disabled = true; err.textContent = '';
        try { const a = await A.savePayoutAccount({ bankCode: d.bankCode, number: d.number }); editing = false; FT.toast(`Saved. Payouts go to ${a.bankName} ••${a.last4}.`); payouts(); } catch (x) { err.textContent = x.message; btn.disabled = false; }
      });
      $('[data-tab="payouts"]').addEventListener('click', payouts); if (location.hash === '#payouts') payouts();
      addEventListener('hashchange', () => { if (location.hash === '#payouts') payouts(); });
    }

    /* password */
    const sf = $('#passForm');
    sf.addEventListener('submit', async e => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(sf)), err = $('.err', sf), btn = $('button[type="submit"]', sf);
      if (d.next !== d.next2) { err.textContent = 'The new passwords do not match.'; return; }
      btn.disabled = true; err.textContent = '';
      try { await A.changePassword(d.current, d.next); sf.reset(); FT.toast('Password updated'); } catch (x) { err.textContent = x.message; } finally { btn.disabled = false; }
    });
  });
})();
