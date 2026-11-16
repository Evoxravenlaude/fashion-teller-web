/**
 * The design room: what happens after a design is saved.
 *   Owner   the design in 3D, every version, the tailor's spec sheet (printable), publish to Discover, share,
 *           get it made, ask a designer.
 *   Public  a published design: like, save, remix into your own, have it made, commission the designer.
 */
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const { $, $$ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount, E = window.FTEngine, esc = FT.esc;
    const root = $('#rmRoot'), id = new URLSearchParams(location.search).get('id') || '';
    let d = null, shownN = null, viewer = null, mode = '3d', flatView = 'front';
    const V = () => d.versions.find(v => v.n === shownN) || App.version(d);
    const enc = encodeURIComponent;

    /* ───── the stage ───── */
    async function stage() {
      const el = $('#rmView'); if (!el) return;
      viewer?.dispose?.(); viewer = null; el.className = ''; el.innerHTML = '';
      if (mode === 'flat') { el.className = 'v3d is-flat'; el.innerHTML = `<div class="v3d-flat">${App.art(V().spec, { view: flatView, bg: false })}</div>`; bar(); return; }
      viewer = await App.viewer(el, V().spec); if (viewer.flat) mode = 'flat';
      bar();
    }
    function bar() {
      const b = $('#rmBar'); if (!b) return;
      $$('#rmSeg [data-view]').forEach(x => x.setAttribute('aria-pressed', x.dataset.view === mode));
      b.innerHTML = mode === 'flat' ? `<button type="button" data-face="front" aria-pressed="${flatView === 'front'}">Front</button><button type="button" data-face="back" aria-pressed="${flatView === 'back'}">Back</button>`
        : `<button type="button" data-face="front">Front</button><button type="button" data-face="side">Side</button><button type="button" data-face="back">Back</button><span class="sep"></span><button type="button" data-spin aria-pressed="${!!viewer?.spinning}">Spin</button>`;
    }
    root.addEventListener('click', e => {
      const f = e.target.closest('#rmBar button'), v = e.target.closest('#rmSeg [data-view]');
      if (f) { if (f.dataset.face) { flatView = f.dataset.face === 'back' ? 'back' : 'front'; if (mode === 'flat') stage(); else viewer?.face(f.dataset.face); } else viewer?.spin(); bar(); }
      if (v && v.dataset.view !== mode) { mode = v.dataset.view; stage(); }
    });

    /* ───── shared pieces ───── */
    const sw = c => `<i style="background:${E.colorHex(c)}"></i>`;
    function specSheet(spec) {
      const s = E.normalize(spec), O = E.OPTIONS, g = s.garment;
      const rows = [['Style', E.vocab.GARMENTS[g].label], ['Fabric', E.vocab.FABRICS[s.fabric]?.label || s.fabric], ['Pattern', s.pattern], ['Colour', sw(s.color) + esc(E.colorName(s.color)) + (s.customColor ? ` <small class="muted">${esc(E.colorHex(s.color))}</small>` : '')], ['Accent', `<i style="background:${E.accentHex(s.accent)}"></i>${esc(E.colorName(s.accent))}`], ['Neckline', esc(E.vocab.COLLAR_LABEL[s.collar] || s.collar)],
        O.sleevesFor[g].length ? ['Sleeves', esc(s.sleeves.replace('-', ' ')) + (s.puff && s.sleeves !== 'sleeveless' ? ', puff' : '')] : null, O.lengthFor[g].length ? ['Length', esc(s.length === 'full' ? 'floor' : s.length)] : null, O.fitFor[g] ? ['Fit', esc(s.fit)] : null,
        ['Embroidery', s.embroidery === 'none' ? 'none' : esc(E.vocab.EMB_LABEL[s.embroidery].replace('embroidery ', '')) + ', ' + ['', 'light', 'medium', 'heavy'][s.density]],
        O.detailsFor[g].some(k => s[k]) ? ['Details', O.detailsFor[g].filter(k => s[k]).join(', ')] : null, s.sketch.length ? ['Hand sketch', App.plural(s.sketch.length, 'stroke')] : null].filter(Boolean);
      return `<dl class="specs">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${typeof v === 'string' && /</.test(v) ? v : esc(v)}</dd>`).join('')}</dl>${s.notes.length ? `<div style="margin-top:14px"><p class="kicker" style="margin:0 0 6px">Notes for the tailor</p><ul class="notes">${s.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}`;
    }
    const estimate = spec => { const e = E.estimate(spec); return `Likely ${FT.money(e.low, { compact: true })} – ${FT.money(e.high, { compact: true })} to make · ${e.daysLow}–${e.daysHigh} days`; };
    const shell = side => `<div class="room"><section class="room-stage" aria-label="The design"><div id="rmView"></div>
        <div class="room-top"><a class="st-seg" href="${d.view === 'owner' ? '/designs' : '/discover'}" style="padding:0 14px;height:36px;align-items:center;font-size:13px;font-weight:600">← ${d.view === 'owner' ? 'My studio' : 'Discover'}</a><div class="st-seg" id="rmSeg" role="group" aria-label="How to view the design"><button type="button" data-view="3d">3D</button><button type="button" data-view="flat">Flat</button></div></div>
        <div class="v3d-bar" id="rmBar"></div></section><section class="room-side">${side}</section></div>`;
    const credit = () => d.credit && d.credit.id !== d.userId ? `<div class="credit">${App.avatar({ name: d.credit.name, hue: 0 }, 30)}<span>${d.remixOf ? `Remixed from <a href="/design?id=${enc(d.remixOf.designId)}">${esc(d.remixOf.title)}</a> by ` : 'Designed by '}<a href="/designer?id=${enc(d.credit.id)}">${esc(d.credit.name)}</a></span></div>` : '';

    /* ───── owner ───── */
    function renderOwner() {
      const v = V(), locked = d.status === 'ordered';
      root.innerHTML = shell(`
        <div><div class="room-meta">${App.badge(d.status)}${d.published ? App.badge('published') : ''}<span>v${v.n} of ${d.versions.length} · updated ${App.ago(d.updatedAt)}</span></div>
          <h1 style="margin-top:10px">${esc(d.title)} <button class="linkbtn noprint" type="button" data-act="rename" style="font-size:13px;vertical-align:middle">Rename</button></h1>
          <p class="muted small" style="margin:8px 0 0">${estimate(v.spec)}</p></div>
        ${credit()}
        <div class="acts2 noprint">
          ${locked ? `<a class="btn gold wide" href="/orders">In production: track the order</a>` : `<a class="btn gold wide" href="/studio?design=${enc(d.id)}&step=3">Get it made</a>`}
          <a class="btn ink" href="/studio?design=${enc(d.id)}">${locked ? 'Open in studio' : 'Keep designing'}</a><a class="btn ghost" href="/try-on?design=${enc(d.id)}">${App.ICON.tryon || ''}Try it on</a><button class="btn ghost" type="button" data-act="share">Share</button>
          <button class="btn ghost" type="button" data-act="dup">Duplicate</button><button class="btn ghost" type="button" data-act="print">Print spec sheet</button>
        </div>
        <div class="noprint" id="publish">${d.published ? `<div class="pubbox"><p><b>On Discover</b> since ${App.date(d.publishedAt)} · ${App.plural(d.likes, 'like')} · ${App.plural(d.remixes, 'remix', 'remixes')}</p>${d.caption ? `<p>“${esc(d.caption)}”</p>` : ''}${d.tags.length ? `<div class="chips">${d.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}<div class="row-btns compact"><button class="btn ghost sm" type="button" data-act="publish">Edit caption</button><button class="btn ghost sm" type="button" data-act="unpublish">Take it down</button></div></div>`
          : `<div class="pubbox"><p><b>Publish it to Discover.</b> Other people can like it, remix it into their own (you stay credited) and commission you.</p><div class="row-btns compact"><button class="btn ink sm" type="button" data-act="publish">Publish</button></div></div>`}</div>
        <div><div class="sec-t"><h2>Versions</h2><span class="muted small">${shownN !== d.current ? `Looking at v${shownN}` : 'Every save is kept'}</span></div>
          <ol class="vrail">${[...d.versions].reverse().map(x => `<li><button type="button" data-vn="${x.n}" aria-current="${x.n === shownN}"><span class="tile-art">${App.art(x.spec, { crop: 'template' })}</span><b>v${x.n}${x.n === d.current ? ' · current' : ''}</b><small>${esc(x.instruction || '')}</small></button></li>`).join('')}</ol>
          ${shownN !== d.current && !locked ? `<div class="row-btns compact noprint" style="margin-top:10px"><button class="btn ink sm" type="button" data-act="restore">Make v${shownN} the current version</button><button class="btn ghost sm" type="button" data-vn="${d.current}">Back to v${d.current}</button></div>` : ''}</div>
        <div><div class="sec-t"><h2>Spec sheet</h2><span class="muted small">What the tailor works from</span></div>${specSheet(v.spec)}</div>
        <div class="nexts noprint"><a class="next-card" href="/designers"><span class="ic">${App.ICON.people}</span><span><b>Ask a designer</b><small>Hire a designer to refine this design or take it further.</small></span><span></span></a></div>
        ${locked ? '' : '<button class="linkbtn noprint" type="button" data-act="delete" style="color:var(--error);align-self:flex-start">Delete this design</button>'}`);
      stage();
      if (location.hash === '#publish') { $('#publish')?.scrollIntoView({ block: 'center' }); history.replaceState(null, '', location.pathname + location.search); if (!d.published) publish(); }
    }
    async function publish() {
      const out = await App.ask(d.published ? 'Edit your post' : 'Publish to Discover', 'Anyone can see a published design. Your measurements, orders and other designs stay private.', [
        { name: 'caption', label: 'Caption', type: 'textarea', optional: true, max: 240, value: d.caption, placeholder: 'What is it for? What makes it yours?' },
        { name: 'tags', label: 'Tags', optional: true, max: 120, value: d.tags.join(', '), placeholder: 'wedding, agbada, gold', hint: 'Up to six, separated by commas.' },
        { name: 'allowRemix', label: 'Remixing', type: 'select', value: d.allowRemix ? '1' : '', options: [['1', 'Let others remix it (you stay credited)'], ['', 'View only']] },
      ], { ok: d.published ? 'Save' : 'Publish', submit: x => A.publishDesign(d.id, { caption: x.caption, tags: x.tags, allowRemix: !!x.allowRemix }) });
      if (!out?.id) return; const first = !d.published; d = out; renderOwner(); FT.toast(first ? 'Published. It is on Discover now.' : 'Saved'); if (out.reward) document.dispatchEvent(new CustomEvent('ft:game'));
    }

    /* ───── public / shared ───── */
    function renderPublic() {
      const v = V(), by = d.owner, shared = d.view === 'party' && !d.published;
      root.innerHTML = shell(`
        <div><div class="room-meta"><span class="tag">${esc(E.vocab.GARMENTS[v.spec.garment].label)}</span>${shared ? '<span class="badge gold">Shared with you</span>' : `<span>Published ${App.ago(d.publishedAt)}</span>`}</div>
          <h1 style="margin-top:10px">${esc(d.title)}</h1></div>
        <div class="row-btns compact" style="align-items:center;justify-content:space-between">${App.byline(by, 40)}${d.mine || by.id === A.me()?.id ? '' : `<button class="btn ghost sm" type="button" data-follow="${esc(by.id)}" aria-pressed="false">Follow</button>`}</div>
        ${d.caption ? `<p class="cap">${esc(d.caption)}</p>` : ''}
        ${d.tags.length ? `<div class="chips">${d.tags.map(t => `<a class="tag" href="/discover?q=${enc(t)}">#${esc(t)}</a>`).join('')}</div>` : ''}
        ${credit()}
        ${shared ? '' : `<div class="row-btns compact noprint" style="align-items:center"><button class="likebtn lg" type="button" data-like="${esc(d.id)}" data-name="" aria-pressed="${!!d.liked}" aria-label="${esc(App.likeLabel('', d.likes))}">${App.ICON.heart}<b>${App.count(d.likes)}</b></button><button class="btn ghost sm" type="button" data-save="${esc(d.id)}" aria-pressed="${!!d.saved}">${App.ICON.mark}<span>${d.saved ? 'Saved' : 'Save'}</span></button><button class="btn ghost sm" type="button" data-act="share">${App.ICON.share}Share</button><button class="iconbtn" type="button" data-report="design:${esc(d.id)}" aria-label="Report this design">${App.ICON.flag}</button></div>`}
        ${shared ? '' : `<div class="acts2 noprint"><a class="btn ghost wide" href="/try-on?design=${enc(d.id)}">${App.ICON.tryon || ''}Try it on</a>${d.allowRemix ? `<button class="btn gold wide" type="button" data-act="make">Have this made for me</button><button class="btn ink" type="button" data-act="remix">${App.ICON.remix}Remix it</button>` : ''}${by.designer ? `<a class="btn ghost${d.allowRemix ? '' : ' wide'}" href="/designer?id=${enc(by.id)}#hire">Commission ${esc(by.name.split(' ')[0])}</a>` : ''}</div>
          <p class="muted small" style="margin:-8px 0 0">${d.allowRemix ? `Both make your own copy, credited to ${esc(by.name.split(' ')[0])}. ` : 'The designer has kept this one view-only. '}${estimate(v.spec)}.${d.remixes ? ` Remixed ${App.plural(d.remixes, 'time')}.` : ''}</p>`}
        <div><div class="sec-t"><h2>The details</h2></div>${specSheet(v.spec)}</div>
        <div id="moreBy"></div>`);
      stage();
      if (!shared) A.getDesigner(by.id).then(p => { const b = $('.room-side [data-follow]'); if (b) { b.setAttribute('aria-pressed', !!p.following); b.textContent = p.following ? 'Following' : 'Follow'; } const rest = p.items.filter(x => x.id !== d.id).slice(0, 6); if (rest.length) { $('#moreBy').innerHTML = `<div class="sec-t"><h2>More from ${esc(by.name.split(' ')[0])}</h2><a class="linkbtn" href="/designer?id=${enc(by.id)}">Profile</a></div><div class="strip" style="grid-auto-columns:46%">${rest.map(x => App.dcard(x)).join('')}</div>`; App.hydrate($('#moreBy')); } }).catch(() => {});
    }
    async function remix(thenMake) {
      const u = await Acc.ensure({ title: thenMake ? 'Have it made' : 'Remix this design', message: 'Create a free account. Your own copy goes into your library, ready to change or send to a tailor.' }); if (!u) return;
      try { const nd = await A.remixDesign(d.id); FT.toast(thenMake ? 'Copied to your library. Add your measurements next.' : 'Copied to your library. Make it yours.'); FT.go(`/studio?design=${enc(nd.id)}${thenMake ? '&step=3' : ''}`); } catch (e) { FT.toast(e.message); }
    }

    root.addEventListener('click', async e => {
      const vn = e.target.closest('[data-vn]'); if (vn && d) { shownN = +vn.dataset.vn; renderOwner(); return; }
      const b = e.target.closest('[data-act]'); if (!b || !d) return; const act = b.dataset.act;
      try {
        if (act === 'share') { if (d.view === 'owner' && !d.published) { if (await App.confirm('Publish it to share it', 'A design has a public page once it is published to Discover. Publish it now?', { ok: 'Publish', no: 'Not now' })) publish(); return; } App.share({ title: d.title, text: `“${d.title}” on Fashion Teller`, url: location.origin + '/design?id=' + enc(d.id) }); }
        else if (act === 'print') { mode = 'flat'; flatView = 'front'; await stage(); setTimeout(() => print(), 150); }
        else if (act === 'publish') publish();
        else if (act === 'unpublish') { if (await App.confirm('Take it off Discover?', 'It stays in your library. Likes are kept if you publish it again.', { ok: 'Take it down' })) { d = await A.unpublishDesign(d.id); renderOwner(); FT.toast('Taken down'); } }
        else if (act === 'dup') { const nd = await A.duplicateDesign(d.id); FT.toast(`Copied as “${nd.title}”`); FT.go('/design?id=' + enc(nd.id)); }
        else if (act === 'rename') { const o = await App.ask('Rename design', '', [{ name: 'title', label: 'Title', value: d.title, max: 90 }], { submit: x => A.renameDesign(d.id, x.title) }); if (o?.id) { d = o; renderOwner(); } }
        else if (act === 'restore') { d = await A.restoreVersion(d.id, shownN); shownN = d.current; renderOwner(); FT.toast(`v${shownN} is now the current version`); }
        else if (act === 'delete') { if (await App.confirm('Delete this design?', `“${esc(d.title)}” and its ${App.plural(d.versions.length, 'version')} will be removed.`, { ok: 'Delete', danger: true })) { await A.deleteDesign(d.id); FT.toast('Design deleted'); FT.go('/designs'); } }
        else if (act === 'remix') remix(false);
        else if (act === 'make') remix(true);
      } catch (x) { FT.toast(x.message); }
    });

    async function load() {
      if (!id) { root.innerHTML = `<section class="sec"><div class="wrap">${App.empty(App.ICON.design, 'No design chosen', 'Open one from My studio or Discover.', '<div class="row-btns"><a class="btn ink" href="/designs">My studio</a><a class="btn ghost" href="/discover">Discover</a></div>')}</div></section>`; return; }
      try { d = await A.getDesign(id); } catch (e) {
        root.innerHTML = `<section class="sec"><div class="wrap">${App.empty(App.ICON.lock, e.status === 401 ? 'This design is private' : 'Design not available', e.status === 401 ? 'Sign in if it is yours.' : esc(e.message), `<div class="row-btns">${e.status === 401 ? '<button class="btn gold" type="button" id="rmIn">Sign in</button>' : ''}<a class="btn ghost" href="/discover">Discover</a></div>`)}</div></section>`;
        $('#rmIn')?.addEventListener('click', async () => { if (await Acc.open({})) load(); }); return;
      }
      shownN = d.current; document.title = `${d.title} — Fashion Teller`;
      d.view === 'owner' ? renderOwner() : renderPublic();
    }
    document.addEventListener('ft:auth', load);
    addEventListener('pagehide', () => viewer?.dispose?.());
    load();
  });
})();
