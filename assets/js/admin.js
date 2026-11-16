/** Admin: overview, tailor verification, orders and reported problems, payments, commissions, content reports, users, designs, inbox. */
(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount, esc = FT.esc, enc = encodeURIComponent;
    const root = $('#adRoot');
    const u = await Acc.require(root, { role: 'admin', title: 'Fashion Teller staff only', message: 'Sign in with an admin account.' }); if (!u) return;
    const panel = id => $(`[data-panel="${id}"]`);
    const tbl = (cols, rows) => `<div class="table" style="--cols:${cols.length}"><div class="tr th">${cols.map(c => `<span>${c}</span>`).join('')}</div>${rows.join('') || '<div class="tr"><span class="muted">Nothing here.</span></div>'}</div>`;
    const td = (l, v) => `<span data-l="${l}">${v}</span>`;
    const where = x => esc([x?.city, x?.country].filter(Boolean).join(', '));

    async function overview() {
      const s = await A.adminStats(), audit = await A.adminAudit();
      $('#cTail').textContent = s.pendingTailors || ''; $('#cInbox').textContent = s.messages || ''; $('#cRep').textContent = s.reports || ''; $('#cPay').textContent = s.payoutsDue || '';
      const tile = (n, l, sub = '') => `<div class="stat"><b>${n}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
      const live = s.activeOrders + s.delivered;
      panel('overview').innerHTML = `<div class="stats">${tile(FT.money(s.gmv, { compact: true }), 'Paid through the platform', `${FT.money(s.held, { compact: true })} held until confirmed`)}${tile(FT.money(s.fees || 0, { compact: true }), 'Platform fees earned', s.payoutsDue ? `${App.plural(s.payoutsDue, 'payout')} waiting` : 'all payouts sent')}${tile(s.activeOrders, 'Orders in progress', `${s.awaitingPayment} awaiting payment · ${s.delivered} delivered`)}${tile(s.activeCommissions, 'Commissions in progress', `${s.commissions} all time · ${s.designers} designers`)}${tile(s.tailors, 'Verified tailors', s.pendingTailors ? `${s.pendingTailors} awaiting verification` : 'none pending')}${tile(s.users, 'Accounts', `${s.newUsers7d} new this week`)}${tile(s.designs, 'Designs', `${s.versions} versions · ${s.published} published`)}${tile(s.reports, 'Open reports', s.reports ? 'Review them under Reports and Orders' : 'nothing waiting')}${tile(s.orders7d, 'Orders this week', `${s.orders} all time`)}</div>
        <div class="split2" style="align-items:start;margin-top:40px"><div><h2 class="h4">Orders by stage</h2><ol class="phase-bars">${s.byPhase.map(([p, n]) => `<li><span>${esc(App.phaseLabel(p))}</span><i style="--w:${live ? Math.round((n / Math.max(1, live)) * 100) : 0}%"></i><b>${n}</b></li>`).join('')}</ol></div>
        <div><h2 class="h4">Recent activity</h2><ol class="feed compact">${audit.slice(0, 12).map(a => `<li><span class="when">${App.ago(a.at)}</span><b>${esc(a.action)}</b><p>${esc(a.target)} · by ${esc(a.by)}</p></li>`).join('') || '<li class="muted">No activity yet.</li>'}</ol></div></div>`;
    }
    async function tailors() {
      const list = await A.adminVendors(), rank = { pending: 0, verified: 1, suspended: 2, rejected: 3 };
      $('#cTail').textContent = list.filter(v => v.status === 'pending').length || '';
      panel('tailors').innerHTML = tbl(['Workshop', 'Owner', 'Specialties', 'Activity', 'Status', ''], list.sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9)).map(v => `<div class="tr" data-id="${esc(v.id)}">
        ${td('Workshop', `<span class="vrow">${App.avatar(v, 32)}<span><b>${esc(v.name)}</b><br><small class="muted">${where(v)}${v.sample ? ' · sample' : ''}</small></span></span>`)}
        ${td('Owner', v.user ? `${esc(v.user.name)}<br><small class="muted">${esc(v.user.email)}</small>` : '<span class="muted">—</span>')}
        ${td('Specialties', `<small>${(v.specialties || []).map(esc).join(', ')}</small>`)}
        ${td('Activity', `<small>${App.plural(v.quotes, 'quote')} · ${App.plural(v.orders, 'order')} · ${v.rating ? v.rating.toFixed(1) + ' ★' : 'no rating'}</small>`)}
        ${td('Status', App.badge(v.status))}
        ${td('', `<span class="row-btns compact">${v.application ? '<button class="btn ghost sm" type="button" data-app>Application</button>' : ''}${v.status !== 'verified' ? '<button class="btn ink sm" type="button" data-set="verified">Verify</button>' : ''}${v.status === 'pending' ? '<button class="btn ghost sm" type="button" data-set="rejected">Reject</button>' : ''}${v.status === 'verified' && !v.sample ? '<button class="btn ghost sm" type="button" data-set="suspended">Suspend</button>' : ''}</span>`)}
      </div>`));
      panel('tailors').onclick = async e => {
        const tr = e.target.closest('.tr[data-id]'); if (!tr) return; const v = list.find(x => x.id === tr.dataset.id); if (!v) return;
        const set = e.target.closest('[data-set]'); if (set) { try { await A.adminSetVendorStatus(v.id, set.dataset.set); FT.toast(`${v.name}: ${set.dataset.set}`); tailors(); overview(); } catch (x) { FT.toast(x.message); } }
        if (e.target.closest('[data-app]')) { const a = v.application; App.sheet(`<h3>${esc(a.workshop)}</h3><p class="muted">Applied ${App.date(a.createdAt)} · ${App.badge(a.status)}</p><dl class="summary"><dt>Contact</dt><dd>${esc(a.name)}</dd><dt>Email</dt><dd>${esc(a.email)}</dd><dt>Phone</dt><dd>${esc(a.phone || '—')}</dd><dt>Location</dt><dd>${where(a)}</dd><dt>Makes</dt><dd>${(a.specialties || []).map(esc).join(', ')}</dd></dl><p class="body" style="max-width:none;margin-top:14px">${esc(a.about || '')}</p>`); }
      };
    }
    const PH = A.PHASE_ORDER;
    async function orders() {
      const list = await A.adminOrders(), open = list.filter(o => o.issue?.status === 'open');
      panel('orders').innerHTML = `${open.length ? `<h2 class="h4">Problems reported by customers</h2><div class="reqs" style="margin-bottom:36px">${open.map(o => `<div class="notice warn" style="margin:0" data-id="${esc(o.id)}"><b>${esc(o.id)} · ${esc(o.issue.reason)}</b> · ${esc(o.customer?.name || '')} and ${esc(o.vendor?.name || '')} · ${FT.money(o.paid)} held · reported ${App.ago(o.issue.at)}<br>${esc(o.issue.body)}<div class="row-btns"><button class="btn ink sm" type="button" data-issue="refund">Refund the customer</button><button class="btn ghost sm" type="button" data-issue="release">Close: no fault found</button><a class="btn ghost sm" href="/orders?id=${enc(o.id)}">Open order</a></div></div>`).join('')}</div>` : ''}` + tbl(['Order', 'Customer', 'Tailor', 'Amount', 'Stage', 'Status', ''], list.map(o => `<div class="tr" data-id="${esc(o.id)}">
        ${td('Order', `<b>${esc(o.id)}</b><br><small class="muted">${esc(o.design?.title || '')} · v${o.versionN} · ${App.ago(o.createdAt)}</small>`)}
        ${td('Customer', `${esc(o.customer?.name || '')}<br><small class="muted">${esc(o.customer?.city || '')}</small>`)}
        ${td('Tailor', esc(o.vendor?.name || ''))}
        ${td('Amount', `${FT.money(o.total)}<br><small class="muted">${FT.money(o.paid)} paid</small>`)}
        ${td('Stage', `<select class="mini" data-phase aria-label="Stage of ${esc(o.id)}" ${['cancelled', 'completed', 'awaiting_payment'].includes(o.status) ? 'disabled' : ''}>${PH.map(p => `<option value="${p}" ${p === o.phase ? 'selected' : ''}${PH.indexOf(p) < PH.indexOf(o.phase) ? ' disabled' : ''}>${esc(App.phaseLabel(p))}</option>`).join('')}</select>`)}
        ${td('Status', App.badge(o.status))}
        ${td('', `<span class="row-btns compact"><a class="btn ghost sm" href="/orders?id=${enc(o.id)}">Open</a>${!['cancelled', 'completed'].includes(o.status) ? '<button class="btn ghost sm" type="button" data-cancel>Cancel</button>' : ''}</span>`)}
      </div>`));
      panel('orders').onchange = async e => { const s = e.target.closest('[data-phase]'); if (!s) return; const oid = s.closest('[data-id]').dataset.id; try { await A.adminSetOrderPhase(oid, s.value, 'Updated by Fashion Teller'); FT.toast(`${oid}: ${App.phaseLabel(s.value)}`); } catch (x) { FT.toast(x.message); } orders(); };
      panel('orders').onclick = async e => {
        const row = e.target.closest('[data-id]'); if (!row) return; const oid = row.dataset.id;
        const iss = e.target.closest('[data-issue]');
        if (iss) { const refund = iss.dataset.issue === 'refund'; const r = await App.ask(refund ? `Refund ${oid}?` : `Close the report on ${oid}?`, refund ? 'The customer is refunded in full and the order is cancelled.' : 'The order continues and the payment stays held until the customer confirms delivery.', [{ name: 'note', label: 'Note for both sides', type: 'textarea', optional: true, max: 300 }], { ok: refund ? 'Refund' : 'Close report', submit: d => A.adminResolveIssue(oid, { action: iss.dataset.issue, note: d.note }) }); if (r) { FT.toast('Done'); orders(); overview(); } return; }
        if (e.target.closest('[data-cancel]') && (await App.confirm(`Cancel ${oid}?`, 'Any payment still held is refunded and the customer is notified.', { ok: 'Cancel order', danger: true }))) { try { await A.adminSetOrderPhase(oid, 'cancelled', 'Cancelled by Fashion Teller'); orders(); overview(); } catch (x) { FT.toast(x.message); } }
      };
    }
    async function payments() {
      const list = await A.adminPayments();
      panel('payments').innerHTML = tbl(['Reference', 'For', 'Customer', 'Amount', 'Method', 'Status', ''], list.map(p => `<div class="tr" data-id="${esc(p.id)}">
        ${td('Reference', `<b>${esc(p.reference)}</b><br><small class="muted">${App.date(p.createdAt, { time: true })}</small>`)}${td('For', p.commissionId ? `Commission<br><small class="muted">${esc(p.designer?.name || '')}</small>` : `${esc(p.orderId || '')}<br><small class="muted">${esc(p.vendor?.name || '')}</small>`)}${td('Customer', esc(p.customer?.name || ''))}${td('Amount', `${FT.money(p.amount)}<br><small class="muted">${esc(p.kind)}</small>`)}${td('Method', `${esc(p.method)}${p.last4 ? ' •••• ' + esc(p.last4) : ''}`)}${td('Status', App.badge(p.status))}${td('', p.status === 'paid' ? '<button class="btn ghost sm" type="button" data-refund>Refund</button>' : '')}
      </div>`));
      panel('payments').onclick = async e => { const b = e.target.closest('[data-refund]'); if (!b) return; const p = list.find(x => x.id === b.closest('.tr').dataset.id); if (p && (await App.confirm(`Refund ${FT.money(p.amount)}?`, `${esc(p.commissionId ? 'Commission' : 'Order ' + p.orderId)} · ${esc(p.customer?.name || '')}. The ${p.commissionId ? 'commission' : 'order'} is closed.`, { ok: 'Refund', danger: true }))) { try { await A.adminRefund(p.id); FT.toast('Refunded'); payments(); overview(); } catch (x) { FT.toast(x.message); } } };
    }
    /* money owed to tailors and designers once a payment is released */
    async function payouts() {
      const list = await A.adminPayouts(), f = await A.features(), manual = f.payouts === 'manual';
      const ST = { pending: ['Waiting', 'warn'], processing: ['On its way', 'gold'], paid: ['Paid', 'ok'], failed: ['Failed', 'bad'], reversed: ['Returned', 'bad'] };
      panel('payouts').innerHTML = `<p class="muted" style="margin:0 0 18px">${f.payouts === 'paystack' ? 'Sent automatically through Paystack when a payment is released. A failed one can be sent again.' : manual ? 'Transfers are not connected, so pay these from your bank and mark each one as sent.' : 'Test mode: payouts complete by themselves a few seconds after release. No money moves.'}${f.feePercent ? ` The platform fee is ${f.feePercent}%.` : ''}</p>` +
        tbl(['Payee', 'For', 'Bank', 'They receive', 'Fee', 'Status', ''], list.map(x => `<div class="tr" data-id="${esc(x.id)}"><span data-l="Payee">${esc(x.payee?.name || '')}</span><span data-l="For">${esc(x.title)}<br><small class="muted">${esc(x.reference)}</small></span><span data-l="Bank">${x.account ? `${esc(x.account.bankName)} ${manual && x.account.number ? esc(x.account.number) : '••' + esc(x.account.last4)}<br><small class="muted">${esc(x.account.accountName)}</small>` : '<span class="muted">No bank details yet</span>'}</span><span data-l="They receive"><b>${FT.money(x.net)}</b></span><span data-l="Fee">${FT.money(x.fee)}</span><span data-l="Status">${App.badge(x.status, ST)}${x.note ? `<br><small class="muted">${esc(x.note)}</small>` : ''}</span><span>${(x.status === 'pending' || x.status === 'processing') && x.account && f.payouts !== 'paystack' ? '<button class="btn ghost sm" type="button" data-paid>Mark as sent</button>' : x.status === 'failed' || x.status === 'reversed' ? '<button class="btn ghost sm" type="button" data-retry>Send again</button>' : f.payouts === 'paystack' && x.status === 'processing' && x.sentAt && Date.now() - Date.parse(x.sentAt) > 6e5 ? '<button class="btn ghost sm" type="button" data-check>Check with Paystack</button>' : ''}</span></div>`));
      panel('payouts').onclick = async e => {
        const paid = e.target.closest('[data-paid]'), retry = e.target.closest('[data-retry]'), chk = e.target.closest('[data-check]'); if (!paid && !retry && !chk) return; const x = list.find(y => y.id === e.target.closest('.tr').dataset.id); if (!x) return;
        try {
          if (paid) { const r = await App.ask('Mark as sent', `${FT.money(x.net)} to ${esc(x.payee?.name || '')}. Enter the reference from your bank so it can be traced.`, [{ name: 'reference', label: 'Bank reference', required: true }], { ok: 'Mark as sent' }); if (!r) return; await A.adminPayout(x.id, { action: 'paid', reference: r.reference }); }
          else await A.adminPayout(x.id, { action: chk ? 'check' : 'retry' });
          FT.toast('Updated'); payouts(); overview();
        } catch (er) { FT.toast(er.message); }
      };
    }
    async function commissions() {
      const list = await A.adminCommissions();
      panel('commissions').innerHTML = tbl(['Commission', 'Client', 'Designer', 'Fee', 'Status', 'Updated'], list.map(c => `<div class="tr">${td('Commission', `<b>${esc(c.title)}</b><br><small class="muted">${esc(c.brief.slice(0, 90))}${c.brief.length > 90 ? '…' : ''}</small>`)}${td('Client', esc(c.client?.name || ''))}${td('Designer', `<a href="/designer?id=${enc(c.designer.id)}">${esc(c.designer?.name || '')}</a>`)}${td('Fee', c.offer ? `${FT.money(c.offer.fee)}<br><small class="muted">${c.paid ? 'paid' : 'not paid'} · ${App.plural(c.deliveries.length, 'delivery', 'deliveries')}</small>` : '<span class="muted">no offer yet</span>')}${td('Status', App.badge(c.status, App.CSTATUS))}${td('Updated', App.ago(c.updatedAt))}</div>`));
    }
    async function reports() {
      const list = await A.adminReports();
      $('#cRep').textContent = list.filter(r => r.status === 'open').length || '';
      panel('reports').innerHTML = tbl(['Reported', 'Reason', 'By', 'When', 'Status', ''], list.sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1)).map(r => `<div class="tr" data-id="${esc(r.id)}">
        ${td('Reported', r.kind === 'design' && r.design ? `<span class="vrow"><span class="art">${App.art(r.design.spec, { crop: 'template' })}</span><span><a href="/design?id=${enc(r.design.id)}"><b>${esc(r.design.title)}</b></a><br><small class="muted">design by ${esc(r.design.by?.name || '')}</small></span></span>` : r.kind === 'user' && r.target ? `<a href="/designer?id=${enc(r.target.id)}"><b>${esc(r.target.name)}</b></a><br><small class="muted">profile</small>` : r.kind === 'order' ? `<a href="/orders?id=${enc(r.refId)}"><b>${esc(r.refId)}</b></a><br><small class="muted">order problem</small>` : `<span class="muted">${esc(r.kind)} (removed)</span>`)}
        ${td('Reason', `${esc(r.reason)}${r.note ? `<br><small class="muted">${esc(r.note)}</small>` : ''}`)}${td('By', esc(r.by?.name || ''))}${td('When', App.ago(r.createdAt))}${td('Status', r.status === 'open' ? App.badge('open') : `<span class="badge mute">${esc(r.resolution || 'resolved')}</span>`)}
        ${td('', r.status !== 'open' ? '' : r.kind === 'order' ? '<span class="muted small">Resolve under Orders</span>' : `<span class="row-btns compact"><button class="btn ink sm" type="button" data-res="remove">${r.kind === 'design' ? 'Take down' : 'Suspend'}</button><button class="btn ghost sm" type="button" data-res="dismiss">Dismiss</button></span>`)}
      </div>`));
      panel('reports').onclick = async e => { const b = e.target.closest('[data-res]'); if (!b) return; const rid = b.closest('.tr').dataset.id; if (b.dataset.res === 'remove' && !(await App.confirm('Act on this report?', 'A design is taken off Discover (the owner keeps it); a profile is suspended.', { ok: 'Confirm', danger: true }))) return; try { await A.adminResolveReport(rid, b.dataset.res); FT.toast('Report closed'); reports(); overview(); } catch (x) { FT.toast(x.message); } };
    }
    async function users() {
      const list = await A.adminUsers();
      panel('users').innerHTML = tbl(['Name', 'Role', 'Location', 'Activity', 'Status', ''], list.map(x => `<div class="tr" data-id="${esc(x.id)}">
        ${td('Name', `<b>${esc(x.name)}</b><br><small class="muted">${esc(x.email)}</small>`)}${td('Role', esc(x.role) + (x.designer ? ' · designer' : ''))}${td('Location', where(x))}${td('Activity', `<small>${App.plural(x.designs, 'design')} · ${App.plural(x.orders, 'order')} · ${FT.money(x.spent)}</small>`)}${td('Status', x.status === 'suspended' ? App.badge('suspended') : '<span class="badge ok">Active</span>')}${td('', x.role !== 'admin' ? `<button class="btn ghost sm" type="button" data-status="${x.status === 'suspended' ? 'active' : 'suspended'}">${x.status === 'suspended' ? 'Reinstate' : 'Suspend'}</button>` : '')}
      </div>`));
      panel('users').onclick = async e => { const b = e.target.closest('[data-status]'); if (!b) return; try { await A.adminSetUserStatus(b.closest('.tr').dataset.id, b.dataset.status); users(); } catch (x) { FT.toast(x.message); } };
    }
    async function designs() {
      const list = (await A.adminDesigns()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 60);
      panel('designs').innerHTML = `<h2 class="sr">Designs</h2><div class="cards small">${list.map(d => `<article class="card design"><a class="card-link" href="/design?id=${enc(d.id)}">${App.thumb(d)}</a><div class="card-body"><div class="card-top"><h3>${esc(d.title)}</h3>${d.published ? App.badge('published') : App.badge(d.status)}</div><p class="muted small">${esc(d.owner?.name || '')} · v${d.current} of ${d.versions.length} · ${App.plural(d.quotes, 'quote')} · ${App.ago(d.updatedAt)}</p></div></article>`).join('') || '<p class="muted">No designs yet.</p>'}</div>`;
    }
    async function inbox() {
      const msgs = await A.adminMessages(), apps = await A.adminApplications();
      $('#cInbox').textContent = msgs.filter(m => m.status === 'new').length || '';
      panel('inbox').innerHTML = `<h2 class="h4">Contact messages</h2>${tbl(['From', 'About', 'Message', 'Received'], msgs.map(m => `<div class="tr">${td('From', `<b>${esc(m.name)}</b><br><small class="muted">${esc(m.email)}</small>`)}${td('About', esc(m.topic || ''))}${td('Message', `<small>${esc(m.message || '')}</small>`)}${td('Received', App.ago(m.createdAt))}</div>`))}
        <h2 class="h4" style="margin-top:36px">Tailor applications</h2>${tbl(['Workshop', 'Contact', 'Makes', 'Status', 'Received'], apps.map(a => `<div class="tr">${td('Workshop', `<b>${esc(a.workshop)}</b><br><small class="muted">${where(a)}</small>`)}${td('Contact', `${esc(a.name)}<br><small class="muted">${esc(a.email)} ${esc(a.phone || '')}</small>`)}${td('Makes', `<small>${(a.specialties || []).map(esc).join(', ')}</small>`)}${td('Status', App.badge(a.status))}${td('Received', App.ago(a.createdAt))}</div>`))}`;
    }
    const views = { overview, tailors, orders, payments, payouts, commissions, reports, users, designs, inbox };
    const load = async id => { try { await views[id]?.(); } catch (e) { panel(id).innerHTML = `<p class="err">${esc(e.message)}</p>`; } };
    const tabs = App.tabs($('#adTabs'), load);
    if (tabs.current() !== 'overview') overview().catch(() => {});
    const typing = () => root.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    let t = null; A.onChange(() => { clearTimeout(t); t = setTimeout(() => { if (!typing() && !document.hidden) load(tabs.current()); }, 600); });
  });
})();
