(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const { $, $$ } = FT;
    const base = FTApi.SAMPLE_VENDORS.map(v => ({ ...v }));

    /* marquee */
    const names = base.map(v => v.name).concat(['Aso Ebi Atelier', 'Bogolan Studio', 'Lagos Island Fashion House']);
    $('#mq').innerHTML = [...names, ...names].map(n => `<span>${FT.STAR}${FT.esc(n)}</span>`).join('');

    /* rank simulator */
    const list = $('#simList'), els = new Map();
    const me = { id: 'me', name: 'Your workshop', city: '', rating: 4.7, verified: true, price: 280, deliveryDays: 7 };
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
    bind('simPrice', 'price', v => '$' + v);
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
    FT.form(form, {
      kind: 'tailor-applications',
      rules: {
        workshop: v => (v?.trim() ? '' : 'Enter your workshop name.'),
        name: v => (v?.trim() ? '' : 'Enter your name.'),
        email: v => (!v?.trim() ? 'Enter an email so we can reply.' : email(v) ? '' : 'That email looks incomplete, for example name@workshop.com.'),
        city: v => (v?.trim() ? '' : 'Enter the city your workshop is in.'),
        country: v => (v ? '' : 'Choose a country.'),
        specialties: (v, d) => (d.specialties?.length ? '' : 'Choose at least one thing you make.'),
      },
      done: d => {
        form.hidden = true;
        $('#applyDoneH').textContent = `Application sent for ${d.workshop}`;
        $('#applyDone').classList.add('on');
      },
    });
    $('#applyAgain').addEventListener('click', () => {
      form.reset(); $$('[data-multi] button', form).forEach(b => b.setAttribute('aria-pressed', 'false'));
      $('#applyDone').classList.remove('on'); form.hidden = false; $('#a-name').focus();
    });
  });
})();
