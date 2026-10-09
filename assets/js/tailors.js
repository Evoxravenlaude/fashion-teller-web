(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const { $, $$ } = FT;
    const base = FTApi.SAMPLE_VENDORS.map(v => ({ ...v }));

    /* marquee */
    const names = base.map(v => v.name).concat(['Aso Ebi Atelier', 'Bogolan Studio', 'Lagos Island Fashion House']);
    const row = names.map(n => `<span>${FT.STAR}${FT.esc(n)}</span>`).join('');
    $('#mq').innerHTML = FT.render.marquee === false ? row : row + row;

    /* rank simulator */
    const list = $('#simList'), els = new Map();
    const me = { id: 'me', name: 'Your workshop', city: '', rating: 4.7, verified: true, price: 95000, deliveryDays: 7 };
    let sort = 'match', raf = 0;
    const all = () => [...base, me];
    const pct = r => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min)) * 100 + '%');
    const draw = animate => {
      const vs = all();
      const apply = () => FT.sortVendors(vs, sort).forEach(v => {
        let el = els.get(v.id); if (!el) { el = FT.vendorEl(v, { tag: 'div' }); els.set(v.id, el); if (v.id === 'me') el.classList.add('me'); }
        const tags = FT.vendorTags(v, vs); if (v.id === 'me') tags.unshift('You');
        FT.vendorFill(el, v, tags); list.appendChild(el);
      });
      animate ? FT.flip(() => [...list.children], apply) : apply();
      const rankBy = by => FT.sortVendors(vs, by).findIndex(v => v.id === 'me') + 1;
      const n = rankBy(sort);
      const label = { match: 'best match', price: 'price', fast: 'fastest', rating: 'rating' }[sort];
      $('#rankN').textContent = '#' + n; $('#rankOf').textContent = `of ${vs.length} by ${label}`;
      const m = rankBy('match');
      $('#simTip').textContent = m === 1 ? 'You lead the list customers see first. Keep your delivery time honest and your rating will hold it there.'
        : me.rating < 4.6 ? 'Rating carries half the weight in best match. Great reviews on your first orders move you up fastest.'
        : me.deliveryDays > 10 ? 'A shorter lead time would lift you in best match and put you in front of customers sorting by speed.'
        : 'You are in the running. A slightly lower price or a faster delivery time would move you up.';
    };
    const bind = (id, key, fmt, num = Number) => {
      const r = $('#' + id), out = $('#' + id + 'Out'); pct(r);
      r.addEventListener('input', () => { me[key] = num(r.value); out.textContent = fmt(me[key]); pct(r); cancelAnimationFrame(raf); raf = requestAnimationFrame(() => draw(true)); });
    };
    bind('simPrice', 'price', v => FT.money(v));
    bind('simDays', 'deliveryDays', v => v + (v === 1 ? ' day' : ' days'));
    bind('simRate', 'rating', v => v.toFixed(1) + ' ★', v => Math.round(Number(v) * 10) / 10);
    $('#simName').addEventListener('input', e => { me.name = e.target.value.trim() || 'Your workshop'; draw(false); });
    FT.seg($('#simSeg'), by => { sort = by; draw(true); });
    draw(false);

    /* specialties multi-select */
    $$('[data-multi]').forEach(g => g.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true');
      g.closest('.field').classList.remove('bad'); g.closest('.field').querySelector('.msg').textContent = '';
    }));

    /* application form */
    const form = $('#applyForm');
    const email = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
    const me0 = FTApi.me();
    if (me0) {
      $('#a-passField').hidden = true; $('#a-contact').value = me0.name; $('#a-email').value = me0.email; $('#a-email').readOnly = true; $('#a-phone').value = me0.phone || ''; $('#a-city').value = me0.city || ''; if (me0.country) $('#a-country').value = me0.country;
      const p = $('#applySigned'); p.hidden = false; p.textContent = `Applying as ${me0.name} (${me0.email}).`;
      if (me0.vendorId) { form.hidden = true; $('#applyDoneH').textContent = 'Your workshop is registered'; $('#applyDone').classList.add('on'); }
    }
    FT.form(form, {
      kind: 'tailor-applications',
      rules: {
        workshop: v => (v?.trim() ? '' : 'Enter your workshop name.'),
        name: v => (v?.trim() ? '' : 'Enter your name.'),
        email: v => (!v?.trim() ? 'Enter an email so we can reply.' : email(v) ? '' : 'That email looks incomplete, for example name@workshop.com.'),
        city: v => (v?.trim() ? '' : 'Enter the city your workshop is in.'),
        country: v => (v ? '' : 'Choose a country.'),
        specialties: (v, d) => (d.specialties?.length ? '' : 'Choose at least one thing you make.'),
        password: v => (FTApi.me() ? '' : v && v.length >= 8 ? '' : 'Create a password of at least 8 characters.'),
      },
      submit: async d => { await FTApi.applyAsVendor(d); },
      done: d => {
        form.hidden = true;
        $('#applyDoneH').textContent = `${d.workshop} is registered`;
        $('#applyDone').classList.add('on');
        document.dispatchEvent(new CustomEvent('ft:auth', { detail: { user: FTApi.me() } }));
      },
    });
  });
})();
