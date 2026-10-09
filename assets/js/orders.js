(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $, $$ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount;
    const root = $('#oRoot');
    const u = await Acc.require(root, { title: 'Sign in to see your orders', message: 'Track production from concept to your door.' }); if (!u) return;
    const id = new URLSearchParams(location.search).get('id');
    let orders = [], order = null, timer = null;

    /* ───── list ───── */
    async function loadList() {
      try { orders = await A.listOrders(); } catch (e) { root.innerHTML = `<p class="err">${FT.esc(e.message)}</p>`; return; }
      const active = orders.filter(o => ['active', 'balance_due', 'awaiting_payment'].includes(o.status)).length;
      $('#oCount').textContent = orders.length ? `${orders.length} order${orders.length === 1 ? '' : 's'} · ${active} in progress` : 'Nothing ordered yet.';
      if (!orders.length) { root.innerHTML = App.empty(App.ICON.order, 'No orders yet', 'Approve a design and choose a tailor in the studio. Your order shows up here with live tracking.', '<a class="btn gold" href="/studio">Open studio</a>'); return; }
      root.innerHTML = `<div class="cards">${orders.map(o => `<article class="card order"><a class="card-link" href="/orders?id=${o.id}" aria-label="Open order ${o.id}">${o.design ? App.thumb(o.design) : '<div class="thumb"></div>'}</a><div class="card-body">
        <div class="card-top"><h3>${FT.esc(o.design?.title || 'Design')}</h3>${App.badge(o.status)}</div>
        <p class="muted small">${FT.esc(o.id)} · ${App.avatar(o.vendor, 22)} ${FT.esc(o.vendor?.name || '')}</p>
        <div class="mini-trk" aria-label="${App.phaseLabel(o.phase)}">${App.PHASES.map((p, i) => `<i class="${i < A.phaseIndex(o.phase) || (o.phase === 'delivered') ? 'done' : i === A.phaseIndex(o.phase) ? 'now' : ''}"></i>`).join('')}</div>
        <p class="meta">${App.phaseLabel(o.phase)}${o.eta && o.status === 'active' ? ` · expected ${App.date(o.eta)}` : ''}</p>
        <div class="card-foot"><strong>${FT.money(o.total)}</strong><a class="btn ink sm" href="${o.status === 'awaiting_payment' ? `/studio?order=${o.id}` : o.status === 'balance_due' ? `/studio?order=${o.id}&pay=1` : `/orders?id=${o.id}`}">${o.status === 'awaiting_payment' ? 'Pay now' : o.status === 'balance_due' ? 'Pay balance' : 'Track'}</a></div>
      </div></article>`).join('')}</div>`;
    }

    /* ───── detail ───── */
    async function loadDetail() {
      try { order = await A.getOrder(id); } catch (e) { root.innerHTML = App.empty(App.ICON.order, 'Order not found', FT.esc(e.message), '<a class="btn ghost" href="/orders">All orders</a>'); return; }
      renderDetail();
      clearInterval(timer); if (!['delivered', 'cancelled'].includes(order.status)) timer = setInterval(async () => { try { const o = await A.getOrder(id); if (o.events.length !== order.events.length || o.status !== order.status) { order = o; renderDetail(); } if (['delivered', 'cancelled'].includes(o.status)) clearInterval(timer); } catch {} }, A.pollMs);
    }
    function renderDetail() {
      const o = order, p = A.phaseIndex(o.phase), v = o.design && App.version(o.design, o.versionN);
      $('#oTitle').textContent = o.design?.title || 'Order'; $('#oCount').innerHTML = `${FT.esc(o.id)} · placed ${App.date(o.createdAt)} · ${App.badge(o.status)}`;
      $('#oActions').innerHTML = `<a class="btn ghost" href="/orders">All orders</a>${['awaiting_payment', 'active'].includes(o.status) && o.phase !== 'tailoring' ? '<button class="btn ghost" type="button" id="oCancel">Cancel order</button>' : ''}${o.status === 'awaiting_payment' ? `<a class="btn gold" href="/studio?order=${o.id}">Pay now</a>` : o.status === 'balance_due' ? `<a class="btn gold" href="/studio?order=${o.id}&pay=1">Pay balance ${FT.money(o.balance)}</a>` : ''}`;
      $('#oCancel')?.addEventListener('click', async () => { if (await App.confirm('Cancel this order?', o.paid ? `${FT.money(o.paid)} will be refunded to your payment method.` : 'No payment has been taken.', { ok: 'Cancel order', danger: true })) { try { order = await A.cancelOrder(o.id); renderDetail(); FT.toast('Order cancelled'); } catch (e) { FT.toast(e.message); } } });
      root.innerHTML = `<div class="odetail">
        <div class="ocol">
          <div class="oart">${v ? FTEngine.render(v.spec, { id: 'o' }) : ''}<span class="st-badge" style="opacity:1;transform:none">Concept <b>v${o.versionN}</b></span></div>
          <dl class="summary"><dt>Tailor</dt><dd>${FT.esc(o.vendor?.name || '')}</dd><dt>City</dt><dd>${FT.esc(o.vendor?.city || '')}</dd><dt>Delivery</dt><dd>${o.deliveryDays || '—'} days</dd><dt>Measurements</dt><dd>${FT.esc(o.measurement?.label || '—')}</dd><dt>Total</dt><dd>${FT.money(o.total)}</dd><dt>Paid</dt><dd>${FT.money(o.paid)}</dd>${o.balance > 0 ? `<dt>Balance</dt><dd>${FT.money(o.balance)} ${o.status === 'balance_due' ? 'due now' : 'on delivery'}</dd>` : ''}</dl>
          ${v ? `<div class="chips">${FTEngine.summary(v.spec).map(t => `<span class="tag">${FT.esc(t)}</span>`).join('')}</div>` : ''}
          ${v?.spec.notes?.length ? `<p class="small muted">Notes for the tailor: ${v.spec.notes.map(FT.esc).join('; ')}</p>` : ''}
        </div>
        <div class="ocol">
          <h2 class="h3" style="margin-bottom:18px">${o.status === 'cancelled' ? 'Order cancelled' : p >= 3 ? 'Delivered to your door' : 'Production is under way'}</h2>
          <ol class="trk-v">${App.PHASES.map(([, t, d], i) => `<li class="${i < p || (i === p && p === 3) ? 'done' : i === p ? 'now' : ''}"><span class="dot"><i></i></span><div><h3>${t}</h3><p>${d}</p></div></li>`).join('')}</ol>
          <h3 class="h4" style="margin-top:28px">Updates</h3>
          <ol class="feed">${[...o.events].reverse().map(e => `<li><span class="when">${App.date(e.at, { time: true })}</span><b>${FT.esc(e.title)}</b>${e.body ? `<p>${FT.esc(e.body)}</p>` : ''}</li>`).join('')}</ol>
        </div>
      </div>`;
    }
    if (id) loadDetail(); else { loadList(); A.onChange(loadList); }
  });
})();
