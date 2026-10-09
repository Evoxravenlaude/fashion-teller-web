/** Admin dashboard: overview, tailor verification, orders, payments, users, designs, inbox. */
(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $, $$ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount, E = window.FTEngine;
    const root = $('#adRoot');
    const u = await Acc.require(root, { role: 'admin', title: 'Fashion Teller staff only', message: 'Sign in with an admin account.' }); if (!u) return;
    const panel = id => $(`[data-panel="${id}"]`);
    const tbl = (cols, rows) => `<div class="table" style="--cols:${cols.length}"><div class="tr th">${cols.map(c => `<span>${c}</span>`).join('')}</div>${rows.join('') || '<div class="tr"><span class="muted">Nothing here.</span></div>'}</div>`;
    const td = (l, v) => `<span data-l="${l}">${v}</span>`;

    async function overview() {
      const s = await A.adminStats(), audit = await A.adminAudit();
      $('#cTail').textContent = s.pendingTailors || ''; $('#cInbox').textContent = s.messages || '';
      const tile = (n, l, sub = '') => `<div class="stat"><b>${n}</b><span>${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
      panel('overview').innerHTML = `<div class="stats">${tile(FT.money(s.gmv, { compact: true }), 'Paid through the platform', `${FT.money(s.held, { compact: true })} held for active orders`)}${tile(s.activeOrders, 'Orders in production', `${s.awaitingPayment} awaiting payment · ${s.delivered} delivered`)}${tile(s.tailors, 'Verified tailors', s.pendingTailors ? `${s.pendingTailors} awaiting verification` : 'none pending')}${tile(s.users, 'Accounts', `${s.newUsers7d} new this week`)}${tile(s.designs, 'Designs', `${s.versions} versions generated`)}${tile(s.orders7d, 'Orders this week', `${s.orders} all time`)}</div>
        <div class="split2" style="align-items:start;margin-top:40px"><div><h3 class="h4">Orders by phase</h3><ol class="phase-bars">${s.byPhase.map(([p, n]) => `<li><span>${App.phaseLabel(p)}</span><i style="--w:${s.activeOrders + s.delivered ? Math.round((n / Math.max(1, s.activeOrders + s.delivered)) * 100) : 0}%"></i><b>${n}</b></li>`).join('')}</ol></div>
        <div><h3 class="h4">Recent activity</h3><ol class="feed compact">${audit.slice(0, 12).map(a => `<li><span class="when">${App.ago(a.at)}</span><b>${FT.esc(a.action)}</b><p>${FT.esc(a.target)} · by ${FT.esc(a.by)}</p></li>`).join('') || '<li class="muted">No activity yet.</li>'}</ol></div></div>`;
    }
    async function tailors() {
      const list = await A.adminVendors(); const order = { pending: 0, verified: 1, suspended: 2, rejected: 3 };
      $('#cTail').textContent = list.filter(v => v.status === 'pending').length || '';
      panel('tailors').innerHTML = tbl(['Workshop', 'Owner', 'Specialties', 'Activity', 'Status', ''], list.sort((a, b) => order[a.status] - order[b.status]).map(v => `<div class="tr" data-id="${v.id}">
        ${td('Workshop', `<span class="vrow">${App.avatar(v, 32)}<span><b>${FT.esc(v.name)}</b><br><small class="muted">${FT.esc([v.city, v.country].filter(Boolean).join(', '))}${v.sample ? ' · sample' : ''}</small></span></span>`)}
        ${td('Owner', v.user ? `${FT.esc(v.user.name)}<br><small class="muted">${FT.esc(v.user.email)}</small>` : '<span class="muted">—</span>')}
        ${td('Specialties', `<small>${(v.specialties || []).map(FT.esc).join(', ')}</small>`)}
        ${td('Activity', `<small>${v.quotes} quotes · ${v.orders} orders · ${v.rating ? v.rating.toFixed(1) + ' ★' : 'no rating'}</small>`)}
        ${td('Status', App.badge(v.status))}
        ${td('', `<span class="row-btns compact">${v.application ? `<button class="btn ghost sm" type="button" data-app>Application</button>` : ''}${v.status !== 'verified' ? `<button class="btn ink sm" type="button" data-set="verified">Verify</button>` : ''}${v.status === 'pending' ? `<button class="btn ghost sm" type="button" data-set="rejected">Reject</button>` : ''}${v.status === 'verified' && !v.sample ? `<button class="btn ghost sm" type="button" data-set="suspended">Suspend</button>` : ''}</span>`)}
      </div>`));
      panel('tailors').onclick = async e => {
        const tr = e.target.closest('.tr'); if (!tr) return; const v = list.find(x => x.id === tr.dataset.id);
        const set = e.target.closest('[data-set]'); if (set) { try { await A.adminSetVendorStatus(v.id, set.dataset.set); FT.toast(`${v.name}: ${set.dataset.set}`); tailors(); overview(); } catch (x) { FT.toast(x.message); } }
        if (e.target.closest('[data-app]')) { const a = v.application; App.sheet(`<h3>${FT.esc(a.workshop)}</h3><p class="muted">Applied ${App.date(a.createdAt)} · ${App.badge(a.status)}</p><dl class="summary"><dt>Contact</dt><dd>${FT.esc(a.name)}</dd><dt>Email</dt><dd>${FT.esc(a.email)}</dd><dt>Phone</dt><dd>${FT.esc(a.phone || '—')}</dd><dt>Location</dt><dd>${FT.esc([a.city, a.country].filter(Boolean).join(', '))}</dd><dt>Makes</dt><dd>${(a.specialties || []).map(FT.esc).join(', ')}</dd></dl><p class="body" style="max-width:none;margin-top:14px">${FT.esc(a.about || '')}</p>`); }
      };
    }
    const PH = ['concept_generated', 'vendor_assigned', 'tailoring', 'delivered'];
    async function orders() {
      const list = await A.adminOrders();
      panel('orders').innerHTML = tbl(['Order', 'Customer', 'Tailor', 'Amount', 'Phase', 'Status', ''], list.map(o => `<div class="tr" data-id="${o.id}">
        ${td('Order', `<b>${FT.esc(o.id)}</b><br><small class="muted">${FT.esc(o.design?.title || '')} · v${o.versionN} · ${App.ago(o.createdAt)}</small>`)}
        ${td('Customer', `${FT.esc(o.customer?.name || '')}<br><small class="muted">${FT.esc(o.customer?.city || '')}</small>`)}
        ${td('Tailor', FT.esc(o.vendor?.name || ''))}
        ${td('Amount', `${FT.money(o.total)}<br><small class="muted">${FT.money(o.paid)} paid</small>`)}
        ${td('Phase', `<select class="mini" data-phase aria-label="Phase" ${['cancelled'].includes(o.status) ? 'disabled' : ''}>${PH.map(p => `<option value="${p}" ${p === o.phase ? 'selected' : ''}>${App.phaseLabel(p)}</option>`).join('')}</select>`)}
        ${td('Status', App.badge(o.status))}
        ${td('', `<span class="row-btns compact"><a class="btn ghost sm" href="/orders?id=${o.id}">Open</a>${!['cancelled', 'delivered'].includes(o.status) ? '<button class="btn ghost sm" type="button" data-cancel>Cancel</button>' : ''}</span>`)}
      </div>`));
      panel('orders').onchange = async e => { const s = e.target.closest('[data-phase]'); if (!s) return; const id = s.closest('.tr').dataset.id; try { await A.adminSetOrderPhase(id, s.value, 'Updated by Fashion Teller'); FT.toast(`${id}: ${App.phaseLabel(s.value)}`); orders(); } catch (x) { FT.toast(x.message); orders(); } };
      panel('orders').onclick = async e => { const b = e.target.closest('[data-cancel]'); if (!b) return; const id = b.closest('.tr').dataset.id; if (await App.confirm(`Cancel ${id}?`, 'Any payment is marked for refund and the customer is notified.', { ok: 'Cancel order', danger: true })) { try { await A.adminSetOrderPhase(id, 'cancelled', 'Cancelled by Fashion Teller'); orders(); overview(); } catch (x) { FT.toast(x.message); } } };
    }
    async function payments() {
      const list = await A.adminPayments();
      panel('payments').innerHTML = tbl(['Reference', 'Order', 'Customer', 'Amount', 'Method', 'Status', ''], list.map(p => `<div class="tr" data-id="${p.id}">
        ${td('Reference', `<b>${FT.esc(p.reference)}</b><br><small class="muted">${App.date(p.createdAt, { time: true })}</small>`)}${td('Order', FT.esc(p.orderId))}${td('Customer', FT.esc(p.customer?.name || ''))}${td('Amount', `${FT.money(p.amount)}<br><small class="muted">${p.kind}</small>`)}${td('Method', `${p.method}${p.last4 ? ' •••• ' + p.last4 : ''}`)}${td('Status', App.badge(p.status))}${td('', p.status === 'paid' ? '<button class="btn ghost sm" type="button" data-refund>Refund</button>' : '')}
      </div>`));
      panel('payments').onclick = async e => { const b = e.target.closest('[data-refund]'); if (!b) return; const p = list.find(x => x.id === b.closest('.tr').dataset.id); if (await App.confirm(`Refund ${FT.money(p.amount)}?`, `Order ${FT.esc(p.orderId)} · ${FT.esc(p.customer?.name || '')}`, { ok: 'Refund', danger: true })) { try { await A.adminRefund(p.id); FT.toast('Refunded'); payments(); overview(); } catch (x) { FT.toast(x.message); } } };
    }
    async function users() {
      const list = await A.adminUsers();
      panel('users').innerHTML = tbl(['Name', 'Role', 'Location', 'Activity', 'Status', ''], list.map(x => `<div class="tr" data-id="${x.id}">
        ${td('Name', `<b>${FT.esc(x.name)}</b><br><small class="muted">${FT.esc(x.email)}</small>`)}${td('Role', x.role)}${td('Location', FT.esc([x.city, x.country].filter(Boolean).join(', ')))}${td('Activity', `<small>${x.designs} designs · ${x.orders} orders · ${FT.money(x.spent)}</small>`)}${td('Status', App.badge(x.status === 'suspended' ? 'suspended' : 'verified').replace('Verified', 'Active'))}${td('', x.role !== 'admin' ? `<button class="btn ghost sm" type="button" data-status="${x.status === 'suspended' ? 'active' : 'suspended'}">${x.status === 'suspended' ? 'Reinstate' : 'Suspend'}</button>` : '')}
      </div>`));
      panel('users').onclick = async e => { const b = e.target.closest('[data-status]'); if (!b) return; try { await A.adminSetUserStatus(b.closest('.tr').dataset.id, b.dataset.status); users(); } catch (x) { FT.toast(x.message); } };
    }
    async function designs() {
      const list = await A.adminDesigns();
      panel('designs').innerHTML = `<div class="cards small">${list.map(d => `<article class="card design"><div class="card-link">${App.thumb(d)}</div><div class="card-body"><div class="card-top"><h3>${FT.esc(d.title)}</h3>${App.badge(d.status)}</div><p class="muted small">${FT.esc(d.owner?.name || '')} · v${d.current} of ${d.versions.length} · ${d.quotes} quotes · ${App.ago(d.updatedAt)}</p><p class="small">${FT.esc(d.prompt)}</p></div></article>`).join('') || '<p class="muted">No designs yet.</p>'}</div>`;
    }
    async function inbox() {
      const msgs = await A.adminMessages(), apps = await A.adminApplications();
      $('#cInbox').textContent = msgs.filter(m => m.status === 'new').length || '';
      panel('inbox').innerHTML = `<h3 class="h4">Contact messages</h3>${tbl(['From', 'About', 'Message', 'Received'], msgs.map(m => `<div class="tr">${td('From', `<b>${FT.esc(m.name)}</b><br><small class="muted">${FT.esc(m.email)}</small>`)}${td('About', FT.esc(m.topic || ''))}${td('Message', `<small>${FT.esc(m.message || '')}</small>`)}${td('Received', App.ago(m.createdAt))}</div>`))}
        <h3 class="h4" style="margin-top:36px">Tailor applications</h3>${tbl(['Workshop', 'Contact', 'Makes', 'Status', 'Received'], apps.map(a => `<div class="tr">${td('Workshop', `<b>${FT.esc(a.workshop)}</b><br><small class="muted">${FT.esc([a.city, a.country].filter(Boolean).join(', '))}</small>`)}${td('Contact', `${FT.esc(a.name)}<br><small class="muted">${FT.esc(a.email)} ${FT.esc(a.phone || '')}</small>`)}${td('Makes', `<small>${(a.specialties || []).map(FT.esc).join(', ')}</small>`)}${td('Status', App.badge(a.status))}${td('Received', App.ago(a.createdAt))}</div>`))}`;
    }
    const views = { overview, tailors, orders, payments, users, designs, inbox };
    const load = async id => { try { await views[id]?.(); } catch (e) { panel(id).innerHTML = `<p class="err">${FT.esc(e.message)}</p>`; } };
    App.tabs($('#adTabs'), load); load(location.hash.slice(1) || 'overview');
    A.onChange(() => { const cur = $$('#adTabs [data-tab]').find(b => b.classList.contains('on'))?.dataset.tab; if (cur) load(cur); });
  });
})();
