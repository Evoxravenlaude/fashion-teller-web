(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $, $$ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount;
    const root = $('#dRoot');
    const u = await Acc.require(root, { title: 'Sign in to see your designs', message: 'Every concept you generate is saved here with all of its versions.' }); if (!u) return;
    let designs = [];
    async function load() { try { designs = await A.listDesigns(); } catch (e) { root.innerHTML = `<p class="err">${FT.esc(e.message)}</p>`; return; } render(); }
    function render() {
      $('#dCount').textContent = designs.length ? `${designs.length} design${designs.length === 1 ? '' : 's'} · ${designs.reduce((s, d) => s + d.versions.length, 0)} versions` : 'Nothing saved yet.';
      if (!designs.length) { root.innerHTML = App.empty(App.ICON.design, 'No designs yet', 'Describe a garment in the studio and the concept is saved here with every version you make.', '<a class="btn gold" href="/studio">Open studio</a>'); return; }
      root.innerHTML = `<div class="cards">${designs.map(d => {
        const v = App.version(d);
        return `<article class="card design" data-id="${d.id}">
          <a class="card-link" href="/studio?design=${d.id}" aria-label="Open ${FT.esc(d.title)}">${App.thumb(d)}</a>
          <div class="card-body">
            <div class="card-top"><h3>${FT.esc(d.title)}</h3>${App.badge(d.status)}</div>
            <p class="muted small">${FT.esc(d.prompt)}</p>
            <div class="chips">${FTEngine.summary(v.spec).slice(0, 3).map(t => `<span class="tag">${FT.esc(t)}</span>`).join('')}</div>
            <p class="meta">v${d.current} of ${d.versions.length} · updated ${App.ago(d.updatedAt)}</p>
            <div class="card-actions"><a class="btn ink sm" href="/studio?design=${d.id}">${d.status === 'ordered' ? 'View' : 'Open'}</a><button class="btn ghost sm" type="button" data-dup>Duplicate</button><button class="btn ghost sm" type="button" data-ren>Rename</button><button class="iconbtn" type="button" data-del aria-label="Delete design"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
          </div>
        </article>`; }).join('')}</div>`;
      FT.magnetic(root);
    }
    root.addEventListener('click', async e => {
      const card = e.target.closest('.card'); if (!card) return; const id = card.dataset.id, d = designs.find(x => x.id === id);
      try {
        if (e.target.closest('[data-dup]')) { const nd = await A.duplicateDesign(id); FT.toast(`Copied as “${nd.title}”`); await load(); }
        else if (e.target.closest('[data-ren]')) {
          const s = App.sheet(`<h3>Rename design</h3><form class="form" style="grid-template-columns:1fr"><div class="field"><label for="rn">Title</label><input id="rn" name="title" value="${FT.esc(d.title)}" maxlength="80"></div><div class="row-btns"><button class="btn ghost" type="button" data-c>Cancel</button><button class="btn ink" type="submit">Save</button></div></form>`);
          $('[data-c]', s).addEventListener('click', App.closeSheet); setTimeout(() => $('#rn', s).select(), 300);
          $('form', s).addEventListener('submit', async ev => { ev.preventDefault(); await A.renameDesign(id, $('#rn', s).value); App.closeSheet(); await load(); });
        }
        else if (e.target.closest('[data-del]')) { if (await App.confirm('Delete this design?', `“${FT.esc(d.title)}” and its ${d.versions.length} version${d.versions.length === 1 ? '' : 's'} will be removed.`, { ok: 'Delete', danger: true })) { await A.deleteDesign(id); FT.toast('Design deleted'); await load(); } }
      } catch (x) { FT.toast(x.message); }
    });
    await load();
    A.onChange(load);
  });
})();
