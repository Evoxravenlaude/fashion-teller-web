/**
 * Fashion Teller API client, ported from the mobile app's api/client.ts + api/fashionTeller.ts.
 * Same routes, same SimpleJWT handling (bearer token, one refresh on 401), same readable DRF errors.
 * Tokens live in sessionStorage so a sign-in survives moving between pages but not closing the tab.
 */
(() => {
  const C = window.FT_CONFIG || {};
  const BASE = (C.apiBaseUrl || '').replace(/\/+$/, '');
  const PREFIX = C.apiPrefix || '/api/v1';
  const SAMPLE = !BASE;
  const TIMEOUT = 15000;

  const store = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const tokens = { get: () => store.get('ft.tokens'), set: t => store.set('ft.tokens', t) };

  class ApiError extends Error {
    constructor(message, status, body) { super(message); this.name = 'ApiError'; this.status = status; this.body = body; }
  }

  function readableError(body, status) {
    if (body && typeof body === 'object') {
      const first = body.detail ?? body.message ?? Object.values(body)[0];
      const text = Array.isArray(first) ? first[0] : first;
      if (typeof text === 'string' && text) return text;
    }
    if (status === 401 || status === 403) return 'Sign in again to continue.';
    if (status >= 500) return 'Fashion Teller is having trouble right now. Try again in a moment.';
    return 'That did not go through. Try again.';
  }

  async function send(path, { method = 'GET', body, auth = true } = {}, access) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
    try {
      return await fetch(BASE + PREFIX + path, {
        method, signal: ctrl.signal,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(auth && access ? { Authorization: 'Bearer ' + access } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError('No connection to Fashion Teller. Check your internet and try again.', 0, null);
    } finally { clearTimeout(timer); }
  }

  async function refreshAccess(refresh) {
    const res = await send('/account/token/refresh/', { method: 'POST', body: { refresh }, auth: false });
    if (!res.ok) { tokens.set(null); return null; }
    const d = await res.json();
    tokens.set({ access: d.access, refresh: d.refresh ?? refresh });
    return d.access;
  }

  async function request(path, opt = {}) {
    const tk = opt.auth === false ? null : tokens.get();
    let res = await send(path, opt, tk?.access);
    if (res.status === 401 && tk?.refresh) {
      const a = await refreshAccess(tk.refresh);
      if (a) res = await send(path, opt, a);
    }
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; } // HTML error page, e.g. Django debug 500
    if (!res.ok) throw new ApiError(readableError(data, res.status), res.status, data);
    return data;
  }

  /* wire (snake_case) -> app (camelCase) */
  const toVendor = q => ({ id: String(q.vendor_id), name: q.vendor_name, rating: Number(q.rating), verified: !!q.is_verified, price: Number(q.price), deliveryDays: q.delivery_days, city: q.city || '' });
  const toDesign = d => ({ id: String(d.id), version: d.version, videoUrl: d.video_url, refinements: (d.refinements || []).map(r => r.instruction) });
  const toOrder = o => ({ id: String(o.id), phase: o.phase, vendorId: String(o.vendor_id), total: Number(o.total) });

  const PHASE_ORDER = ['concept_generated', 'vendor_assigned', 'tailoring', 'delivered'];
  const phaseIndex = p => Math.max(0, PHASE_ORDER.indexOf(p));

  /* sample data, used while apiBaseUrl is empty */
  const wait = (ms = 450) => new Promise(r => setTimeout(r, ms));
  const VENDORS = [
    { id: 'savile-row', name: 'Savile Row Custom Houses', city: 'London', rating: 4.9, verified: true, price: 340, deliveryDays: 6 },
    { id: 'luxe-ankara', name: 'Luxe Ankara Hubs', city: 'Lagos', rating: 4.8, verified: true, price: 295, deliveryDays: 8 },
    { id: 'maison-ndiaye', name: 'Maison Ndiaye', city: 'Dakar', rating: 4.7, verified: true, price: 260, deliveryDays: 10 },
    { id: 'kano-emb', name: 'Kano Embroidery Works', city: 'Kano', rating: 4.9, verified: true, price: 385, deliveryDays: 5 },
    { id: 'casa-lbv', name: 'Casa Libreville Tailoring', city: 'Libreville', rating: 4.6, verified: true, price: 225, deliveryDays: 12 },
  ];
  const SAMPLE_PHASE_MS = 12000; // the sample order moves one phase every 12s so the tracker can be seen working
  const sd = () => store.get('ft.sample.design') || { id: 'sample', version: 1, videoUrl: null, refinements: [] };

  window.FTApi = {
    sample: SAMPLE,
    ApiError, PHASE_ORDER, phaseIndex, SAMPLE_VENDORS: VENDORS,
    signedIn: () => SAMPLE || !!tokens.get(),

    /** POST account/login/ — SimpleJWT pair */
    async login(email, password) {
      if (SAMPLE) return wait();
      tokens.set(await request('/account/login/', { method: 'POST', body: { email, password }, auth: false }));
    },
    logout: () => tokens.set(null),

    /** POST design/ {prompt} — proposed route; the contract has no create-design route yet (see README) */
    async createDesign(prompt) {
      if (SAMPLE) { await wait(600); const d = { id: 'sample', version: 1, videoUrl: null, refinements: [], prompt }; store.set('ft.sample.design', d); return d; }
      return toDesign(await request('/design/', { method: 'POST', body: { prompt } }));
    },
    /** GET design/{id}/ */
    async getDesign(id) {
      if (SAMPLE) { await wait(); return sd(); }
      return toDesign(await request(`/design/${id}/`));
    },
    /** POST design/{id}/refinements/ — returns the design at its new version */
    async refineDesign(id, instruction) {
      if (SAMPLE) { await wait(900); const d = sd(); d.refinements.push(instruction); d.version += 1; store.set('ft.sample.design', d); return { ...d, refinements: [...d.refinements] }; }
      return toDesign(await request(`/design/${id}/refinements/`, { method: 'POST', body: { instruction } }));
    },
    /** GET design/{id}/quotes/ */
    async listQuotes(id) {
      if (SAMPLE) { await wait(700); return VENDORS.map(v => ({ ...v })); }
      return (await request(`/design/${id}/quotes/`)).map(toVendor);
    },
    /** POST order/ — server takes the total from the vendor's quote */
    async createOrder(designId, vendorId) {
      if (SAMPLE) {
        await wait(1000);
        const v = VENDORS.find(x => x.id === vendorId) ?? VENDORS[0];
        store.set('ft.sample.orderAt', Date.now());
        return { id: 'FT-' + String(Date.now()).slice(-6), phase: 'vendor_assigned', vendorId: v.id, total: v.price };
      }
      return toOrder(await request('/order/', { method: 'POST', body: { design_id: designId, vendor_id: vendorId } }));
    },
    /** GET order/{id}/ — polled to move the tracker */
    async getOrder(id) {
      if (SAMPLE) {
        await wait(200);
        const at = store.get('ft.sample.orderAt') || Date.now();
        const n = Math.min(3, 1 + Math.floor((Date.now() - at) / SAMPLE_PHASE_MS));
        return { id, phase: PHASE_ORDER[n], vendorId: '', total: 0 };
      }
      return toOrder(await request(`/order/${id}/`));
    },
    pollMs: SAMPLE ? 3000 : 30000,
  };
})();
