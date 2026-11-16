/** Account: your details, measurement profiles, designer profile, password. */
(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $, $$ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount, esc = FT.esc;
    const root = $('#aRoot');
    let u = await Acc.require(root, { title: 'Sign in to manage your account' }); if (!u) return;
    $('#aSub').textContent = `${u.email} · ${u.role === 'admin' ? 'Admin' : u.role === 'tailor' ? 'Tailor account' : u.designer ? 'Designer' : 'Customer'}`;
    if (u.role !== 'customer') { $('[data-tab="measurements"]').hidden = u.role === 'tailor'; $('[data-tab="designer"]').hidden = true; }
    App.tabs($('#aTabs'));

    /* profile */
    $('#p-country').innerHTML = [...new Set([...App.COUNTRIES, u.country].filter(Boolean))].map(c => `<option${c === (u.country || 'Nigeria') ? ' selected' : ''}>${esc(c)}</option>`).join('');
    $('#p-name').value = u.name; $('#p-email').value = u.email; $('#p-phone').value = u.phone || ''; $('#p-city').value = u.city || '';
    $('#p-role').textContent = u.role === 'tailor' ? 'Workshop details are edited in your Workshop page.' : 'Member since ' + App.date(u.createdAt);
    const pf = $('#profileForm');
    pf.addEventListener('submit', async e => {
      e.preventDefault(); const btn = $('button[type="submit"]', pf), err = $('.err', pf); btn.disabled = true; err.textContent = '';
      try { u = await A.updateProfile(Object.fromEntries(new FormData(pf))); FT.toast('Profile saved'); document.dispatchEvent(new CustomEvent('ft:auth', { detail: { user: A.me() } })); } catch (x) { err.textContent = x.message; } finally { btn.disabled = false; }
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
