(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $, reduced } = FT;


    /* gold thread follows the pointer over the concept video */
    FT.trail($('#heroTrail'), $('#heroStage'));

    /* marquee */
    const star = FT.STAR;
    const names = FTApi.SAMPLE_VENDORS.map(v => v.name).concat(['Aso Ebi Atelier', 'Bogolan Studio', 'Lagos Island Fashion House']);
    const row = names.map(n => `<span>${star}${FT.esc(n)}</span>`).join('');
    $('#mq').innerHTML = FT.render.marquee === false ? row : row + row; // the scrolling version needs two copies

    /* compare demo: FLIP reorder */
    const list = $('#cmpList'), all = FTApi.SAMPLE_VENDORS.slice(0, 4);
    const els = new Map(all.map(v => [v.id, FT.vendorEl(v, { tag: 'div' })]));
    const order = by => FT.sortVendors(all, by).forEach(v => { FT.vendorFill(els.get(v.id), v, FT.vendorTags(v, all)); list.appendChild(els.get(v.id)); });
    order('match');
    FT.seg($('#cmpSeg'), by => FT.flip(() => [...list.children], () => order(by)));

    /* community: trending designs and featured designers */
    (async () => {
      const App = window.FTApp, feed = $('#homeFeed'), ds = $('#homeDesigners'); if (!App || !feed) return;
      feed.innerHTML = Array.from({ length: 5 }, () => '<div class="dcard sk"><div class="dcard-art"></div><div class="sk-l"></div></div>').join('');
      try { const r = await FTApi.discover({ sort: 'trending', limit: 8 }); feed.innerHTML = r.items.map((d, i) => App.dcard(d, { rank: i < 3 ? i + 1 : null })).join(''); App.hydrate(feed); if (!r.items.length) $('#community').hidden = true; } catch { $('#community').hidden = true; }
      try { const list = (await FTApi.listDesigners({ open: true })).slice(0, 3); ds.innerHTML = list.map(App.pcard).join(''); } catch { ds.innerHTML = ''; }
    })();

    await FT.ready;

    /* refine demo on the hero */
    const lines = ['Collar → mandarin', 'Palette → Royal Owambe', 'Sketch: gold motif on the cuffs', 'Embroidery → chest and hem'];
    const el = $('#demoLine'), ver = $('#demoV'), st = $('#demoState'); let i = 0, v = 1;
    if (reduced) { el.textContent = lines[0]; }
    else {
      const type = (s, k = 0) => {
        if (k <= s.length) { el.textContent = s.slice(0, k); return setTimeout(() => type(s, k + 1), 30 + Math.random() * 45); }
        st.textContent = 'Saving';
        setTimeout(() => { v = v >= 5 ? 1 : v + 1; ver.textContent = 'v' + v; st.textContent = 'Saved +10 XP'; setTimeout(erase, 1600); }, 900);
      };
      const erase = () => { const s = el.textContent; if (s.length) { el.textContent = s.slice(0, -1); setTimeout(erase, 14); } else { st.textContent = 'Designing'; i = (i + 1) % lines.length; setTimeout(() => type(lines[i]), 450); } };
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
