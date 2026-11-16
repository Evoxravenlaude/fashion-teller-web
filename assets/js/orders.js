/** Orders: every order with live tracking; on an order: pay, message the tailor, confirm delivery, report a problem, review. */
(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount, E = window.FTEngine, esc = FT.esc, enc = encodeURIComponent;
    const root = $('#oRoot');
    const u = await Acc.require(root, { title: 'Sign in to see your orders', message: 'Track production from the tailor’s table to your door.' }); if (!u) return;
    const id = new URLSearchParams(location.search).get('id');
    let orders = [], order = null, timer = null;
    const DONE = ['completed', 'cancelled'];
    const trk = o => `<div class="mini-trk" role="img" aria-label="${esc(App.phaseLabel(o.phase))}">${App.PHASES.map((p, i) => `<i class="${i < A.phaseIndex(o.phase) || o.phase === 'delivered' ? 'done' : i === A.phaseIndex(o.phase) ? 'now' : ''}"></i>`).join('')}</div>`;
    const PHOTO = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;

    /* ───── list ───── */
    async function loadList() {
      try { orders = await A.listOrders(); } catch (e) { root.innerHTML = `<p class="err">${esc(e.message)}</p>`; return; }
      const active = orders.filter(o => ['active', 'balance_due', 'awaiting_payment', 'delivered'].includes(o.status)).length;
      $('#oCount').textContent = orders.length ? `${App.plural(orders.length, 'order')} · ${active} in progress` : 'Nothing ordered yet.';
      if (!orders.length) { root.innerHTML = App.empty(App.ICON.order, 'No orders yet', 'Open a design, add your measurements and choose a tailor. Your order shows up here with live tracking.', '<div class="row-btns"><a class="btn gold" href="/designs">My designs</a><a class="btn ghost" href="/studio">Open studio</a></div>'); return; }
      root.innerHTML = `<h2 class="sr">Your orders</h2><div class="cards">${orders.map(o => { const act = o.status === 'awaiting_payment' ? [`/studio?order=${enc(o.id)}`, 'Pay now'] : o.status === 'balance_due' ? [`/studio?order=${enc(o.id)}&pay=1`, 'Pay balance'] : o.status === 'delivered' ? [`/orders?id=${enc(o.id)}`, 'Confirm delivery'] : [`/orders?id=${enc(o.id)}`, DONE.includes(o.status) ? 'View' : 'Track']; return `<article class="card order"><a class="card-link" href="/orders?id=${enc(o.id)}" aria-label="Open order ${esc(o.id)}">${o.design ? App.thumb(o.design) : '<div class="thumb"></div>'}</a><div class="card-body">
        <div class="card-top"><h3>${esc(o.design?.title || 'Design')}</h3>${App.badge(o.status)}</div>
        <p class="muted small">${esc(o.id)} · ${App.avatar(o.vendor, 22)} ${esc(o.vendor?.name || '')}</p>
        ${trk(o)}
        <p class="meta">${o.issue?.status === 'open' ? 'Problem reported: on hold' : esc(App.phaseLabel(o.phase))}${o.eta && o.status === 'active' ? ` · expected ${App.date(o.eta)}` : ''}</p>
        <div class="card-foot"><strong>${FT.money(o.total)}</strong><a class="btn ${['awaiting_payment', 'balance_due', 'delivered'].includes(o.status) ? 'gold' : 'ink'} sm" href="${act[0]}">${act[1]}</a></div>
      </div></article>`; }).join('')}</div>`;
    }

    /* ───── detail ───── */
    async function loadDetail() {
      try { order = await A.getOrder(id); } catch (e) { root.innerHTML = App.empty(App.ICON.order, 'Order not found', esc(e.message), '<a class="btn ghost" href="/orders">All orders</a>'); return; }
      renderDetail();
      clearInterval(timer); if (!DONE.includes(order.status)) timer = setInterval(async () => { if (document.hidden) return; try { const o = await A.getOrder(id); if (o.events.length !== order.events.length || o.status !== order.status || o.issue?.status !== order.issue?.status) { order = o; renderDetail(); } if (DONE.includes(o.status)) clearInterval(timer); } catch {} }, A.pollMs);
    }
    function renderDetail() {
      const o = order, p = A.phaseIndex(o.phase), v = o.design && App.version(o.design, o.versionN), mine = o.userId === u.id, vn = esc(o.vendor?.name || 'the tailor');
      $('#oTitle').textContent = o.design?.title || 'Order'; $('#oCount').innerHTML = `${esc(o.id)} · placed ${App.date(o.createdAt)} · ${App.badge(o.status)}`;
      const canCancel = mine && ['awaiting_payment', 'active'].includes(o.status) && !['tailoring', 'delivered'].includes(o.phase);
      $('#oActions').innerHTML = `<a class="btn ghost" href="/orders">All orders</a>${mine && o.status === 'awaiting_payment' ? `<a class="btn gold" href="/studio?order=${enc(o.id)}">Pay now</a>` : mine && o.status === 'balance_due' ? `<a class="btn gold" href="/studio?order=${enc(o.id)}&pay=1">Pay balance ${FT.money(o.balance)}</a>` : ''}`;
      const next = !mine ? '' : o.issue?.status === 'open' ? `<div class="notice warn"><b>You reported a problem: ${esc(o.issue.reason)}.</b> ${esc(o.issue.body)}<br>The payment stays on hold while Fashion Teller looks into it. We will message you here.</div>`
        : o.status === 'delivered' ? `<div class="notice gold"><b>Has it arrived?</b> Confirm you have it and ${FT.money(o.paid)} is released to ${vn}. If something is wrong, report a problem instead and the payment stays on hold.<div class="row-btns"><button class="btn gold sm" type="button" data-act="confirm">I have it: release payment</button><button class="btn ghost sm" type="button" data-act="problem">Report a problem</button></div></div>`
        : o.status === 'balance_due' ? `<div class="notice gold"><b>Delivered. The balance of ${FT.money(o.balance)} is due.</b><div class="row-btns"><a class="btn gold sm" href="/studio?order=${enc(o.id)}&pay=1">Pay balance</a><button class="btn ghost sm" type="button" data-act="problem">Report a problem</button></div></div>`
        : o.status === 'completed' && !o.review ? `<div class="notice ok"><b>Enjoy wearing it.</b> How did ${vn} do? Reviews help other customers choose.<div class="row-btns"><button class="btn ink sm" type="button" data-act="review">Leave a review</button></div></div>` : '';
      root.innerHTML = `${next}<div class="odetail">
        <div class="ocol">
          <div class="oart">${v ? App.art(v.spec) : ''}<span class="st-badge" style="opacity:1;transform:none">Design <b>v${o.versionN}</b></span></div>
          <dl class="summary"><dt>Tailor</dt><dd>${esc(o.vendor?.name || '')}</dd><dt>City</dt><dd>${esc(o.vendor?.city || '')}</dd><dt>Delivery</dt><dd>${o.deliveryDays ? App.plural(o.deliveryDays, 'day') : '—'}</dd><dt>Measurements</dt><dd>${esc(o.measurement?.label || '—')}</dd><dt>Total</dt><dd>${FT.money(o.total)}</dd><dt>Paid</dt><dd>${FT.money(o.paid)}</dd>${o.balance > 0 && o.status !== 'cancelled' ? `<dt>Balance</dt><dd>${FT.money(o.balance)} ${o.status === 'balance_due' ? 'due now' : 'on delivery'}</dd>` : ''}</dl>
          ${v ? `<div class="chips">${E.summary(v.spec).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
          ${v?.spec.notes?.length ? `<p class="small muted">Notes for the tailor: ${v.spec.notes.map(esc).join('; ')}</p>` : ''}
          <div class="row-btns">${o.design && mine ? `<a class="btn ghost" href="/design?id=${enc(o.design.id)}">Open the design</a>` : ''}${mine && o.status !== 'awaiting_payment' && o.status !== 'cancelled' ? `<button class="btn ink" type="button" data-msg="order:${esc(o.id)}">Message ${esc((o.vendor?.name || 'tailor').split(' ')[0])}</button>` : ''}</div>
          ${o.review ? `<div class="revbox"><p class="kicker" style="margin:0">Your review</p>${App.stars(o.review.rating, 18)}${o.review.text ? `<p>“${esc(o.review.text)}”</p>` : ''}</div>` : ''}
        </div>
        <div class="ocol">
          <h2 class="h3" style="margin-bottom:18px">${o.status === 'cancelled' ? 'Order cancelled' : o.status === 'completed' ? 'Delivered and confirmed' : p >= 3 ? 'Delivered to your door' : o.status === 'awaiting_payment' ? 'Waiting for payment' : 'Production is under way'}</h2>
          <ol class="trk-v">${App.PHASES.map(([, t, d], i) => `<li class="${i < p || (i === p && p === 3) ? 'done' : i === p ? 'now' : ''}"><span class="dot"><i></i></span><div><h3>${t}</h3><p>${d}</p></div></li>`).join('')}</ol>
          <h3 class="h4" style="margin-top:28px">Updates</h3>
          <ol class="feed">${[...o.events].reverse().map(e => `<li><span class="when">${App.date(e.at, { time: true })}</span><b>${esc(e.title)}</b>${e.body ? `<p>${esc(e.body)}</p>` : ''}${e.photos?.length ? `<div class="photos">${e.photos.filter(x => PHOTO.test(x)).map(x => `<button type="button" data-photo aria-label="Open photo"><img src="${x}" alt="Photo from the tailor" loading="lazy"></button>`).join('')}</div>` : ''}</li>`).join('')}</ol>
          <div class="row-btns" style="margin-top:8px">${canCancel ? '<button class="btn ghost" type="button" data-act="cancel">Cancel order</button>' : ''}${mine && o.status === 'active' && !o.issue ? '<button class="btn ghost" type="button" data-act="problem">Report a problem</button>' : ''}</div>
        </div>
      </div>`;
    }
    root.addEventListener('click', async e => {
      const ph = e.target.closest('[data-photo]'); if (ph) { const src = $('img', ph).src; if (PHOTO.test(src)) App.sheet(`<h3>From the tailor</h3><div class="lightbox"><img src="${src}" alt="Photo from the tailor"></div>`, { wide: true }); return; }
      const b = e.target.closest('[data-act]'); if (!b || !order) return; const o = order, act = b.dataset.act;
      try {
        if (act === 'cancel') { if (await App.confirm('Cancel this order?', o.paid ? `${FT.money(o.paid)} will be refunded to your payment method.` : 'No payment has been taken.', { ok: 'Cancel order', danger: true })) { order = await A.cancelOrder(o.id); renderDetail(); FT.toast('Order cancelled'); } }
        else if (act === 'confirm') { if (await App.confirm('You have the garment?', `Confirming releases ${FT.money(o.paid)} to ${esc(o.vendor?.name || 'the tailor')}. This cannot be undone.`, { ok: 'Yes, release payment', no: 'Not yet' })) { order = await A.confirmDelivery(o.id); renderDetail(); FT.toast('Thank you. Enjoy wearing it.'); } }
        else if (act === 'problem') { const r = await App.ask('Report a problem', 'The payment stays on hold while a person at Fashion Teller looks into it.', [{ name: 'reason', label: 'What went wrong?', type: 'select', options: ['It has not arrived', 'It does not fit', 'Wrong fabric or colour', 'Poor finishing', 'Not what I designed', 'Something else'] }, { name: 'body', label: 'Tell us what happened', type: 'textarea', max: 1000, placeholder: 'What you expected, what you got, and what would put it right.' }], { ok: 'Send report', submit: d => A.reportProblem(o.id, d) }); if (r?.id) { order = r; renderDetail(); FT.toast('Reported. We will be in touch.'); } }
        else if (act === 'review') { const r = await App.review('order', o.id, o.vendor?.name || 'the tailor'); if (r) { FT.toast('Thank you for the review'); loadDetail(); } }
      } catch (x) { FT.toast(x.message); }
    });
    if (id) loadDetail(); else { loadList(); let t = null; A.onChange(() => { clearTimeout(t); t = setTimeout(loadList, 400); }); }
  });
})();
