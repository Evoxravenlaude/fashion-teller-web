/**
 * Fashion Teller API client.
 *
 * One surface, two backends:
 *   - apiBaseUrl empty: every call is served by the browser-side data layer in assets/js/store.js.
 *   - apiBaseUrl set:   every call is a JSON request to the Django backend in /backend (JWT bearer token, one
 *                       silent refresh on 401, readable errors). The backend speaks snake_case; this file converts
 *                       both ways, so pages always see the same camelCase records as in built-in mode.
 *
 * Pages only ever talk to window.FTApi. The route table below is the whole contract with the backend.
 */
(() => {
  const C = window.FT_CONFIG || {}, E = window.FTEngine;
  const devBase = (() => { try { const q = new URLSearchParams(location.search).get('api'); if (q != null && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) { q ? sessionStorage.setItem('ft.api', q) : sessionStorage.removeItem('ft.api'); } return /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? sessionStorage.getItem('ft.api') : null; } catch { return null; } })();
  const BASE = (devBase || C.apiBaseUrl || '').replace(/\/+$/, '');
  const PREFIX = C.apiPrefix || '/api/v1';
  const LOCAL = !BASE;
  const TIMEOUT = 25000;
  const S = window.FTStore;

  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const tokens = { get: () => ls.get('ft.tokens'), set: t => ls.set('ft.tokens', t) };
  const cachedUser = { get: () => ls.get('ft.user'), set: u => ls.set('ft.user', u) };
  const listeners = new Set(), emit = () => listeners.forEach(fn => { try { fn(); } catch {} });
  if (!LOCAL) addEventListener('storage', e => { if (e.key === 'ft.tokens' || e.key === 'ft.user') emit(); });

  /* snake_case on the wire, camelCase in the app. The contents of these keys are data, not fields: left as they are. */
  const OPAQUE = new Set(['spec', 'values', 'hints', 'card']);
  const camel = k => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
  const snake = k => k.replace(/[A-Z]/g, c => '_' + c.toLowerCase());
  const convert = (v, fn) => Array.isArray(v) ? v.map(x => convert(x, fn)) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [fn(k), OPAQUE.has(k) ? x : convert(x, fn)])) : v;

  class ApiError extends Error { constructor(message, status, body) { super(message); this.name = 'ApiError'; this.status = status; this.body = body; } }
  function readableError(body, status) {
    if (body && typeof body === 'object') {
      const first = body.detail ?? body.message ?? body.error ?? Object.values(body)[0];
      const text = Array.isArray(first) ? first[0] : first;
      if (typeof text === 'string' && text) return text;
    }
    if (status === 401) return 'Sign in to continue.';
    if (status === 403) return 'You do not have access to that.';
    if (status === 404) return 'That was not found.';
    if (status === 429) return 'Too many requests. Give it a minute.';
    if (status >= 500) return 'Fashion Teller is having trouble right now. Try again in a moment.';
    return 'That did not go through. Try again.';
  }
  async function send(path, { method = 'GET', body, auth = true } = {}, access) {
    const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      return await fetch(BASE + PREFIX + path, { method, signal: ctrl.signal, headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(auth && access ? { Authorization: 'Bearer ' + access } : {}) }, body: body !== undefined ? JSON.stringify(convert(body, snake)) : undefined });
    } catch { throw new ApiError('No connection to Fashion Teller. Check your internet and try again.', 0, null); }
    finally { clearTimeout(timer); }
  }
  let refreshing = null;
  function refreshAccess(refresh) {
    return refreshing || (refreshing = (async () => {
      try { const res = await send('/auth/refresh/', { method: 'POST', body: { refresh }, auth: false }); if (!res.ok) { tokens.set(null); cachedUser.set(null); emit(); return null; } const d = await res.json(); tokens.set({ access: d.access, refresh: d.refresh ?? refresh }); return d.access; }
      finally { setTimeout(() => (refreshing = null), 0); }
    })());
  }
  async function request(path, opt = {}) {
    const tk = opt.auth === false ? null : tokens.get();
    let res = await send(path, opt, tk?.access);
    if (res.status === 401 && tk?.refresh) { const a = await refreshAccess(tk.refresh); if (a) res = await send(path, opt, a); }
    const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    if (!res.ok) throw new ApiError(readableError(data, res.status), res.status, data);
    return convert(data, camel);
  }
  const qs = o => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o || {})) if (v !== '' && v != null && v !== false) p.set(snake(k), v === true ? '1' : v); const s = p.toString(); return s ? '?' + s : ''; };
  const get = (p, q) => request(p + qs(q)), post = (p, body = {}) => request(p, { method: 'POST', body }), patch = (p, body) => request(p, { method: 'PATCH', body }), put = (p, body) => request(p, { method: 'PUT', body }), del = p => request(p, { method: 'DELETE' });
  const signIn = d => { tokens.set({ access: d.access, refresh: d.refresh }); cachedUser.set(d.user); emit(); return d.user; };
  const id = v => encodeURIComponent(v);

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

  /* Sample tailors for the marketing pages (home compare demo, tailor rank simulator). */
  const SAMPLE_VENDORS = (() => {
    const spec = E.template('royal-kaftan').spec;
    return [
      { id: 'v_kano', name: 'Kano Embroidery Works', city: 'Kano', rating: 4.9, priceFactor: 1.22, speedFactor: 0.8, leadMin: 4 },
      { id: 'v_luxe', name: 'Luxe Ankara Hubs', city: 'Lagos', rating: 4.8, priceFactor: 1.05, speedFactor: 1.1, leadMin: 6 },
      { id: 'v_ndiaye', name: 'Maison Ndiaye', city: 'Dakar', rating: 4.7, priceFactor: 1.1, speedFactor: 1.4, leadMin: 9 },
      { id: 'v_abuja', name: 'Maitama Bespoke', city: 'Abuja', rating: 4.5, priceFactor: 0.95, speedFactor: 0.7, leadMin: 3 },
      { id: 'v_lbv', name: 'Casa Libreville Tailoring', city: 'Libreville', rating: 4.6, priceFactor: 0.88, speedFactor: 1.5, leadMin: 10 },
    ].map(v => { const p = E.price(spec, v); return { id: v.id, name: v.name, city: v.city, rating: v.rating, verified: true, price: p.price, deliveryDays: p.deliveryDays }; });
  })();

  /* ═════════ the API: [built-in call, backend call] for every method ═════════ */
  const R = {
    /* designs + versions */
    createDesign: o => { const spec = o.spec ? E.normalize(o.spec) : E.parse(o.prompt || '', o.hints || {}); return post('/designs/', { prompt: o.prompt || '', title: o.title || '', autoTitle: E.title(spec), spec }); },
    saveVersion: (d, spec, label = '', fromN = null) => post(`/designs/${id(d)}/versions/`, { spec: E.normalize(spec), label, fromN, autoTitle: E.title(spec) }),
    restoreVersion: (d, n) => post(`/designs/${id(d)}/restore/`, { n }),
    listDesigns: () => get('/designs/'),
    getDesign: d => get(`/designs/${id(d)}/`),
    renameDesign: (d, title) => patch(`/designs/${id(d)}/`, { title }),
    duplicateDesign: d => post(`/designs/${id(d)}/duplicate/`),
    deleteDesign: d => del(`/designs/${id(d)}/`).then(() => true),
    game: () => get('/me/game/'),
    /* publishing + Discover */
    publishDesign: (d, o = {}) => post(`/designs/${id(d)}/publish/`, { caption: o.caption || '', tags: o.tags || [], allowRemix: o.allowRemix !== false }),
    unpublishDesign: d => post(`/designs/${id(d)}/unpublish/`),
    discover: (o = {}) => get('/discover/', o),
    like: (d, on = true) => post(`/designs/${id(d)}/like/`, { on }),
    saveForLater: (d, on = true) => post(`/designs/${id(d)}/save/`, { on }),
    remixDesign: d => post(`/designs/${id(d)}/remix/`),
    reportContent: o => post('/reports/', o).then(() => true),
    /* designers */
    listDesigners: (o = {}) => get('/designers/', o),
    getDesigner: d => get(`/designers/${id(String(d).replace(/^@/, ''))}/`),
    myDesigner: () => get('/me/designer/'),
    saveDesignerProfile: o => put('/me/designer/', o),
    follow: (u, on = true) => post(`/designers/${id(u)}/follow/`, { on }),
    /* commissions */
    requestCommission: (designerId, o) => post('/commissions/', { designerId, ...o }),
    listCommissions: () => get('/commissions/'),
    getCommission: c => get(`/commissions/${id(c)}/`),
    offerCommission: (c, o) => post(`/commissions/${id(c)}/offer/`, o),
    declineCommission: (c, reason = '') => post(`/commissions/${id(c)}/decline/`, { reason }),
    payCommission: (c, o) => post(`/commissions/${id(c)}/pay/`, o),
    deliverCommission: (c, o) => post(`/commissions/${id(c)}/deliver/`, o),
    requestChanges: (c, note) => post(`/commissions/${id(c)}/changes/`, { note }),
    approveCommission: c => post(`/commissions/${id(c)}/approve/`),
    cancelCommission: c => post(`/commissions/${id(c)}/cancel/`),
    /* reviews */
    addReview: o => post('/reviews/', o),
    listReviews: (o = {}) => get('/reviews/', o),
    /* messages + notifications */
    listThreads: () => get('/threads/'),
    openThread: o => post('/threads/', o),
    getThread: t => get(`/threads/${id(t)}/`),
    sendMessage: (t, o) => post(`/threads/${id(t)}/messages/`, o),
    unread: () => (tokens.get() ? get('/me/unread/') : Promise.resolve({ notifications: 0, messages: 0 })),
    listNotifications: () => get('/me/notifications/'),
    markNotifications: (ids = 'all') => post('/me/notifications/read/', { ids }).then(() => true),
    /* measurements */
    listMeasurements: () => get('/me/measurements/'),
    saveMeasurement: m => (m.id ? patch(`/me/measurements/${id(m.id)}/`, m) : post('/me/measurements/', m)),
    deleteMeasurement: m => del(`/me/measurements/${id(m)}/`).then(() => true),
    /* tailors */
    listVendors: (o = {}) => get('/vendors/', o),
    getVendor: v => get(`/vendors/${id(v)}/`),
    myVendor: () => get('/vendors/me/'),
    updateVendor: o => patch('/vendors/me/', o),
    openRequests: () => get('/vendors/requests/'),
    submitQuote: (r, o) => post(`/vendors/requests/${id(r)}/quote/`, o),
    myQuotes: () => get('/vendors/quotes/'),
    vendorOrders: () => get('/vendors/orders/'),
    updateOrder: (o, u) => post(`/vendors/orders/${id(o)}/events/`, u),
    /* production requests, quotes, orders */
    requestQuotes: (d, o) => post(`/designs/${id(d)}/requests/`, o),
    getRequest: d => get(`/designs/${id(d)}/requests/latest/`),
    listQuotes: d => get(`/designs/${id(d)}/quotes/`),
    createOrder: (quoteId, o = {}) => post('/orders/', { quoteId, plan: o.plan || 'full' }),
    pay: (o, p = {}) => post(`/orders/${id(o)}/pay/`, p),
    listOrders: () => get('/orders/'),
    getOrder: o => get(`/orders/${id(o)}/`),
    cancelOrder: o => post(`/orders/${id(o)}/cancel/`),
    confirmDelivery: o => post(`/orders/${id(o)}/confirm/`),
    reportProblem: (o, b) => post(`/orders/${id(o)}/problem/`, b),
    contact: f => post('/contact/', f).then(() => true),
    /* email: confirm an address, reset a forgotten password (links arrive by email; built-in mode keeps them in a demo mailbox) */
    sendVerification: () => post('/me/verify/send/').then(() => true),
    forgotPassword: email => request('/auth/forgot/', { method: 'POST', body: { email }, auth: false }).then(() => true),
    resetPassword: (token, password) => request('/auth/reset/', { method: 'POST', body: { token, password }, auth: false }),
    mailbox: () => Promise.resolve([]),
    /* payouts: where a tailor or designer is paid, and what has been sent */
    listBanks: () => get('/payouts/banks/'),
    payoutAccount: () => get('/me/payout-account/'),
    savePayoutAccount: o => put('/me/payout-account/', o),
    earnings: () => get('/me/earnings/'),
    /* admin */
    adminStats: () => get('/admin/stats/'), adminUsers: () => get('/admin/users/'), adminVendors: () => get('/admin/vendors/'), adminDesigns: () => get('/admin/designs/'), adminOrders: () => get('/admin/orders/'),
    adminPayments: () => get('/admin/payments/'), adminCommissions: () => get('/admin/commissions/'), adminReports: () => get('/admin/reports/'), adminMessages: () => get('/admin/messages/'), adminApplications: () => get('/admin/applications/'), adminAudit: () => get('/admin/audit/'),
    adminSetVendorStatus: (v, status) => post(`/admin/vendors/${id(v)}/status/`, { status }),
    adminSetUserStatus: (u, status) => post(`/admin/users/${id(u)}/status/`, { status }),
    adminSetOrderPhase: (o, phase, note) => post(`/admin/orders/${id(o)}/phase/`, { phase, note }),
    adminResolveIssue: (o, b) => post(`/admin/orders/${id(o)}/issue/`, b),
    adminRefund: p => post(`/admin/payments/${id(p)}/refund/`),
    adminResolveReport: (r, action) => post(`/admin/reports/${id(r)}/resolve/`, { action }),
    adminPayouts: () => get('/admin/payouts/'),
    adminPayout: (p, o) => post(`/admin/payouts/${id(p)}/`, o),
  };

  const A = (window.FTApi = {
    local: LOCAL, sample: LOCAL, base: BASE, ApiError, PHASE_ORDER, phaseIndex, SAMPLE_VENDORS, money, DEMO: S?.DEMO,
    onChange: fn => { if (LOCAL) return S.onChange(fn); listeners.add(fn); return () => listeners.delete(fn); },
    pollMs: LOCAL ? 2500 : 6000,

    /* accounts */
    me: () => (LOCAL ? S.me() : tokens.get() ? cachedUser.get() : null),
    signedIn: () => !!A.me(),
    async register(form) { return LOCAL ? S.register(form) : signIn(await request('/auth/register/', { method: 'POST', body: form, auth: false })); },
    async login(email, password) { return LOCAL ? S.login(email, password) : signIn(await request('/auth/login/', { method: 'POST', body: { email, password }, auth: false })); },
    async logout() { if (LOCAL) return S.logout(); tokens.set(null); cachedUser.set(null); emit(); },
    async refreshMe() { if (LOCAL) return S.me(); if (!tokens.get()) return null; try { const u = await get('/me/'); cachedUser.set(u); emit(); return u; } catch (e) { if (e.status === 401) { tokens.set(null); cachedUser.set(null); emit(); return null; } return cachedUser.get(); } },
    async updateProfile(p) { if (LOCAL) return S.updateProfile(p); const u = await patch('/me/', p); cachedUser.set(u); emit(); return u; },
    async changePassword(current, next) { return LOCAL ? S.changePassword(current, next) : post('/me/password/', { current, next }).then(() => true); },
    async applyAsVendor(form) { if (LOCAL) return S.applyAsVendor(form); const d = await post('/vendors/apply/', form); if (d.access) signIn(d); else await A.refreshMe(); return d.vendor; },
    async saveDesignerProfile(o) { const p = LOCAL ? await S.saveDesignerProfile(o) : await R.saveDesignerProfile(o); if (!LOCAL) await A.refreshMe(); return p; },

    /** Start a Paystack payment: the backend creates the reference it will later verify. */
    async initPayment(target, kind) { if (LOCAL) return { reference: 'FT' + Date.now().toString(36).toUpperCase(), amount: null }; return target.commissionId ? post(`/commissions/${id(target.commissionId)}/pay/init/`) : post(`/orders/${id(target.orderId || target)}/pay/init/`, { kind }); },

    async verifyEmail(token) { const r = LOCAL ? await S.verifyEmail(token) : await request('/auth/verify/', { method: 'POST', body: { token }, auth: false }); if (!LOCAL) await A.refreshMe(); return r; },

    /** What this installation has switched on: the platform fee, payouts, email, photoreal try-on. Asked once. */
    features() { return A._features || (A._features = (LOCAL ? S.features() : request('/config/', { auth: false })).catch(() => ({ feePercent: 0, payouts: 'off', mail: 'off', tryOnAi: false, paymentsLive: false })).then(f => { A.ai.tryOn = !LOCAL && !!f.tryOnAi; return f; })); },
    /** Photoreal try-on: an AI service on the backend redraws a photo with the garment on. Off until features() says otherwise. */
    ai: { tryOn: false },
    async tryOnStart(designId, body) { if (!A.ai.tryOn) throw new ApiError('Photoreal try-on is not switched on.', 0); return post(`/designs/${id(designId)}/try-on/`, body); },
    async tryOnStatus(jobId) { return get(`/try-on/${id(jobId)}/`); },
  });
  for (const [name, remote] of Object.entries(R)) if (!A[name]) A[name] = LOCAL ? (...a) => S[name](...a) : (...a) => remote(...a);
  if (!LOCAL && tokens.get()) A.refreshMe();
})();
