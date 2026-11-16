/** My studio: streak, level and today's challenge, every design you saved, what you published, and your badges. */
(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount, E = window.FTEngine, esc = FT.esc, enc = encodeURIComponent;
    const root = $('#dRoot');
    const u = await Acc.require(root, { title: 'Sign in to open your studio', message: 'Every design you save lives here with all of its versions.' }); if (!u) return;
    const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-4-1-6 1-9.5z" fill="currentColor"/></svg>';
    const TRASH = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    let game = null, designs = [], tab = 'all';
    async function renderGame() {
      const g = $('#gRoot'); if (u.role !== 'customer') { g.hidden = true; return; }
      try { game = await A.game(); } catch { g.hidden = true; return; }
      const x = game, pct = x.to ? Math.round(((x.xp - x.from) / (x.to - x.from)) * 100) : 100;
      g.innerHTML = `<div class="hub">
        <div class="hub-card streak-card${x.doneToday ? ' lit' : ''}"><div class="big">${FLAME}<b>${x.streak}</b><span>day streak</span></div>
          <ol class="week">${x.week.map(d => `<li class="${d.done ? 'done' : ''}${d.today ? ' today' : ''}"><i></i><span>${esc(d.label)}</span></li>`).join('')}</ol>
          <p>${x.doneToday ? 'Kept for today. Come back tomorrow.' : x.atRisk ? 'Save a design today to keep it going.' : 'Save a design today to start one.'} Best: ${App.plural(x.best, 'day')}.</p></div>
        <div class="hub-card"><span class="k">Level ${x.level}</span><b class="lvl">${esc(x.title)}</b><div class="xpbar" role="img" aria-label="${pct}% of the way to the next level"><i style="width:${pct}%"></i></div><p>${x.xp} XP${x.to ? ` · ${x.to - x.xp} to the next level` : ' · top level'}</p></div>
        <div class="hub-card challenge-card"><span class="k">Today’s challenge</span><b>${esc(x.challenge.title)}</b><p>${esc(x.challenge.text)}</p>${x.challenge.done ? '<span class="dc-done">Done ✓ +50 XP</span>' : '<a class="btn gold sm" href="/studio?challenge=1">Take it on · +50 XP</a>'}</div>
      </div>`;
      if (tab === 'badges') render();
    }
    async function load() { try { designs = await A.listDesigns(); } catch (e) { root.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; } render(); }
    function render() {
      $('#dCount').textContent = designs.length ? `${App.plural(designs.length, 'design')} · ${App.plural(designs.reduce((s, d) => s + d.versions.length, 0), 'version')} · ${designs.filter(d => d.published).length} published` : 'Nothing saved yet.';
      if (tab === 'badges') { root.innerHTML = game ? `<p class="muted" style="margin:0 0 14px">${game.badges.filter(b => b.at).length} of ${game.badges.length} earned.</p><div class="badges" style="margin-top:0">${game.badges.map(b => `<div class="bdg${b.at ? ' got' : ''}"><span class="medal" aria-hidden="true">${b.at ? '★' : ''}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}${b.at ? ` · ${App.date(b.at)}` : ''}</small></div>`).join('')}</div>` : '<p class="muted">Badges are for customer accounts.</p>'; return; }
      const list = designs.filter(d => tab === 'all' || (tab === 'published' && d.published) || (tab === 'forme' && d.credit && !d.remixOf));
      if (!list.length) {
        root.innerHTML = tab === 'published' ? App.empty(App.ICON.spark, 'Nothing published yet', 'Open a design and publish it to Discover. People can like it, remix it and commission you.', designs.length ? '' : '<a class="btn gold" href="/studio">Start designing</a>')
          : tab === 'forme' ? App.empty(App.ICON.people, 'No designs made for you yet', 'Hire a designer and the design they make for you lands here, credited to them.', '<a class="btn ink" href="/designers">Find a designer</a>')
          : App.empty(App.ICON.design, 'No designs yet', 'Pick a template in the studio, make it yours and save it. Every version lands here.', '<a class="btn gold" href="/studio">Start designing</a>');
        return;
      }
      root.innerHTML = `<div class="cards">${list.map(d => { const v = App.version(d); return `<article class="card design" data-id="${esc(d.id)}">
          <a class="card-link" href="/design?id=${enc(d.id)}" aria-label="Open ${esc(d.title)}"><div class="thumb">${App.art(v.spec)}</div></a>
          <div class="card-body">
            <div class="card-top"><h3>${esc(d.title)}</h3>${d.published ? App.badge('published') : App.badge(d.status)}</div>
            ${d.credit && d.credit.id !== u.id ? `<p class="muted small">${d.remixOf ? 'Remixed from' : 'Designed by'} ${esc(d.credit.name)}</p>` : ''}
            <div class="chips">${E.summary(v.spec).slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
            <p class="meta">v${d.current} of ${d.versions.length} · updated ${App.ago(d.updatedAt)}${d.published ? ` · ${App.plural(d.likes, 'like')}` : ''}</p>
            <div class="card-actions"><a class="btn ink sm" href="/design?id=${enc(d.id)}">Open</a><a class="btn ghost sm" href="/studio?design=${enc(d.id)}">${d.status === 'ordered' ? 'View in studio' : 'Edit'}</a><button class="btn ghost sm" type="button" data-dup>Duplicate</button>${d.status === 'ordered' ? '' : `<button class="iconbtn" type="button" data-del aria-label="Delete ${esc(d.title)}">${TRASH}</button>`}</div>
          </div></article>`; }).join('')}</div>`;
    }
    root.addEventListener('click', async e => {
      const card = e.target.closest('.card'); if (!card) return; const d = designs.find(x => x.id === card.dataset.id); if (!d) return;
      try {
        if (e.target.closest('[data-dup]')) { const nd = await A.duplicateDesign(d.id); FT.toast(`Copied as “${nd.title}”`); await load(); }
        else if (e.target.closest('[data-del]')) { if (await App.confirm('Delete this design?', `“${esc(d.title)}” and its ${App.plural(d.versions.length, 'version')} will be removed.`, { ok: 'Delete', danger: true })) { await A.deleteDesign(d.id); FT.toast('Design deleted'); await load(); } }
      } catch (x) { FT.toast(x.message); }
    });
    App.tabs($('#dTabs'), t => { tab = t; render(); }, { hash: true });
    tab = ['all', 'published', 'forme', 'badges'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'all';
    renderGame(); await load();
    let t = null; A.onChange(() => { clearTimeout(t); t = setTimeout(() => { load(); renderGame(); }, 500); });
    document.addEventListener('ft:game', renderGame);
  });
})();
