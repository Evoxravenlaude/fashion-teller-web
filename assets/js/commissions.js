/**
 * Commissions: where a customer and a designer work together.
 * brief → offer → pay (held) → design delivered → changes or approve → the design is the customer's.
 * One page serves both sides; what you can do depends on your role in the commission and its status.
 */
(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $, $$ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount, E = window.FTEngine, esc = FT.esc, enc = encodeURIComponent;
    const root = $('#cRoot');
    const u = await Acc.require(root, { title: 'Sign in to see your commissions', message: 'Briefs you sent to designers, and briefs clients sent to you.' }); if (!u) return;
    const id = new URLSearchParams(location.search).get('id');
    let c = null, timer = null, filter = 'all';
    const first = p => (p?.name || '').split(' ')[0];
    const STEPS = [['requested', 'Brief'], ['offered', 'Offer'], ['active', 'Design'], ['delivered', 'Review'], ['approved', 'Done']];
    const stepIndex = s => ({ requested: 0, offered: 1, active: 2, changes: 2, delivered: 3, approved: 4 })[s] ?? -1;

    /* ───── list ───── */
    async function loadList() {
      let list; try { list = await A.listCommissions(); } catch (e) { root.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
      const mineAsDesigner = list.filter(x => x.role === 'designer'), waiting = list.filter(x => (x.role === 'client' && ['offered', 'delivered'].includes(x.status)) || (x.role === 'designer' && ['requested', 'active', 'changes'].includes(x.status))).length;
      $('#cSub').textContent = list.length ? `${App.plural(list.length, 'commission')}${waiting ? ` · ${waiting} waiting on you` : ''}` : 'Designs made for you by a designer, and designs you are making for clients.';
      if (!list.length) { root.innerHTML = App.empty(App.ICON.spark, 'No commissions yet', u.designer ? 'When a client sends you a brief it shows up here. You can also hire another designer yourself.' : 'Hire a designer to design something for you: send a brief, get an offer, and the finished design lands in your library.', `<div class="row-btns"><a class="btn gold" href="/designers">Find a designer</a>${u.designer ? '' : '<a class="btn ghost" href="/account#designer">Take commissions yourself</a>'}</div>`); return; }
      const shown = list.filter(x => filter === 'all' || x.role === filter);
      root.innerHTML = `${mineAsDesigner.length && mineAsDesigner.length !== list.length ? `<div class="filters"><div class="seg" id="cSeg" role="group" aria-label="Show"><button type="button" data-v="all" aria-pressed="${filter === 'all'}">All</button><button type="button" data-v="client" aria-pressed="${filter === 'client'}">I commissioned</button><button type="button" data-v="designer" aria-pressed="${filter === 'designer'}">For my clients</button></div></div>` : ''}
        <h2 class="sr">Your commissions</h2><div class="crows">${shown.map(x => { const other = x.role === 'client' ? x.designer : x.client; return `<a class="crow" href="/commissions?id=${enc(x.id)}">${App.avatar(other, 44)}<div style="min-width:0"><h3>${esc(x.title)}</h3><p>${x.role === 'client' ? 'Designer' : 'Client'}: ${esc(other.name)} · ${x.offer ? FT.money(x.offer.fee) : x.budget ? 'budget ' + FT.money(x.budget) : 'no budget set'}</p></div><div class="end">${App.badge(x.status, App.CSTATUS)}<span>${App.ago(x.updatedAt)}</span></div></a>`; }).join('')}</div>`;
      const seg = $('#cSeg'); if (seg) FT.seg(seg, v => { filter = v; loadList(); });
    }

    /* ───── detail ───── */
    const WAITING = { client: ['requested', 'active', 'changes'], designer: ['offered', 'delivered'] };
    async function loadDetail(quiet = false) {
      let next; try { next = await A.getCommission(id); } catch (e) { if (!quiet) root.innerHTML = App.empty(App.ICON.spark, 'Commission not found', esc(e.message), '<a class="btn ghost" href="/commissions">All commissions</a>'); return; }
      if (quiet && c && next.status === c.status && next.updatedAt === c.updatedAt) return;
      if (quiet && document.activeElement && root.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      const was = c?.status; c = next; render();
      if (quiet && was && was !== c.status) FT.toast(App.CSTATUS[c.status]?.[0] || c.status);
      clearInterval(timer); if (WAITING[c.role]?.includes(c.status)) timer = setInterval(() => { if (!document.hidden) loadDetail(true); }, A.pollMs * 2);
    }
    function actionBox() {
      const me = c.role, d = c.designer, cl = c.client, o = c.offer, left = c.maxRevisions - c.revisions;
      const chat = `<button class="btn ghost${me === 'client' && ['offered', 'delivered'].includes(c.status) ? '' : ' light'}" type="button" data-msg="commission:${esc(c.id)}">Open conversation</button>`;
      if (c.status === 'cancelled') return `<div class="cbox"><h2>Cancelled</h2><p class="muted">${c.paidAt ? 'The payment was refunded.' : 'Nothing was paid.'}</p></div>`;
      if (c.status === 'declined') return `<div class="cbox"><h2>${me === 'client' ? `${esc(first(d))} could not take this on` : 'You declined this request'}</h2>${me === 'client' ? '<p class="muted">Nothing was paid. Other designers are open to commissions.</p><div class="row-btns"><a class="btn ink" href="/designers">Find another designer</a></div>' : ''}</div>`;
      if (me === 'client') {
        if (c.status === 'requested') return `<div class="cbox dark"><h2>Waiting for ${esc(first(d))}’s offer</h2><p class="muted">Designers usually answer within a day${A.local ? ' (a few seconds for sample designers here)' : ''}. Nothing is paid until you accept.</p><div class="row-btns">${chat}<button class="btn ghost light" type="button" data-act="cancel">Cancel request</button></div></div>`;
        if (c.status === 'offered') return `<div class="cbox"><p class="kicker">${esc(first(d))}’s offer</p><p class="big">${FT.money(o.fee)}</p><p>Delivered within ${App.plural(o.days, 'day')} of payment · ${App.plural(c.maxRevisions, 'round')} of changes included</p>${o.note ? `<p class="muted">“${esc(o.note)}”</p>` : ''}<p class="muted small">Your payment is held by Fashion Teller and released to ${esc(first(d))} only when you approve the design.</p><div class="row-btns"><button class="btn gold" type="button" data-act="pay">Accept and pay ${FT.money(o.fee)}</button></div><div class="row-btns">${chat}<button class="btn ghost" type="button" data-act="cancel">Decline</button></div></div>`;
        if (c.status === 'active' || c.status === 'changes') return `<div class="cbox dark"><h2>${c.status === 'changes' ? `${esc(first(d))} is making your changes` : `${esc(first(d))} is designing`}</h2><p class="muted">${FT.money(c.paid)} is held safely. ${c.status === 'active' && c.paidAt ? `Due by ${App.date(new Date(c.paidAt).getTime() + o.days * 86400000)}.` : ''}</p><div class="row-btns">${chat}${c.deliveries.length ? '' : '<button class="btn ghost light" type="button" data-act="cancel">Cancel and refund</button>'}</div></div>`;
        if (c.status === 'delivered') return `<div class="cbox"><p class="kicker">Ready to review</p><h2>Is this the one?</h2><p class="muted">Approve it and the design is copied into your library, credited to ${esc(first(d))}, and ${FT.money(c.paid)} is released to them. ${left > 0 ? `You have ${App.plural(left, 'round')} of changes left.` : 'Both rounds of changes are used.'}</p><div class="row-btns"><button class="btn gold" type="button" data-act="approve">Approve the design</button></div><div class="row-btns">${left > 0 ? '<button class="btn ghost" type="button" data-act="changes">Ask for changes</button>' : ''}${chat}</div></div>`;
        if (c.status === 'approved') return `<div class="cbox dark"><p class="kicker" style="color:var(--gold)">Done</p><h2>It is yours</h2><p class="muted">The design is in your library, credited to ${esc(d.name)}.</p><div class="row-btns">${c.result ? `<a class="btn gold" href="/studio?design=${enc(c.result.id)}&step=3">Have it made</a><a class="btn ghost light" href="/design?id=${enc(c.result.id)}">Open the design</a>` : ''}</div>${c.review ? '' : `<div class="row-btns"><button class="btn ghost light" type="button" data-act="review">Review ${esc(first(d))}</button></div>`}</div>`;
      } else {
        if (c.status === 'requested' || c.status === 'offered') return `<div class="cbox"><p class="kicker">${c.status === 'offered' ? 'Your offer is with the client' : 'Make an offer'}</p><form class="form two" id="offerForm" novalidate><div class="field"><label for="of-fee">Your fee (₦)</label><input id="of-fee" name="fee" type="number" inputmode="numeric" min="1000" step="500" value="${o?.fee ?? (c.budget || d.feeFrom || '')}"><small class="tip" data-fee></small></div><div class="field"><label for="of-days">Delivery (days)</label><input id="of-days" name="days" type="number" inputmode="numeric" min="1" max="60" value="${o?.days ?? d.turnaroundDays ?? 3}"></div><div class="field full"><label for="of-note">Note to the client</label><input id="of-note" name="note" maxlength="400" value="${esc(o?.note || '')}" placeholder="What they get, and anything you need from them"></div><p class="err full" role="alert"></p><div class="full row-btns"><button class="btn ink" type="submit">${c.status === 'offered' ? 'Update offer' : 'Send offer'}</button><button class="btn ghost" type="button" data-act="decline">Decline</button></div></form><p class="muted small">${c.budget ? `The client’s budget is ${FT.money(c.budget)}. ` : ''}You are paid when the client approves the design. ${App.plural(c.maxRevisions, 'round')} of changes are included.</p><div class="row-btns">${chat.replace(' light', '')}</div></div>`;
        if (c.status === 'active' || c.status === 'changes') return `<div class="cbox dark"><p class="kicker" style="color:var(--gold)">${c.status === 'changes' ? `Changes requested (${c.revisions} of ${c.maxRevisions})` : 'Paid. Over to you.'}</p><h2>${c.status === 'changes' ? 'Deliver the revised design' : `Design it for ${esc(first(cl))}`}</h2>${c.changeNote ? `<p>“${esc(c.changeNote)}”</p>` : ''}<p class="muted">${FT.money(c.paid)} is held and released to you on approval.${c.paidAt && c.status === 'active' ? ` Due by ${App.date(new Date(c.paidAt).getTime() + o.days * 86400000)}.` : ''}</p><div class="row-btns"><button class="btn gold" type="button" data-act="deliver">Deliver a design</button><a class="btn ghost light" href="/studio">Open the studio</a></div><div class="row-btns">${chat}</div></div>`;
        if (c.status === 'delivered') return `<div class="cbox dark"><h2>Delivered. Waiting for ${esc(first(cl))}</h2><p class="muted">They can approve it or ask for changes (${c.maxRevisions - c.revisions} left).</p><div class="row-btns">${chat}</div></div>`;
        if (c.status === 'approved') return `<div class="cbox dark"><p class="kicker" style="color:var(--gold)">Approved</p><p class="big">${FT.money(c.paid)}</p><p class="muted">Released to you. ${esc(first(cl))} now owns a copy of the design, credited to you.</p>${c.review ? `<div>${App.stars(c.review.rating, 16)}${c.review.text ? `<p style="margin-top:6px">“${esc(c.review.text)}”</p>` : ''}</div>` : ''}<div class="row-btns">${chat}</div></div>`;
      }
      return '';
    }
    function render() {
      const other = c.role === 'client' ? c.designer : c.client, si = stepIndex(c.status), dl = c.delivery;
      $('#cTitle').textContent = c.title;
      $('#cSub').innerHTML = `${c.role === 'client' ? 'Designer' : 'Client'}: <a href="/designer?id=${enc(other.id)}"><b>${esc(other.name)}</b></a> · ${App.badge(c.status, App.CSTATUS)} · started ${App.date(c.createdAt)}`;
      $('#cActions').innerHTML = '<a class="btn ghost" href="/commissions">All commissions</a>';
      root.innerHTML = `${si >= 0 ? `<ol class="steps" style="margin-bottom:30px">${STEPS.map(([, l], i) => `<li class="${i < si || c.status === 'approved' ? 'done' : i === si ? 'now' : ''}"><span>${l}</span></li>`).join('')}</ol>` : ''}
        <div class="cdetail">
          <div class="ocol">
            ${dl ? `<div class="cbox"><div class="sec-t"><h2>${c.deliveries.length > 1 ? `Delivery ${c.deliveries.length}` : 'The design'}</h2><span class="muted small">${App.ago(dl.at)}</span></div><div class="deliv">${dl.design ? `<a class="art" href="/design?id=${enc(dl.design.id)}" aria-label="Open the design">${App.art(dl.design.spec, { crop: 'template' })}</a>` : '<div class="art"></div>'}<div style="display:flex;flex-direction:column;gap:10px;min-width:0">${dl.note ? `<p>${esc(dl.note)}</p>` : ''}${dl.design ? `<div class="chips">${E.summary(dl.design.spec).slice(0, 5).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div><a class="linkbtn" href="/design?id=${enc(c.role === 'client' && c.result ? c.result.id : dl.design.id)}">${App.ICON.cube}See it in 3D</a>` : '<p class="muted">This design is no longer available.</p>'}</div></div></div>` : ''}
            <div class="cbox"><h2>The brief</h2><p class="brief">${esc(c.brief)}</p><dl class="specs">${c.garment ? `<dt>Style</dt><dd>${esc(E.vocab.GARMENTS[c.garment]?.label || c.garment)}</dd>` : ''}${c.occasion ? `<dt>Occasion</dt><dd>${esc(c.occasion)}</dd>` : ''}<dt>Budget</dt><dd>${c.budget ? FT.money(c.budget) : 'Open'}</dd>${c.deadline ? `<dt>Needed by</dt><dd>${App.date(c.deadline)}</dd>` : ''}</dl>${c.reference ? `<a class="credit" href="/design?id=${enc(c.reference.id)}"><span class="tile-art" style="width:44px;height:60px;flex:none">${App.art(c.reference.spec, { crop: 'template' })}</span><span>Starting point: <b>${esc(c.reference.title)}</b></span></a>` : ''}</div>
            ${c.deliveries.length > 1 ? `<div class="cbox"><h2>Earlier deliveries</h2><ol class="feed compact">${c.deliveries.slice(0, -1).reverse().map((x, i) => `<li><span class="when">${App.date(x.at, { time: true })}</span><b>Delivery ${c.deliveries.length - 1 - i}</b>${x.note ? `<p>${esc(x.note)}</p>` : ''}</li>`).join('')}</ol></div>` : ''}
          </div>
          <div class="ocol">${actionBox()}<p class="muted small"><button class="linkbtn" type="button" data-report="user:${esc(other.id)}">${App.ICON.flag}Report a problem with this ${c.role === 'client' ? 'designer' : 'client'}</button></p></div>
        </div>`;
      App.feeHints(root);
      $('#offerForm')?.addEventListener('submit', async e => { e.preventDefault(); const f = e.target, v = Object.fromEntries(new FormData(f)), btn = $('button[type="submit"]', f); btn.disabled = true; $('.err', f).textContent = ''; try { c = await A.offerCommission(c.id, { fee: v.fee, days: v.days, note: v.note }); FT.toast('Offer sent'); render(); } catch (x) { $('.err', f).textContent = x.message; btn.disabled = false; } });
    }
    async function deliver() {
      let mine = []; try { mine = (await A.listDesigns()).filter(d => !d.commissionOf); } catch {}
      if (!mine.length) { if (await App.confirm('Design it first', 'Create the design in the studio and save it. Then come back here to deliver it.', { ok: 'Open the studio', no: 'Later' })) FT.go('/studio'); return; }
      let pick = mine[0].id, done = false;
      const s = App.sheet(`<h3>Deliver a design</h3><p class="muted">Choose the design to send to ${esc(first(c.client))}. They see it in 3D and can approve it or ask for changes.</p><div class="pick">${mine.slice(0, 40).map(d => `<button type="button" data-pick="${esc(d.id)}" aria-pressed="${d.id === pick}"><span class="tile-art">${App.art(App.version(d).spec, { crop: 'template' })}</span>${esc(d.title)}</button>`).join('')}</div><div class="field" style="margin-top:14px"><label for="dl-note">Note to the client</label><textarea id="dl-note" maxlength="600" rows="3" placeholder="Why you made these choices, and what to look at"></textarea></div><p class="err" role="alert"></p><div class="row-btns"><a class="btn ghost" href="/studio">Design a new one</a><button class="btn ink" type="button" data-send>Deliver</button></div>`, { wide: true });
      s.addEventListener('click', async e => {
        const p = e.target.closest('[data-pick]'); if (p) { pick = p.dataset.pick; $$('[data-pick]', s).forEach(x => x.setAttribute('aria-pressed', x === p)); return; }
        if (!e.target.closest('[data-send]') || done) return; const btn = $('[data-send]', s); btn.disabled = true;
        try { c = await A.deliverCommission(c.id, { designId: pick, note: $('#dl-note', s).value }); done = true; App.closeSheet(); FT.toast('Delivered'); render(); } catch (x) { $('.err', s).textContent = x.message; btn.disabled = false; }
      });
    }
    root.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b || !c || b.disabled) return; const act = b.dataset.act;
      try {
        if (act === 'pay') { const r = await App.checkout({ title: `Pay ${first(c.designer)}`, amount: c.offer.fee, lines: [['Commission', c.title], ['Designer', c.designer.name], ['Delivery', App.plural(c.offer.days, 'day')]], note: 'Held by Fashion Teller and released when you approve the design. If the designer does not deliver, you are refunded.', paystackTarget: { commissionId: c.id }, pay: p => A.payCommission(c.id, p) }); if (r) { c = r.commission; render(); FT.toast(`Paid. ${first(c.designer)} is starting.`); loadDetail(); } }
        else if (act === 'cancel') { if (await App.confirm(c.status === 'offered' ? 'Decline this offer?' : 'Cancel this commission?', c.paid ? `${FT.money(c.paid)} will be refunded to you.` : 'Nothing has been paid.', { ok: c.status === 'offered' ? 'Decline offer' : 'Cancel it', danger: true })) { c = await A.cancelCommission(c.id); render(); FT.toast('Cancelled'); } }
        else if (act === 'approve') { if (await App.confirm('Approve this design?', `It is copied into your library and ${FT.money(c.paid)} is released to ${esc(c.designer.name)}. This cannot be undone.`, { ok: 'Approve', no: 'Not yet' })) { const r = await A.approveCommission(c.id); c = r.commission; render(); FT.toast('Approved. The design is in your library.'); document.dispatchEvent(new CustomEvent('ft:game')); } }
        else if (act === 'changes') { const r = await App.ask('Ask for changes', `Say what you would like different. ${App.plural(c.maxRevisions - c.revisions, 'round')} left.`, [{ name: 'note', label: 'What should change?', type: 'textarea', max: 600, placeholder: 'Shorter sleeves, a deeper green, less embroidery at the hem…' }], { ok: 'Send', submit: v => A.requestChanges(c.id, v.note) }); if (r?.id) { c = r; render(); FT.toast('Sent to the designer'); loadDetail(); } }
        else if (act === 'review') { const r = await App.review('commission', c.id, first(c.designer)); if (r) { FT.toast('Thank you for the review'); loadDetail(); } }
        else if (act === 'decline') { const r = await App.ask('Decline this request?', 'The client is told you cannot take it on.', [{ name: 'reason', label: 'A word for the client', optional: true, max: 200, placeholder: 'Fully booked this month' }], { ok: 'Decline', submit: v => A.declineCommission(c.id, v.reason) }); if (r?.id) { c = r; render(); } }
        else if (act === 'deliver') deliver();
      } catch (x) { FT.toast(x.message); }
    });
    if (id) loadDetail(); else { loadList(); let t = null; A.onChange(() => { clearTimeout(t); t = setTimeout(loadList, 400); }); }
  });
})();
