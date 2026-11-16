/** Discover: the public feed of published designs. Trending, new, people you follow, and what you saved. */
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const { $, $$ } = FT, A = window.FTApi, App = window.FTApp, E = window.FTEngine;
    const feed = $('#feed'), more = $('#moreBtn'), PAGE = 24;
    const qs = new URLSearchParams(location.search);
    const st = { sort: ['trending', 'new', 'following', 'saved'].includes(qs.get('sort')) ? qs.get('sort') : 'trending', garment: E.vocab.GARMENTS[qs.get('style')] ? qs.get('style') : '', q: (qs.get('q') || '').slice(0, 60), offset: 0, total: 0 };
    let token = 0;
    $('#fGarment').innerHTML = [['', 'All styles'], ...E.OPTIONS.garment].map(([v, l]) => `<button class="chip" type="button" data-g="${v}" aria-pressed="${st.garment === v}">${FT.esc(l)}</button>`).join('');
    $('#fQ').value = st.q;
    const sync = () => { const p = new URLSearchParams(); if (st.sort !== 'trending') p.set('sort', st.sort); if (st.garment) p.set('style', st.garment); if (st.q) p.set('q', st.q); try { history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '')); } catch {} };
    const EMPTY = {
      following: () => A.me() ? App.empty(App.ICON.people, 'Nothing from people you follow yet', 'Follow designers and their new designs show up here.', '<a class="btn ink" href="/designers">Find designers</a>') : App.empty(App.ICON.lock, 'Sign in to see who you follow', 'Follow designers and their new designs show up here.', '<a class="btn gold" href="/signin">Sign in</a>'),
      saved: () => A.me() ? App.empty(App.ICON.mark, 'Nothing saved yet', 'Tap Save on any design to keep it here for later.') : App.empty(App.ICON.lock, 'Sign in to see what you saved', 'Save designs you like and come back to them.', '<a class="btn gold" href="/signin">Sign in</a>'),
    };
    async function load(reset = true) {
      const my = ++token; if (reset) { st.offset = 0; feed.innerHTML = App.skeleton(8); more.hidden = true; }
      more.disabled = true;
      let r; try { r = await A.discover({ sort: st.sort, garment: st.garment, q: st.q, limit: PAGE, offset: st.offset }); } catch (e) { if (my === token) feed.innerHTML = `<p class="err">${FT.esc(e.message)}</p>`; return; }
      if (my !== token) return;
      st.total = r.total;
      $('#fCount').textContent = r.total ? App.plural(r.total, 'design') : '';
      if (reset) feed.innerHTML = r.items.length ? '<div class="feed-grid"></div>' : (EMPTY[st.sort]?.() || App.empty(App.ICON.design, 'No designs match', 'Try another style or a shorter search.', '<button class="btn ghost" type="button" data-clear>Clear filters</button>'));
      const grid = $('.feed-grid', feed);
      if (grid) { grid.insertAdjacentHTML('beforeend', r.items.map((d, i) => App.dcard(d, { rank: st.sort === 'trending' && !st.q && !st.garment && st.offset + i < 3 ? st.offset + i + 1 : null })).join('')); App.hydrate(grid); }
      st.offset += r.items.length; more.hidden = st.offset >= r.total; more.disabled = false;
    }
    App.tabs($('#fSort'), id => { st.sort = id; sync(); load(); }, { hash: false, initial: st.sort });
    $('#fGarment').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (!b) return; st.garment = b.dataset.g; $$('#fGarment [data-g]').forEach(x => x.setAttribute('aria-pressed', x === b)); sync(); load(); });
    let t = null; $('#fQ').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); sync(); load(); }, 280); });
    feed.addEventListener('click', e => { if (!e.target.closest('[data-clear]')) return; st.garment = ''; st.q = ''; $('#fQ').value = ''; $$('#fGarment [data-g]').forEach(x => x.setAttribute('aria-pressed', x.dataset.g === '')); sync(); load(); });
    more.addEventListener('click', () => load(false));
    document.addEventListener('ft:auth', () => load());
    load();
  });
})();
