(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $, $$ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount;
    const root = $('#aRoot');
    const u = await Acc.require(root, { title: 'Sign in to manage your account' }); if (!u) return;
    $('#aSub').textContent = `${u.email} · ${u.role === 'admin' ? 'Admin' : u.role === 'tailor' ? 'Tailor account' : 'Customer'}`;
    if (u.role === 'tailor') $('[data-tab="measurements"]').hidden = true;
    App.tabs($('#aTabs'));

    /* profile */
    const COUNTRIES = ['Nigeria', 'Gabon', 'Ghana', 'Senegal', "Côte d'Ivoire", 'Cameroon', 'Kenya', 'South Africa', 'Brazil', 'Mexico', 'Colombia', 'United Kingdom', 'United States', 'Other'];
    $('#p-country').innerHTML = COUNTRIES.map(c => `<option${c === (u.country || 'Nigeria') ? ' selected' : ''}>${c}</option>`).join('');
    $('#p-name').value = u.name; $('#p-email').value = u.email; $('#p-phone').value = u.phone || ''; $('#p-city').value = u.city || '';
    $('#p-role').textContent = u.role === 'tailor' ? 'Workshop details are edited in your Workshop page.' : 'Member since ' + App.date(u.createdAt);
    const pf = $('#profileForm');
    pf.addEventListener('submit', async e => {
      e.preventDefault(); const btn = $('button[type="submit"]', pf), err = $('.err', pf); btn.disabled = true; err.textContent = '';
      try { await A.updateProfile(Object.fromEntries(new FormData(pf))); FT.toast('Profile saved'); document.dispatchEvent(new CustomEvent('ft:auth', { detail: { user: A.me() } })); } catch (x) { err.textContent = x.message; } finally { btn.disabled = false; }
    });

    /* measurements */
    let list = [];
    const mList = $('#mList'), mForm = $('#mForm');
    async function loadM() { list = await A.listMeasurements(); renderM(); }
    function renderM() {
      mList.innerHTML = list.length ? list.map(m => `<div class="mcard static" data-id="${m.id}"><div><span class="mn">${FT.esc(m.label)}</span><span class="ms">${FT.esc(App.measureSummary(m))} · ${m.fit} fit · ${m.unit}</span><span class="ms muted">${App.MEASURE_FIELDS.filter(([k]) => m.values[k]).map(([k, l]) => `${l} ${m.values[k]}`).join(' · ')}</span></div><div class="row-btns"><button class="btn ghost sm" type="button" data-edit>Edit</button><button class="iconbtn" type="button" data-del aria-label="Delete profile"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div></div>`).join('')
        : App.empty(App.ICON.tape, 'No measurement profiles', 'Add one for yourself, and one for anyone you order for.');
    }
    const openForm = existing => { mForm.hidden = false; App.measureForm(mForm, { existing, onSave: () => { mForm.hidden = true; loadM(); }, onCancel: () => { mForm.hidden = true; } }); mForm.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    $('#mAdd').addEventListener('click', () => openForm(null));
    mList.addEventListener('click', async e => {
      const card = e.target.closest('.mcard'); if (!card) return; const m = list.find(x => x.id === card.dataset.id);
      if (e.target.closest('[data-edit]')) openForm(m);
      else if (e.target.closest('[data-del]') && (await App.confirm('Delete this profile?', `“${FT.esc(m.label)}” will be removed. Orders already placed keep their measurements.`, { ok: 'Delete', danger: true }))) { await A.deleteMeasurement(m.id); loadM(); }
    });
    if (u.role !== 'tailor') loadM();

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
