/** Workshop — the verified tailor's dashboard: open requests to quote, quotes sent, orders to run, workshop profile. */
(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $, $$ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount, E = window.FTEngine;
    const root = $('#wRoot');
    const u = await Acc.require(root, { role: 'tailor', title: 'Sign in to your workshop', message: 'Quote on requests from customers anywhere, run your orders and get paid on delivery.' }); if (!u) return;
    let vendor = null; try { vendor = await A.myVendor(); } catch {}
    if (!vendor) { root.innerHTML = App.empty(App.ICON.inbox, 'No workshop on this account yet', 'Tell us about your workshop and we will verify it. Verified tailors can quote on every request.', '<a class="btn gold" href="/tailors#apply">Apply as a tailor</a>'); return; }
    $('#wTitle').textContent = vendor.name; $('#wSub').innerHTML = `${FT.esc([vendor.city, vendor.country].filter(Boolean).join(', '))} · ${App.badge(vendor.status)} · ${vendor.rating ? vendor.rating.toFixed(1) + ' ★' : 'No reviews yet'} · ${vendor.ordersDone} orders made`;
    const banner = $('#wBanner');
    if (vendor.status === 'pending') banner.innerHTML = `<div class="notice warn"><b>Verification pending.</b> We are checking your workshop details. You will be able to quote as soon as it is approved${A.local ? ' (sign in as the demo admin to approve it)' : ''}.</div>`;
    else if (vendor.status === 'rejected' || vendor.status === 'suspended') banner.innerHTML = `<div class="notice bad"><b>Your workshop is ${vendor.status}.</b> Contact support@fashionteller.com to resolve this.</div>`;
    const measureList = m => m ? App.MEASURE_FIELDS.filter(([k]) => m.values[k]).map(([k, l]) => `<span class="tag">${l} ${m.values[k]}${m.unit}</span>`).join('') : '<span class="muted">No measurements attached</span>';

    /* requests */
    async function requests() {
      const el = $('[data-panel="requests"]'); let list = [];
      try { list = await A.openRequests(); } catch (e) { el.innerHTML = `<p class="err">${FT.esc(e.message)}</p>`; return; }
      $('#cReq').textContent = list.filter(r => !r.myQuote).length || '';
      if (!list.length) { el.innerHTML = App.empty(App.ICON.inbox, vendor.status === 'verified' ? 'No open requests right now' : 'Requests appear once you are verified', 'When a customer requests quotes on a design, it shows up here with the concept, every version, their measurements and notes.'); return; }
      el.innerHTML = `<div class="reqs">${list.map(r => { const d = r.design, v = App.version(d, r.versionN); return `<article class="req" data-id="${r.id}">
        <div class="req-art">${E.render(v.spec, { id: 'r' + r.id })}</div>
        <div class="req-body">
          <div class="card-top"><h3>${FT.esc(d.title)}</h3>${r.myQuote ? App.badge(r.myQuote.status) : `<span class="badge gold">${r.quoteCount} quote${r.quoteCount === 1 ? '' : 's'} so far</span>`}</div>
          <p class="muted small">${FT.esc(r.customer?.name || 'Customer')}, ${FT.esc([r.customer?.city, r.customer?.country].filter(Boolean).join(', '))} · ${App.ago(r.createdAt)}${r.deadline ? ` · needed by ${App.date(r.deadline)}` : ''}</p>
          <p class="small"><b>Description:</b> ${FT.esc(d.prompt)}</p>
          <div class="chips">${E.summary(v.spec).map(t => `<span class="tag">${FT.esc(t)}</span>`).join('')}</div>
          ${d.versions.length > 1 ? `<p class="small muted">Version ${r.versionN} of ${d.versions.length}: ${d.versions.filter(x => x.n > 1 && x.n <= r.versionN).map(x => FT.esc(x.instruction)).join(' → ')}</p>` : ''}
          ${v.spec.notes?.length ? `<p class="small"><b>Tailor notes:</b> ${v.spec.notes.map(FT.esc).join('; ')}</p>` : ''}
          ${r.notes ? `<p class="small"><b>From the customer:</b> ${FT.esc(r.notes)}</p>` : ''}
          <details class="small"><summary>Measurements (${FT.esc(r.measurement?.label || '—')}, ${r.measurement?.fit || ''} fit)</summary><div class="chips" style="margin-top:8px">${measureList(r.measurement)}</div>${r.measurement?.notes ? `<p class="muted">${FT.esc(r.measurement.notes)}</p>` : ''}</details>
          <form class="form two qform">
            <div class="field"><label for="qp-${r.id}">Your price (₦, fabric included)</label><input id="qp-${r.id}" name="price" inputmode="numeric" type="number" step="500" min="1000" value="${r.myQuote?.price ?? r.suggested?.price ?? ''}"></div>
            <div class="field"><label for="qd-${r.id}">Delivery (days)</label><input id="qd-${r.id}" name="deliveryDays" inputmode="numeric" type="number" min="1" max="90" value="${r.myQuote?.deliveryDays ?? r.suggested?.deliveryDays ?? ''}"></div>
            <div class="field full"><label for="qn-${r.id}">Note to the customer</label><input id="qn-${r.id}" name="note" maxlength="140" value="${FT.esc(r.myQuote?.note ?? '')}" placeholder="Fabric included. Two fittings by video."></div>
            <p class="err full" role="alert"></p>
            <div class="foot-row"><p>${r.suggested ? `Suggested from the design: ${FT.money(r.suggested.price)}, ${r.suggested.deliveryDays} days.` : ''}</p><button class="btn ink" type="submit" ${vendor.status !== 'verified' ? 'disabled' : ''}>${r.myQuote ? 'Update quote' : 'Send quote'}</button></div>
          </form>
        </div></article>`; }).join('')}</div>`;
      $$('.qform', el).forEach(f => f.addEventListener('submit', async e => {
        e.preventDefault(); const id = f.closest('.req').dataset.id, d = Object.fromEntries(new FormData(f)), err = $('.err', f), btn = $('button[type="submit"]', f);
        btn.disabled = true; err.textContent = '';
        try { await A.submitQuote(id, { price: d.price, deliveryDays: d.deliveryDays, note: d.note }); FT.toast('Quote sent'); requests(); } catch (x) { err.textContent = x.message; btn.disabled = false; }
      }));
    }
    /* quotes */
    async function quotes() {
      const el = $('[data-panel="quotes"]'); let list = []; try { list = await A.myQuotes(); } catch (e) { el.innerHTML = `<p class="err">${FT.esc(e.message)}</p>`; return; }
      if (!list.length) { el.innerHTML = App.empty(App.ICON.inbox, 'No quotes sent yet', 'Quotes you send on requests are listed here with their outcome.'); return; }
      el.innerHTML = `<div class="table"><div class="tr th"><span>Design</span><span>Price</span><span>Delivery</span><span>Status</span><span>Sent</span></div>${list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(q => `<div class="tr"><span data-l="Design"><b>${FT.esc(q.design?.title || '')}</b><br><small class="muted">v${q.request?.versionN} · ${FT.esc(q.note || '')}</small></span><span data-l="Price">${FT.money(q.price)}</span><span data-l="Delivery">${q.deliveryDays} days</span><span data-l="Status">${App.badge(q.status)}</span><span data-l="Sent">${App.ago(q.createdAt)}</span></div>`).join('')}</div>`;
    }
    /* orders */
    const STEP = { vendor_assigned: ['tailoring', 'Start tailoring'], tailoring: ['delivered', 'Mark delivered'] };
    async function orders() {
      const el = $('[data-panel="orders"]'); let list = []; try { list = await A.vendorOrders(); } catch (e) { el.innerHTML = `<p class="err">${FT.esc(e.message)}</p>`; return; }
      $('#cOrd').textContent = list.filter(o => o.status === 'active').length || '';
      if (!list.length) { el.innerHTML = App.empty(App.ICON.order, 'No orders yet', 'When a customer accepts your quote and pays, the order appears here. Post updates as you go; the customer sees them live.'); return; }
      el.innerHTML = `<div class="reqs">${list.map(o => { const v = o.design && App.version(o.design, o.versionN), next = STEP[o.phase]; return `<article class="req" data-id="${o.id}">
        <div class="req-art">${v ? E.render(v.spec, { id: 'w' + o.id }) : ''}</div>
        <div class="req-body">
          <div class="card-top"><h3>${FT.esc(o.design?.title || 'Design')} <small class="muted">· v${o.versionN}</small></h3>${App.badge(o.status)}</div>
          <p class="muted small">${FT.esc(o.id)} · ${FT.esc(o.customer?.name || '')}, ${FT.esc(o.customer?.city || '')} · ${FT.money(o.total)} (${FT.money(o.paid)} held)${o.eta ? ` · due ${App.date(o.eta)}` : ''}</p>
          <div class="mini-trk">${App.PHASES.map((p, i) => `<i class="${i < A.phaseIndex(o.phase) || o.phase === 'delivered' ? 'done' : i === A.phaseIndex(o.phase) ? 'now' : ''}"></i>`).join('')}</div>
          <p class="small"><b>${App.phaseLabel(o.phase)}</b>${o.customer?.phone ? ` · ${FT.esc(o.customer.phone)}` : ''}</p>
          <details class="small"><summary>Design details and measurements</summary>${v ? `<div class="chips" style="margin:8px 0">${E.summary(v.spec).map(t => `<span class="tag">${FT.esc(t)}</span>`).join('')}</div>` : ''}${v?.spec.notes?.length ? `<p>Notes: ${v.spec.notes.map(FT.esc).join('; ')}</p>` : ''}<div class="chips">${measureList(o.measurement)}</div></details>
          <ol class="feed compact">${[...o.events].reverse().slice(0, 3).map(e => `<li><span class="when">${App.ago(e.at)}</span><b>${FT.esc(e.title)}</b></li>`).join('')}</ol>
          ${['active'].includes(o.status) ? `<form class="form uform" style="grid-template-columns:1fr"><div class="field"><label for="ut-${o.id}">Post an update</label><input id="ut-${o.id}" name="title" placeholder="Fabric sourced from Balogun; cutting tomorrow" maxlength="80"></div><div class="field"><input name="body" placeholder="Details (optional)" maxlength="200" aria-label="Details"></div><p class="err" role="alert"></p><div class="row-btns"><button class="btn ghost sm" type="submit">Post update</button>${next ? `<button class="btn ink sm" type="button" data-phase="${next[0]}">${next[1]}</button>` : ''}</div></form>` : ''}
        </div></article>`; }).join('')}</div>`;
      $$('.uform', el).forEach(f => {
        const id = f.closest('.req').dataset.id;
        f.addEventListener('submit', async e => { e.preventDefault(); const d = Object.fromEntries(new FormData(f)); try { await A.updateOrder(id, { title: d.title, body: d.body }); FT.toast('Update posted'); orders(); } catch (x) { $('.err', f).textContent = x.message; } });
        $('[data-phase]', f)?.addEventListener('click', async b => { const phase = b.target.dataset.phase, d = Object.fromEntries(new FormData(f)); const title = d.title || (phase === 'tailoring' ? 'Fabric sourced, tailoring started' : 'Delivered'); if (phase === 'delivered' && !(await App.confirm('Mark as delivered?', 'The customer is told the order arrived and the payment is released to you.', { ok: 'Mark delivered' }))) return; try { await A.updateOrder(id, { phase, title, body: d.body }); FT.toast(App.phaseLabel(phase)); orders(); } catch (x) { $('.err', f).textContent = x.message; } });
      });
    }
    /* profile */
    function profile() {
      const el = $('[data-panel="profile"]'), SPECS = ['Kaftans', 'Agbada', 'Dresses', 'Suits', 'Shirts', 'Embroidery', 'Bridal', 'Production runs'];
      el.innerHTML = `<div class="split2" style="align-items:start"><div class="copy"><h2 class="h3">Workshop profile</h2><p class="body">Customers see this next to your quotes. Specialties decide which requests you are matched with.</p><div class="vstats"><div><b>${vendor.rating ? vendor.rating.toFixed(1) + ' ★' : 'New'}</b><span>${vendor.reviews} reviews</span></div><div><b>${vendor.ordersDone}</b><span>orders made</span></div><div><b>${vendor.status === 'verified' ? 'Verified' : vendor.status}</b><span>${vendor.verifiedAt ? App.date(vendor.verifiedAt) : ''}</span></div></div></div>
        <form class="form" id="vForm"><div class="field full"><label for="v-name">Workshop name</label><input id="v-name" name="name" value="${FT.esc(vendor.name)}"></div><div class="field"><label for="v-city">City</label><input id="v-city" name="city" value="${FT.esc(vendor.city)}"></div><div class="field"><label for="v-country">Country</label><input id="v-country" name="country" value="${FT.esc(vendor.country)}"></div><div class="field full"><label for="v-bio">About the workshop</label><textarea id="v-bio" name="bio">${FT.esc(vendor.bio)}</textarea></div><div class="field full"><span class="lbl">What you make</span><div class="chips" data-multi="specialties">${SPECS.map(s => `<button class="chip" type="button" data-v="${s}" aria-pressed="${vendor.specialties.includes(s)}">${s}</button>`).join('')}</div></div><div class="field"><label for="v-lead">Minimum lead time (days)</label><input id="v-lead" name="leadMin" type="number" min="2" max="60" value="${vendor.leadMin}"></div><p class="err full" role="alert"></p><div class="foot-row"><p></p><button class="btn ink" type="submit">Save profile</button></div></form></div>`;
      $('[data-multi]', el).addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); });
      $('#vForm').addEventListener('submit', async e => { e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f)); d.specialties = $$('[aria-pressed="true"]', f).map(b => b.dataset.v); try { vendor = await A.updateVendor(d); $('#wTitle').textContent = vendor.name; FT.toast('Workshop saved'); } catch (x) { $('.err', f).textContent = x.message; } });
    }
    const load = id => ({ requests, quotes, orders, profile })[id]?.();
    App.tabs($('#wTabs'), load); requests(); orders();
    const typing = () => root.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    const refresh = () => { if (document.hidden || typing()) return; const cur = $$('#wTabs [data-tab]').find(b => b.classList.contains('on'))?.dataset.tab; if (cur && cur !== 'profile') load(cur); };
    A.onChange(refresh);
    setInterval(refresh, A.pollMs * 4);
  });
})();
