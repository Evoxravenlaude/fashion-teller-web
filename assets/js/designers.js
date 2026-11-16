/** Designers directory: people who publish designs and take commissions. */
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const { $, $$ } = FT, A = window.FTApi, App = window.FTApp;
    const root = $('#pRoot'), SPECS = ['Kaftans', 'Agbada', 'Dresses', 'Suits', 'Shirts', 'Bridal', 'Embroidery'];
    const st = { q: '', specialty: '', open: false }; let token = 0;
    $('#pSpec').innerHTML = `<button class="chip" type="button" data-s="" aria-pressed="true">Everyone</button>${SPECS.map(s => `<button class="chip" type="button" data-s="${s}" aria-pressed="false">${s}</button>`).join('')}<button class="chip" type="button" data-open aria-pressed="false">Open to commissions</button>`;
    async function load() {
      const my = ++token; let list;
      try { list = await A.listDesigners(st); } catch (e) { root.innerHTML = `<p class="err">${FT.esc(e.message)}</p>`; return; }
      if (my !== token) return;
      root.innerHTML = list.length ? `<div class="pgrid">${list.map(App.pcard).join('')}</div>` : App.empty(App.ICON.people, 'No designers match', 'Try another style, or clear the search.');
      const me = A.me(); $('#becomeBtn').textContent = me?.designer ? 'Edit my designer profile' : 'Become a designer'; $('#becomeBtn').hidden = !!me && me.role !== 'customer';
    }
    $('#pSpec').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if ('open' in b.dataset) { st.open = !st.open; b.setAttribute('aria-pressed', st.open); }
      else { st.specialty = b.dataset.s; $$('#pSpec [data-s]').forEach(x => x.setAttribute('aria-pressed', x === b)); }
      load();
    });
    let t = null; $('#pQ').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { st.q = e.target.value.trim(); load(); }, 260); });
    document.addEventListener('ft:auth', load);
    load();
  });
})();
