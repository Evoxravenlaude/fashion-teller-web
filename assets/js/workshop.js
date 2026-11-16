/** Workshop: the verified tailor's dashboard. Open requests to quote, quotes sent, orders to run (with photos), reviews, profile. */
(() => {
  document.addEventListener('DOMContentLoaded', async () => {
    const { $, $$ } = FT, A = window.FTApi, App = window.FTApp, Acc = window.FTAccount, E = window.FTEngine, esc = FT.esc, enc = encodeURIComponent;
    const root = $('#wRoot');
    const u = await Acc.require(root, { role: 'tailor', title: 'Sign in to your workshop', message: 'Quote on requests from customers anywhere, run your orders and get paid when they confirm delivery.' }); if (!u) return;
    let vendor = null; try { vendor = await A.myVendor(); } catch {}
    if (!vendor) { root.innerHTML = App.empty(App.ICON.inbox, 'No workshop on this account yet', 'Tell us about your workshop and we will verify it. Verified tailors can quote on every request.', '<a class="btn gold" href="/tailors#apply">Apply as a tailor</a>'); return; }
    const head = () => { $('#wTitle').textContent = vendor.name; $('#wSub').innerHTML = `${esc([vendor.city, vendor.country].filter(Boolean).join(', '))} · ${App.badge(vendor.status)} · ${vendor.rating ? vendor.rating.toFixed(1) + ' ★' : 'No reviews yet'} · ${App.plural(vendor.ordersDone, 'order')} made`; };
    head();
    const banner = $('#wBanner');
    if (vendor.status === 'pending') banner.innerHTML = `<div class="notice warn"><b>Verification pending.</b> We are checking your workshop details. You will be able to quote as soon as it is approved${A.local ? ' (sign in as the demo admin to approve it)' : ''}.</div>`;
    else if (vendor.status === 'rejected' || vendor.status === 'suspended') banner.innerHTML = `<div class="notice bad"><b>Your workshop is ${esc(vendor.status)}.</b> Contact support@fashionteller.com to resolve this.</div>`;
    const measureList = m => m ? App.MEASURE_FIELDS.filter(([k]) => m.values[k]).map(([k, l]) => `<span class="tag">${l} ${esc(m.values[k])}${esc(m.unit)}</span>`).join('') : '<span class="muted">No measurements attached</span>';
    const fail = (el, e) => { el.innerHTML = `<p class="err">${esc(e.message)}</p>`; };

    /* requests */
    async function requests() {
      const el = $('[data-panel="requests"]'); let list = [];
      try { list = await A.openRequests(); } catch (e) { return fail(el, e); }
      $('#cReq').textContent = list.filter(r => !r.myQuote).length || '';
      if (!list.length) { el.innerHTML = App.empty(App.ICON.inbox, vendor.status === 'verified' ? 'No open requests right now' : 'Requests appear once you are verified', 'When a customer requests quotes on a design, it shows up here with the design, their measurements and notes.'); return; }
      el.innerHTML = `<h2 class="sr">Requests to quote</h2><div class="reqs">${list.map(r => { const d = r.design, v = App.version(d, r.versionN); return `<article class="req" data-id="${esc(r.id)}">
        <a class="req-art" href="/design?id=${enc(d.id)}" aria-label="Open the design in 3D">${App.art(v.spec)}</a>
        <div class="req-body">
          <div class="card-top"><h3>${esc(d.title)}</h3>${r.myQuote ? App.badge(r.myQuote.status) : `<span class="badge gold">${App.plural(r.quoteCount, 'quote')} so far</span>`}</div>
          <p class="muted small">${esc(r.customer?.name || 'Customer')}, ${esc([r.customer?.city, r.customer?.country].filter(Boolean).join(', '))} · ${App.ago(r.createdAt)}${r.deadline ? ` · needed by ${App.date(r.deadline)}` : ''}</p>
          <div class="chips">${E.summary(v.spec).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>
          ${v.spec.notes?.length ? `<p class="small"><b>Tailor notes:</b> ${v.spec.notes.map(esc).join('; ')}</p>` : ''}
          ${r.notes ? `<p class="small"><b>From the customer:</b> ${esc(r.notes)}</p>` : ''}
          <details class="small"><summary>Measurements (${esc(r.measurement?.label || '—')}, ${esc(r.measurement?.fit || '')} fit)</summary><div class="chips" style="margin-top:8px">${measureList(r.measurement)}</div>${r.measurement?.notes ? `<p class="muted">${esc(r.measurement.notes)}</p>` : ''}</details>
          <a class="linkbtn" href="/design?id=${enc(d.id)}">${App.ICON.cube}See it in 3D and open the spec sheet</a>
          <form class="form two qform" novalidate>
            <div class="field"><label for="qp-${esc(r.id)}">Your price (₦, fabric included)</label><input id="qp-${esc(r.id)}" name="price" inputmode="numeric" type="number" step="500" min="1000" value="${esc(r.myQuote?.price ?? r.suggested?.price ?? '')}"></div>
            <div class="field"><label for="qd-${esc(r.id)}">Delivery (days)</label><input id="qd-${esc(r.id)}" name="deliveryDays" inputmode="numeric" type="number" min="1" max="90" value="${esc(r.myQuote?.deliveryDays ?? r.suggested?.deliveryDays ?? '')}"></div>
            <div class="field full"><label for="qn-${esc(r.id)}">Note to the customer</label><input id="qn-${esc(r.id)}" name="note" maxlength="400" value="${esc(r.myQuote?.note ?? '')}" placeholder="Fabric included. Two fittings by video."></div>
            <p class="err full" role="alert"></p>
            <div class="foot-row"><p>${r.suggested ? `Suggested from the design: ${FT.money(r.suggested.price)}, ${App.plural(r.suggested.deliveryDays, 'day')}.` : ''}</p><button class="btn ink" type="submit" ${vendor.status !== 'verified' ? 'disabled' : ''}>${r.myQuote ? 'Update quote' : 'Send quote'}</button></div>
          </form>
        </div></article>`; }).join('')}</div>`;
      $$('.qform', el).forEach(f => f.addEventListener('submit', async e => {
        e.preventDefault(); const rid = f.closest('.req').dataset.id, d = Object.fromEntries(new FormData(f)), err = $('.err', f), btn = $('button[type="submit"]', f);
        btn.disabled = true; err.textContent = '';
        try { await A.submitQuote(rid, { price: d.price, deliveryDays: d.deliveryDays, note: d.note }); FT.toast('Quote sent'); requests(); } catch (x) { err.textContent = x.message; btn.disabled = false; }
      }));
    }
    /* quotes */
    async function quotes() {
      const el = $('[data-panel="quotes"]'); let list = []; try { list = await A.myQuotes(); } catch (e) { return fail(el, e); }
      if (!list.length) { el.innerHTML = App.empty(App.ICON.inbox, 'No quotes sent yet', 'Quotes you send on requests are listed here with their outcome.'); return; }
      el.innerHTML = `<div class="table"><div class="tr th"><span>Design</span><span>Price</span><span>Delivery</span><span>Status</span><span>Sent</span></div>${list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(q => `<div class="tr"><span data-l="Design"><b>${esc(q.design?.title || '')}</b><br><small class="muted">${q.request ? 'v' + q.request.versionN + ' · ' : ''}${esc(q.note || '')}</small></span><span data-l="Price">${FT.money(q.price)}</span><span data-l="Delivery">${App.plural(q.deliveryDays, 'day')}</span><span data-l="Status">${App.badge(q.status)}</span><span data-l="Sent">${App.ago(q.createdAt)}</span></div>`).join('')}</div>`;
    }
    /* orders */
    const STEP = { vendor_assigned: ['tailoring', 'Start tailoring'], tailoring: ['delivered', 'Mark delivered'] };
    const shots = new Map(), drafts = new Map(); // photos and text for the next update, per order (kept while the list redraws)
    async function orders() {
      const el = $('[data-panel="orders"]'); let list = []; try { list = await A.vendorOrders(); } catch (e) { return fail(el, e); }
      $('#cOrd').textContent = list.filter(o => o.status === 'active').length || '';
      if (!list.length) { el.innerHTML = App.empty(App.ICON.order, 'No orders yet', 'When a customer accepts your quote and pays, the order appears here. Post updates and photos as you go; the customer sees them live.'); return; }
      el.innerHTML = `<h2 class="sr">Orders</h2><div class="reqs">${list.map(o => { const v = o.design && App.version(o.design, o.versionN), next = STEP[o.phase], pics = shots.get(o.id) || []; return `<article class="req" data-id="${esc(o.id)}">
        <a class="req-art" href="${o.design ? '/design?id=' + enc(o.design.id) : '#'}" aria-label="Open the design in 3D">${v ? App.art(v.spec) : ''}</a>
        <div class="req-body">
          <div class="card-top"><h3>${esc(o.design?.title || 'Design')} <small class="muted">· v${o.versionN}</small></h3>${App.badge(o.status)}</div>
          <p class="muted small">${esc(o.id)} · ${esc(o.customer?.name || '')}, ${esc(o.customer?.city || '')} · ${FT.money(o.total)} (${FT.money(o.paid)} ${o.status === 'completed' ? 'released to you' : 'held'})${o.eta && o.status === 'active' ? ` · due ${App.date(o.eta)}` : ''}</p>
          <div class="mini-trk" role="img" aria-label="${esc(App.phaseLabel(o.phase))}">${App.PHASES.map((p, i) => `<i class="${i < A.phaseIndex(o.phase) || o.phase === 'delivered' ? 'done' : i === A.phaseIndex(o.phase) ? 'now' : ''}"></i>`).join('')}</div>
          ${o.issue?.status === 'open' ? `<div class="notice warn" style="margin:0"><b>The customer reported a problem: ${esc(o.issue.reason)}.</b> ${esc(o.issue.body)} Payment is on hold while Fashion Teller reviews it. Message the customer to put it right.</div>` : o.status === 'delivered' ? '<p class="small"><b>Delivered.</b> Payment is released when the customer confirms they have it.</p>' : o.status === 'balance_due' ? '<p class="small"><b>Delivered.</b> Waiting for the customer to pay the balance.</p>' : `<p class="small"><b>${esc(App.phaseLabel(o.phase))}</b>${o.customer?.phone ? ` · ${esc(o.customer.phone)}` : ''}</p>`}
          <details class="small"><summary>Design details and measurements</summary>${v ? `<div class="chips" style="margin:8px 0">${E.summary(v.spec).map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}${v?.spec.notes?.length ? `<p>Notes: ${v.spec.notes.map(esc).join('; ')}</p>` : ''}<div class="chips">${measureList(o.measurement)}</div></details>
          <ol class="feed compact">${[...o.events].reverse().slice(0, 3).map(e => `<li><span class="when">${App.ago(e.at)}</span><b>${esc(e.title)}</b>${e.photos?.length ? ` <small class="muted">· ${App.plural(e.photos.length, 'photo')}</small>` : ''}</li>`).join('')}</ol>
          ${o.status === 'active' ? `<form class="form uform one" novalidate><div class="field"><label for="ut-${esc(o.id)}">Post an update</label><input id="ut-${esc(o.id)}" name="title" placeholder="Fabric sourced from Balogun; cutting tomorrow" maxlength="90" value="${esc(drafts.get(o.id)?.title || '')}"></div><div class="field"><input name="body" placeholder="Details (optional)" maxlength="600" aria-label="Details" value="${esc(drafts.get(o.id)?.body || '')}"></div>
            <div class="photos" data-shots>${pics.map((p, i) => `<button type="button" data-rm="${i}" aria-label="Remove photo"><img src="${p}" alt="Photo to post"></button>`).join('')}${pics.length < 3 ? `<label class="upl">${App.ICON.plus}<span>Add a photo</span><input type="file" accept="image/*" data-shot></label>` : ''}</div>
            <p class="err" role="alert"></p><div class="row-btns"><button class="btn ghost sm" type="submit">Post update</button>${next ? `<button class="btn ink sm" type="button" data-phase="${next[0]}">${next[1]}</button>` : ''}<button class="btn ghost sm" type="button" data-msg="order:${esc(o.id)}">Message customer</button></div></form>` : o.status !== 'cancelled' ? `<div class="row-btns compact"><button class="btn ghost sm" type="button" data-msg="order:${esc(o.id)}">Message customer</button></div>` : ''}
        </div></article>`; }).join('')}</div>`;
      $$('.uform', el).forEach(f => {
        const oid = f.closest('.req').dataset.id, send = async (phase, title, body) => { try { await A.updateOrder(oid, { phase, title, body, photos: shots.get(oid) || [] }); shots.delete(oid); drafts.delete(oid); FT.toast(phase ? App.phaseLabel(phase) : 'Update posted'); orders(); } catch (x) { $('.err', f).textContent = x.message; } };
        f.addEventListener('input', () => { const d = Object.fromEntries(new FormData(f)); drafts.set(oid, { title: d.title, body: d.body }); });
        f.addEventListener('submit', e => { e.preventDefault(); const d = Object.fromEntries(new FormData(f)); send(undefined, d.title, d.body); });
        f.addEventListener('change', async e => { const inp = e.target.closest('[data-shot]'); if (!inp?.files[0]) return; try { const url = await App.photo(inp.files[0], 640, 0.62); if (url.length > 200000) throw new Error('That photo is too large. Try another.'); shots.set(oid, [...(shots.get(oid) || []), url].slice(0, 3)); orders(); } catch (x) { $('.err', f).textContent = x.message; } });
        f.addEventListener('click', async e => {
          const rm = e.target.closest('[data-rm]'); if (rm) { const a = [...(shots.get(oid) || [])]; a.splice(+rm.dataset.rm, 1); shots.set(oid, a); orders(); return; }
          const b = e.target.closest('[data-phase]'); if (!b) return; const phase = b.dataset.phase, d = Object.fromEntries(new FormData(f));
          if (phase === 'delivered' && !(await App.confirm('Mark as delivered?', 'The customer is asked to confirm they have it. Your payment is released when they do.', { ok: 'Mark delivered' }))) return;
          send(phase, d.title || (phase === 'tailoring' ? 'Fabric sourced, tailoring started' : 'Delivered'), d.body);
        });
      });
    }
    /* reviews */
    async function reviews() {
      const el = $('[data-panel="reviews"]'); let list = []; try { list = await A.listReviews({ vendorId: vendor.id }); } catch (e) { return fail(el, e); }
      el.innerHTML = `<div class="split2" style="align-items:start"><div class="copy"><h2 class="h3">What customers say</h2><div class="vstats" style="margin-top:14px"><div><b>${vendor.rating ? vendor.rating.toFixed(1) : '—'}</b><span>${App.stars(vendor.rating, 12)}</span></div><div><b>${vendor.reviews}</b><span>reviews</span></div><div><b>${vendor.ordersDone}</b><span>orders made</span></div></div><p class="body">Customers can review an order once it is delivered. Reviews show on your profile next to every quote you send.</p></div><div>${App.reviews(list)}</div></div>`;
    }
    /* profile */
    function profile() {
      const el = $('[data-panel="profile"]'), SPECS = ['Kaftans', 'Agbada', 'Dresses', 'Suits', 'Shirts', 'Embroidery', 'Bridal', 'Production runs'];
      el.innerHTML = `<div class="split2" style="align-items:start"><div class="copy"><h2 class="h3">Workshop profile</h2><p class="body">Customers see this next to your quotes. Specialties decide which requests you are matched with.</p><div class="vstats"><div><b>${vendor.rating ? vendor.rating.toFixed(1) + ' ★' : 'New'}</b><span>${App.plural(vendor.reviews, 'review')}</span></div><div><b>${vendor.ordersDone}</b><span>orders made</span></div><div><b>${vendor.status === 'verified' ? 'Verified' : esc(vendor.status)}</b><span>${vendor.verifiedAt ? App.date(vendor.verifiedAt) : ''}</span></div></div></div>
        <form class="form" id="vForm" novalidate><div class="field full"><label for="v-name">Workshop name</label><input id="v-name" name="name" maxlength="80" value="${esc(vendor.name)}"></div><div class="field"><label for="v-city">City</label><input id="v-city" name="city" maxlength="60" value="${esc(vendor.city)}"></div><div class="field"><label for="v-country">Country</label><input id="v-country" name="country" maxlength="60" value="${esc(vendor.country)}"></div><div class="field full"><label for="v-bio">About the workshop</label><textarea id="v-bio" name="bio" maxlength="500">${esc(vendor.bio)}</textarea></div><div class="field full"><span class="lbl">What you make</span><div class="chips" data-multi="specialties">${SPECS.map(s => `<button class="chip" type="button" data-v="${s}" aria-pressed="${vendor.specialties.includes(s)}">${s}</button>`).join('')}</div></div><div class="field"><label for="v-lead">Minimum lead time (days)</label><input id="v-lead" name="leadMin" type="number" min="2" max="60" value="${esc(vendor.leadMin)}"></div><p class="err full" role="alert"></p><div class="foot-row"><p></p><button class="btn ink" type="submit">Save profile</button></div></form></div>`;
      $('[data-multi]', el).addEventListener('click', e => { const b = e.target.closest('button'); if (b) b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') !== 'true'); });
      $('#vForm').addEventListener('submit', async e => { e.preventDefault(); const f = e.target, d = Object.fromEntries(new FormData(f)); d.specialties = $$('[data-multi] [aria-pressed="true"]', f).map(b => b.dataset.v); try { vendor = await A.updateVendor(d); head(); FT.toast('Workshop saved'); } catch (x) { $('.err', f).textContent = x.message; } });
    }
    const views = { requests, quotes, orders, reviews, profile };
    const tabs = App.tabs($('#wTabs'), t => views[t]?.()); requests(); orders();
    const typing = () => root.contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    let t = null; const refresh = () => { if (document.hidden || typing() || shots.size || [...drafts.values()].some(d => d.title || d.body)) return; const cur = tabs.current(); if (cur && cur !== 'profile' && cur !== 'reviews') views[cur](); };
    A.onChange(() => { clearTimeout(t); t = setTimeout(refresh, 500); });
    setInterval(refresh, A.pollMs * 4);
  });
})();
