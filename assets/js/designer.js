/** A designer's public profile: who they are, what they have published, reviews, follow, message, and "commission me". */
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const { $ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount, E = window.FTEngine, esc = FT.esc;
    const root = $('#pfRoot'), key = new URLSearchParams(location.search).get('id') || '';
    let p = null;
    async function load() {
      try { p = await A.getDesigner(key); } catch (e) { root.innerHTML = `<section class="sec"><div class="wrap">${App.empty(App.ICON.people, 'Profile not found', esc(e.message), '<a class="btn ghost" href="/designers">All designers</a>')}</div></section>`; return; }
      document.title = `${p.name} — Fashion Teller`;
      const first = p.name.split(' ')[0];
      root.innerHTML = `<header class="phead" style="--h:${Number(p.hue) || 40}"><div class="wrap">
          ${App.avatar(p, 96)}
          <div><h1>${esc(p.name)}</h1><p class="sub">${p.handle ? '@' + esc(p.handle) + ' · ' : ''}${esc([p.city, p.country].filter(Boolean).join(', '))}${p.isDesigner ? '' : ' · Member'}</p>
            ${p.bio ? `<p class="bio">${esc(p.bio)}</p>` : ''}
            ${p.specialties.length ? `<div class="chips" style="margin-top:12px">${p.specialties.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>` : ''}
            <ul class="pstats"><li><b id="pfFol">${App.count(p.followers)}</b>followers</li><li><b>${p.designs}</b>published</li>${p.isDesigner ? `<li><b>${p.completed || 0}</b>commissions</li><li><b>${p.rating ? p.rating.toFixed(1) + ' ★' : 'New'}</b>${App.plural(p.reviews || 0, 'review')}</li>` : ''}</ul></div>
          <div class="acts">${p.mine ? '<a class="btn ink" href="/account#designer">Edit profile</a><a class="btn ghost" href="/commissions">My commissions</a>' : `<button class="btn ${p.following ? 'ghost' : 'ink'}" type="button" data-follow="${esc(p.id)}" aria-pressed="${!!p.following}">${p.following ? 'Following' : 'Follow'}</button>${p.isDesigner ? `<button class="btn ghost" type="button" data-msg="${esc(p.id)}">Message</button>` : ''}<button class="iconbtn" type="button" data-report="user:${esc(p.id)}" aria-label="Report this profile">${App.ICON.flag}</button>`}</div>
        </div></header>
        <section class="sec tight"><div class="wrap">
          ${p.isDesigner && !p.mine ? `<div class="hirebox"><div><h2>${p.open ? `Commission ${esc(first)}` : `${esc(first)} is booked right now`}</h2><p>${p.open ? `From ${FT.money(p.feeFrom)} · usually delivers in ${App.plural(p.turnaroundDays, 'day')} · two rounds of changes included. You pay only when you accept the offer.` : 'Follow to see new work, and check back for commissions.'}</p></div>${p.open ? '<button class="btn gold" type="button" id="hireBtn">Start a commission</button>' : ''}</div>` : ''}
          <div class="sec-t"><h2>${p.mine ? 'Your published designs' : 'Published designs'}</h2>${p.mine ? '<a class="linkbtn" href="/designs">Publish from My studio</a>' : ''}</div>
          ${p.items.length ? `<div class="feed-grid">${p.items.map(d => App.dcard(d)).join('')}</div>` : App.empty(App.ICON.design, 'Nothing published yet', p.mine ? 'Open a design and publish it. It shows here and on Discover.' : `${esc(first)} has not published a design yet.`, p.mine ? '<a class="btn gold" href="/designs">Go to My studio</a>' : '')}
          ${p.isDesigner ? `<div class="sec-t" style="margin-top:48px"><h2>Reviews</h2><span class="muted small">${p.rating ? `${p.rating.toFixed(1)} from ${App.plural(p.reviews, 'review')}` : ''}</span></div>${App.reviews(p.reviewList)}` : ''}
        </div></section>`;
      App.hydrate(root);
      $('#hireBtn')?.addEventListener('click', hire);
      if (location.hash === '#hire' && p.isDesigner && p.open && !p.mine) hire();
    }
    async function hire() {
      const u = await Acc.ensure({ title: `Commission ${p.name.split(' ')[0]}`, message: 'Create a free account to send your brief. You pay only when you accept the offer.' }); if (!u) return;
      if (u.id === p.id) return;
      let mine = []; try { mine = await A.listDesigns(); } catch {}
      const out = await App.ask(`Commission ${p.name.split(' ')[0]}`, `From ${FT.money(p.feeFrom)}. ${esc(p.name.split(' ')[0])} replies with a fee and a delivery time; nothing is paid until you accept.`, [
        { name: 'title', label: 'What is it?', placeholder: 'Kaftan for my father’s 70th', max: 90 },
        { name: 'brief', label: 'The brief', type: 'textarea', max: 2000, placeholder: 'Who it is for, the occasion, colours and fabrics you like, anything to avoid…', hint: 'The more they know, the closer the first design.' },
        { name: 'garment', label: 'Style', type: 'select', options: [['', 'Not sure, suggest one'], ...E.OPTIONS.garment] },
        { name: 'occasion', label: 'Occasion', optional: true, max: 60, placeholder: 'Wedding, work, birthday…' },
        { name: 'budget', label: 'Design budget (₦)', type: 'number', optional: true, min: 1000, step: 1000, placeholder: String(p.feeFrom), hint: 'For the design only. Making it is quoted separately by tailors.' },
        { name: 'deadline', label: 'Needed by', type: 'date', optional: true, min: new Date().toISOString().slice(0, 10) },
        ...(mine.length ? [{ name: 'refDesignId', label: 'Start from one of my designs', type: 'select', optional: true, options: [['', 'No, start fresh'], ...mine.slice(0, 30).map(d => [d.id, d.title])] }] : []),
      ], { ok: 'Send request', submit: d => A.requestCommission(p.id, { ...d, budget: Number(d.budget) || 0, deadline: d.deadline || null, refDesignId: d.refDesignId || null }) });
      if (out?.id) { FT.toast('Request sent'); FT.go('/commissions?id=' + encodeURIComponent(out.id)); }
    }
    document.addEventListener('ft:follow', e => { if (p && e.detail.id === p.id) { const n = $('#pfFol'); if (n) n.textContent = App.count(e.detail.followers); const b = $('.phead [data-follow]'); if (b) { b.classList.toggle('ink', !e.detail.following); b.classList.toggle('ghost', e.detail.following); } } });
    document.addEventListener('ft:auth', load);
    load();
  });
})();
