/**
 * Fashion Teller local data layer — the product's backend, running in the browser.
 *
 * Used while FT_CONFIG.apiBaseUrl is empty. Everything is persisted in this browser's localStorage
 * (key ft.db.v1) and mirrored across open tabs, so a customer tab and a tailor tab on the same device see
 * each other's changes live. Passwords are salted and hashed (PBKDF2-SHA256) before they are stored.
 *
 * Collections: users, designs, measurements, vendors, applications, requests, quotes, orders, payments,
 * messages, audit. The method surface is the same one assets/js/api.js exposes against the Django backend.
 */
(() => {
  const C = window.FT_CONFIG || {}, E = window.FTEngine;
  const KEY = 'ft.db.v1', SESSION = 'ft.session';
  const now = () => Date.now();
  const iso = t => new Date(t || now()).toISOString();
  const clone = o => JSON.parse(JSON.stringify(o));
  const uid = (p = '') => p + now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);
  const orderNo = () => 'FT-' + String(now()).slice(-6);
  const hash32 = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  class StoreError extends Error { constructor(m, status = 400) { super(m); this.name = 'ApiError'; this.status = status; } }

  /* ───────── persistence ───────── */
  let db = null;
  const empty = () => ({ v: 1, users: [], designs: [], measurements: [], vendors: [], applications: [], requests: [], quotes: [], orders: [], payments: [], messages: [], audit: [], seededAt: null });
  function load() { try { db = JSON.parse(localStorage.getItem(KEY)) || empty(); } catch { db = empty(); } if (!db.seededAt) seed(); return db; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('Fashion Teller: storage is full or blocked', e); } emit(); }
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => { try { fn(); } catch {} });
  addEventListener('storage', e => { if (e.key === KEY || e.key === SESSION) { try { db = JSON.parse(localStorage.getItem(KEY)) || db; } catch {} emit(); } });

  /* ───────── passwords ───────── */
  const enc = new TextEncoder();
  const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  async function hashPassword(password, salt) {
    try {
      if (crypto?.subtle) {
        const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 60000, hash: 'SHA-256' }, key, 256);
        return 'pbkdf2$' + toHex(bits);
      }
    } catch {}
    return 'fnv$' + hash32(salt + ':' + password).toString(16) + hash32(password + ':' + salt).toString(16); // non-secure contexts only (file://)
  }
  const newSalt = () => { try { return toHex(crypto.getRandomValues(new Uint8Array(12))); } catch { return uid('s'); } };

  /* ───────── seed data ───────── */
  const SAMPLE_VENDORS = [
    { id: 'v_luxe', name: 'Luxe Ankara Hubs', city: 'Lagos', country: 'Nigeria', specialties: ['Kaftans', 'Agbada', 'Dresses', 'Embroidery'], bio: 'Lekki atelier known for hand-finished embroidery on kaftans and agbada. Fabric sourced from Balogun market or supplied by you.', rating: 4.8, reviews: 212, ordersDone: 640, priceFactor: 1.05, speedFactor: 1.1, leadMin: 6, since: 2016 },
    { id: 'v_kano', name: 'Kano Embroidery Works', city: 'Kano', country: 'Nigeria', specialties: ['Kaftans', 'Agbada', 'Embroidery'], bio: 'Third-generation embroiderers. Machine and hand embroidery in gold, silver and tonal thread.', rating: 4.9, reviews: 148, ordersDone: 410, priceFactor: 1.22, speedFactor: 0.8, leadMin: 4, since: 2009 },
    { id: 'v_island', name: 'Lagos Island Fashion House', city: 'Lagos', country: 'Nigeria', specialties: ['Suits', 'Shirts', 'Dresses'], bio: 'Bespoke suits and shirts from Lagos Island. Canvassed jackets, working cuffs, two fittings by video.', rating: 4.7, reviews: 96, ordersDone: 320, priceFactor: 1.15, speedFactor: 1.2, leadMin: 7, since: 2014 },
    { id: 'v_asoebi', name: 'Aso Ebi Atelier', city: 'Ibadan', country: 'Nigeria', specialties: ['Dresses', 'Bridal', 'Production runs'], bio: 'Occasion wear and aso ebi for groups of 5 to 200. Consistent sizing across a run.', rating: 4.6, reviews: 301, ordersDone: 1900, priceFactor: 0.9, speedFactor: 1.0, leadMin: 8, since: 2012 },
    { id: 'v_abuja', name: 'Maitama Bespoke', city: 'Abuja', country: 'Nigeria', specialties: ['Kaftans', 'Suits', 'Shirts'], bio: 'Senator styles and sharp kaftans for the capital. Quick turnarounds for travel.', rating: 4.5, reviews: 74, ordersDone: 210, priceFactor: 0.95, speedFactor: 0.7, leadMin: 3, since: 2019 },
    { id: 'v_ph', name: 'Garden City Tailors', city: 'Port Harcourt', country: 'Nigeria', specialties: ['Kaftans', 'Dresses', 'Shirts'], bio: 'Everyday custom wear at honest prices. Good with linen and cotton.', rating: 4.4, reviews: 158, ordersDone: 520, priceFactor: 0.82, speedFactor: 1.3, leadMin: 7, since: 2017 },
    { id: 'v_ndiaye', name: 'Maison Ndiaye', city: 'Dakar', country: 'Senegal', specialties: ['Agbada', 'Kaftans', 'Embroidery'], bio: 'Grand boubou and kaftan specialists. Bazin riche and hand embroidery.', rating: 4.7, reviews: 63, ordersDone: 180, priceFactor: 1.1, speedFactor: 1.4, leadMin: 9, since: 2011 },
    { id: 'v_lbv', name: 'Casa Libreville Tailoring', city: 'Libreville', country: 'Gabon', specialties: ['Dresses', 'Shirts', 'Suits'], bio: 'Francophone cuts with African prints. Ships across Central and West Africa.', rating: 4.6, reviews: 41, ordersDone: 130, priceFactor: 0.88, speedFactor: 1.5, leadMin: 10, since: 2018 },
  ];
  const DEMO = { customer: { email: 'customer@demo.fashionteller', password: 'fashion2026' }, tailor: { email: 'tailor@demo.fashionteller', password: 'fashion2026' }, admin: { email: 'admin@demo.fashionteller', password: 'fashion2026' } };

  function seed() {
    const t = now(), d = n => t - n * 86400000;
    db.vendors = SAMPLE_VENDORS.map(v => ({ ...v, verified: 'verified', verifiedAt: iso(d(400)), sample: true, createdAt: iso(d(420)), userId: null, hue: hash32(v.id) % 360 }));
    // demo accounts: hashes are filled in on first sign-in (see login), so seeding stays synchronous
    const u = (id, email, name, role, extra = {}) => ({ id, email, name, role, passHash: null, salt: newSalt(), phone: '', city: 'Lagos', country: 'Nigeria', status: 'active', createdAt: iso(d(30)), demo: true, ...extra });
    db.users = [
      u('u_admin', DEMO.admin.email, 'Fashion Teller Admin', 'admin'),
      u('u_cust', DEMO.customer.email, 'Adaeze Okafor', 'customer', { phone: '+234 802 000 0000' }),
      u('u_tail', DEMO.tailor.email, 'Tunde Bakare', 'tailor', { vendorId: 'v_demo', phone: '+234 803 000 0000' }),
      u('u_c2', 'ifeoma@example.com', 'Ifeoma Nwosu', 'customer', { demo: false, city: 'Enugu' }),
      u('u_c3', 'kwame@example.com', 'Kwame Mensah', 'customer', { demo: false, city: 'Accra', country: 'Ghana' }),
      u('u_t2', 'amaka@example.com', 'Amaka Eze', 'tailor', { demo: false, vendorId: 'v_pending', city: 'Onitsha' }),
    ];
    db.vendors.push({ id: 'v_demo', userId: 'u_tail', name: 'Bakare Atelier', city: 'Lagos', country: 'Nigeria', specialties: ['Kaftans', 'Agbada', 'Shirts', 'Embroidery'], bio: 'Yaba workshop, six machines, two embroiderers. Fabric from Balogun or yours.', rating: 4.8, reviews: 37, ordersDone: 112, priceFactor: 1.0, speedFactor: 1.0, leadMin: 5, since: 2020, verified: 'verified', verifiedAt: iso(d(60)), sample: false, createdAt: iso(d(90)), hue: 42 });
    db.vendors.push({ id: 'v_pending', userId: 'u_t2', name: 'Eze Stitches', city: 'Onitsha', country: 'Nigeria', specialties: ['Dresses', 'Bridal'], bio: 'Bridal and occasion dresses, eight years in Onitsha main market.', rating: 0, reviews: 0, ordersDone: 0, priceFactor: 0.92, speedFactor: 1.1, leadMin: 7, since: 2018, verified: 'pending', verifiedAt: null, sample: false, createdAt: iso(d(2)), hue: 300 });
    db.applications.push({ id: uid('a_'), userId: 'u_t2', vendorId: 'v_pending', workshop: 'Eze Stitches', name: 'Amaka Eze', email: 'amaka@example.com', phone: '+234 806 000 0000', city: 'Onitsha', country: 'Nigeria', specialties: ['Dresses', 'Bridal'], about: 'Eight years making bridal and aso ebi. Instagram: @ezestitches', status: 'pending', createdAt: iso(d(2)) });
    // a couple of finished orders so dashboards have history
    const mk = (uidx, vendorId, prompt, hints, daysAgo, phase) => {
      const spec = E.parse(prompt, hints), design = { id: uid('d_'), userId: uidx, title: E.title(spec), prompt, hints, versions: [{ n: 1, instruction: null, spec, changes: [], noted: null, createdAt: iso(d(daysAgo)) }], current: 1, status: 'ordered', createdAt: iso(d(daysAgo)), updatedAt: iso(d(daysAgo)) };
      db.designs.push(design);
      const v = db.vendors.find(x => x.id === vendorId), q = E.price(spec, v);
      const m = { id: uid('m_'), userId: uidx, label: 'Me', unit: 'cm', values: { height: 172, neck: 39, shoulder: 46, chest: 98, waist: 84, hips: 98, sleeve: 62, length: 140, inseam: 80, thigh: 58 }, fit: 'regular', notes: '', createdAt: iso(d(daysAgo)), updatedAt: iso(d(daysAgo)) };
      db.measurements.push(m);
      const req = { id: uid('r_'), designId: design.id, versionN: 1, userId: uidx, measurementId: m.id, notes: '', deadline: null, status: 'ordered', createdAt: iso(d(daysAgo)) };
      db.requests.push(req);
      const quote = { id: uid('q_'), requestId: req.id, designId: design.id, vendorId, price: q.price, deliveryDays: q.deliveryDays, note: 'Fabric included.', includesFabric: true, status: 'accepted', createdAt: iso(d(daysAgo)), validUntil: iso(d(daysAgo - 7)) };
      db.quotes.push(quote);
      const o = { id: 'FT-' + String(hash32(design.id)).slice(0, 6), userId: uidx, vendorId, designId: design.id, versionN: 1, quoteId: quote.id, requestId: req.id, measurementId: m.id, total: q.price, paid: q.price, plan: 'full', phase, status: phase === 'delivered' ? 'delivered' : 'active', createdAt: iso(d(daysAgo)), paidAt: iso(d(daysAgo)), eta: iso(d(daysAgo - q.deliveryDays)), deliveredAt: phase === 'delivered' ? iso(d(daysAgo - q.deliveryDays)) : null, events: [
        { at: iso(d(daysAgo)), phase: 'concept_generated', title: 'Concept approved', body: `Version 1 approved by the customer.`, by: 'system' },
        { at: iso(d(daysAgo)), phase: 'vendor_assigned', title: `${v.name} accepted the order`, body: 'Payment received and held by Fashion Teller.', by: 'system' },
        ...(phase !== 'vendor_assigned' ? [{ at: iso(d(daysAgo - 2)), phase: 'tailoring', title: 'Fabric sourced', body: 'Cutting has started.', by: 'vendor' }] : []),
        ...(phase === 'delivered' ? [{ at: iso(d(daysAgo - q.deliveryDays)), phase: 'delivered', title: 'Delivered', body: 'Signed for at the door.', by: 'vendor' }] : []),
      ] };
      db.orders.push(o);
      db.payments.push({ id: uid('p_'), orderId: o.id, userId: uidx, vendorId, amount: q.price, kind: 'full', method: 'card', reference: 'FT' + hash32(o.id).toString(36).toUpperCase(), status: 'paid', createdAt: iso(d(daysAgo)) });
    };
    mk('u_c2', 'v_luxe', 'An emerald Ankara dress, knee length, puff sleeves', {}, 21, 'delivered');
    mk('u_c3', 'v_demo', 'An ivory agbada with gold embroidery on the chest', {}, 6, 'tailoring');
    mk('u_c2', 'v_kano', 'A midnight silk kaftan with gold embroidery across the chest, sleeves to the wrist', {}, 1, 'vendor_assigned');
    db.seededAt = iso();
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
  }

  /* ───────── session ───────── */
  const session = {
    get() { try { return JSON.parse(localStorage.getItem(SESSION)); } catch { return null; } },
    set(s) { try { s ? localStorage.setItem(SESSION, JSON.stringify(s)) : localStorage.removeItem(SESSION); } catch {} emit(); },
  };
  const me = () => { const s = session.get(); if (!s) return null; const u = db.users.find(x => x.id === s.userId); return u && u.status !== 'suspended' ? u : null; };
  const need = (role) => { const u = me(); if (!u) throw new StoreError('Sign in to continue.', 401); if (role && u.role !== role && u.role !== 'admin') throw new StoreError('This area is for ' + role + ' accounts.', 403); return u; };
  const pub = u => u && ({ id: u.id, email: u.email, name: u.name, role: u.role, phone: u.phone || '', city: u.city || '', country: u.country || '', vendorId: u.vendorId || null, status: u.status, createdAt: u.createdAt, demo: !!u.demo });
  const audit = (action, target, by) => { db.audit.unshift({ at: iso(), by: by || me()?.id || 'system', action, target }); db.audit.length = Math.min(db.audit.length, 500); };

  /* ───────── helpers ───────── */
  const vendorPub = v => v && ({ id: v.id, name: v.name, city: v.city, country: v.country, specialties: v.specialties, bio: v.bio, rating: v.rating, reviews: v.reviews, ordersDone: v.ordersDone, verified: v.verified === 'verified', status: v.verified, since: v.since, sample: !!v.sample, hue: v.hue, leadMin: v.leadMin, verifiedAt: v.verifiedAt, createdAt: v.createdAt, userId: v.userId });
  const designOut = d => ({ ...clone(d), render: null });
  const version = (d, n) => d.versions.find(v => v.n === (n ?? d.current));
  const email = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
  const sampleDelay = (reqId, vId) => { const [lo, hi] = C.sample?.quoteDelayMs || [1500, 8000]; return lo + (hash32(reqId + vId) % (hi - lo)); };
  const matches = (v, spec) => { const g = { kaftan: 'Kaftans', agbada: 'Agbada', boubou: 'Dresses', dress: 'Dresses', suit: 'Suits', shirt: 'Shirts' }[spec.garment]; return v.specialties.includes(g) || v.specialties.includes('Production runs'); };

  /* Sample tailors quote on open requests after a short delay; sample orders move through production on a timer. */
  function simulateQuotes(req) {
    if (req.status !== 'open') return;
    const design = db.designs.find(d => d.id === req.designId); if (!design) return;
    const spec = version(design, req.versionN).spec; let changed = false;
    for (const v of db.vendors.filter(x => x.sample && x.verified === 'verified')) {
      if (db.quotes.some(q => q.requestId === req.id && q.vendorId === v.id)) continue;
      const h = hash32(req.id + v.id + 'q');
      if (!matches(v, spec) && h % 100 < 70) continue;          // most tailors quote only on what they make
      if (h % 100 >= 88) continue;                                // some are busy
      if (now() < new Date(req.createdAt).getTime() + sampleDelay(req.id, v.id)) continue;
      const p = E.price(spec, v), jitter = 1 + ((h % 9) - 4) / 100;
      const notes = ['Fabric included. Two fittings by video.', 'Price includes fabric and delivery within Nigeria.', 'Can start this week. Fabric sourced locally or send yours.', 'Embroidery done by hand. Fabric included.', 'Includes fabric; add 2 days for delivery outside Lagos.'];
      db.quotes.push({ id: uid('q_'), requestId: req.id, designId: design.id, vendorId: v.id, price: Math.round((p.price * jitter) / 500) * 500, deliveryDays: p.deliveryDays, note: notes[h % notes.length], includesFabric: true, status: 'offered', createdAt: iso(new Date(req.createdAt).getTime() + sampleDelay(req.id, v.id)), validUntil: iso(now() + 7 * 86400000) });
      changed = true;
    }
    if (changed) save();
  }
  const PHASES = ['concept_generated', 'vendor_assigned', 'tailoring', 'delivered'];
  function simulateOrder(o) {
    const v = db.vendors.find(x => x.id === o.vendorId);
    if (!v?.sample || o.status !== 'active' || !o.paidAt) return;
    const pace = C.sample?.orderPhaseMs || 30000, el = now() - new Date(o.paidAt).getTime();
    const steps = [
      [1.0, 'tailoring', 'Fabric sourced', `${v.name} sourced the fabric and started cutting.`],
      [1.7, 'tailoring', 'Sewing in progress', 'Body and sleeves assembled; embroidery is next.'],
      [2.4, 'tailoring', 'Finishing', 'Embroidery complete. Pressing and quality check.'],
      [3.0, 'tailoring', 'Dispatched', 'Quality checked and handed to the courier.'],
      [3.6, 'delivered', 'Delivered', 'Delivered to your door. Enjoy wearing it.'],
    ];
    let changed = false;
    for (const [k, phase, title, body] of steps) {
      if (el < k * pace || o.events.some(e => e.title === title)) continue;
      o.events.push({ at: iso(new Date(o.paidAt).getTime() + k * pace), phase, title, body, by: 'vendor' });
      o.phase = phase; changed = true;
      if (phase === 'delivered') { o.status = o.paid < o.total ? 'balance_due' : 'delivered'; o.deliveredAt = iso(); v.ordersDone += 1; }
    }
    if (changed) save();
  }

  /* ═════════ public API ═════════ */
  const S = (window.FTStore = {
    onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    DEMO, PHASES,
    reset() { localStorage.removeItem(KEY); localStorage.removeItem(SESSION); load(); emit(); },

    /* ───── accounts ───── */
    me: () => pub(me()),
    async register({ name, email: em, password, role = 'customer', phone = '', city = '', country = '' }) {
      em = String(em || '').trim().toLowerCase();
      if (!name?.trim()) throw new StoreError('Enter your name.');
      if (!email(em)) throw new StoreError('Enter a valid email address.');
      if (!password || password.length < 8) throw new StoreError('Use a password of at least 8 characters.');
      if (db.users.some(u => u.email === em)) throw new StoreError('An account with this email already exists. Sign in instead.', 409);
      if (!['customer', 'tailor'].includes(role)) role = 'customer';
      const salt = newSalt();
      const u = { id: uid('u_'), email: em, name: name.trim(), role, passHash: await hashPassword(password, salt), salt, phone, city, country, status: 'active', createdAt: iso(), demo: false };
      db.users.push(u); audit('register', u.id, u.id); save();
      session.set({ userId: u.id, token: uid('t_'), at: iso() });
      return pub(u);
    },
    async login(em, password) {
      em = String(em || '').trim().toLowerCase();
      const u = db.users.find(x => x.email === em);
      await wait(250);
      if (!u) throw new StoreError('No account with that email. Create one to get started.', 401);
      if (u.status === 'suspended') throw new StoreError('This account has been suspended. Contact support.', 403);
      if (u.passHash == null) { // demo accounts get their hash on first sign-in
        const demo = Object.values(DEMO).find(d => d.email === em);
        if (!demo || password !== demo.password) throw new StoreError('That password is not right.', 401);
        u.passHash = await hashPassword(password, u.salt); save();
      } else if ((await hashPassword(password, u.salt)) !== u.passHash) throw new StoreError('That password is not right.', 401);
      session.set({ userId: u.id, token: uid('t_'), at: iso() }); audit('login', u.id, u.id);
      return pub(u);
    },
    logout() { session.set(null); },
    async updateProfile(patch) {
      const u = need();
      for (const k of ['name', 'phone', 'city', 'country']) if (patch[k] != null) u[k] = String(patch[k]).trim();
      if (patch.email != null) { const em = String(patch.email).trim().toLowerCase(); if (!email(em)) throw new StoreError('Enter a valid email address.'); if (db.users.some(x => x.email === em && x.id !== u.id)) throw new StoreError('That email is already in use.'); u.email = em; }
      save(); return pub(u);
    },
    async changePassword(current, next) {
      const u = need();
      if ((await hashPassword(current, u.salt)) !== u.passHash) throw new StoreError('Your current password is not right.');
      if (!next || next.length < 8) throw new StoreError('Use a new password of at least 8 characters.');
      u.salt = newSalt(); u.passHash = await hashPassword(next, u.salt); save(); return true;
    },

    /* ───── designs + versions ───── */
    async createDesign({ prompt, hints = {} }) {
      const u = need();
      if (!prompt?.trim()) throw new StoreError('Describe the garment first.');
      const spec = E.parse(prompt, hints);
      const d = { id: uid('d_'), userId: u.id, title: E.title(spec), prompt: prompt.trim(), hints, versions: [{ n: 1, instruction: null, spec, changes: [], noted: null, createdAt: iso() }], current: 1, status: 'draft', createdAt: iso(), updatedAt: iso() };
      db.designs.unshift(d); save(); return designOut(d);
    },
    async listDesigns() { const u = need(); return db.designs.filter(d => d.userId === u.id || u.role === 'admin').map(designOut); },
    async getDesign(id) {
      const u = me(), d = db.designs.find(x => x.id === id);
      if (!d) throw new StoreError('That design no longer exists.', 404);
      const vendor = u?.vendorId && db.vendors.find(v => v.id === u.vendorId);
      const allowed = u && (d.userId === u.id || u.role === 'admin' || (vendor && (db.requests.some(r => r.designId === d.id) )));
      if (!allowed) throw new StoreError('Sign in to open this design.', 403);
      return designOut(d);
    },
    async refineDesign(id, instruction) {
      const u = need(), d = db.designs.find(x => x.id === id && (x.userId === u.id || u.role === 'admin'));
      if (!d) throw new StoreError('That design no longer exists.', 404);
      if (d.status === 'ordered') throw new StoreError('This design is in production. Duplicate it to keep refining.');
      if (!instruction?.trim()) throw new StoreError('Write the change you want.');
      const cur = version(d), r = E.refine(cur.spec, instruction);
      const n = Math.max(...d.versions.map(v => v.n)) + 1;
      d.versions.push({ n, instruction: instruction.trim(), spec: r.spec, changes: r.changes, noted: r.noted, from: cur.n, createdAt: iso() });
      d.current = n; d.title = E.title(r.spec); d.updatedAt = iso(); save(); return designOut(d);
    },
    async restoreVersion(id, n) {
      const u = need(), d = db.designs.find(x => x.id === id && (x.userId === u.id || u.role === 'admin'));
      if (!d) throw new StoreError('That design no longer exists.', 404);
      const v = version(d, n); if (!v) throw new StoreError('That version does not exist.', 404);
      if (d.status === 'ordered') throw new StoreError('This design is in production.');
      if (d.current === n) return designOut(d);
      const nn = Math.max(...d.versions.map(x => x.n)) + 1;
      d.versions.push({ n: nn, instruction: `Restored version ${n}`, spec: clone(v.spec), changes: [`Restored v${n}`], noted: null, from: n, restored: n, createdAt: iso() });
      d.current = nn; d.title = E.title(v.spec); d.updatedAt = iso(); save(); return designOut(d);
    },
    async renameDesign(id, title) { const u = need(), d = db.designs.find(x => x.id === id && x.userId === u.id); if (!d) throw new StoreError('Design not found.', 404); d.title = (title || '').trim() || d.title; d.updatedAt = iso(); save(); return designOut(d); },
    async duplicateDesign(id) {
      const u = need(), d = db.designs.find(x => x.id === id && (x.userId === u.id || u.role === 'admin')); if (!d) throw new StoreError('Design not found.', 404);
      const cur = version(d);
      const nd = { id: uid('d_'), userId: u.id, title: d.title + ' (copy)', prompt: d.prompt, hints: d.hints, versions: [{ n: 1, instruction: `Copied from "${d.title}" v${cur.n}`, spec: clone(cur.spec), changes: [], noted: null, createdAt: iso() }], current: 1, status: 'draft', createdAt: iso(), updatedAt: iso() };
      db.designs.unshift(nd); save(); return designOut(nd);
    },
    async deleteDesign(id) {
      const u = need(), i = db.designs.findIndex(x => x.id === id && x.userId === u.id); if (i < 0) throw new StoreError('Design not found.', 404);
      if (db.orders.some(o => o.designId === id && o.status !== 'cancelled')) throw new StoreError('This design has an order. It stays in your library.');
      db.designs.splice(i, 1); db.requests = db.requests.filter(r => r.designId !== id); db.quotes = db.quotes.filter(q => q.designId !== id); save(); return true;
    },

    /* ───── measurements ───── */
    async listMeasurements() { const u = need(); return db.measurements.filter(m => m.userId === u.id).map(clone); },
    async saveMeasurement(m) {
      const u = need();
      const vals = {}; for (const [k, v] of Object.entries(m.values || {})) { const n = Number(v); if (v !== '' && v != null && !Number.isNaN(n) && n > 0) vals[k] = n; }
      if (!vals.chest || !vals.waist) throw new StoreError('Chest and waist are the minimum a tailor needs.');
      let rec = m.id && db.measurements.find(x => x.id === m.id && x.userId === u.id);
      if (!rec) { rec = { id: uid('m_'), userId: u.id, createdAt: iso() }; db.measurements.push(rec); }
      Object.assign(rec, { label: (m.label || 'Me').trim(), unit: m.unit === 'in' ? 'in' : 'cm', values: vals, fit: m.fit || 'regular', notes: (m.notes || '').trim(), updatedAt: iso() });
      save(); return clone(rec);
    },
    async deleteMeasurement(id) { const u = need(); db.measurements = db.measurements.filter(m => !(m.id === id && m.userId === u.id)); save(); return true; },

    /* ───── vendors ───── */
    async listVendors({ all = false } = {}) { return db.vendors.filter(v => all || v.verified === 'verified').map(vendorPub); },
    async getVendor(id) { const v = db.vendors.find(x => x.id === id); if (!v) throw new StoreError('Tailor not found.', 404); return vendorPub(v); },
    async myVendor() { const u = need('tailor'); const v = db.vendors.find(x => x.userId === u.id); return v ? vendorPub(v) : null; },
    async updateVendor(patch) {
      const u = need('tailor'), v = db.vendors.find(x => x.userId === u.id); if (!v) throw new StoreError('No workshop on this account.', 404);
      for (const k of ['name', 'city', 'country', 'bio']) if (patch[k] != null) v[k] = String(patch[k]).trim();
      if (Array.isArray(patch.specialties) && patch.specialties.length) v.specialties = patch.specialties;
      if (patch.leadMin) v.leadMin = Math.max(2, Number(patch.leadMin) || v.leadMin);
      save(); return vendorPub(v);
    },
    /** Tailor application: creates (or links) a tailor account and a workshop awaiting verification. */
    async applyAsVendor(form) {
      let u = me();
      if (!u) {
        u = db.users.find(x => x.email === String(form.email || '').trim().toLowerCase());
        if (u) throw new StoreError('An account with this email already exists. Sign in, then apply from your account.', 409);
        await S.register({ name: form.name, email: form.email, password: form.password, role: 'tailor', phone: form.phone, city: form.city, country: form.country });
        u = me();
      } else if (u.role === 'customer') { u.role = 'tailor'; }
      if (db.vendors.some(v => v.userId === u.id)) throw new StoreError('Your workshop is already registered. Check its status in your workshop page.', 409);
      const v = { id: uid('v_'), userId: u.id, name: form.workshop.trim(), city: (form.city || '').trim(), country: form.country || '', specialties: form.specialties || [], bio: (form.about || '').trim(), rating: 0, reviews: 0, ordersDone: 0, priceFactor: 1, speedFactor: 1, leadMin: 7, since: new Date().getFullYear(), verified: 'pending', verifiedAt: null, sample: false, createdAt: iso(), hue: hash32(u.id) % 360 };
      u.vendorId = v.id; db.vendors.push(v);
      db.applications.unshift({ id: uid('a_'), userId: u.id, vendorId: v.id, ...form, password: undefined, status: 'pending', createdAt: iso() });
      audit('apply', v.id); save(); return vendorPub(v);
    },

    /* ───── production requests + quotes ───── */
    async requestQuotes(designId, { measurementId, notes = '', deadline = null } = {}) {
      const u = need(), d = db.designs.find(x => x.id === designId && x.userId === u.id); if (!d) throw new StoreError('Design not found.', 404);
      if (!measurementId || !db.measurements.some(m => m.id === measurementId && m.userId === u.id)) throw new StoreError('Choose a measurement profile first.');
      let req = db.requests.find(r => r.designId === designId && r.status === 'open');
      if (req && req.versionN === d.current && req.measurementId === measurementId) return clone(req);
      if (req) { req.status = 'closed'; db.quotes.filter(q => q.requestId === req.id && q.status === 'offered').forEach(q => (q.status = 'withdrawn')); }
      req = { id: uid('r_'), designId, versionN: d.current, userId: u.id, measurementId, notes: notes.trim(), deadline, status: 'open', createdAt: iso() };
      db.requests.push(req); if (d.status === 'draft') d.status = 'requested'; save(); return clone(req);
    },
    async getRequest(designId) { need(); const r = db.requests.filter(x => x.designId === designId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]; return r ? clone(r) : null; },
    async listQuotes(designId) {
      need();
      const req = db.requests.filter(x => x.designId === designId && x.status !== 'closed').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!req) return [];
      simulateQuotes(req);
      return db.quotes.filter(q => q.requestId === req.id && q.status !== 'withdrawn').map(q => ({ ...clone(q), vendor: vendorPub(db.vendors.find(v => v.id === q.vendorId)) }));
    },
    /* tailor side */
    async openRequests() {
      const u = need('tailor'), v = db.vendors.find(x => x.userId === u.id); if (!v || v.verified !== 'verified') return [];
      return db.requests.filter(r => r.status === 'open').map(r => {
        const d = db.designs.find(x => x.id === r.designId), c = db.users.find(x => x.id === r.userId), m = db.measurements.find(x => x.id === r.measurementId);
        const q = db.quotes.find(x => x.requestId === r.id && x.vendorId === v.id);
        return d && { ...clone(r), design: designOut(d), customer: c ? { name: c.name, city: c.city, country: c.country } : null, measurement: m ? clone(m) : null, myQuote: q ? clone(q) : null, suggested: E.price(version(d, r.versionN).spec, v), quoteCount: db.quotes.filter(x => x.requestId === r.id && x.status !== 'withdrawn').length };
      }).filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async submitQuote(requestId, { price, deliveryDays, note = '', includesFabric = true }) {
      const u = need('tailor'), v = db.vendors.find(x => x.userId === u.id);
      if (!v || v.verified !== 'verified') throw new StoreError('Your workshop must be verified before you can quote.', 403);
      const r = db.requests.find(x => x.id === requestId && x.status === 'open'); if (!r) throw new StoreError('This request is no longer open.', 404);
      price = Math.round(Number(price)); deliveryDays = Math.round(Number(deliveryDays));
      if (!(price >= 1000)) throw new StoreError('Enter a price of at least ₦1,000.');
      if (!(deliveryDays >= 1 && deliveryDays <= 90)) throw new StoreError('Enter a delivery time between 1 and 90 days.');
      let q = db.quotes.find(x => x.requestId === requestId && x.vendorId === v.id);
      if (!q) { q = { id: uid('q_'), requestId, designId: r.designId, vendorId: v.id, createdAt: iso() }; db.quotes.push(q); }
      Object.assign(q, { price, deliveryDays, note: note.trim(), includesFabric: !!includesFabric, status: 'offered', validUntil: iso(now() + 7 * 86400000), updatedAt: iso() });
      save(); return clone(q);
    },
    async myQuotes() { const u = need('tailor'), v = db.vendors.find(x => x.userId === u.id); return v ? db.quotes.filter(q => q.vendorId === v.id).map(q => ({ ...clone(q), design: designOut(db.designs.find(d => d.id === q.designId)), request: clone(db.requests.find(r => r.id === q.requestId)) })) : []; },

    /* ───── orders ───── */
    async createOrder(quoteId, { plan = 'full' } = {}) {
      const u = need(), q = db.quotes.find(x => x.id === quoteId && x.status === 'offered'); if (!q) throw new StoreError('That quote is no longer available.', 404);
      const r = db.requests.find(x => x.id === q.requestId); if (!r || r.userId !== u.id) throw new StoreError('That quote is not yours.', 403);
      const existing = db.orders.find(o => o.quoteId === quoteId && o.status === 'awaiting_payment'); if (existing) { existing.plan = plan; save(); return S._orderOut(existing); }
      const d = db.designs.find(x => x.id === q.designId), v = db.vendors.find(x => x.id === q.vendorId);
      const o = { id: orderNo(), userId: u.id, vendorId: q.vendorId, designId: q.designId, versionN: r.versionN, quoteId, requestId: r.id, measurementId: r.measurementId, total: q.price, paid: 0, plan: plan === 'deposit' ? 'deposit' : 'full', phase: 'concept_generated', status: 'awaiting_payment', createdAt: iso(), paidAt: null, eta: null, deliveredAt: null, events: [{ at: iso(), phase: 'concept_generated', title: 'Concept approved', body: `Version ${r.versionN} of "${d.title}" approved. ${v.name} quoted ${fmt(q.price)}.`, by: 'system' }] };
      db.orders.unshift(o); save(); return S._orderOut(o);
    },
    /** Payment. method: 'card' | 'transfer' | 'paystack'. kind: 'full' | 'deposit' | 'balance'. */
    async pay(orderId, { method = 'card', kind, card, reference } = {}) {
      const u = need(), o = db.orders.find(x => x.id === orderId && x.userId === u.id); if (!o) throw new StoreError('Order not found.', 404);
      const pct = (C.payments?.depositPercent || 50) / 100;
      kind = kind || (o.status === 'balance_due' ? 'balance' : o.plan === 'deposit' ? 'deposit' : 'full');
      const amount = kind === 'full' ? o.total : kind === 'deposit' ? Math.round(o.total * pct) : o.total - o.paid;
      if (amount <= 0) throw new StoreError('Nothing is due on this order.');
      if (method === 'card' && !reference) {
        const num = String(card?.number || '').replace(/\D/g, '');
        if (!luhn(num) || num.length < 16) throw new StoreError('Check the card number.');
        if (!/^\d{2}\/\d{2}$/.test(card?.expiry || '')) throw new StoreError('Enter the expiry as MM/YY.');
        const [mm, yy] = card.expiry.split('/').map(Number); if (mm < 1 || mm > 12 || new Date(2000 + yy, mm, 0) < new Date()) throw new StoreError('This card has expired.');
        if (!/^\d{3,4}$/.test(card?.cvv || '')) throw new StoreError('Enter the 3-digit CVV.');
        if (card.cvv === '000') throw new StoreError('The bank declined this card. Try another card or bank transfer.', 402);
      }
      await wait(method === 'transfer' ? 1800 : 1200);
      const p = { id: uid('p_'), orderId: o.id, userId: u.id, vendorId: o.vendorId, amount, kind, method, reference: reference || 'FT' + uid().toUpperCase().slice(-9), status: 'paid', last4: card ? String(card.number).replace(/\D/g, '').slice(-4) : null, createdAt: iso() };
      db.payments.unshift(p); o.paid += amount;
      const v = db.vendors.find(x => x.id === o.vendorId), q = db.quotes.find(x => x.id === o.quoteId), d = db.designs.find(x => x.id === o.designId);
      if (o.status === 'awaiting_payment') {
        o.plan = kind === 'deposit' ? 'deposit' : 'full'; o.status = 'active'; o.paidAt = iso(); o.phase = 'vendor_assigned'; o.eta = iso(now() + q.deliveryDays * 86400000);
        o.events.push({ at: iso(), phase: 'vendor_assigned', title: `${v.name} accepted the order`, body: `${fmt(amount)} ${kind === 'deposit' ? 'deposit ' : ''}received and held by Fashion Teller until delivery.`, by: 'system' });
        q.status = 'accepted'; db.quotes.filter(x => x.requestId === o.requestId && x.id !== q.id && x.status === 'offered').forEach(x => (x.status = 'declined'));
        const r = db.requests.find(x => x.id === o.requestId); if (r) r.status = 'ordered';
        if (d) d.status = 'ordered';
      } else if (o.status === 'balance_due') {
        o.status = 'delivered'; o.events.push({ at: iso(), phase: 'delivered', title: 'Balance paid', body: `${fmt(amount)} received. Payment released to ${v.name}.`, by: 'system' });
      }
      audit('pay', p.id); save(); return { payment: clone(p), order: S._orderOut(o) };
    },
    async listOrders() {
      const u = need();
      const mine = db.orders.filter(o => o.userId === u.id || u.role === 'admin');
      mine.forEach(simulateOrder);
      return mine.map(o => S._orderOut(o)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async getOrder(id) {
      const u = need(), o = db.orders.find(x => x.id === id); if (!o) throw new StoreError('Order not found.', 404);
      const v = db.vendors.find(x => x.id === o.vendorId);
      if (!(o.userId === u.id || u.role === 'admin' || v?.userId === u.id)) throw new StoreError('That order is not yours.', 403);
      simulateOrder(o); return S._orderOut(o);
    },
    _orderOut(o) {
      const v = db.vendors.find(x => x.id === o.vendorId), d = db.designs.find(x => x.id === o.designId), c = db.users.find(x => x.id === o.userId), m = db.measurements.find(x => x.id === o.measurementId), q = db.quotes.find(x => x.id === o.quoteId);
      return { ...clone(o), vendor: vendorPub(v), design: d ? designOut(d) : null, customer: c ? { id: c.id, name: c.name, city: c.city, country: c.country, phone: c.phone } : null, measurement: m ? clone(m) : null, deliveryDays: q?.deliveryDays, balance: o.total - o.paid };
    },
    async cancelOrder(id) {
      const u = need(), o = db.orders.find(x => x.id === id && x.userId === u.id); if (!o) throw new StoreError('Order not found.', 404);
      if (!['awaiting_payment', 'active'].includes(o.status) || o.phase === 'tailoring' || o.phase === 'delivered') throw new StoreError('This order has started production and cannot be cancelled here. Contact support.');
      o.status = 'cancelled'; o.events.push({ at: iso(), title: 'Order cancelled', body: o.paid ? `${fmt(o.paid)} will be refunded to the original payment method.` : 'No payment was taken.', by: 'customer' });
      if (o.paid) { db.payments.filter(p => p.orderId === o.id && p.status === 'paid').forEach(p => (p.status = 'refunded')); o.paid = 0; }
      const d = db.designs.find(x => x.id === o.designId); if (d && d.status === 'ordered') d.status = 'requested';
      save(); return S._orderOut(o);
    },
    /* tailor side */
    async vendorOrders() { const u = need('tailor'), v = db.vendors.find(x => x.userId === u.id); if (!v) return []; return db.orders.filter(o => o.vendorId === v.id && o.status !== 'awaiting_payment').map(o => S._orderOut(o)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
    async updateOrder(id, { phase, title, body }) {
      const u = need('tailor'), v = db.vendors.find(x => x.userId === u.id), o = db.orders.find(x => x.id === id && x.vendorId === v?.id);
      if (!o) throw new StoreError('Order not found.', 404);
      if (o.status === 'cancelled') throw new StoreError('This order was cancelled.');
      if (phase && PHASES.indexOf(phase) < PHASES.indexOf(o.phase)) throw new StoreError('An order cannot move backwards.');
      if (!title?.trim()) throw new StoreError('Give the update a title the customer will understand.');
      if (phase) o.phase = phase;
      o.events.push({ at: iso(), phase: o.phase, title: title.trim(), body: (body || '').trim(), by: 'vendor' });
      if (phase === 'delivered') { o.status = o.paid < o.total ? 'balance_due' : 'delivered'; o.deliveredAt = iso(); v.ordersDone += 1; }
      save(); return S._orderOut(o);
    },

    /* ───── contact ───── */
    async contact(form) { db.messages.unshift({ id: uid('msg_'), ...form, status: 'new', createdAt: iso() }); save(); return true; },

    /* ───── admin ───── */
    async adminStats() {
      need('admin');
      const paid = db.payments.filter(p => p.status === 'paid'), gmv = paid.reduce((s, p) => s + p.amount, 0);
      const d7 = now() - 7 * 86400000;
      return { users: db.users.length, customers: db.users.filter(u => u.role === 'customer').length, tailors: db.vendors.filter(v => v.verified === 'verified').length, pendingTailors: db.vendors.filter(v => v.verified === 'pending').length, designs: db.designs.length, versions: db.designs.reduce((s, d) => s + d.versions.length, 0), orders: db.orders.length, activeOrders: db.orders.filter(o => ['active', 'balance_due'].includes(o.status)).length, delivered: db.orders.filter(o => o.status === 'delivered').length, awaitingPayment: db.orders.filter(o => o.status === 'awaiting_payment').length, gmv, held: db.orders.filter(o => o.status === 'active').reduce((s, o) => s + o.paid, 0), newUsers7d: db.users.filter(u => new Date(u.createdAt).getTime() > d7).length, orders7d: db.orders.filter(o => new Date(o.createdAt).getTime() > d7).length, messages: db.messages.filter(m => m.status === 'new').length, byPhase: PHASES.map(p => [p, db.orders.filter(o => o.phase === p && !['cancelled', 'awaiting_payment'].includes(o.status)).length]) };
    },
    async adminUsers() { need('admin'); return db.users.map(u => ({ ...pub(u), designs: db.designs.filter(d => d.userId === u.id).length, orders: db.orders.filter(o => o.userId === u.id).length, spent: db.payments.filter(p => p.userId === u.id && p.status === 'paid').reduce((s, p) => s + p.amount, 0) })); },
    async adminVendors() { need('admin'); return db.vendors.map(v => ({ ...vendorPub(v), user: pub(db.users.find(u => u.id === v.userId)), application: db.applications.find(a => a.vendorId === v.id) || null, quotes: db.quotes.filter(q => q.vendorId === v.id).length, orders: db.orders.filter(o => o.vendorId === v.id).length })); },
    async adminSetVendorStatus(id, status) {
      const a = need('admin'), v = db.vendors.find(x => x.id === id); if (!v) throw new StoreError('Tailor not found.', 404);
      if (!['verified', 'rejected', 'suspended', 'pending'].includes(status)) throw new StoreError('Unknown status.');
      v.verified = status; v.verifiedAt = status === 'verified' ? iso() : v.verifiedAt;
      const app = db.applications.find(x => x.vendorId === id); if (app) app.status = status === 'verified' ? 'approved' : status;
      audit('vendor:' + status, id, a.id); save(); return vendorPub(v);
    },
    async adminSetUserStatus(id, status) { const a = need('admin'), u = db.users.find(x => x.id === id); if (!u) throw new StoreError('User not found.', 404); if (u.role === 'admin') throw new StoreError('Admin accounts cannot be suspended here.'); u.status = status === 'suspended' ? 'suspended' : 'active'; audit('user:' + u.status, id, a.id); save(); return pub(u); },
    async adminDesigns() { need('admin'); return db.designs.map(d => ({ ...designOut(d), owner: pub(db.users.find(u => u.id === d.userId)), quotes: db.quotes.filter(q => q.designId === d.id && q.status !== 'withdrawn').length })); },
    async adminOrders() { need('admin'); db.orders.forEach(simulateOrder); return db.orders.map(o => S._orderOut(o)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
    async adminSetOrderPhase(id, phase, note) {
      const a = need('admin'), o = db.orders.find(x => x.id === id); if (!o) throw new StoreError('Order not found.', 404);
      if (phase === 'cancelled') { o.status = 'cancelled'; o.events.push({ at: iso(), title: 'Cancelled by Fashion Teller', body: note || '', by: 'admin' }); }
      else { o.phase = phase; o.events.push({ at: iso(), phase, title: note || `Moved to ${phase.replace('_', ' ')}`, body: '', by: 'admin' }); if (phase === 'delivered') { o.status = o.paid < o.total ? 'balance_due' : 'delivered'; o.deliveredAt = iso(); } else if (o.status === 'awaiting_payment') { /* leave */ } else o.status = 'active'; }
      audit('order:' + phase, id, a.id); save(); return S._orderOut(o);
    },
    async adminPayments() { need('admin'); return db.payments.map(p => ({ ...clone(p), customer: pub(db.users.find(u => u.id === p.userId)), vendor: vendorPub(db.vendors.find(v => v.id === p.vendorId)) })); },
    async adminRefund(paymentId) {
      const a = need('admin'), p = db.payments.find(x => x.id === paymentId); if (!p) throw new StoreError('Payment not found.', 404);
      if (p.status !== 'paid') throw new StoreError('Only a paid payment can be refunded.');
      p.status = 'refunded'; const o = db.orders.find(x => x.id === p.orderId); if (o) { o.paid = Math.max(0, o.paid - p.amount); o.events.push({ at: iso(), title: 'Refund issued', body: `${fmt(p.amount)} refunded by Fashion Teller.`, by: 'admin' }); if (o.paid === 0 && o.status === 'active') o.status = 'cancelled'; }
      audit('refund', paymentId, a.id); save(); return clone(p);
    },
    async adminMessages() { need('admin'); return db.messages.map(clone); },
    async adminApplications() { need('admin'); return db.applications.map(clone); },
    async adminAudit() { need('admin'); const who = id => db.users.find(u => u.id === id)?.name || db.vendors.find(v => v.id === id)?.name || id; return db.audit.slice(0, 100).map(a => ({ ...a, by: who(a.by), target: a.target.startsWith('p_') ? 'payment ' + (db.payments.find(p => p.id === a.target)?.reference || '') : who(a.target) })); },
  });

  function luhn(n) { let s = 0, alt = false; for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } s += d; alt = !alt; } return n.length >= 12 && s % 10 === 0; }
  const fmt = n => (C.currency?.symbol || '₦') + Math.round(n).toLocaleString('en-NG');

  load();
})();
