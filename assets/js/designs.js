(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $, $$ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount;
    const root = $('#dRoot');
    const u = await Acc.require(root, { title: 'Sign in to see your designs', message: 'Every concept you generate is saved here with all of its versions.' }); if (!u) return;
    const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-4-1-6 1-9.5z" fill="currentColor"/></svg>';
    async function renderGame() {
      const g = $('#gRoot'); if (u.role !== 'customer') { g.hidden = true; return; }
      let x; try { x = await A.game(); } catch { g.hidden = true; return; }
      const pct = x.to ? Math.round(((x.xp - x.from) / (x.to - x.from)) * 100) : 100;
      g.innerHTML = `<div class="hub">
        <div class="hub-card streak-card${x.doneToday ? ' lit' : ''}"><div class="big">${FLAME}<b>${x.streak}</b><span>day streak</span></div>
          <ol class="week">${x.week.map(d => `<li class="${d.done ? 'done' : ''}${d.today ? ' today' : ''}"><i></i><span>${d.label}</span></li>`).join('')}</ol>
          <p>${x.doneToday ? 'Kept for today. Come back tomorrow.' : x.atRisk ? 'Save a design today to keep it going.' : 'Save a design today to start one.'} Best: ${x.best} day${x.best === 1 ? "" : "s"}.</p></div>
        <div class="hub-card"><span class="k">Level ${x.level}</span><b class="lvl">${FT.esc(x.title)}</b><div class="xpbar"><i style="width:${pct}%"></i></div><p>${x.xp} XP${x.to ? ` · ${x.to - x.xp} to the next level` : ' · top level'}</p></div>
        <div class="hub-card challenge-card"><span class="k">Today’s challenge</span><b>${FT.esc(x.challenge.title)}</b><p>${FT.esc(x.challenge.text)}</p>${x.challenge.done ? '<span class="dc-done">Done ✓ +50 XP</span>' : '<a class="btn gold sm" href="/studio?challenge=1">Take it on · +50 XP</a>'}</div>
      </div>
      <div class="badges">${x.badges.map(b => `<div class="bdg${b.at ? ' got' : ''}" title="${FT.esc(b.desc)}"><span class="medal">${b.at ? '★' : ''}</span><b>${FT.esc(b.name)}</b><small>${FT.esc(b.desc)}</small></div>`).join('')}</div>`;
    }
    renderGame();
    let designs = [];
    async function load() { try { designs = await A.listDesigns(); } catch (e) { root.innerHTML = `<p class="err">${FT.esc(e.message)}</p>`; return; } render(); }
    function render() {
      $('#dCount').textContent = designs.length ? `${designs.length} design${designs.length === 1 ? '' : 's'} · ${designs.reduce((s, d) => s + d.versions.length, 0)} versions` : 'Nothing saved yet.';
      if (!designs.length) { root.innerHTML = App.empty(App.ICON.design, 'No designs yet', 'Pick a template in the studio, make it yours and save it. Every version lands here.', '<a class="btn gold" href="/studio">Start designing</a>'); return; }
      root.innerHTML = `<div class="cards">${designs.map(d => {
        const v = App.version(d);
        return `<article class="card design" data-id="${d.id}">
          <a class="card-link" href="/studio?design=${d.id}" aria-label="Open ${FT.esc(d.title)}">${App.thumb(d)}</a>
          <div class="card-body">
            <div class="card-top"><h3>${FT.esc(d.title)}</h3>${App.badge(d.status)}</div>
            <p class="muted small">${FT.esc(d.prompt)}</p>
            <div class="chips">${FTEngine.summary(v.spec).slice(0, 3).map(t => `<span class="tag">${FT.esc(t)}</span>`).join('')}</div>
            <p class="meta">v${d.current} of ${d.versions.length} · updated ${App.ago(d.updatedAt)}</p>
            <div class="card-actions"><a class="btn ink sm" href="/studio?design=${d.id}">${d.status === 'ordered' ? 'View' : 'Keep designing'}</a><button class="btn ghost sm" type="button" data-dup>Duplicate</button><button class="btn ghost sm" type="button" data-ren>Rename</button><button class="iconbtn" type="button" data-del aria-label="Delete design"><svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
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
    A.onChange(() => { load(); renderGame(); });
  });
})();
