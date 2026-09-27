(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $, $$, reduced } = FT;

    /* hero prompt -> studio */
    const form = $('#ask'), input = $('#askInput');
    $$('[data-fill]').forEach(c => c.addEventListener('click', () => { input.value = c.dataset.fill; input.focus(); }));
    form.addEventListener('submit', e => {
      e.preventDefault();
      const v = input.value.trim();
      if (!v) { input.focus(); form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); return; }
      FT.go('/studio?prompt=' + encodeURIComponent(v));
    });

    /* gold thread follows the pointer over the concept video */
    FT.trail($('#heroTrail'), $('#heroStage'));

    /* marquee */
    const star = FT.STAR;
    const names = FTApi.SAMPLE_VENDORS.map(v => v.name).concat(['Aso Ebi Atelier', 'Bogolan Studio', 'Lagos Island Fashion House']);
    $('#mq').innerHTML = names.map(n => `<span>${star}${FT.esc(n)}</span>`).join('') + names.map(n => `<span>${star}${FT.esc(n)}</span>`).join('');

    /* compare demo: FLIP reorder */
    const list = $('#cmpList'), all = FTApi.SAMPLE_VENDORS.slice(0, 4);
    const els = new Map(all.map(v => [v.id, FT.vendorEl(v, { tag: 'div' })]));
    const order = by => FT.sortVendors(all, by).forEach(v => { FT.vendorFill(els.get(v.id), v, FT.vendorTags(v, all)); list.appendChild(els.get(v.id)); });
    order('match');
    FT.seg($('#cmpSeg'), by => FT.flip(() => [...list.children], () => order(by)));

    await FT.ready;

    /* refine demo on the hero */
    const lines = ['add deeper gold trim', 'make the neckline a mandarin collar', 'shorten the sleeves to three-quarter', 'bring the embroidery down to the hem'];
    const el = $('#demoLine'), ver = $('#demoV'), st = $('#demoState'); let i = 0, v = 1;
    if (reduced) { el.textContent = lines[0]; }
    else {
      const type = (s, k = 0) => {
        if (k <= s.length) { el.textContent = s.slice(0, k); return setTimeout(() => type(s, k + 1), 30 + Math.random() * 45); }
        st.textContent = 'Applying';
        setTimeout(() => { v = v >= 5 ? 1 : v + 1; ver.textContent = 'v' + v; st.textContent = 'Applied'; setTimeout(erase, 1600); }, 900);
      };
      const erase = () => { const s = el.textContent; if (s.length) { el.textContent = s.slice(0, -1); setTimeout(erase, 14); } else { st.textContent = 'Refining'; i = (i + 1) % lines.length; setTimeout(() => type(lines[i]), 450); } };
      setTimeout(() => type(lines[0]), 1200);
    }

    /* finale: a stitch runs across the section when it comes into view */
    const fin = $('#finale');
    FT.onView(fin, () => FT.thread($('#finaleThread'), {
      paths: [[[0.02, 0.86], [0.18, 0.8], [0.34, 0.9], [0.5, 0.82], [0.66, 0.9], [0.82, 0.8], [0.98, 0.86]], [[0.02, 0.14], [0.2, 0.2], [0.4, 0.12], [0.6, 0.2], [0.8, 0.12], [0.98, 0.18]]],
      duration: 2600, width: 1.6, light: true, glints: 0.15,
    }), 0.35);
  });
})();
