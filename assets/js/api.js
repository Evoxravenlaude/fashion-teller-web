/**
 * Fashion Teller API client.
 *
 * One surface, two backends:
 *   - apiBaseUrl empty: every call is served by the browser-side data layer in assets/js/store.js
 *     (accounts, designs, versions, measurements, tailors, quotes, orders, payments, admin).
 *   - apiBaseUrl set: every call is a JSON request to the Django backend (SimpleJWT bearer token,
 *     one refresh on 401, readable DRF errors). The routes are listed in README.md.
 *
 * Pages only ever talk to window.FTApi.
 */
(() => {
  const C = window.FT_CONFIG || {};
  const BASE = (C.apiBaseUrl || '').replace(/\/+$/, '');
  const PREFIX = C.apiPrefix || '/api/v1';
  const LOCAL = !BASE;
  const TIMEOUT = 20000;
  const S = window.FTStore;

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const tokens = { get: () => store.get('ft.tokens'), set: t => store.set('ft.tokens', t) };
  const cachedUser = { get: () => store.get('ft.user'), set: u => store.set('ft.user', u) };

  class ApiError extends Error { constructor(message, status, body) { super(message); this.name = 'ApiError'; this.status = status; this.body = body; } }
  function readableError(body, status) {
    if (body && typeof body === 'object') {
      const first = body.detail ?? body.message ?? body.error ?? Object.values(body)[0];
      const text = Array.isArray(first) ? first[0] : first;
      if (typeof text === 'string' && text) return text;
    }
    if (status === 401 || status === 403) return 'Sign in again to continue.';
    if (status === 404) return 'That was not found.';
    if (status >= 500) return 'Fashion Teller is having trouble right now. Try again in a moment.';
    return 'That did not go through. Try again.';
  }
  async function send(path, { method = 'GET', body, auth = true } = {}, access) {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      return await fetch(BASE + PREFIX + path, { method, signal: ctrl.signal, headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(auth && access ? { Authorization: 'Bearer ' + access } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch { throw new ApiError('No connection to Fashion Teller. Check your internet and try again.', 0, null); }
    finally { clearTimeout(timer); }
  }
  async function refreshAccess(refresh) {
    const res = await send('/account/token/refresh/', { method: 'POST', body: { refresh }, auth: false });
    if (!res.ok) { tokens.set(null); cachedUser.set(null); return null; }
    const d = await res.json(); tokens.set({ access: d.access, refresh: d.refresh ?? refresh }); return d.access;
  }
  async function request(path, opt = {}) {
    const tk = opt.auth === false ? null : tokens.get();
    let res = await send(path, opt, tk?.access);
    if (res.status === 401 && tk?.refresh) { const a = await refreshAccess(tk.refresh); if (a) res = await send(path, opt, a); }
    const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) throw new ApiError(readableError(data, res.status), res.status, data);
    return data;
  }
  const get = p => request(p), post = (p, body) => request(p, { method: 'POST', body }), patch = (p, body) => request(p, { method: 'PATCH', body }), del = p => request(p, { method: 'DELETE' });

  /* Money: naira everywhere. */
  const CUR = C.currency || { code: 'NGN', symbol: '₦', locale: 'en-NG' };
  const money = (n, { compact = false } = {}) => {
    const v = Math.round(Number(n) || 0);
    if (compact && v >= 1e6) return CUR.symbol + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + 'M';
    if (compact && v >= 1e4) return CUR.symbol + Math.round(v / 1e3) + 'k';
    return CUR.symbol + v.toLocaleString(CUR.locale);
  };

  const PHASE_ORDER = ['concept_generated', 'vendor_assigned', 'tailoring', 'delivered'];
  const phaseIndex = p => Math.max(0, PHASE_ORDER.indexOf(p));

  /* Sample vendors for the marketing pages (home compare demo, tailor rank simulator). */
  const SAMPLE_VENDORS = (() => {
    const spec = window.FTEngine.parse('A midnight silk kaftan with gold embroidery across the chest, sleeves to the wrist');
    const base = [
      { id: 'v_kano', name: 'Kano Embroidery Works', city: 'Kano', rating: 4.9, priceFactor: 1.22, speedFactor: 0.8, leadMin: 4 },
      { id: 'v_luxe', name: 'Luxe Ankara Hubs', city: 'Lagos', rating: 4.8, priceFactor: 1.05, speedFactor: 1.1, leadMin: 6 },
      { id: 'v_ndiaye', name: 'Maison Ndiaye', city: 'Dakar', rating: 4.7, priceFactor: 1.1, speedFactor: 1.4, leadMin: 9 },
      { id: 'v_abuja', name: 'Maitama Bespoke', city: 'Abuja', rating: 4.5, priceFactor: 0.95, speedFactor: 0.7, leadMin: 3 },
      { id: 'v_lbv', name: 'Casa Libreville Tailoring', city: 'Libreville', rating: 4.6, priceFactor: 0.88, speedFactor: 1.5, leadMin: 10 },
    ];
    return base.map(v => { const p = window.FTEngine.price(spec, v); return { id: v.id, name: v.name, city: v.city, rating: v.rating, verified: true, price: p.price, deliveryDays: p.deliveryDays }; });
  })();

  /* Shape adapters for the Django backend (snake_case wire -> camelCase app). */
  const W = {
    user: u => u && ({ id: String(u.id), email: u.email, name: u.name || u.full_name || '', role: u.role || 'customer', phone: u.phone || '', city: u.city || '', country: u.country || '', vendorId: u.vendor_id ? String(u.vendor_id) : null, status: u.status || 'active', createdAt: u.created_at }),
    vendor: v => v && ({ id: String(v.id), name: v.name, city: v.city || '', country: v.country || '', specialties: v.specialties || [], bio: v.bio || '', rating: Number(v.rating || 0), reviews: v.review_count || 0, ordersDone: v.orders_done || 0, verified: !!v.is_verified, status: v.status || (v.is_verified ? 'verified' : 'pending'), since: v.since, sample: false, hue: v.hue || 40, leadMin: v.lead_min || 7, verifiedAt: v.verified_at, createdAt: v.created_at, userId: v.user_id ? String(v.user_id) : null }),
    version: v => ({ n: v.n ?? v.version, instruction: v.instruction ?? null, spec: v.spec || null, changes: v.changes || [], noted: v.noted ?? null, from: v.from_version ?? null, createdAt: v.created_at }),
    design: d => {
      if (!d) return null;
      let versions = (d.versions || []).map(W.version);
      if (!versions.length) { // contract v1: refinements only — rebuild versions from the prompt
        let spec = window.FTEngine.parse(d.prompt || '', d.hints || {}); versions = [{ n: 1, instruction: null, spec, changes: [], noted: null, createdAt: d.created_at }];
        (d.refinements || []).forEach((r, i) => { const x = window.FTEngine.refine(spec, r.instruction); spec = x.spec; versions.push({ n: i + 2, instruction: r.instruction, spec, changes: x.changes, noted: x.noted, createdAt: r.created_at }); });
      }
      versions.forEach(v => { if (!v.spec) v.spec = window.FTEngine.parse(d.prompt || '', d.hints || {}); });
      return { id: String(d.id), userId: d.user_id ? String(d.user_id) : null, title: d.title || window.FTEngine.title(versions[versions.length - 1].spec), prompt: d.prompt || '', hints: d.hints || {}, versions, current: d.current_version ?? d.version ?? versions[versions.length - 1].n, status: d.status || 'draft', videoUrl: d.video_url || null, createdAt: d.created_at, updatedAt: d.updated_at };
    },
    measurement: m => m && ({ id: String(m.id), label: m.label || 'Me', unit: m.unit || 'cm', values: m.values || {}, fit: m.fit || 'regular', notes: m.notes || '', createdAt: m.created_at, updatedAt: m.updated_at }),
    quote: q => q && ({ id: String(q.id), requestId: String(q.request_id), designId: String(q.design_id), vendorId: String(q.vendor_id), price: Number(q.price), deliveryDays: q.delivery_days, note: q.note || '', includesFabric: q.includes_fabric !== false, status: q.status || 'offered', createdAt: q.created_at, validUntil: q.valid_until, vendor: q.vendor ? W.vendor(q.vendor) : { id: String(q.vendor_id), name: q.vendor_name, city: q.city || '', rating: Number(q.rating || 0), verified: !!q.is_verified, specialties: [], hue: 40 } }),
    request: r => r && ({ id: String(r.id), designId: String(r.design_id), versionN: r.version, userId: String(r.user_id), measurementId: String(r.measurement_id), notes: r.notes || '', deadline: r.deadline, status: r.status, createdAt: r.created_at, design: r.design ? W.design(r.design) : null, customer: r.customer || null, measurement: r.measurement ? W.measurement(r.measurement) : null, myQuote: r.my_quote ? W.quote(r.my_quote) : null, suggested: r.suggested || null, quoteCount: r.quote_count || 0 }),
    order: o => o && ({ id: String(o.id), userId: String(o.user_id), vendorId: String(o.vendor_id), designId: String(o.design_id), versionN: o.version, quoteId: o.quote_id ? String(o.quote_id) : null, measurementId: o.measurement_id ? String(o.measurement_id) : null, total: Number(o.total), paid: Number(o.paid || 0), balance: Number(o.total) - Number(o.paid || 0), plan: o.plan || 'full', phase: o.phase, status: o.status || 'active', createdAt: o.created_at, paidAt: o.paid_at, eta: o.eta, deliveredAt: o.delivered_at, deliveryDays: o.delivery_days, events: (o.events || []).map(e => ({ at: e.created_at || e.at, phase: e.phase, title: e.title, body: e.body || '', by: e.by || 'system' })), vendor: o.vendor ? W.vendor(o.vendor) : { id: String(o.vendor_id), name: o.vendor_name || '', hue: 40 }, design: o.design ? W.design(o.design) : null, customer: o.customer || null, measurement: o.measurement ? W.measurement(o.measurement) : null }),
    payment: p => p && ({ id: String(p.id), orderId: String(p.order_id), amount: Number(p.amount), kind: p.kind, method: p.method, reference: p.reference, status: p.status, last4: p.last4 || null, createdAt: p.created_at, customer: p.customer, vendor: p.vendor }),
  };
  const specBody = s => ({ garment: s.garment, fabric: s.fabric, color: s.color, accent: s.accent, length: s.length, sleeves: s.sleeves, collar: s.collar, fit: s.fit, embroidery: s.embroidery, density: s.density, buttons: s.buttons, pockets: s.pockets, puff: s.puff, belt: s.belt, pattern: s.pattern, notes: s.notes });
  const mBody = m => ({ label: m.label, unit: m.unit, values: m.values, fit: m.fit, notes: m.notes });

  /* ═════════ the API ═════════ */
  const A = (window.FTApi = {
    local: LOCAL, sample: LOCAL, ApiError, PHASE_ORDER, phaseIndex, SAMPLE_VENDORS, money, DEMO: S?.DEMO,
    onChange: fn => (LOCAL ? S.onChange(fn) : () => {}),
    pollMs: LOCAL ? 2500 : 30000,

    /* accounts */
    me: () => (LOCAL ? S.me() : cachedUser.get()),
    signedIn: () => !!A.me(),
    async register(form) { if (LOCAL) return S.register(form); const d = await post('/account/register/', { name: form.name, email: form.email, password: form.password, role: form.role || 'customer', phone: form.phone, city: form.city, country: form.country }); tokens.set({ access: d.access, refresh: d.refresh }); const u = W.user(d.user || (await get('/account/me/'))); cachedUser.set(u); return u; },
    async login(email, password) { if (LOCAL) return S.login(email, password); const d = await post('/account/login/', { email, password }); tokens.set({ access: d.access, refresh: d.refresh }); const u = W.user(d.user || (await get('/account/me/'))); cachedUser.set(u); return u; },
    async logout() { if (LOCAL) return S.logout(); tokens.set(null); cachedUser.set(null); },
    async refreshMe() { if (LOCAL) return S.me(); if (!tokens.get()) return null; try { const u = W.user(await get('/account/me/')); cachedUser.set(u); return u; } catch { return cachedUser.get(); } },
    async updateProfile(p) { if (LOCAL) return S.updateProfile(p); const u = W.user(await patch('/account/me/', p)); cachedUser.set(u); return u; },
    async changePassword(cur, next) { return LOCAL ? S.changePassword(cur, next) : post('/account/password/', { current_password: cur, new_password: next }).then(() => true); },

    /* designs + versions */
    async createDesign({ prompt, hints }) { return LOCAL ? S.createDesign({ prompt, hints }) : W.design(await post('/design/', { prompt, hints, spec: specBody(window.FTEngine.parse(prompt, hints)) })); },
    async listDesigns() { return LOCAL ? S.listDesigns() : (await get('/design/')).map(W.design); },
    async getDesign(id) { return LOCAL ? S.getDesign(id) : W.design(await get(`/design/${id}/`)); },
    async refineDesign(id, instruction) {
      if (LOCAL) return S.refineDesign(id, instruction);
      const d = await A.getDesign(id), cur = d.versions.find(v => v.n === d.current) || d.versions[d.versions.length - 1], r = window.FTEngine.refine(cur.spec, instruction);
      return W.design(await post(`/design/${id}/refinements/`, { instruction, spec: specBody(r.spec), changes: r.changes, noted: r.noted }));
    },
    async restoreVersion(id, n) { return LOCAL ? S.restoreVersion(id, n) : W.design(await post(`/design/${id}/versions/${n}/restore/`, {})); },
    async renameDesign(id, title) { return LOCAL ? S.renameDesign(id, title) : W.design(await patch(`/design/${id}/`, { title })); },
    async duplicateDesign(id) { return LOCAL ? S.duplicateDesign(id) : W.design(await post(`/design/${id}/duplicate/`, {})); },
    async deleteDesign(id) { return LOCAL ? S.deleteDesign(id) : del(`/design/${id}/`).then(() => true); },

    /* measurements */
    async listMeasurements() { return LOCAL ? S.listMeasurements() : (await get('/account/measurements/')).map(W.measurement); },
    async saveMeasurement(m) { return LOCAL ? S.saveMeasurement(m) : W.measurement(await (m.id ? patch(`/account/measurements/${m.id}/`, mBody(m)) : post('/account/measurements/', mBody(m)))); },
    async deleteMeasurement(id) { return LOCAL ? S.deleteMeasurement(id) : del(`/account/measurements/${id}/`).then(() => true); },

    /* vendors */
    async listVendors(o) { return LOCAL ? S.listVendors(o) : (await get('/vendor/')).map(W.vendor); },
    async getVendor(id) { return LOCAL ? S.getVendor(id) : W.vendor(await get(`/vendor/${id}/`)); },
    async myVendor() { return LOCAL ? S.myVendor() : W.vendor(await get('/vendor/me/')); },
    async updateVendor(p) { return LOCAL ? S.updateVendor(p) : W.vendor(await patch('/vendor/me/', { name: p.name, city: p.city, country: p.country, bio: p.bio, specialties: p.specialties, lead_min: p.leadMin })); },
    async applyAsVendor(form) { if (LOCAL) return S.applyAsVendor(form); const d = await post('/vendor/apply/', form); if (d.access) { tokens.set({ access: d.access, refresh: d.refresh }); cachedUser.set(W.user(d.user)); } return W.vendor(d.vendor || d); },

    /* production requests + quotes */
    async requestQuotes(designId, o) { return LOCAL ? S.requestQuotes(designId, o) : W.request(await post(`/design/${designId}/requests/`, { measurement_id: o.measurementId, notes: o.notes, deadline: o.deadline })); },
    async getRequest(designId) { return LOCAL ? S.getRequest(designId) : W.request(await get(`/design/${designId}/requests/latest/`)); },
    async listQuotes(designId) { return LOCAL ? S.listQuotes(designId) : (await get(`/design/${designId}/quotes/`)).map(W.quote); },
    async openRequests() { return LOCAL ? S.openRequests() : (await get('/vendor/requests/')).map(W.request); },
    async submitQuote(requestId, q) { return LOCAL ? S.submitQuote(requestId, q) : W.quote(await post(`/vendor/requests/${requestId}/quote/`, { price: q.price, delivery_days: q.deliveryDays, note: q.note, includes_fabric: q.includesFabric })); },
    async myQuotes() { return LOCAL ? S.myQuotes() : (await get('/vendor/quotes/')).map(q => ({ ...W.quote(q), design: W.design(q.design), request: W.request(q.request) })); },

    /* orders + payments */
    async createOrder(quoteId, o) { return LOCAL ? S.createOrder(quoteId, o) : W.order(await post('/order/', { quote_id: quoteId, plan: o?.plan || 'full' })); },
    async pay(orderId, o) {
      if (LOCAL) return S.pay(orderId, o);
      // Paystack inline on the client; the backend verifies the reference and records the payment.
      const d = await post(`/order/${orderId}/payments/`, { method: o.method, kind: o.kind, reference: o.reference || null });
      return { payment: W.payment(d.payment || d), order: W.order(d.order || (await get(`/order/${orderId}/`))) };
    },
    async initPayment(orderId, kind) { return LOCAL ? { reference: 'FT' + Date.now().toString(36).toUpperCase(), amount: null } : post(`/order/${orderId}/payments/init/`, { kind }); },
    async listOrders() { return LOCAL ? S.listOrders() : (await get('/order/')).map(W.order); },
    async getOrder(id) { return LOCAL ? S.getOrder(id) : W.order(await get(`/order/${id}/`)); },
    async cancelOrder(id) { return LOCAL ? S.cancelOrder(id) : W.order(await post(`/order/${id}/cancel/`, {})); },
    async vendorOrders() { return LOCAL ? S.vendorOrders() : (await get('/vendor/orders/')).map(W.order); },
    async updateOrder(id, u) { return LOCAL ? S.updateOrder(id, u) : W.order(await post(`/vendor/orders/${id}/events/`, { phase: u.phase, title: u.title, body: u.body })); },

    /* contact */
    async contact(form) { return LOCAL ? S.contact(form) : post('/contact/', form).then(() => true); },

    /* admin */
    async adminStats() { return LOCAL ? S.adminStats() : get('/admin/stats/'); },
    async adminUsers() { return LOCAL ? S.adminUsers() : (await get('/admin/users/')).map(u => ({ ...W.user(u), designs: u.designs, orders: u.orders, spent: Number(u.spent || 0) })); },
    async adminVendors() { return LOCAL ? S.adminVendors() : (await get('/admin/vendors/')).map(v => ({ ...W.vendor(v), user: W.user(v.user), application: v.application, quotes: v.quotes, orders: v.orders })); },
    async adminSetVendorStatus(id, status) { return LOCAL ? S.adminSetVendorStatus(id, status) : W.vendor(await post(`/admin/vendors/${id}/status/`, { status })); },
    async adminSetUserStatus(id, status) { return LOCAL ? S.adminSetUserStatus(id, status) : W.user(await post(`/admin/users/${id}/status/`, { status })); },
    async adminDesigns() { return LOCAL ? S.adminDesigns() : (await get('/admin/designs/')).map(d => ({ ...W.design(d), owner: W.user(d.owner), quotes: d.quotes })); },
    async adminOrders() { return LOCAL ? S.adminOrders() : (await get('/admin/orders/')).map(W.order); },
    async adminSetOrderPhase(id, phase, note) { return LOCAL ? S.adminSetOrderPhase(id, phase, note) : W.order(await post(`/admin/orders/${id}/phase/`, { phase, note })); },
    async adminPayments() { return LOCAL ? S.adminPayments() : (await get('/admin/payments/')).map(W.payment); },
    async adminRefund(id) { return LOCAL ? S.adminRefund(id) : W.payment(await post(`/admin/payments/${id}/refund/`, {})); },
    async adminMessages() { return LOCAL ? S.adminMessages() : get('/admin/messages/'); },
    async adminApplications() { return LOCAL ? S.adminApplications() : get('/admin/applications/'); },
    async adminAudit() { return LOCAL ? S.adminAudit() : get('/admin/audit/'); },
  });
})();
