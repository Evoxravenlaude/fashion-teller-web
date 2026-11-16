/**
 * Fashion Teller local data layer: the product's backend, running in the browser.
 *
 * Used while FT_CONFIG.apiBaseUrl is empty. Everything is kept in this browser's localStorage (key ft.db.v2) and
 * mirrored across open tabs, so a customer tab, a tailor tab and a designer tab on one device see each other's
 * changes live. Passwords are salted and hashed (PBKDF2-SHA256) before they are stored.
 *
 * The method surface is the one assets/js/api.js exposes against the Django backend in /backend, and the
 * records have the same shape, so pages never know which of the two they are talking to.
 *
 * Collections: users, designs, measurements, vendors, applications, requests, quotes, orders, payments,
 * designers, likes, saves, follows, commissions, threads, chat, notifications, reviews, reports, messages
 * (contact form), audit, games.
 */
(() => {
  const C = window.FT_CONFIG || {}, E = window.FTEngine;
  const KEY = 'ft.db.v2', SESSION = 'ft.session', DAY = 86400000;
  const now = () => Date.now();
  const iso = t => new Date(t || now()).toISOString();
  const ms = s => new Date(s).getTime();
  const clone = o => JSON.parse(JSON.stringify(o));
  let seq = 0;
  const uid = (p = '') => p + now().toString(36).slice(-5) + (seq++ % 36).toString(36) + Math.random().toString(36).slice(2, 6);
  const hash32 = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0); };
  const wait = t => new Promise(r => setTimeout(r, t));
  const txt = (v, max = 400) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
  const fmt = n => (C.currency?.symbol || '₦') + Math.round(n).toLocaleString('en-NG');
  class StoreError extends Error { constructor(m, status = 400) { super(m); this.name = 'ApiError'; this.status = status; } }
  const fail = (m, status) => { throw new StoreError(m, status); };

  /* ───────── persistence ───────── */
  let db = null;
  const LISTS = ['users', 'designs', 'measurements', 'vendors', 'applications', 'requests', 'quotes', 'orders', 'payments', 'designers', 'likes', 'saves', 'follows', 'commissions', 'threads', 'chat', 'outbox', 'notifications', 'reviews', 'reports', 'messages', 'audit', 'payouts', 'payoutAccounts', 'mail', 'tokens'];
  const empty = () => { const d = { v: 2, games: {}, seededAt: null }; for (const k of LISTS) d[k] = []; return d; };
  function load() {
    try { db = JSON.parse(localStorage.getItem(KEY)) || empty(); } catch { db = empty(); }
    for (const k of LISTS) if (!Array.isArray(db[k])) db[k] = [];
    if (!db.games) db.games = {};
    if (!db.seededAt) seed();
    return db;
  }
  /* localStorage is small (about 5 MB). When it fills up, drop what matters least and try once more. */
  function prune() {
    db.audit.length = Math.min(db.audit.length, 60);
    db.notifications = db.notifications.filter(n => !n.read || now() - ms(n.at) < 14 * DAY).slice(0, 200);
    const done = db.orders.filter(o => ['completed', 'delivered', 'cancelled'].includes(o.status));
    for (const o of done) for (const e of o.events) delete e.photos;
    db.chat = db.chat.slice(-600);
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch { prune(); try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { console.warn('Fashion Teller: storage is full or blocked', e); dispatchEvent(new CustomEvent('ft:storage-full')); } }
    emit();
  }
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
  const SAMPLE_DESIGNERS = [
    { id: 'u_d1', name: 'Zainab Bello', handle: 'zainabcuts', city: 'Abuja', country: 'Nigeria', specialties: ['Kaftans', 'Senator sets', 'Embroidery'], bio: 'Menswear designer. Clean senator sets and kaftans with embroidery that sits exactly where it should.', feeFrom: 15000, turnaroundDays: 3, open: true, rating: 4.9, reviews: 58, completed: 73, featured: true },
    { id: 'u_d2', name: 'Chidi Okonkwo', handle: 'chidi.o', city: 'Lagos', country: 'Nigeria', specialties: ['Agbada', 'Suits', 'Wedding parties'], bio: 'Grooms and their men. Agbada sets and suits designed as one wedding party, from the groom down.', feeFrom: 25000, turnaroundDays: 4, open: true, rating: 4.8, reviews: 41, completed: 52, featured: true },
    { id: 'u_d3', name: 'Ama Serwaa', handle: 'amaserwaa', city: 'Accra', country: 'Ghana', specialties: ['Dresses', 'Kente', 'Occasion wear'], bio: 'Kente and print dresses for engagements, graduations and Sundays. Bold colour, simple lines.', feeFrom: 20000, turnaroundDays: 3, open: true, rating: 4.9, reviews: 67, completed: 88, featured: true },
    { id: 'u_d4', name: 'Fatou Diop', handle: 'fatoudiop', city: 'Dakar', country: 'Senegal', specialties: ['Boubou', 'Adire', 'Resort'], bio: 'Flowing boubous in hand-dyed cloth. Currently booked; follow to hear when commissions reopen.', feeFrom: 30000, turnaroundDays: 6, open: false, rating: 4.7, reviews: 23, completed: 31, featured: false },
    { id: 'u_d5', name: 'Tolu Adeyemi', handle: 'tolustitch', city: 'Ibadan', country: 'Nigeria', specialties: ['Shirts', 'Ankara', 'Everyday'], bio: 'Shirts you will actually wear on a Tuesday. Ankara, linen and band collars.', feeFrom: 12000, turnaroundDays: 2, open: true, rating: 4.6, reviews: 35, completed: 49, featured: false },
    { id: 'u_d6', name: 'Ngozi Umeh', handle: 'ngoziumeh', city: 'Enugu', country: 'Nigeria', specialties: ['Bridal', 'Lace', 'Evening'], bio: 'Bridal and evening gowns. Lace, off-shoulder necklines and trains that move.', feeFrom: 40000, turnaroundDays: 5, open: true, rating: 4.9, reviews: 29, completed: 36, featured: true },
  ];
  // owner, template, changes, title, caption, tags, days ago, likes
  const SAMPLE_FEED = [
    ['u_d1', 'senator', { color: 'charcoal', accent: 'silver' }, 'Charcoal senator, silver neck', 'Weekday senator. The embroidery stops at the collarbone on purpose.', ['senator', 'menswear', 'office'], 2, 184],
    ['u_d1', 'royal-kaftan', {}, 'Midnight royal kaftan', 'Gold on midnight never misses. Full chest panel, heavy weight.', ['kaftan', 'owambe', 'embroidery'], 9, 412],
    ['u_d1', 'jalabiya', { color: 'sand' }, 'Sand jalabiya', 'Friday whites, but warmer.', ['jalabiya', 'friday'], 16, 97],
    ['u_d2', 'grand-agbada', {}, 'Ivory grand agbada', 'For the groom. Aso-oke with chest and hem work in gold.', ['agbada', 'groom', 'wedding'], 4, 531],
    ['u_d2', 'wine-agbada', {}, 'Wine brocade agbada', 'For the best man, so the groom still wins.', ['agbada', 'groomsmen'], 11, 263],
    ['u_d2', 'shawl-tux', {}, 'Shawl tuxedo', 'After-party suit. Shawl lapel, nothing else.', ['suit', 'black-tie'], 19, 148],
    ['u_d3', 'kente-midi', {}, 'Kente midi with belt', 'Graduation dress. Square neck, belted, pockets because of course.', ['kente', 'dress', 'graduation'], 1, 376],
    ['u_d3', 'ankara-flare', { color: 'orange' }, 'Tangerine ankara flare', 'Puff sleeves and a skirt that spins.', ['ankara', 'dress', 'sunday'], 6, 298],
    ['u_d3', 'shift-dress', { color: 'emerald', collar: 'square' }, 'Emerald shift', 'Office to dinner, one dress.', ['dress', 'workwear'], 13, 121],
    ['u_d4', 'adire-boubou', {}, 'Indigo adire boubou', 'Dyed in Abeokuta, cut in Dakar.', ['boubou', 'adire', 'resort'], 3, 344],
    ['u_d4', 'flow-boubou', { color: 'magenta' }, 'Magenta flow boubou', 'One size, every body.', ['boubou', 'owambe'], 21, 156],
    ['u_d5', 'ankara-shirt', {}, 'Ankara camp shirt', 'Short sleeve, chest pocket, weekend.', ['shirt', 'ankara', 'weekend'], 2, 209],
    ['u_d5', 'band-shirt', {}, 'Sage band-collar shirt', 'No tie required, ever.', ['shirt', 'linen'], 8, 133],
    ['u_d5', 'dashiki', {}, 'Sunshine dashiki', 'Hip length with matching trousers.', ['dashiki', 'festival'], 15, 187],
    ['u_d6', 'lace-bride', {}, 'Off-shoulder lace bride', 'Second dress for the reception. Mermaid, lace, long sleeves.', ['bridal', 'lace', 'wedding'], 5, 602],
    ['u_d6', 'evening-gown', {}, 'Wine velvet gown', 'Sweetheart neck, floor length.', ['evening', 'gown'], 12, 271],
    ['u_des', 'linen-kaftan', { color: 'sky', embroidery: 'neck' }, 'Sky linen kaftan', 'Short sleeves for Lagos heat.', ['kaftan', 'linen', 'everyday'], 3, 88],
    ['u_des', 'sharp-suit', { color: 'navy' }, 'Navy two-button', 'First suit, done right.', ['suit', 'wedding-guest'], 10, 64],
    ['u_c2', 'ankara-flare', {}, 'Emerald ankara flare', 'My first design on here. Wore it to my cousin’s introduction.', ['ankara', 'dress'], 20, 45],
  ];
  const DEMO = { customer: { email: 'customer@demo.fashionteller', password: 'fashion2026' }, designer: { email: 'designer@demo.fashionteller', password: 'fashion2026' }, tailor: { email: 'tailor@demo.fashionteller', password: 'fashion2026' }, admin: { email: 'admin@demo.fashionteller', password: 'fashion2026' } };
  const tplSpec = (id, patch = {}) => E.normalize({ ...E.template(id).spec, ...patch });

  function seed() {
    const t = now(), d = n => t - n * DAY;
    const u = (id, email, name, role, extra = {}) => ({ id, email, name, role, passHash: null, salt: newSalt(), phone: '', city: 'Lagos', country: 'Nigeria', status: 'active', createdAt: iso(d(30)), demo: true, ...extra });
    db.users = [
      u('u_admin', DEMO.admin.email, 'Fashion Teller Admin', 'admin'),
      u('u_cust', DEMO.customer.email, 'Adaeze Okafor', 'customer', { phone: '+234 802 000 0000' }),
      u('u_des', DEMO.designer.email, 'Kemi Lawal', 'customer', { phone: '+234 805 000 0000' }),
      u('u_tail', DEMO.tailor.email, 'Tunde Bakare', 'tailor', { vendorId: 'v_demo', phone: '+234 803 000 0000' }),
      u('u_c2', 'ifeoma@example.com', 'Ifeoma Nwosu', 'customer', { demo: false, sample: true, city: 'Enugu' }),
      u('u_c3', 'kwame@example.com', 'Kwame Mensah', 'customer', { demo: false, sample: true, city: 'Accra', country: 'Ghana' }),
      u('u_t2', 'amaka@example.com', 'Amaka Eze', 'tailor', { demo: false, sample: true, vendorId: 'v_pending', city: 'Onitsha' }),
    ];
    // sample tailors and designers are real records with an owner, so they can be messaged and can answer
    db.vendors = SAMPLE_VENDORS.map(v => { const uidv = 'u_' + v.id; db.users.push(u(uidv, v.id.slice(2) + '@sample.fashionteller', v.name, 'tailor', { demo: false, sample: true, vendorId: v.id, city: v.city, country: v.country, createdAt: iso(d(420)) })); return { ...v, verified: 'verified', verifiedAt: iso(d(400)), sample: true, createdAt: iso(d(420)), userId: uidv, hue: hash32(v.id) % 360 }; });
    db.vendors.push({ id: 'v_demo', userId: 'u_tail', name: 'Bakare Atelier', city: 'Lagos', country: 'Nigeria', specialties: ['Kaftans', 'Agbada', 'Shirts', 'Embroidery'], bio: 'Yaba workshop, six machines, two embroiderers. Fabric from Balogun or yours.', rating: 4.8, reviews: 37, ordersDone: 112, priceFactor: 1.0, speedFactor: 1.0, leadMin: 5, since: 2020, verified: 'verified', verifiedAt: iso(d(60)), sample: false, createdAt: iso(d(90)), hue: 42 });
    db.vendors.push({ id: 'v_pending', userId: 'u_t2', name: 'Eze Stitches', city: 'Onitsha', country: 'Nigeria', specialties: ['Dresses', 'Bridal'], bio: 'Bridal and occasion dresses, eight years in Onitsha main market.', rating: 0, reviews: 0, ordersDone: 0, priceFactor: 0.92, speedFactor: 1.1, leadMin: 7, since: 2018, verified: 'pending', verifiedAt: null, sample: false, createdAt: iso(d(2)), hue: 300 });
    db.applications.push({ id: 'a_seed1', userId: 'u_t2', vendorId: 'v_pending', workshop: 'Eze Stitches', name: 'Amaka Eze', email: 'amaka@example.com', phone: '+234 806 000 0000', city: 'Onitsha', country: 'Nigeria', specialties: ['Dresses', 'Bridal'], about: 'Eight years making bridal and aso ebi. Instagram: @ezestitches', status: 'pending', createdAt: iso(d(2)) });
    for (const p of SAMPLE_DESIGNERS) {
      db.users.push(u(p.id, p.handle.replace('.', '') + '@sample.fashionteller', p.name, 'customer', { demo: false, sample: true, city: p.city, country: p.country, createdAt: iso(d(200)) }));
      db.designers.push({ userId: p.id, handle: p.handle, bio: p.bio, specialties: p.specialties, open: p.open, feeFrom: p.feeFrom, turnaroundDays: p.turnaroundDays, rating: p.rating, reviews: p.reviews, completed: p.completed, featured: p.featured, followersBase: 120 + hash32(p.id) % 900, sample: true, createdAt: iso(d(200)) });
    }
    db.designers.push({ userId: 'u_des', handle: 'kemilawal', bio: 'Lagos designer. Relaxed tailoring for people who hate ironing. Open to commissions for kaftans, shirts and suits.', specialties: ['Kaftans', 'Shirts', 'Suits'], open: true, feeFrom: 18000, turnaroundDays: 3, rating: 4.7, reviews: 12, completed: 14, featured: true, followersBase: 86, sample: false, createdAt: iso(d(28)) });

    const mkDesign = (id, userId, spec, title, daysAgo, extra = {}) => { const x = { id, userId, title: title || E.title(spec), prompt: '', source: 'builder', versions: [{ n: 1, instruction: 'First save', spec, changes: [], from: null, createdAt: iso(d(daysAgo)) }], current: 1, status: 'draft', published: false, publishedAt: null, caption: '', tags: [], allowRemix: true, remixOf: null, credit: null, likeBase: 0, createdAt: iso(d(daysAgo)), updatedAt: iso(d(daysAgo)), ...extra }; db.designs.push(x); return x; };
    SAMPLE_FEED.forEach(([owner, tpl, patch, title, caption, tags, daysAgo, likes], i) => mkDesign('d_feed' + (i + 1), owner, tplSpec(tpl, patch), title, daysAgo, { published: true, publishedAt: iso(d(daysAgo)), caption, tags, likeBase: likes }));

    // finished and running orders so the dashboards have history
    const body = { height: 172, neck: 39, shoulder: 46, chest: 98, waist: 84, hips: 98, sleeve: 62, length: 140, inseam: 80, thigh: 58 };
    const mkOrder = (n, userId, vendorId, tpl, patch, daysAgo, phase) => {
      const spec = tplSpec(tpl, patch), design = mkDesign('d_ord' + n, userId, spec, '', daysAgo, { status: 'ordered' });
      const v = db.vendors.find(x => x.id === vendorId), q = E.price(spec, v);
      const m = { id: 'm_seed' + n, userId, label: 'Me', unit: 'cm', values: body, fit: 'regular', notes: '', createdAt: iso(d(daysAgo)), updatedAt: iso(d(daysAgo)) }; db.measurements.push(m);
      const req = { id: 'r_seed' + n, designId: design.id, versionN: 1, userId, measurementId: m.id, notes: '', deadline: null, status: 'ordered', createdAt: iso(d(daysAgo)) }; db.requests.push(req);
      const quote = { id: 'q_seed' + n, requestId: req.id, designId: design.id, vendorId, price: q.price, deliveryDays: q.deliveryDays, note: 'Fabric included.', includesFabric: true, status: 'accepted', createdAt: iso(d(daysAgo)), validUntil: iso(d(daysAgo - 7)) }; db.quotes.push(quote);
      const done = phase === 'delivered';
      const o = { id: 'FT-' + String(100000 + (hash32(design.id) % 899999)), userId, vendorId, designId: design.id, versionN: 1, quoteId: quote.id, requestId: req.id, measurementId: m.id, total: q.price, paid: q.price, plan: 'full', phase, status: done ? 'completed' : 'active', createdAt: iso(d(daysAgo)), paidAt: iso(d(daysAgo)), eta: iso(d(daysAgo - q.deliveryDays)), deliveredAt: done ? iso(d(daysAgo - q.deliveryDays)) : null, receivedAt: done ? iso(d(daysAgo - q.deliveryDays - 1)) : null, issue: null, reviewId: null, events: [
        { at: iso(d(daysAgo)), phase: 'concept_generated', title: 'Design approved', body: 'Version 1 approved by the customer.', by: 'system' },
        { at: iso(d(daysAgo)), phase: 'vendor_assigned', title: `${v.name} accepted the order`, body: 'Payment received and held by Fashion Teller.', by: 'system' },
        ...(phase !== 'vendor_assigned' ? [{ at: iso(d(daysAgo - 2)), phase: 'tailoring', title: 'Fabric sourced', body: 'Cutting has started.', by: 'vendor' }] : []),
        ...(done ? [{ at: iso(d(daysAgo - q.deliveryDays)), phase: 'delivered', title: 'Delivered', body: 'Signed for at the door.', by: 'vendor' }, { at: iso(d(daysAgo - q.deliveryDays - 1)), phase: 'delivered', title: 'Received by the customer', body: `Payment released to ${v.name}.`, by: 'customer' }] : []),
      ] };
      db.orders.push(o);
      db.payments.push({ id: 'p_seed' + n, orderId: o.id, commissionId: null, userId, vendorId, designerId: null, amount: q.price, kind: 'full', method: 'card', reference: 'FT' + hash32(o.id).toString(36).toUpperCase(), status: done ? 'released' : 'paid', last4: '4242', createdAt: iso(d(daysAgo)) });
      return o;
    };
    const o1 = mkOrder(1, 'u_c2', 'v_luxe', 'ankara-flare', {}, 21, 'delivered');
    mkOrder(2, 'u_c3', 'v_demo', 'grand-agbada', {}, 6, 'tailoring');
    mkOrder(3, 'u_c2', 'v_kano', 'royal-kaftan', {}, 1, 'vendor_assigned');
    const o4 = mkOrder(4, 'u_cust', 'v_abuja', 'senator', { color: 'forest' }, 16, 'delivered');

    const rv = (id, kind, refId, byId, target, rating, text, daysAgo) => db.reviews.push({ id, kind, refId, byId, vendorId: kind === 'order' ? target : null, designerId: kind === 'commission' ? target : null, rating, text, createdAt: iso(d(daysAgo)) });
    rv('rv1', 'order', o1.id, 'u_c2', 'v_luxe', 5, 'The embroidery is cleaner than the picture. Arrived two days early.', 12); o1.reviewId = 'rv1';
    rv('rv2', 'order', o4.id, 'u_cust', 'v_abuja', 5, 'Fit was right first time from my measurements. Will order again.', 8); o4.reviewId = 'rv2';
    rv('rv3', 'order', 'seed', 'u_c3', 'v_kano', 5, 'Hand embroidery, and you can tell. Worth the price.', 30);
    rv('rv4', 'order', 'seed', 'u_c2', 'v_demo', 4, 'Good finishing. One fitting adjustment, handled quickly.', 25);
    rv('rv5', 'commission', 'seed', 'u_c3', 'u_d1', 5, 'Sent a voice note and a photo of my father’s old agbada. She got it in one go.', 14);
    rv('rv6', 'commission', 'seed', 'u_c2', 'u_d3', 5, 'Three options in two days. The kente one is being sewn now.', 9);
    rv('rv7', 'commission', 'seed', 'u_c3', 'u_des', 5, 'Understood the brief and explained every choice.', 20);
    rv('rv8', 'commission', 'seed', 'u_c2', 'u_d6', 5, 'My reception dress. People are still asking who designed it.', 40);

    // commissions: one waiting on the demo customer, two in the demo designer's inbox
    const thread = (id, kind, refId, members, title, msgs) => { db.threads.push({ id, kind, refId, members, title, createdAt: msgs[0][2], updatedAt: msgs[msgs.length - 1][2], read: {} }); msgs.forEach(([by, text, at, extra], i) => db.chat.push({ id: id + '_' + i, threadId: id, by, text, at, system: by === 'system', designId: extra || null })); };
    const dc1 = mkDesign('d_com1', 'u_d1', tplSpec('royal-kaftan', { color: 'burgundy', accent: 'gold', embroidery: 'chest-hem', collar: 'mandarin' }), 'Burgundy kaftan for Adaeze’s father', 1);
    db.commissions.push({ id: 'c_seed1', clientId: 'u_cust', designerId: 'u_d1', title: 'Kaftan for my father’s 70th', brief: 'He likes deep colours and hates anything tight. Gold embroidery, but not loud. The party is in the evening.', garment: 'kaftan', occasion: 'Birthday', budget: 20000, deadline: iso(d(-12)).slice(0, 10), refDesignId: null, status: 'delivered', offer: { fee: 18000, days: 3, note: 'I will send one main direction and one alternative.', at: iso(d(3)) }, paid: 18000, paidAt: iso(d(3)), revisions: 0, maxRevisions: 2, deliveries: [{ at: iso(d(1)), designId: dc1.id, versionN: 1, note: 'Burgundy with gold running from the chest to the hem, band collar so it sits well without a cap. Relaxed fit as you asked.' }], resultDesignId: null, reviewId: null, threadId: 't_c1', createdAt: iso(d(4)), updatedAt: iso(d(1)) });
    db.payments.push({ id: 'p_com1', orderId: null, commissionId: 'c_seed1', userId: 'u_cust', vendorId: null, designerId: 'u_d1', amount: 18000, kind: 'commission', method: 'card', reference: 'FTC' + hash32('c_seed1').toString(36).toUpperCase(), status: 'paid', last4: '4242', createdAt: iso(d(3)) });
    thread('t_c1', 'commission', 'c_seed1', ['u_cust', 'u_d1'], 'Kaftan for my father’s 70th', [
      ['system', 'Adaeze sent a commission request.', iso(d(4))],
      ['u_d1', 'Thank you for the brief. Does he usually wear a cap with his kaftans? It changes what I do at the collar.', iso(d(4) + 3600000)],
      ['u_cust', 'Never. He says caps are for chiefs.', iso(d(4) + 5400000)],
      ['u_d1', 'Then a band collar. I will send the design tomorrow.', iso(d(3))],
      ['system', 'Zainab delivered a design.', iso(d(1)), dc1.id],
    ]);
    db.commissions.push({ id: 'c_seed2', clientId: 'u_c3', designerId: 'u_des', title: 'Groomsmen shirts, six of us', brief: 'Wedding in Accra in December. We want matching shirts that are not boring: short sleeves, something with pattern, and we can all wear them again.', garment: 'shirt', occasion: 'Wedding', budget: 25000, deadline: iso(d(-30)).slice(0, 10), refDesignId: null, status: 'requested', offer: null, paid: 0, paidAt: null, revisions: 0, maxRevisions: 2, deliveries: [], resultDesignId: null, reviewId: null, threadId: 't_c2', createdAt: iso(d(0.4)), updatedAt: iso(d(0.4)) });
    thread('t_c2', 'commission', 'c_seed2', ['u_c3', 'u_des'], 'Groomsmen shirts, six of us', [['system', 'Kwame sent a commission request.', iso(d(0.4))], ['u_c3', 'Hello Kemi. The groom’s colours are forest green and gold, if that helps.', iso(d(0.39))]]);
    db.commissions.push({ id: 'c_seed3', clientId: 'u_c2', designerId: 'u_des', title: 'Linen kaftan for work', brief: 'I work in a bank in Enugu. I want one kaftan I can wear on Fridays that still looks serious. Light colour, no embroidery or very little.', garment: 'kaftan', occasion: 'Work', budget: 18000, deadline: iso(d(-9)).slice(0, 10), refDesignId: null, status: 'active', offer: { fee: 18000, days: 3, note: 'One design with two colour options.', at: iso(d(2)) }, paid: 18000, paidAt: iso(d(1.5)), revisions: 0, maxRevisions: 2, deliveries: [], resultDesignId: null, reviewId: null, threadId: 't_c3', createdAt: iso(d(2.5)), updatedAt: iso(d(1.5)) });
    db.payments.push({ id: 'p_com3', orderId: null, commissionId: 'c_seed3', userId: 'u_c2', vendorId: null, designerId: 'u_des', amount: 18000, kind: 'commission', method: 'transfer', reference: 'FTC' + hash32('c_seed3').toString(36).toUpperCase(), status: 'paid', last4: null, createdAt: iso(d(1.5)) });
    thread('t_c3', 'commission', 'c_seed3', ['u_c2', 'u_des'], 'Linen kaftan for work', [['system', 'Ifeoma sent a commission request.', iso(d(2.5))], ['system', 'Kemi offered ₦18,000, 3 days.', iso(d(2))], ['system', 'Ifeoma paid. ₦18,000 is held by Fashion Teller until the design is approved.', iso(d(1.5))], ['u_c2', 'Thank you! Short or long sleeves, I leave that to you.', iso(d(1.4))]]);
    thread('t_o4', 'order', o4.id, ['u_cust', 'u_v_abuja'], `Order ${o4.id}`, [['u_v_abuja', 'Good afternoon. Your senator set is ready and has gone out with the rider.', iso(d(4))], ['u_cust', 'Received, thank you. It fits.', iso(d(3))]]);
    db.threads.forEach(th => th.members.forEach(m => (th.read[m] = th.updatedAt)));
    db.threads.find(x => x.id === 't_c1').read.u_cust = iso(d(3));
    db.threads.find(x => x.id === 't_c2').read.u_des = iso(d(1));

    db.follows.push({ u: 'u_cust', t: 'u_d1', at: iso(d(5)) }, { u: 'u_cust', t: 'u_d3', at: iso(d(5)) }, { u: 'u_c2', t: 'u_des', at: iso(d(8)) }, { u: 'u_c3', t: 'u_des', at: iso(d(8)) });
    db.likes.push({ u: 'u_cust', d: 'd_feed2', at: iso(d(3)) }, { u: 'u_cust', d: 'd_feed7', at: iso(d(1)) });
    db.saves.push({ u: 'u_cust', d: 'd_feed15', at: iso(d(2)) });
    const nf = (id, userId, kind, title, bodyText, href, daysAgo, read = false) => db.notifications.push({ id, userId, kind, title, body: bodyText, href, at: iso(d(daysAgo)), read });
    nf('n_s1', 'u_cust', 'commission', 'Zainab delivered your design', 'Kaftan for my father’s 70th is ready to review.', '/commissions?id=c_seed1', 1);
    nf('n_s2', 'u_cust', 'order', 'Your senator set was delivered', 'Maitama Bespoke marked it delivered.', `/orders?id=${o4.id}`, 4, true);
    nf('n_s3', 'u_des', 'commission', 'New commission request', 'Kwame Mensah: Groomsmen shirts, six of us', '/commissions?id=c_seed2', 0.4);
    nf('n_s4', 'u_des', 'commission', 'Ifeoma paid for her commission', 'Linen kaftan for work. Deliver within 3 days.', '/commissions?id=c_seed3', 1.5);
    nf('n_s5', 'u_des', 'follow', 'Kwame Mensah followed you', '', '/designer?id=u_c3', 8, true);

    { const k = n => E.dayKey(new Date(Date.now() - n * DAY)); const g = (xp, streak) => ({ xp, streak, best: Math.max(9, streak), lastDay: k(1), days: [k(1), k(2), k(3), k(4), k(6), k(7)], badges: { first_design: iso(d(20)), streak_3: iso(d(2)), sketcher: iso(d(5)), all_styles: iso(d(3)) }, challenges: { [k(1)]: 'x', [k(3)]: 'x' }, palettes: ['jewel', 'lagos', 'owambe'], garments: ['kaftan', 'agbada', 'dress', 'boubou', 'suit', 'shirt'], todayVersions: 0, todayKey: k(1) }); db.games.u_cust = g(640, 4); db.games.u_des = { ...g(1520, 4), badges: { ...g(0, 0).badges, published: iso(d(10)), collab: iso(d(9)) } }; }
    db.seededAt = iso();
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {}
  }

  /* ───────── session + who can do what ───────── */
  const session = {
    get() { try { return JSON.parse(localStorage.getItem(SESSION)); } catch { return null; } },
    set(s) { try { s ? localStorage.setItem(SESSION, JSON.stringify(s)) : localStorage.removeItem(SESSION); } catch {} emit(); },
  };
  const userById = id => db.users.find(x => x.id === id);
  const me = () => { const s = session.get(); if (!s) return null; const u = userById(s.userId); return u && u.status !== 'suspended' ? u : null; };
  const need = role => { const u = me(); if (!u) fail('Sign in to continue.', 401); if (role && u.role !== role && u.role !== 'admin') fail('This area is for ' + role + ' accounts.', 403); return u; };
  const profileOf = id => db.designers.find(p => p.userId === id);
  const vendorOf = u => u && db.vendors.find(v => v.userId === u.id);
  const pub = u => u && ({ id: u.id, email: u.email, name: u.name, role: u.role, phone: u.phone || '', city: u.city || '', country: u.country || '', vendorId: u.vendorId || null, status: u.status, createdAt: u.createdAt, demo: !!u.demo, emailVerified: verified(u), emailPrefs: prefsOf(u), designer: !!profileOf(u.id), handle: profileOf(u.id)?.handle || null, hue: hash32(u.id) % 360 });
  const verified = u => u.emailVerified ?? !!(u.demo || u.sample), prefsOf = u => ({ orders: true, messages: true, ...(u.emailPrefs || {}) });
  /* what anyone may see of a person */
  const person = id => { const u = userById(id); if (!u) return { id, name: 'Former member', handle: null, hue: 0, city: '', country: '', designer: false, vendorId: null }; const p = profileOf(id); return { id: u.id, name: u.vendorId && u.sample ? db.vendors.find(v => v.id === u.vendorId)?.name || u.name : u.name, handle: p?.handle || null, hue: hash32(u.id) % 360, city: u.city || '', country: u.country || '', designer: !!p, vendorId: u.vendorId || null }; };
  const audit = (action, target, by) => { db.audit.unshift({ at: iso(), by: by || me()?.id || 'system', action, target: String(target) }); db.audit.length = Math.min(db.audit.length, 400); };
  /* `key` folds a burst into one line: five quotes on one design are one notification that keeps updating, not five. */
  /* ───────── email ─────────
     Built-in mode has no mail server, so every email is kept in a demo mailbox (FTStore.mailbox) that the site can show.
     The backend sends the same emails for real. */
  const MAILS = { order: 'orders', quote: 'orders', commission: 'orders', payout: 'orders', message: 'messages' };
  function mail(to, kind, subject, text, link) { db.mail.unshift({ id: uid('m_'), to, kind, subject, text, link: link || '/', at: iso() }); db.mail.length = Math.min(db.mail.length, 80); }
  function token(kind, u, hours) { db.tokens = db.tokens.filter(t => !(t.userId === u.id && t.kind === kind) && t.exp > now()); const t = { token: uid('k') + uid(), kind, userId: u.id, email: u.email, exp: now() + hours * 3600000 }; db.tokens.push(t); return t.token; }
  function sendVerify(u) { mail(u.email, 'verify', 'Confirm your email address', `Hello ${u.name.split(' ')[0]}. Confirm this is your address so we can reach you about your orders and payments.`, '/signin?verify=' + token('verify', u, 72)); }

  /* ───────── payouts ─────────
     When a payment is released, the tailor or designer is owed it less the platform fee. Built-in mode pretends to send it:
     a payout waits until they have added bank details, then goes "on its way" and arrives a few seconds later. */
  const feePct = () => Math.max(0, Math.min(50, +(C.payments?.platformFeePercent ?? 10) || 0));
  const BANKS = [['044', 'Access Bank'], ['050', 'Ecobank'], ['070', 'Fidelity Bank'], ['011', 'First Bank'], ['214', 'FCMB'], ['058', 'GTBank'], ['082', 'Keystone Bank'], ['50211', 'Kuda'], ['50515', 'Moniepoint'], ['999992', 'OPay'], ['999991', 'PalmPay'], ['076', 'Polaris Bank'], ['101', 'Providus Bank'], ['221', 'Stanbic IBTC'], ['232', 'Sterling Bank'], ['032', 'Union Bank'], ['033', 'UBA'], ['035', 'Wema Bank'], ['057', 'Zenith Bank']];
  function payout(userId, kind, refId, title, gross) {
    const u = userById(userId); if (!u || !(gross > 0)) return null;
    const fee = Math.round(gross * feePct() / 100), po = { id: uid('po_'), userId, kind, refId, title: txt(title, 120), gross, fee, net: gross - fee, status: u.sample ? 'paid' : 'pending', createdAt: iso(), sentAt: u.sample ? iso() : null, paidAt: u.sample ? iso() : null, reference: 'FTP' + hash32(refId + userId).toString(36).toUpperCase(), note: '' };
    db.payouts.unshift(po); if (!u.sample) settle(userId); return po;
  }
  function settle(userId) {
    const acc = db.payoutAccounts.find(a => a.userId === userId), due = db.payouts.filter(x => x.userId === userId && x.status === 'pending'); if (!due.length) return;
    if (!acc || !verified(userById(userId))) return notify(userId, 'payout', acc ? 'Confirm your email to be paid' : 'Add your bank details to be paid', `${fmt(due.reduce((n, x) => n + x.net, 0))} is waiting for you.`, '/account#payouts', 'payout-account');
    for (const x of due) { x.status = 'processing'; x.sentAt = iso(); }
  }
  function simulatePayouts() {
    let changed = false;
    for (const x of db.payouts) if (x.status === 'processing' && now() - ms(x.sentAt) > Math.min(8000, (C.sample?.orderPhaseMs || 30000) / 3)) { const acc = db.payoutAccounts.find(a => a.userId === x.userId); x.status = 'paid'; x.paidAt = iso(); changed = true; notify(x.userId, 'payout', `${fmt(x.net)} sent to your bank`, `${acc ? acc.bankName + ' ••' + acc.last4 : 'Your account'} · ${x.title}`, '/account#payouts'); }
    return changed;
  }
  const payoutOut = x => ({ ...clone(x) });

  function notify(userId, kind, title, body, href, key = null) {
    if (!userId || !userById(userId) || userById(userId).sample) return;
    const fresh = !key || !db.notifications.some(n => n.userId === userId && n.key === key && !n.read), group = MAILS[kind];
    if (fresh && group && prefsOf(userById(userId))[group]) mail(userById(userId).email, kind, txt(title, 120), txt(body, 200), href);
    if (key) db.notifications = db.notifications.filter(n => !(n.userId === userId && n.key === key && !n.read));
    db.notifications.unshift({ id: uid('n_'), userId, kind, title: txt(title, 120), body: txt(body, 200), href, at: iso(), read: false, ...(key ? { key } : {}) });
    let n = 0; db.notifications = db.notifications.filter(x => x.userId !== userId || ++n <= 60);
  }

  /* ───────── shapes going out ───────── */
  const vendorPub = v => v && ({ id: v.id, name: v.name, city: v.city, country: v.country, specialties: v.specialties, bio: v.bio, rating: v.rating, reviews: v.reviews, ordersDone: v.ordersDone, verified: v.verified === 'verified', status: v.verified, since: v.since, sample: !!v.sample, hue: v.hue, leadMin: v.leadMin, verifiedAt: v.verifiedAt, createdAt: v.createdAt, userId: v.userId });
  const version = (d, n) => d.versions.find(v => v.n === (n ?? d.current)) || d.versions[d.versions.length - 1];
  const likesOf = d => (d.likeBase || 0) + db.likes.filter(l => l.d === d.id).length;
  const remixesOf = d => db.designs.filter(x => x.remixOf?.designId === d.id).length;
  const designOut = (d, view = 'owner') => {
    const u = me(), base = { id: d.id, userId: d.userId, title: d.title, status: d.status, current: d.current, createdAt: d.createdAt, updatedAt: d.updatedAt, published: !!d.published, publishedAt: d.publishedAt || null, caption: d.caption || '', tags: d.tags || [], allowRemix: d.allowRemix !== false, remixOf: d.remixOf || null, credit: d.credit || null, owner: person(d.userId), likes: likesOf(d), remixes: remixesOf(d), liked: !!u && db.likes.some(l => l.u === u.id && l.d === d.id), saved: !!u && db.saves.some(l => l.u === u.id && l.d === d.id), view };
    return view === 'public' ? { ...base, versions: [clone(version(d))], prompt: '' } : { ...base, versions: clone(d.versions), prompt: d.prompt || '', source: d.source || 'builder' };
  };
  const card = d => { const u = me(), v = version(d); return { id: d.id, title: d.title, garment: v.spec.garment, spec: clone(v.spec), caption: d.caption || '', tags: d.tags || [], by: person(d.userId), likes: likesOf(d), remixes: remixesOf(d), liked: !!u && db.likes.some(l => l.u === u.id && l.d === d.id), saved: !!u && db.saves.some(l => l.u === u.id && l.d === d.id), publishedAt: d.publishedAt, allowRemix: d.allowRemix !== false, mine: !!u && d.userId === u.id }; };
  const mini = d => d ? { id: d.id, title: d.title, spec: clone(version(d).spec), by: person(d.userId) } : null;
  const designerOut = p => { const u = me(), usr = userById(p.userId) || {}; return { id: p.userId, userId: p.userId, handle: p.handle, name: usr.name || '', bio: p.bio, specialties: p.specialties || [], open: !!p.open, feeFrom: p.feeFrom || 0, turnaroundDays: p.turnaroundDays || 3, hue: hash32(p.userId) % 360, city: usr.city || '', country: usr.country || '', rating: p.rating || 0, reviews: p.reviews || 0, completed: p.completed || 0, featured: !!p.featured, sample: !!p.sample, followers: (p.followersBase || 0) + db.follows.filter(f => f.t === p.userId).length, following: !!u && db.follows.some(f => f.u === u.id && f.t === p.userId), designs: db.designs.filter(d => d.userId === p.userId && d.published).length, mine: !!u && u.id === p.userId, createdAt: p.createdAt }; };
  const email = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v || '');
  const sampleDelay = (id, salt, range = C.sample?.quoteDelayMs || [1500, 8000]) => range[0] + (hash32(id + salt) % Math.max(1, range[1] - range[0]));
  const SPECIALTY = { kaftan: 'Kaftans', agbada: 'Agbada', boubou: 'Dresses', dress: 'Dresses', suit: 'Suits', shirt: 'Shirts' };
  const matches = (v, spec) => v.specialties.includes(SPECIALTY[spec.garment]) || v.specialties.includes('Production runs');
  /* who may open a design, and how much of it */
  function access(d, u) {
    if (u && (d.userId === u.id || u.role === 'admin')) return 'owner';
    if (u) {
      const v = vendorOf(u);
      if (v && (db.orders.some(o => o.designId === d.id && o.vendorId === v.id) || db.quotes.some(q => q.designId === d.id && q.vendorId === v.id) || (v.verified === 'verified' && db.requests.some(r => r.designId === d.id && r.status === 'open')))) return 'party';
      if (db.commissions.some(c => (c.clientId === u.id || c.designerId === u.id) && (c.refDesignId === d.id || c.deliveries.some(x => x.designId === d.id)))) return 'party';
    }
    return d.published ? 'public' : null;
  }

  /* ═════════ sample tailors and designers act on their own, so the product can be tried end to end ═════════ */
  function simulateQuotes(req) {
    if (req.status !== 'open') return false;
    const design = db.designs.find(d => d.id === req.designId); if (!design) return false;
    const spec = version(design, req.versionN).spec; let changed = false;
    for (const v of db.vendors.filter(x => x.sample && x.verified === 'verified')) {
      if (db.quotes.some(q => q.requestId === req.id && q.vendorId === v.id)) continue;
      const h = hash32(req.id + v.id + 'q');
      if (!matches(v, spec) && h % 100 < 70) continue;          // most tailors quote only on what they make
      if (h % 100 >= 88) continue;                                // some are busy
      const due = ms(req.createdAt) + sampleDelay(req.id, v.id); if (now() < due) continue;
      const p = E.price(spec, v), jitter = 1 + ((h % 9) - 4) / 100, price = Math.round((p.price * jitter) / 500) * 500;
      const notes = ['Fabric included. Two fittings by video.', 'Price includes fabric and delivery within Nigeria.', 'Can start this week. Fabric sourced locally or send yours.', 'Embroidery done by hand. Fabric included.', 'Includes fabric; add 2 days for delivery outside Lagos.'];
      db.quotes.push({ id: uid('q_'), requestId: req.id, designId: design.id, vendorId: v.id, price, deliveryDays: p.deliveryDays, note: notes[h % notes.length], includesFabric: true, status: 'offered', createdAt: iso(due), validUntil: iso(now() + 7 * DAY) });
      const nq = db.quotes.filter(q => q.requestId === req.id && q.status === 'offered').length;
      notify(req.userId, 'quote', nq > 1 ? `${nq} quotes for "${design.title}"` : `${v.name} sent a quote`, nq > 1 ? `Latest: ${v.name}, ${fmt(price)}, ${p.deliveryDays} days.` : `${fmt(price)}, ${p.deliveryDays} days for "${design.title}".`, `/studio?design=${design.id}&step=4`, 'quote:' + req.id);
      changed = true;
    }
    return changed;
  }
  const PHASES = ['concept_generated', 'vendor_assigned', 'tailoring', 'delivered'];
  function markDelivered(o, v) { o.phase = 'delivered'; o.status = o.paid < o.total ? 'balance_due' : 'delivered'; o.deliveredAt = iso(); }
  function simulateOrder(o) {
    const v = db.vendors.find(x => x.id === o.vendorId);
    if (!v?.sample || o.status !== 'active' || !o.paidAt || o.issue?.status === 'open') return false;
    const pace = C.sample?.orderPhaseMs || 30000, el = now() - ms(o.paidAt);
    const steps = [
      [1.0, 'tailoring', 'Fabric sourced', `${v.name} sourced the fabric and started cutting.`],
      [1.7, 'tailoring', 'Sewing in progress', 'Body and sleeves assembled; finishing is next.'],
      [2.4, 'tailoring', 'Finishing', 'Details complete. Pressing and quality check.'],
      [3.0, 'tailoring', 'Dispatched', 'Quality checked and handed to the courier.'],
      [3.6, 'delivered', 'Delivered', 'Delivered to your door. Confirm you have it so the tailor can be paid.'],
    ];
    let changed = false;
    for (const [k, phase, title, body] of steps) {
      if (el < k * pace || o.events.some(e => e.title === title)) continue;
      o.events.push({ at: iso(ms(o.paidAt) + k * pace), phase, title, body, by: 'vendor' }); o.phase = phase; changed = true;
      if (phase === 'delivered') markDelivered(o, v);
      notify(o.userId, 'order', `${title}: order ${o.id}`, body, `/orders?id=${o.id}`, 'order:' + o.id);
    }
    return changed;
  }
  const say = (threadId, by, text, designId = null) => { const th = db.threads.find(x => x.id === threadId); if (!th) return; const at = iso(); db.chat.push({ id: uid('k_'), threadId, by, text: txt(text, 2000), at, system: by === 'system', designId }); th.updatedAt = at; if (by !== 'system') th.read[by] = at; };
  function simulateCommission(c) {
    const d = userById(c.designerId), p = profileOf(c.designerId); if (!d?.sample || !p) return false;
    const first = d.name.split(' ')[0], age = now() - ms(c.updatedAt), pace = (C.sample?.orderPhaseMs || 30000) / 3;
    if (c.status === 'requested' && age > pace * 0.6) {
      if (!p.open) { c.status = 'declined'; c.updatedAt = iso(); say(c.threadId, 'system', `${first} is not taking commissions right now.`); notify(c.clientId, 'commission', `${first} declined your request`, c.title, `/commissions?id=${c.id}`); return true; }
      const fee = Math.max(p.feeFrom, Math.round(Math.min(c.budget || p.feeFrom, p.feeFrom * 2) / 1000) * 1000);
      c.offer = { fee, days: p.turnaroundDays, note: 'One design, built for your measurements and the occasion. Two rounds of changes included.', at: iso() }; c.status = 'offered'; c.updatedAt = iso();
      say(c.threadId, d.id, 'Thank you for the brief. I would love to do this. I have sent my offer; once it is paid I start straight away.'); say(c.threadId, 'system', `${first} offered ${fmt(fee)}, ${p.turnaroundDays} days.`);
      notify(c.clientId, 'commission', `${first} sent an offer`, `${fmt(fee)}, ${p.turnaroundDays} days for "${c.title}".`, `/commissions?id=${c.id}`); return true;
    }
    if ((c.status === 'active' || c.status === 'changes') && age > pace) {
      const lastNote = c.status === 'changes' ? c.changeNote || '' : '';
      let spec = E.parse(`${c.brief} ${lastNote}`, { garment: c.garment });
      const prev = c.deliveries[c.deliveries.length - 1], prevD = prev && db.designs.find(x => x.id === prev.designId);
      if (prevD) { const base = version(prevD).spec, wish = E.parse(lastNote, { garment: base.garment }), blank = E.blank(base.garment), low = lastNote.toLowerCase(); spec = { ...base }; for (const k of Object.keys(blank)) if (!['notes', 'sketch', 'garment', 'template', 'palette'].includes(k) && (SAID[k] ? SAID[k].test(low) : JSON.stringify(wish[k]) !== JSON.stringify(blank[k]))) spec[k] = wish[k]; if (JSON.stringify(spec) === JSON.stringify(base)) spec = E.shuffle ? { ...E.shuffle(base), garment: base.garment, length: base.length, sleeves: base.sleeves } : base; spec = E.normalize(spec); }
      let design;
      if (prevD) { const n = Math.max(...prevD.versions.map(v => v.n)) + 1; prevD.versions.push({ n, instruction: 'Changes for the client', spec, changes: E.diff(version(prevD).spec, spec), from: prevD.current, createdAt: iso() }); prevD.current = n; prevD.updatedAt = iso(); design = prevD; }
      else { design = { id: uid('d_'), userId: d.id, title: c.title, prompt: '', source: 'builder', versions: [{ n: 1, instruction: 'Designed for the commission', spec, changes: [], from: null, createdAt: iso() }], current: 1, status: 'draft', published: false, publishedAt: null, caption: '', tags: [], allowRemix: false, remixOf: null, credit: null, likeBase: 0, createdAt: iso(), updatedAt: iso() }; db.designs.push(design); }
      const note = c.status === 'changes' ? 'Changed as you asked. Have a look at it in 3D and tell me what you think.' : `Here is my design for you: ${E.title(spec).toLowerCase()}. ${E.summary(spec).slice(0, 3).join(', ')}.`;
      c.deliveries.push({ at: iso(), designId: design.id, versionN: design.current, note }); c.status = 'delivered'; c.updatedAt = iso(); c.changeNote = null;
      say(c.threadId, d.id, note); say(c.threadId, 'system', `${first} delivered a design.`, design.id);
      notify(c.clientId, 'commission', `${first} delivered your design`, `"${c.title}" is ready to review.`, `/commissions?id=${c.id}`); return true;
    }
    return false;
  }
  /* which parts of a design a change request talks about */
  const SAID = { length: /knee|midi|ankle|floor|full[-\s]length|hip[-\s]length|maxi|mini|cropped|calf/, sleeves: /sleeve/, collar: /neck|collar|shawl|notch|lapel|shoulder|mandarin/, fit: /fitted|slim|snug|tight|relaxed|loose|flowing|roomy|oversized/, embroidery: /embroider|thread|motif|bead|sequin/, density: /heav|dense|bold|light|fine|subtle|minimal/ };
  const REPLIES = {
    order: ['Noted, thank you. I will post a photo when the next stage is done.', 'Yes, that is fine. We allow a little ease so it sits well.', 'Thanks for the message. It is on the table this week.'],
    commission: ['Good to know, that helps. I will work it in.', 'Understood. Leave it with me.', 'Yes, I can do that within the same fee.'],
    direct: ['Thanks for reaching out! Send a commission request from my profile with the occasion and your budget, and I will reply with an offer.', 'Hello! Happy to help. What is the occasion?', 'Thank you. I reply fastest to commission requests, but ask me anything here.'],
  };
  function simulateReplies() {
    let changed = false;
    for (const job of db.outbox.filter(j => j.dueAt <= now())) { say(job.threadId, job.by, job.text); const th = db.threads.find(x => x.id === job.threadId); th?.members.filter(m => m !== job.by).forEach(m => notify(m, 'message', `${person(job.by).name} replied`, job.text, `/messages?t=${job.threadId}`, 'msg:' + job.threadId)); changed = true; }
    if (changed) db.outbox = db.outbox.filter(j => j.dueAt > now());
    return changed;
  }
  /* run everything that could have moved for this user since the last look */
  function simulate(u) {
    if (!u) return; let changed = false;
    for (const r of db.requests) if (r.userId === u.id && r.status === 'open') changed = simulateQuotes(r) || changed;
    for (const o of db.orders) if (o.userId === u.id || u.role === 'admin') changed = simulateOrder(o) || changed;
    for (const c of db.commissions) if (c.clientId === u.id) changed = simulateCommission(c) || changed;
    changed = simulateReplies() || changed;
    changed = simulatePayouts() || changed;
    if (changed) save();
  }

  /* ═════════ streaks, XP, levels, badges, daily challenge ═════════
     A day counts towards the streak when the user saves at least one design or version that day. */
  const BADGES = [
    ['first_design', 'First design', 'Saved your first design'],
    ['sketcher', 'Sketch artist', 'Added your own hand sketch'],
    ['palette_explorer', 'Colour theory', 'Used 5 different palettes'],
    ['all_styles', 'Wardrobe', 'Designed all six styles'],
    ['iterator', 'Perfectionist', '10 versions of one design'],
    ['streak_3', 'On a roll', '3-day streak'],
    ['streak_7', 'Week of style', '7-day streak'],
    ['streak_30', 'Couture habit', '30-day streak'],
    ['challenger', 'Challenger', 'Completed 3 daily challenges'],
    ['published', 'Runway debut', 'Published a design'],
    ['collab', 'Collaborator', 'Completed a commission'],
    ['made_real', 'Made for real', 'Ordered a design from a tailor'],
  ];
  const LEVELS = [[0, 'Apprentice'], [150, 'Pattern cutter'], [400, 'Stylist'], [800, 'Tailor'], [1400, 'Master tailor'], [2200, 'Designer'], [3500, 'Couturier']];
  const levelOf = xp => { let i = 0; while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++; return { level: i + 1, title: LEVELS[i][1], from: LEVELS[i][0], to: LEVELS[i + 1]?.[0] ?? null }; };
  const gameOf = u => (db.games[u.id] ||= { xp: 0, streak: 0, best: 0, lastDay: null, days: [], badges: {}, challenges: {}, palettes: [], garments: [], todayVersions: 0, todayKey: null });
  const yKey = () => E.dayKey(new Date(Date.now() - DAY));
  function play(u, kind, spec, design) {
    const g = gameOf(u), today = E.dayKey(), before = levelOf(g.xp).level, r = { xp: 0, lines: [], badges: [], streak: g.streak, streakUp: false, challenge: null, levelUp: null };
    const add = (n, why) => { g.xp += n; r.xp += n; r.lines.push(`+${n} ${why}`); };
    const badge = id => { if (g.badges[id]) return; g.badges[id] = iso(); const b = BADGES.find(x => x[0] === id); r.badges.push(b[1]); add(25, b[1]); };
    if (g.todayKey !== today) { g.todayKey = today; g.todayVersions = 0; }
    if (kind === 'create' || kind === 'version') {
      if (g.lastDay !== today) { g.streak = g.lastDay === yKey() ? g.streak + 1 : 1; g.lastDay = today; g.best = Math.max(g.best, g.streak); g.days = [today, ...g.days.filter(x => x !== today)].slice(0, 60); r.streakUp = true; add(15, `${g.streak}-day streak`); }
      r.streak = g.streak;
      if (kind === 'create') add(20, 'new design'); else if (g.todayVersions < 15) { add(10, 'new version'); g.todayVersions++; }
      if (kind === 'create') badge('first_design');
      if (spec?.sketch?.length) badge('sketcher');
      if (spec?.palette && !g.palettes.includes(spec.palette)) g.palettes.push(spec.palette);
      if (g.palettes.length >= 5) badge('palette_explorer');
      if (spec && !g.garments.includes(spec.garment)) g.garments.push(spec.garment);
      if (g.garments.length >= 6) badge('all_styles');
      if (design?.versions.length >= 10) badge('iterator');
      if (g.streak >= 3) badge('streak_3'); if (g.streak >= 7) badge('streak_7'); if (g.streak >= 30) badge('streak_30');
      const ch = E.challengeFor();
      if (spec && !g.challenges[today] && E.checkChallenge(ch, spec)) { g.challenges[today] = ch.id; r.challenge = ch.title; add(50, `challenge: ${ch.title}`); }
      if (Object.keys(g.challenges).length >= 3) badge('challenger');
    }
    if (kind === 'publish') { const first = !g.badges.published; badge('published'); if (!first) add(15, 'published'); }
    if (kind === 'remix') add(10, 'remix');
    if (kind === 'collab') { const first = !g.badges.collab; badge('collab'); add(first ? 60 : 40, 'commission completed'); }
    if (kind === 'order') { const first = !g.badges.made_real; badge('made_real'); add(first ? 100 : 40, 'order placed'); }
    const after = levelOf(g.xp); if (after.level > before) r.levelUp = after.title;
    return r;
  }
  function gameOut(u) {
    const g = gameOf(u), today = E.dayKey(), y = yKey(), lv = levelOf(g.xp), ch = E.challengeFor();
    const alive = g.lastDay === today || g.lastDay === y;
    const week = Array.from({ length: 7 }, (_, i) => { const dd = new Date(Date.now() - (6 - i) * DAY), k = E.dayKey(dd); return { key: k, label: dd.toLocaleDateString('en-NG', { weekday: 'narrow' }), done: g.days.includes(k), today: k === today }; });
    return { xp: g.xp, streak: alive ? g.streak : 0, best: g.best, doneToday: g.lastDay === today, atRisk: g.lastDay === y, ...lv, week, badges: BADGES.map(([id, name, desc]) => ({ id, name, desc, at: g.badges[id] || null })), challenge: { id: ch.id, title: ch.title, text: ch.text, template: ch.template || null, tab: ch.tab || null, done: !!g.challenges[today] }, challengesDone: Object.keys(g.challenges).length, garments: g.garments.length, palettes: g.palettes.length };
  }

  /* ───────── payments (test mode) ───────── */
  function luhn(n) { let s = 0, alt = false; for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } s += d; alt = !alt; } return n.length >= 12 && s % 10 === 0; }
  async function charge({ method = 'card', card, reference }) {
    if (!['card', 'transfer', 'paystack'].includes(method)) fail('Choose a payment method.');
    if (method === 'card' && !reference) {
      const num = String(card?.number || '').replace(/\D/g, '');
      if (!luhn(num) || num.length < 16) fail('Check the card number.');
      if (!/^\d{2}\/\d{2}$/.test(card?.expiry || '')) fail('Enter the expiry as MM/YY.');
      const [mm, yy] = card.expiry.split('/').map(Number); if (mm < 1 || mm > 12 || new Date(2000 + yy, mm, 0) < new Date()) fail('This card has expired.');
      if (!/^\d{3,4}$/.test(card?.cvv || '')) fail('Enter the 3-digit CVV.');
      if (card.cvv === '000') fail('The bank declined this card. Try another card or bank transfer.', 402);
    }
    await wait(method === 'transfer' ? 1800 : 1200);
    return { method, reference: txt(reference, 60) || 'FT' + uid().toUpperCase().slice(-9), last4: method === 'card' && card ? String(card.number).replace(/\D/g, '').slice(-4) : null };
  }
  const HANDLE = /^[a-z0-9][a-z0-9._]{2,23}$/;
  const newDesign = (u, spec, extra = {}) => ({ id: uid('d_'), userId: u.id, title: E.title(spec), prompt: '', source: 'builder', versions: [{ n: 1, instruction: 'First save', spec, changes: [], from: null, createdAt: iso() }], current: 1, status: 'draft', published: false, publishedAt: null, caption: '', tags: [], allowRemix: true, remixOf: null, credit: null, likeBase: 0, createdAt: iso(), updatedAt: iso(), ...extra });
  const commissionOut = c => { const u = me(), last = c.deliveries[c.deliveries.length - 1], dd = last && db.designs.find(x => x.id === last.designId), p = profileOf(c.designerId); return { ...clone(c), client: person(c.clientId), designer: { ...person(c.designerId), feeFrom: p?.feeFrom || 0, turnaroundDays: p?.turnaroundDays || 3, rating: p?.rating || 0 }, role: u?.id === c.designerId ? 'designer' : 'client', delivery: last ? { ...clone(last), design: mini(dd) } : null, reference: mini(db.designs.find(x => x.id === c.refDesignId)), result: mini(db.designs.find(x => x.id === c.resultDesignId)), canRevise: c.revisions < c.maxRevisions, review: db.reviews.find(r => r.id === c.reviewId) || null }; };
  const partyOf = (c, u) => c && u && (c.clientId === u.id || c.designerId === u.id || u.role === 'admin');
  function threadFor(kind, refId, members, title) { let th = db.threads.find(x => x.kind === kind && (kind === 'direct' ? members.every(m => x.members.includes(m)) : x.refId === refId)); if (!th) { th = { id: uid('t_'), kind, refId, members, title: txt(title, 120), createdAt: iso(), updatedAt: iso(), read: {} }; db.threads.push(th); } return th; }
  const unreadIn = (th, u) => db.chat.filter(k => k.threadId === th.id && !k.system && k.by !== u.id && k.at > (th.read[u.id] || '')).length;
  const threadOut = (th, u) => { const other = th.members.find(m => m !== u.id) || th.members[0], msgs = db.chat.filter(k => k.threadId === th.id), last = msgs[msgs.length - 1]; return { id: th.id, kind: th.kind, refId: th.refId, title: th.kind === 'direct' ? person(other).name : th.title, other: person(other), last: last ? { text: last.text, at: last.at, mine: last.by === u.id, system: !!last.system } : null, unread: unreadIn(th, u), updatedAt: th.updatedAt, href: th.kind === 'order' ? `/orders?id=${th.refId}` : th.kind === 'commission' ? `/commissions?id=${th.refId}` : `/designer?id=${other}` }; };
  function rate(kind, target) { const all = db.reviews.filter(r => (kind === 'order' ? r.vendorId : r.designerId) === target && r.refId !== 'seed'); const rec = kind === 'order' ? db.vendors.find(v => v.id === target) : profileOf(target); if (!rec || !all.length) return; const last = all[all.length - 1]; rec.rating = Math.round(((rec.rating * rec.reviews + last.rating) / (rec.reviews + 1)) * 10) / 10; rec.reviews += 1; }

  /* ═════════ public API ═════════ */
  const S = (window.FTStore = {
    onChange: fn => { listeners.add(fn); return () => listeners.delete(fn); },
    DEMO, PHASES,
    reset() { localStorage.removeItem(KEY); localStorage.removeItem(SESSION); load(); emit(); },

    /* ───── accounts ───── */
    me: () => pub(me()),
    async register({ name, email: em, password, role = 'customer', phone = '', city = '', country = '' }) {
      em = String(em || '').trim().toLowerCase();
      if (!txt(name)) fail('Enter your name.');
      if (!email(em)) fail('Enter a valid email address.');
      if (!password || password.length < 8) fail('Use a password of at least 8 characters.');
      if (db.users.some(u => u.email === em)) fail('An account with this email already exists. Sign in instead.', 409);
      if (!['customer', 'tailor'].includes(role)) role = 'customer';
      const salt = newSalt();
      const u = { id: uid('u_'), email: em, name: txt(name, 80), role, passHash: await hashPassword(password, salt), salt, phone: txt(phone, 30), city: txt(city, 60), country: txt(country, 60), status: 'active', createdAt: iso(), demo: false, emailVerified: false };
      db.users.push(u); audit('register', u.id, u.id); sendVerify(u); save();
      session.set({ userId: u.id, token: uid('t_'), at: iso() });
      return pub(u);
    },
    async login(em, password) {
      em = String(em || '').trim().toLowerCase();
      const u = db.users.find(x => x.email === em);
      await wait(250);
      if (!u || u.sample) fail('No account with that email. Create one to get started.', 401);
      if (u.status === 'suspended') fail('This account has been suspended. Contact support.', 403);
      if (u.passHash == null) { // demo accounts get their hash on first sign-in
        const demo = Object.values(DEMO).find(x => x.email === em);
        if (!demo || password !== demo.password) fail('That password is not right.', 401);
        u.passHash = await hashPassword(password, u.salt); save();
      } else if ((await hashPassword(password, u.salt)) !== u.passHash) fail('That password is not right.', 401);
      session.set({ userId: u.id, token: uid('t_'), at: iso() }); audit('login', u.id, u.id);
      return pub(u);
    },
    logout() { session.set(null); },
    async updateProfile(patch) {
      const u = need();
      for (const k of ['name', 'phone', 'city', 'country']) if (patch[k] != null) u[k] = txt(patch[k], 80);
      if (patch.emailPrefs && typeof patch.emailPrefs === 'object') u.emailPrefs = { orders: patch.emailPrefs.orders !== false, messages: patch.emailPrefs.messages !== false };
      if (!u.name) fail('Enter your name.');
      if (patch.email != null) { const em = String(patch.email).trim().toLowerCase(); if (!email(em)) fail('Enter a valid email address.'); if (db.users.some(x => x.email === em && x.id !== u.id)) fail('That email is already in use.'); if (em !== u.email) { u.email = em; u.emailVerified = false; sendVerify(u); } }
      save(); return pub(u);
    },
    async changePassword(current, next) {
      const u = need();
      if (u.passHash == null || (await hashPassword(current, u.salt)) !== u.passHash) fail('Your current password is not right.');
      if (!next || next.length < 8) fail('Use a new password of at least 8 characters.');
      u.salt = newSalt(); u.passHash = await hashPassword(next, u.salt); save(); return true;
    },
    /* ───── email: confirm an address, reset a forgotten password ───── */
    async sendVerification() { const u = need(); if (verified(u)) return true; sendVerify(u); save(); return true; },
    async verifyEmail(tok) {
      const t = db.tokens.find(x => x.token === tok && x.kind === 'verify' && x.exp > now()), u = t && userById(t.userId);
      if (!u || u.email !== t.email) fail('This confirmation link has expired or was already used. Ask for a new one from your account.');
      u.emailVerified = true; db.tokens = db.tokens.filter(x => x !== t); audit('email:verified', u.id, u.id); settle(u.id); save(); return { email: u.email };
    },
    /** Always answers the same way, so nobody can find out which addresses have accounts. */
    async forgotPassword(em) {
      em = String(em || '').trim().toLowerCase(); await wait(250); if (!email(em)) fail('Enter a valid email address.');
      const u = db.users.find(x => x.email === em && !x.sample && x.status !== 'suspended');
      if (u) { mail(u.email, 'reset', 'Reset your password', `Hello ${u.name.split(' ')[0]}. Use this link to choose a new password. It works once and for one hour. If you did not ask for it, ignore this email.`, '/signin?reset=' + token('reset', u, 1)); save(); }
      return true;
    },
    async resetPassword(tok, next) {
      const t = db.tokens.find(x => x.token === tok && x.kind === 'reset' && x.exp > now()), u = t && userById(t.userId);
      if (!u) fail('This reset link has expired or was already used. Ask for a new one.');
      if (!next || next.length < 8) fail('Use a new password of at least 8 characters.');
      u.salt = newSalt(); u.passHash = await hashPassword(next, u.salt); if (u.email === t.email) u.emailVerified = true;
      db.tokens = db.tokens.filter(x => x.userId !== u.id); audit('password:reset', u.id, u.id); save(); return { email: u.email };
    },
    /** The demo mailbox: every email this browser would have sent, newest first. Built-in mode only. */
    async mailbox() { return db.mail.slice(0, 40).map(clone); },
    /** What this installation has switched on. The backend answers the same question at /config/. */
    async features() { return { feePercent: feePct(), payouts: 'test', mail: 'demo', tryOnAi: false, paymentsLive: false }; },

    /* ───── payouts: where to send the money, and what has been sent ───── */
    async listBanks() { return BANKS.map(([code, name]) => ({ code, name })); },
    async payoutAccount() { const u = need(), a = db.payoutAccounts.find(x => x.userId === u.id); return a ? { bankCode: a.bankCode, bankName: a.bankName, accountName: a.accountName, last4: a.last4 } : null; },
    async savePayoutAccount({ bankCode, number }) {
      const u = need(); if (!verified(u)) fail('Confirm your email address first. We sent you a link.');
      const bank = BANKS.find(b => b[0] === String(bankCode)); if (!bank) fail('Choose your bank.');
      number = String(number || '').replace(/\D/g, ''); if (number.length !== 10) fail('Enter the 10-digit account number.');
      await wait(300);
      db.payoutAccounts = db.payoutAccounts.filter(x => x.userId !== u.id);
      db.payoutAccounts.push({ userId: u.id, bankCode: bank[0], bankName: bank[1], accountName: u.name, last4: number.slice(-4), number, at: iso() });
      audit('payout:account', u.id, u.id); settle(u.id); save(); return S.payoutAccount();
    },
    async earnings() {
      const u = need(); simulate(u); const mine = db.payouts.filter(x => x.userId === u.id), sum = st => mine.filter(x => x.status === st).reduce((n, x) => n + x.net, 0);
      const held = db.payments.filter(p => p.status === 'paid' && ((u.vendorId && p.vendorId === u.vendorId) || p.designerId === u.id)).reduce((n, p) => n + p.amount, 0);
      return { feePercent: feePct(), held, heldNet: held - Math.round(held * feePct() / 100), pending: sum('pending'), processing: sum('processing'), paid: sum('paid'), failed: sum('failed'), account: await S.payoutAccount(), payouts: mine.slice(0, 60).map(payoutOut) };
    },

    /* ───── designs + versions ───── */
    /** Create a design from the builder ({spec}) or, optionally, from a description ({prompt}: "Describe it"). */
    async createDesign({ prompt = '', hints = {}, spec = null, title = '' }) {
      const u = need();
      if (!spec && !txt(prompt)) fail('Start from a template or describe the garment first.');
      spec = spec ? E.normalize(spec) : E.parse(prompt, hints);
      const tpl = spec.template && E.template(spec.template);
      const d = newDesign(u, spec, { prompt: txt(prompt, 600), source: prompt ? 'describe' : 'builder' });
      if (txt(title)) { d.title = txt(title, 90); d.renamed = true; }
      d.versions[0].instruction = tpl ? `Started from ${tpl.name}` : prompt ? 'Made from your description' : 'First save';
      db.designs.unshift(d);
      const reward = play(u, 'create', spec, d);
      save(); return { ...designOut(d), reward };
    },
    /** Save the builder's current spec as a new version of a design. */
    async saveVersion(id, spec, label = '', fromN = null) {
      const u = need(), d = db.designs.find(x => x.id === id && (x.userId === u.id || u.role === 'admin'));
      if (!d) fail('That design no longer exists.', 404);
      if (d.status === 'ordered') fail('This design is in production. Duplicate it to keep designing.');
      spec = E.normalize(spec);
      const cur = (fromN && d.versions.find(v => v.n === fromN)) || version(d), changes = E.diff(cur.spec, spec);
      if (!changes.length && !txt(label)) fail('Nothing changed since the last version.');
      if (d.versions.length >= 60) fail('This design has 60 versions. Duplicate it to keep going.');
      const n = Math.max(...d.versions.map(v => v.n)) + 1;
      d.versions.push({ n, instruction: txt(label, 90) || changes.slice(0, 2).join(', ') + (changes.length > 2 ? ` +${changes.length - 2} more` : ''), spec, changes, from: cur.n, createdAt: iso() });
      d.current = n; d.title = d.renamed ? d.title : E.title(spec); d.updatedAt = iso();
      const reward = play(u, 'version', spec, d);
      save(); return { ...designOut(d), reward };
    },
    async restoreVersion(id, n) {
      const u = need(), d = db.designs.find(x => x.id === id && (x.userId === u.id || u.role === 'admin'));
      if (!d) fail('That design no longer exists.', 404);
      const v = d.versions.find(x => x.n === Number(n)); if (!v) fail('That version does not exist.', 404);
      if (d.status === 'ordered') fail('This design is in production. Duplicate it to keep designing.');
      if (d.current === v.n) return designOut(d);
      const nn = Math.max(...d.versions.map(x => x.n)) + 1;
      d.versions.push({ n: nn, instruction: `Back to version ${v.n}`, spec: clone(v.spec), changes: [`Restored v${v.n}`], from: v.n, restored: v.n, createdAt: iso() });
      d.current = nn; d.title = d.renamed ? d.title : E.title(v.spec); d.updatedAt = iso(); save(); return designOut(d);
    },
    async game() { const u = need(); return gameOut(u); },
    async listDesigns() { const u = need(); return db.designs.filter(d => d.userId === u.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(d => designOut(d)); },
    async getDesign(id) {
      const u = me(), d = db.designs.find(x => x.id === id);
      if (!d) fail('That design no longer exists.', 404);
      const view = access(d, u); if (!view) fail(u ? 'This design is private.' : 'Sign in to open this design.', u ? 403 : 401);
      return designOut(d, view);
    },
    async renameDesign(id, title) { const u = need(), d = db.designs.find(x => x.id === id && x.userId === u.id); if (!d) fail('Design not found.', 404); if (!txt(title)) fail('Give the design a name.'); d.title = txt(title, 90); d.renamed = true; d.updatedAt = iso(); save(); return designOut(d); },
    async duplicateDesign(id) {
      const u = need(), d = db.designs.find(x => x.id === id && (x.userId === u.id || u.role === 'admin')); if (!d) fail('Design not found.', 404);
      const cur = version(d), nd = newDesign(u, clone(cur.spec), { title: txt(d.title + ' (copy)', 90), renamed: true, credit: d.credit || null });
      nd.versions[0].instruction = `Copied from "${d.title}" v${cur.n}`;
      db.designs.unshift(nd); save(); return designOut(nd);
    },
    async deleteDesign(id) {
      const u = need(), i = db.designs.findIndex(x => x.id === id && x.userId === u.id); if (i < 0) fail('Design not found.', 404);
      if (db.orders.some(o => o.designId === id && o.status !== 'cancelled')) fail('This design has an order. It stays in your library.');
      if (db.commissions.some(c => c.deliveries.some(x => x.designId === id) && !['cancelled', 'declined'].includes(c.status))) fail('This design was delivered for a commission. It stays in your library.');
      db.designs.splice(i, 1); db.requests = db.requests.filter(r => r.designId !== id); db.quotes = db.quotes.filter(q => q.designId !== id); db.likes = db.likes.filter(l => l.d !== id); db.saves = db.saves.filter(l => l.d !== id); save(); return true;
    },

    /* ───── publishing + Discover ───── */
    async publishDesign(id, { caption = '', tags = [], allowRemix = true } = {}) {
      const u = need(), d = db.designs.find(x => x.id === id && x.userId === u.id); if (!d) fail('Design not found.', 404);
      if (d.credit && d.credit.id !== u.id && !d.remixOf) fail('This design was made for you by a designer. Ask them before publishing it.');
      const first = !d.published;
      d.caption = txt(caption, 240); d.tags = [...new Set((Array.isArray(tags) ? tags : String(tags).split(/[,#\s]+/)).map(t => txt(t, 24).toLowerCase().replace(/[^a-z0-9-]/g, '')).filter(Boolean))].slice(0, 6); d.allowRemix = !!allowRemix;
      d.published = true; d.publishedAt = d.publishedAt || iso(); d.updatedAt = iso();
      const reward = first ? play(u, 'publish') : null;
      if (first) db.follows.filter(f => f.t === u.id).forEach(f => notify(f.u, 'publish', `${u.name} published a design`, d.title, `/design?id=${d.id}`));
      audit('publish', d.id); save(); return { ...designOut(d), reward };
    },
    async unpublishDesign(id) { const u = need(), d = db.designs.find(x => x.id === id && (x.userId === u.id || u.role === 'admin')); if (!d) fail('Design not found.', 404); d.published = false; d.updatedAt = iso(); save(); return designOut(d); },
    /** The public feed. sort: trending | new | following | saved. */
    async discover({ sort = 'trending', garment = '', q = '', by = '', limit = 24, offset = 0 } = {}) {
      const u = me(); let list = db.designs.filter(d => d.published && userById(d.userId)?.status !== 'suspended');
      if (garment) list = list.filter(d => version(d).spec.garment === garment);
      if (by) list = list.filter(d => d.userId === by);
      if (sort === 'following') { if (!u) return { items: [], total: 0 }; const f = db.follows.filter(x => x.u === u.id).map(x => x.t); list = list.filter(d => f.includes(d.userId)); }
      if (sort === 'saved') { if (!u) return { items: [], total: 0 }; const s = db.saves.filter(x => x.u === u.id).map(x => x.d); list = list.filter(d => s.includes(d.id)); }
      const needle = txt(q, 60).toLowerCase().replace(/^#/, '');
      if (needle) list = list.filter(d => [d.title, d.caption, (d.tags || []).join(' '), person(d.userId).name, person(d.userId).handle || ''].join(' ').toLowerCase().includes(needle));
      const score = d => likesOf(d) * 3 + remixesOf(d) * 12 + Math.max(0, 14 - (now() - ms(d.publishedAt)) / DAY) * 30;
      list.sort(sort === 'trending' ? (a, b) => score(b) - score(a) : (a, b) => b.publishedAt.localeCompare(a.publishedAt));
      return { items: list.slice(offset, offset + Math.min(60, limit)).map(card), total: list.length };
    },
    async like(id, on = true) { const u = need(), d = db.designs.find(x => x.id === id && x.published); if (!d) fail('Design not found.', 404); const had = db.likes.some(l => l.u === u.id && l.d === id); if (on && !had) { db.likes.push({ u: u.id, d: id, at: iso() }); if (d.userId !== u.id) notify(d.userId, 'like', `${u.name} liked your design`, d.title, `/design?id=${d.id}`); } else if (!on && had) db.likes = db.likes.filter(l => !(l.u === u.id && l.d === id)); save(); return { likes: likesOf(d), liked: !!on }; },
    async saveForLater(id, on = true) { const u = need(), d = db.designs.find(x => x.id === id && x.published); if (!d) fail('Design not found.', 404); db.saves = db.saves.filter(l => !(l.u === u.id && l.d === id)); if (on) db.saves.push({ u: u.id, d: id, at: iso() }); save(); return { saved: !!on }; },
    /** Copy a published design into your library to make it your own. The original designer stays credited. */
    async remixDesign(id) {
      const u = need(), d = db.designs.find(x => x.id === id); if (!d || !access(d, u)) fail('Design not found.', 404);
      if (d.userId !== u.id && !(d.published && d.allowRemix !== false)) fail('The designer has not opened this design for remixing.', 403);
      const cur = version(d), owner = person(d.userId), nd = newDesign(u, clone(cur.spec), { title: txt(d.title + ' (remix)', 90), renamed: true, remixOf: { designId: d.id, title: d.title, by: owner.name, byId: owner.id }, credit: d.credit || { id: owner.id, name: owner.name, handle: owner.handle } });
      nd.versions[0].instruction = `Remixed from "${d.title}" by ${owner.name}`;
      db.designs.unshift(nd); const reward = play(u, 'remix');
      if (d.userId !== u.id) notify(d.userId, 'remix', `${u.name} remixed your design`, d.title, `/design?id=${d.id}`);
      save(); return { ...designOut(nd), reward };
    },
    async reportContent({ kind = 'design', id, reason = '', note = '' }) {
      const u = need(); if (!['design', 'user', 'message', 'order'].includes(kind) || !id) fail('Nothing to report.');
      if (!txt(reason)) fail('Choose a reason.');
      if (db.reports.some(r => r.byId === u.id && r.kind === kind && r.refId === id && r.status === 'open')) return true;
      db.reports.unshift({ id: uid('rp_'), kind, refId: String(id), reason: txt(reason, 60), note: txt(note, 500), byId: u.id, status: 'open', createdAt: iso(), resolvedAt: null, resolution: null }); audit('report:' + kind, id); save(); return true;
    },

    /* ───── designers ───── */
    async listDesigners({ q = '', specialty = '', open = false } = {}) {
      const needle = txt(q, 60).toLowerCase().replace(/^@/, '');
      return db.designers.filter(p => userById(p.userId)?.status === 'active').map(designerOut).filter(p => (!open || p.open) && (!specialty || p.specialties.includes(specialty)) && (!needle || [p.name, p.handle, p.bio, p.city, p.specialties.join(' ')].join(' ').toLowerCase().includes(needle))).sort((a, b) => (b.featured - a.featured) || (b.followers - a.followers));
    },
    async getDesigner(id) {
      const key = String(id || '').replace(/^@/, ''), p = db.designers.find(x => x.userId === key || x.handle === key), u = userById(p?.userId || key);
      if (!u || u.status === 'suspended' || u.role === 'admin') fail('That profile does not exist.', 404);
      const designs = db.designs.filter(d => d.userId === u.id && d.published).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).map(card);
      const reviews = db.reviews.filter(r => r.designerId === u.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12).map(r => ({ ...clone(r), by: person(r.byId) }));
      const viewer = me();
      return p ? { ...designerOut(p), isDesigner: true, items: designs, reviewList: reviews } : { ...person(u.id), userId: u.id, isDesigner: false, bio: '', specialties: [], open: false, followers: db.follows.filter(f => f.t === u.id).length, following: !!viewer && db.follows.some(f => f.u === viewer.id && f.t === u.id), designs: designs.length, mine: viewer?.id === u.id, items: designs, reviewList: [] };
    },
    async myDesigner() { const u = need(), p = profileOf(u.id); return p ? designerOut(p) : null; },
    async saveDesignerProfile(patch) {
      const u = need(); let p = profileOf(u.id);
      const handle = String(patch.handle ?? p?.handle ?? '').trim().toLowerCase().replace(/^@/, '');
      if (!HANDLE.test(handle)) fail('Choose a handle of 3 to 24 letters, numbers, dots or underscores.');
      if (db.designers.some(x => x.handle === handle && x.userId !== u.id)) fail('That handle is taken.', 409);
      if (!txt(patch.bio ?? p?.bio)) fail('Write a line or two about what you design.');
      const specs = Array.isArray(patch.specialties) ? patch.specialties.map(s => txt(s, 30)).filter(Boolean).slice(0, 6) : p?.specialties || [];
      if (!specs.length) fail('Pick at least one thing you design.');
      const fee = Math.round(Number(patch.feeFrom ?? p?.feeFrom ?? 0)), days = Math.round(Number(patch.turnaroundDays ?? p?.turnaroundDays ?? 3));
      if (!(fee >= 1000 && fee <= 5000000)) fail('Set a starting fee of at least ₦1,000.');
      if (!(days >= 1 && days <= 60)) fail('Set a turnaround between 1 and 60 days.');
      const fresh = !p; if (!p) { p = { userId: u.id, rating: 0, reviews: 0, completed: 0, featured: false, followersBase: 0, sample: false, createdAt: iso() }; db.designers.push(p); audit('designer:new', u.id); }
      Object.assign(p, { handle, bio: txt(patch.bio ?? p.bio, 400), specialties: specs, open: patch.open == null ? p.open ?? true : !!patch.open, feeFrom: fee, turnaroundDays: days });
      save(); return { ...designerOut(p), fresh };
    },
    async follow(userId, on = true) { const u = need(), t = userById(userId); if (!t || t.id === u.id) fail('You cannot follow this profile.'); const had = db.follows.some(f => f.u === u.id && f.t === t.id); if (on && !had) { db.follows.push({ u: u.id, t: t.id, at: iso() }); notify(t.id, 'follow', `${u.name} followed you`, '', `/designer?id=${u.id}`); } else if (!on) db.follows = db.follows.filter(f => !(f.u === u.id && f.t === t.id)); save(); return { following: !!on, followers: (profileOf(t.id)?.followersBase || 0) + db.follows.filter(f => f.t === t.id).length }; },

    /* ───── commissions: a customer hires a designer to design something for them ───── */
    async requestCommission(designerId, { title = '', brief = '', garment = '', occasion = '', budget = 0, deadline = null, refDesignId = null } = {}) {
      const u = need(), p = profileOf(designerId), d = userById(designerId);
      if (!p || !d || d.status !== 'active') fail('That designer does not exist.', 404);
      if (d.id === u.id) fail('You cannot commission yourself.');
      if (!p.open) fail(`${d.name.split(' ')[0]} is not taking commissions right now.`);
      if (txt(title).length < 3) fail('Give the commission a short title.');
      if (txt(brief, 2000).length < 20) fail('Describe what you want in a sentence or two, so the designer can price it.');
      budget = Math.round(Number(budget) || 0); if (budget && budget < 1000) fail('Enter a budget of at least ₦1,000, or leave it empty.');
      if (deadline && !(ms(deadline) > now() - DAY)) fail('Choose a date in the future.');
      if (refDesignId && !db.designs.some(x => x.id === refDesignId && x.userId === u.id)) refDesignId = null;
      if (db.commissions.filter(c => c.clientId === u.id && c.designerId === d.id && ['requested', 'offered'].includes(c.status)).length >= 3) fail('You already have open requests with this designer.');
      const c = { id: uid('c_'), clientId: u.id, designerId: d.id, title: txt(title, 90), brief: txt(brief, 2000), garment: E.vocab.GARMENTS[garment] ? garment : '', occasion: txt(occasion, 60), budget, deadline: deadline ? String(deadline).slice(0, 10) : null, refDesignId, status: 'requested', offer: null, paid: 0, paidAt: null, revisions: 0, maxRevisions: 2, deliveries: [], resultDesignId: null, reviewId: null, threadId: null, changeNote: null, createdAt: iso(), updatedAt: iso() };
      const th = threadFor('commission', c.id, [u.id, d.id], c.title); c.threadId = th.id; db.commissions.unshift(c);
      say(th.id, 'system', `${u.name.split(' ')[0]} sent a commission request.`);
      notify(d.id, 'commission', 'New commission request', `${u.name}: ${c.title}`, `/commissions?id=${c.id}`); audit('commission:new', c.id); save(); return commissionOut(c);
    },
    async listCommissions() { const u = need(); simulate(u); return db.commissions.filter(c => c.clientId === u.id || c.designerId === u.id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(commissionOut); },
    async getCommission(id) { const u = need(), c = db.commissions.find(x => x.id === id); if (!partyOf(c, u)) fail('Commission not found.', 404); simulate(u); return commissionOut(c); },
    async offerCommission(id, { fee, days, note = '' }) {
      const u = need(), c = db.commissions.find(x => x.id === id && x.designerId === u.id); if (!c) fail('Commission not found.', 404);
      if (!['requested', 'offered'].includes(c.status)) fail('This request is no longer open for an offer.');
      fee = Math.round(Number(fee)); days = Math.round(Number(days));
      if (!(fee >= 1000 && fee <= 5000000)) fail('Enter a fee of at least ₦1,000.'); if (!(days >= 1 && days <= 60)) fail('Enter a delivery time between 1 and 60 days.');
      c.offer = { fee, days, note: txt(note, 400), at: iso() }; c.status = 'offered'; c.updatedAt = iso();
      say(c.threadId, 'system', `${u.name.split(' ')[0]} offered ${fmt(fee)}, ${days} day${days === 1 ? '' : 's'}.`);
      notify(c.clientId, 'commission', `${u.name.split(' ')[0]} sent an offer`, `${fmt(fee)}, ${days} days for "${c.title}".`, `/commissions?id=${c.id}`); save(); return commissionOut(c);
    },
    async declineCommission(id, reason = '') {
      const u = need(), c = db.commissions.find(x => x.id === id && x.designerId === u.id); if (!c) fail('Commission not found.', 404);
      if (!['requested', 'offered'].includes(c.status)) fail('Only a request that has not been paid can be declined.');
      c.status = 'declined'; c.updatedAt = iso(); say(c.threadId, 'system', `${u.name.split(' ')[0]} declined the request.${txt(reason) ? ' ' + txt(reason, 200) : ''}`);
      notify(c.clientId, 'commission', `${u.name.split(' ')[0]} declined your request`, c.title, `/commissions?id=${c.id}`); save(); return commissionOut(c);
    },
    /** The client accepts the offer and pays. The fee is held until they approve the design. */
    async payCommission(id, pay = {}) {
      const u = need(), c = db.commissions.find(x => x.id === id && x.clientId === u.id); if (!c) fail('Commission not found.', 404);
      if (c.status !== 'offered' || !c.offer) fail('There is no open offer to pay.');
      const paid = await charge(pay);
      if (c.status !== 'offered') fail('This offer was already paid.', 409);
      const p = { id: uid('p_'), orderId: null, commissionId: c.id, userId: u.id, vendorId: null, designerId: c.designerId, amount: c.offer.fee, kind: 'commission', status: 'paid', createdAt: iso(), ...paid };
      db.payments.unshift(p); c.paid = c.offer.fee; c.paidAt = iso(); c.status = 'active'; c.updatedAt = iso();
      say(c.threadId, 'system', `${u.name.split(' ')[0]} paid. ${fmt(c.paid)} is held by Fashion Teller until the design is approved.`);
      notify(c.designerId, 'commission', `${u.name.split(' ')[0]} paid for the commission`, `"${c.title}". Deliver within ${c.offer.days} days.`, `/commissions?id=${c.id}`); audit('pay', p.id); save(); return { payment: clone(p), commission: commissionOut(c) };
    },
    async deliverCommission(id, { designId, note = '' }) {
      const u = need(), c = db.commissions.find(x => x.id === id && x.designerId === u.id); if (!c) fail('Commission not found.', 404);
      if (!['active', 'changes'].includes(c.status)) fail(c.status === 'delivered' ? 'You already delivered. Wait for the client to answer.' : 'This commission is not waiting on a delivery.');
      const d = db.designs.find(x => x.id === designId && x.userId === u.id); if (!d) fail('Choose one of your own designs to deliver.');
      c.deliveries.push({ at: iso(), designId: d.id, versionN: d.current, note: txt(note, 600) }); c.status = 'delivered'; c.updatedAt = iso(); c.changeNote = null;
      say(c.threadId, 'system', `${u.name.split(' ')[0]} delivered a design.`, d.id);
      notify(c.clientId, 'commission', `${u.name.split(' ')[0]} delivered your design`, `"${c.title}" is ready to review.`, `/commissions?id=${c.id}`); save(); return commissionOut(c);
    },
    async requestChanges(id, note = '') {
      const u = need(), c = db.commissions.find(x => x.id === id && x.clientId === u.id); if (!c) fail('Commission not found.', 404);
      if (c.status !== 'delivered') fail('There is no delivery to answer yet.');
      if (c.revisions >= c.maxRevisions) fail(`This commission includes ${c.maxRevisions} rounds of changes and both are used. Approve it, or message the designer.`);
      if (txt(note).length < 8) fail('Say what you would like changed.');
      c.revisions += 1; c.status = 'changes'; c.changeNote = txt(note, 600); c.updatedAt = iso();
      say(c.threadId, u.id, c.changeNote); say(c.threadId, 'system', `${u.name.split(' ')[0]} asked for changes (${c.revisions} of ${c.maxRevisions}).`);
      notify(c.designerId, 'commission', `${u.name.split(' ')[0]} asked for changes`, c.changeNote, `/commissions?id=${c.id}`); save(); return commissionOut(c);
    },
    /** The client approves: the design is copied into their library, credited, and the designer is paid. */
    async approveCommission(id) {
      const u = need(), c = db.commissions.find(x => x.id === id && x.clientId === u.id); if (!c) fail('Commission not found.', 404);
      if (c.status !== 'delivered') fail('There is no delivery to approve yet.');
      const last = c.deliveries[c.deliveries.length - 1], src = db.designs.find(x => x.id === last.designId); if (!src) fail('The delivered design is no longer available. Message the designer.');
      const designer = person(c.designerId), spec = clone((src.versions.find(v => v.n === last.versionN) || version(src)).spec);
      const nd = newDesign(u, spec, { title: c.title, renamed: true, credit: { id: designer.id, name: designer.name, handle: designer.handle }, commissionOf: c.id });
      nd.versions[0].instruction = `Designed for you by ${designer.name}`;
      db.designs.unshift(nd); c.resultDesignId = nd.id; c.status = 'approved'; c.updatedAt = iso();
      db.payments.filter(p => p.commissionId === c.id && p.status === 'paid').forEach(p => (p.status = 'released'));
      const prof = profileOf(c.designerId); if (prof) prof.completed = (prof.completed || 0) + 1;
      const po = payout(c.designerId, 'commission', c.id, c.title, c.paid);
      say(c.threadId, 'system', `${u.name.split(' ')[0]} approved the design. ${fmt(c.paid)} released to ${designer.name.split(' ')[0]}.`);
      notify(c.designerId, 'commission', 'Design approved, payment released', `${fmt(po ? po.net : c.paid)} for "${c.title}"${po && po.fee ? `, after the ${feePct()}% platform fee` : ''}.`, `/commissions?id=${c.id}`);
      const dUser = userById(c.designerId); if (dUser && !dUser.sample) play(dUser, 'collab');
      const reward = play(u, 'collab'); save(); return { commission: commissionOut(c), design: designOut(nd), reward };
    },
    async cancelCommission(id) {
      const u = need(), c = db.commissions.find(x => x.id === id && x.clientId === u.id); if (!c) fail('Commission not found.', 404);
      if (!['requested', 'offered', 'active'].includes(c.status) || c.deliveries.length) fail('The designer has already delivered work on this commission. Message them, or report a problem.');
      if (c.paid) { db.payments.filter(p => p.commissionId === c.id && p.status === 'paid').forEach(p => (p.status = 'refunded')); say(c.threadId, 'system', `Cancelled. ${fmt(c.paid)} refunded to ${u.name.split(' ')[0]}.`); c.paid = 0; } else say(c.threadId, 'system', `${u.name.split(' ')[0]} cancelled the request.`);
      c.status = 'cancelled'; c.updatedAt = iso(); notify(c.designerId, 'commission', 'Commission cancelled', c.title, `/commissions?id=${c.id}`); save(); return commissionOut(c);
    },

    /* ───── reviews ───── */
    async addReview({ kind, id, rating, text = '' }) {
      const u = need(); rating = Math.round(Number(rating)); if (!(rating >= 1 && rating <= 5)) fail('Choose 1 to 5 stars.');
      let rec, target;
      if (kind === 'order') { rec = db.orders.find(o => o.id === id && o.userId === u.id); if (!rec || !['delivered', 'completed'].includes(rec.status)) fail('You can review an order once it is delivered.'); target = rec.vendorId; }
      else if (kind === 'commission') { rec = db.commissions.find(c => c.id === id && c.clientId === u.id); if (!rec || rec.status !== 'approved') fail('You can review a commission once you have approved it.'); target = rec.designerId; }
      else fail('Nothing to review.');
      if (rec.reviewId) fail('You have already reviewed this.', 409);
      const r = { id: uid('rv_'), kind, refId: rec.id, byId: u.id, vendorId: kind === 'order' ? target : null, designerId: kind === 'commission' ? target : null, rating, text: txt(text, 600), createdAt: iso() };
      db.reviews.unshift(r); rec.reviewId = r.id; rate(kind, target);
      notify(kind === 'order' ? db.vendors.find(v => v.id === target)?.userId : target, 'review', `${u.name.split(' ')[0]} left a ${rating}-star review`, r.text, kind === 'order' ? '/workshop' : `/designer?id=${target}`); save(); return clone(r);
    },
    async listReviews({ vendorId = null, designerId = null } = {}) { return db.reviews.filter(r => (vendorId && r.vendorId === vendorId) || (designerId && r.designerId === designerId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20).map(r => ({ ...clone(r), by: person(r.byId) })); },

    /* ───── messages ───── */
    async listThreads() { const u = need(); simulate(u); return db.threads.filter(th => th.members.includes(u.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(th => threadOut(th, u)); },
    /** Open (or start) a conversation: with a person, about an order, or about a commission. */
    async openThread({ userId = null, orderId = null, commissionId = null } = {}) {
      const u = need(); let th;
      if (orderId) { const o = db.orders.find(x => x.id === orderId), v = o && db.vendors.find(x => x.id === o.vendorId); if (!o || !(o.userId === u.id || v?.userId === u.id)) fail('Order not found.', 404); if (o.status === 'awaiting_payment') fail('You can message the tailor once the order is paid.'); th = threadFor('order', o.id, [o.userId, v.userId], `Order ${o.id}`); }
      else if (commissionId) { const c = db.commissions.find(x => x.id === commissionId); if (!partyOf(c, u) || u.role === 'admin') fail('Commission not found.', 404); th = db.threads.find(x => x.id === c.threadId) || threadFor('commission', c.id, [c.clientId, c.designerId], c.title); }
      else { const t = userById(userId); if (!t || t.id === u.id || t.status !== 'active' || t.role === 'admin') fail('You cannot message this profile.'); if (!profileOf(t.id) && !t.vendorId && !db.threads.some(x => x.kind === 'direct' && x.members.includes(t.id) && x.members.includes(u.id))) fail('You can message designers and tailors from their profiles.', 403); th = threadFor('direct', null, [u.id, t.id], ''); }
      save(); return threadOut(th, u);
    },
    async getThread(id) {
      const u = need(), th = db.threads.find(x => x.id === id && x.members.includes(u.id)); if (!th) fail('Conversation not found.', 404);
      simulate(u);
      const list = db.chat.filter(k => k.threadId === th.id).slice(-200), stamp = list.length ? list[list.length - 1].at : iso();
      if (th.read[u.id] !== stamp) { th.read[u.id] = stamp; save(); }
      return { ...threadOut(th, u), messages: list.map(k => ({ id: k.id, by: k.by, mine: k.by === u.id, system: !!k.system, text: k.text, at: k.at, design: k.designId ? mini(db.designs.find(d => d.id === k.designId)) : null })) };
    },
    async sendMessage(id, { text = '', designId = null } = {}) {
      const u = need(), th = db.threads.find(x => x.id === id && x.members.includes(u.id)); if (!th) fail('Conversation not found.', 404);
      const body = txt(text, 2000); if (!body && !designId) fail('Write a message first.');
      if (designId && !db.designs.some(d => d.id === designId && d.userId === u.id)) fail('You can only share your own designs.');
      if (db.chat.filter(k => k.by === u.id && now() - ms(k.at) < 60000).length >= 20) fail('You are sending messages very quickly. Give it a minute.', 429);
      say(th.id, u.id, body || 'Shared a design', designId);
      for (const m of th.members.filter(x => x !== u.id)) {
        const other = userById(m); if (!other) continue;
        if (other.sample) { const set = REPLIES[th.kind] || REPLIES.direct; if (!db.outbox.some(j => j.threadId === th.id)) db.outbox.push({ threadId: th.id, by: m, text: set[hash32(th.id + db.chat.length) % set.length], dueAt: now() + sampleDelay(th.id, 'r' + db.chat.length, [2500, 6000]) }); }
        else notify(m, 'message', `${u.name} sent a message`, body || 'Shared a design', `/messages?t=${th.id}`, 'msg:' + th.id);
      }
      save(); return S.getThread(th.id);
    },

    /* ───── notifications ───── */
    /** Counts for the nav. Calling it also lets sample tailors and designers take their turn. */
    async unread() { const u = me(); if (!u) return { notifications: 0, messages: 0 }; simulate(u); return { notifications: db.notifications.filter(n => n.userId === u.id && !n.read).length, messages: db.threads.filter(th => th.members.includes(u.id)).reduce((s, th) => s + unreadIn(th, u), 0) }; },
    async listNotifications() { const u = need(); simulate(u); return db.notifications.filter(n => n.userId === u.id).slice(0, 40).map(clone); },
    async markNotifications(ids = 'all') { const u = need(); for (const n of db.notifications) if (n.userId === u.id && (ids === 'all' || ids.includes(n.id))) n.read = true; save(); return true; },

    /* ───── measurements ───── */
    async listMeasurements() { const u = need(); return db.measurements.filter(m => m.userId === u.id).map(clone); },
    async saveMeasurement(m) {
      const u = need();
      const vals = {}; for (const [k, v] of Object.entries(m.values || {})) { const n = Number(v); if (/^[a-z]{2,12}$/.test(k) && v !== '' && v != null && !Number.isNaN(n) && n > 0 && n < 400) vals[k] = Math.round(n * 10) / 10; }
      if (!vals.chest || !vals.waist) fail('Chest and waist are the minimum a tailor needs.');
      let rec = m.id && db.measurements.find(x => x.id === m.id && x.userId === u.id);
      if (!rec) { if (db.measurements.filter(x => x.userId === u.id).length >= 12) fail('You can keep up to 12 measurement profiles.'); rec = { id: uid('m_'), userId: u.id, createdAt: iso() }; db.measurements.push(rec); }
      Object.assign(rec, { label: txt(m.label, 40) || 'Me', unit: m.unit === 'in' ? 'in' : 'cm', values: vals, fit: ['slim', 'regular', 'relaxed'].includes(m.fit) ? m.fit : 'regular', notes: txt(m.notes, 400), updatedAt: iso() });
      save(); return clone(rec);
    },
    async deleteMeasurement(id) { const u = need(); if (db.orders.some(o => o.measurementId === id && ['active', 'awaiting_payment'].includes(o.status))) fail('An order in production uses this profile.'); db.measurements = db.measurements.filter(m => !(m.id === id && m.userId === u.id)); save(); return true; },

    /* ───── tailors ───── */
    async listVendors({ all = false } = {}) { return db.vendors.filter(v => (all && me()?.role === 'admin') || v.verified === 'verified').map(vendorPub); },
    async getVendor(id) { const v = db.vendors.find(x => x.id === id); if (!v || (v.verified !== 'verified' && me()?.role !== 'admin' && v.userId !== me()?.id)) fail('Tailor not found.', 404); return { ...vendorPub(v), reviewList: await S.listReviews({ vendorId: v.id }) }; },
    async myVendor() { const u = need('tailor'); const v = vendorOf(u); return v ? vendorPub(v) : null; },
    async updateVendor(patch) {
      const u = need('tailor'), v = vendorOf(u); if (!v) fail('No workshop on this account.', 404);
      for (const k of ['name', 'city', 'country']) if (patch[k] != null && txt(patch[k])) v[k] = txt(patch[k], 80);
      if (patch.bio != null) v.bio = txt(patch.bio, 500);
      if (Array.isArray(patch.specialties) && patch.specialties.length) v.specialties = patch.specialties.map(s => txt(s, 30)).filter(Boolean).slice(0, 8);
      if (patch.leadMin) v.leadMin = Math.min(60, Math.max(2, Math.round(Number(patch.leadMin)) || v.leadMin));
      save(); return vendorPub(v);
    },
    /** Tailor application: creates (or links) a tailor account and a workshop awaiting verification. */
    async applyAsVendor(form) {
      if (!txt(form.workshop)) fail('Enter the name of your workshop.');
      let u = me();
      if (!u) {
        if (db.users.some(x => x.email === String(form.email || '').trim().toLowerCase())) fail('An account with this email already exists. Sign in, then apply from your account.', 409);
        await S.register({ name: form.name, email: form.email, password: form.password, role: 'tailor', phone: form.phone, city: form.city, country: form.country });
        u = me();
      }
      if (vendorOf(u)) fail('Your workshop is already registered. Check its status in your workshop page.', 409);
      if (u.role === 'customer') u.role = 'tailor';
      const v = { id: uid('v_'), userId: u.id, name: txt(form.workshop, 80), city: txt(form.city, 60), country: txt(form.country, 60), specialties: (form.specialties || []).map(s => txt(s, 30)).filter(Boolean).slice(0, 8), bio: txt(form.about, 500), rating: 0, reviews: 0, ordersDone: 0, priceFactor: 1, speedFactor: 1, leadMin: 7, since: new Date().getFullYear(), verified: 'pending', verifiedAt: null, sample: false, createdAt: iso(), hue: hash32(u.id) % 360 };
      u.vendorId = v.id; db.vendors.push(v);
      db.applications.unshift({ id: uid('a_'), userId: u.id, vendorId: v.id, workshop: v.name, name: txt(form.name || u.name, 80), email: u.email, phone: txt(form.phone || u.phone, 30), city: v.city, country: v.country, specialties: v.specialties, about: v.bio, status: 'pending', createdAt: iso() });
      audit('apply', v.id); save(); return vendorPub(v);
    },

    /* ───── production requests + quotes ───── */
    async requestQuotes(designId, { measurementId, notes = '', deadline = null } = {}) {
      const u = need(), d = db.designs.find(x => x.id === designId && x.userId === u.id); if (!d) fail('Design not found.', 404);
      if (!measurementId || !db.measurements.some(m => m.id === measurementId && m.userId === u.id)) fail('Choose a measurement profile first.');
      let req = db.requests.find(r => r.designId === designId && r.status === 'open');
      if (req && req.versionN === d.current && req.measurementId === measurementId) return clone(req);
      if (req) { req.status = 'closed'; db.quotes.filter(q => q.requestId === req.id && q.status === 'offered').forEach(q => (q.status = 'withdrawn')); }
      req = { id: uid('r_'), designId, versionN: d.current, userId: u.id, measurementId, notes: txt(notes, 600), deadline: deadline ? String(deadline).slice(0, 10) : null, status: 'open', createdAt: iso() };
      db.requests.push(req); if (d.status === 'draft') d.status = 'requested';
      db.vendors.filter(v => !v.sample && v.verified === 'verified' && matches(v, version(d).spec)).forEach(v => notify(v.userId, 'request', 'New request for quotes', d.title, '/workshop'));
      save(); return clone(req);
    },
    async getRequest(designId) { const u = need(); const r = db.requests.filter(x => x.designId === designId && (x.userId === u.id || u.role === 'admin')).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]; return r ? clone(r) : null; },
    async listQuotes(designId) {
      const u = need();
      const req = db.requests.filter(x => x.designId === designId && x.userId === u.id && x.status !== 'closed').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (!req) return [];
      if (simulateQuotes(req)) save();
      return db.quotes.filter(q => q.requestId === req.id && q.status !== 'withdrawn').map(q => ({ ...clone(q), vendor: vendorPub(db.vendors.find(v => v.id === q.vendorId)) }));
    },
    /* tailor side */
    async openRequests() {
      const u = need('tailor'), v = vendorOf(u); if (!v || v.verified !== 'verified') return [];
      return db.requests.filter(r => r.status === 'open').map(r => {
        const d = db.designs.find(x => x.id === r.designId), c = userById(r.userId), m = db.measurements.find(x => x.id === r.measurementId);
        const q = db.quotes.find(x => x.requestId === r.id && x.vendorId === v.id);
        return d && { ...clone(r), design: designOut(d, 'party'), customer: c ? { name: c.name, city: c.city, country: c.country } : null, measurement: m ? clone(m) : null, myQuote: q ? clone(q) : null, suggested: E.price(version(d, r.versionN).spec, v), quoteCount: db.quotes.filter(x => x.requestId === r.id && x.status !== 'withdrawn').length };
      }).filter(Boolean).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async submitQuote(requestId, { price, deliveryDays, note = '', includesFabric = true }) {
      const u = need('tailor'), v = vendorOf(u);
      if (!v || v.verified !== 'verified') fail('Your workshop must be verified before you can quote.', 403);
      const r = db.requests.find(x => x.id === requestId && x.status === 'open'); if (!r) fail('This request is no longer open.', 404);
      price = Math.round(Number(price)); deliveryDays = Math.round(Number(deliveryDays));
      if (!(price >= 1000 && price <= 50000000)) fail('Enter a price of at least ₦1,000.');
      if (!(deliveryDays >= 1 && deliveryDays <= 90)) fail('Enter a delivery time between 1 and 90 days.');
      let q = db.quotes.find(x => x.requestId === requestId && x.vendorId === v.id);
      const fresh = !q; if (!q) { q = { id: uid('q_'), requestId, designId: r.designId, vendorId: v.id, createdAt: iso() }; db.quotes.push(q); }
      Object.assign(q, { price, deliveryDays, note: txt(note, 400), includesFabric: !!includesFabric, status: 'offered', validUntil: iso(now() + 7 * DAY), updatedAt: iso() });
      const d = db.designs.find(x => x.id === r.designId);
      notify(r.userId, 'quote', `${v.name} ${fresh ? 'sent' : 'updated'} a quote`, `${fmt(price)}, ${deliveryDays} days for "${d?.title || 'your design'}".`, `/studio?design=${r.designId}&step=4`);
      save(); return clone(q);
    },
    async myQuotes() { const u = need('tailor'), v = vendorOf(u); return v ? db.quotes.filter(q => q.vendorId === v.id && db.designs.some(d => d.id === q.designId)).map(q => ({ ...clone(q), design: designOut(db.designs.find(d => d.id === q.designId), 'party'), request: clone(db.requests.find(r => r.id === q.requestId) || null) })) : []; },

    /* ───── orders ───── */
    async createOrder(quoteId, { plan = 'full' } = {}) {
      const u = need(), q = db.quotes.find(x => x.id === quoteId && x.status === 'offered'); if (!q) fail('That quote is no longer available.', 404);
      const r = db.requests.find(x => x.id === q.requestId); if (!r || r.userId !== u.id) fail('That quote is not yours.', 403);
      if (q.validUntil && ms(q.validUntil) < now()) fail('That quote has expired. Ask for quotes again.');
      plan = plan === 'deposit' ? 'deposit' : 'full';
      const existing = db.orders.find(o => o.quoteId === quoteId && o.status === 'awaiting_payment'); if (existing) { existing.plan = plan; save(); return S._orderOut(existing); }
      const d = db.designs.find(x => x.id === q.designId), v = db.vendors.find(x => x.id === q.vendorId);
      let id; do { id = 'FT-' + String(100000 + Math.floor(Math.random() * 900000)); } while (db.orders.some(o => o.id === id));
      const o = { id, userId: u.id, vendorId: q.vendorId, designId: q.designId, versionN: r.versionN, quoteId, requestId: r.id, measurementId: r.measurementId, total: q.price, paid: 0, plan, phase: 'concept_generated', status: 'awaiting_payment', createdAt: iso(), paidAt: null, eta: null, deliveredAt: null, receivedAt: null, issue: null, reviewId: null, events: [{ at: iso(), phase: 'concept_generated', title: 'Design approved', body: `Version ${r.versionN} of "${d.title}" approved. ${v.name} quoted ${fmt(q.price)}.`, by: 'system' }] };
      db.orders.unshift(o); save(); return S._orderOut(o);
    },
    /** Payment. method: 'card' | 'transfer' | 'paystack'. kind: 'full' | 'deposit' | 'balance'. */
    async pay(orderId, { method = 'card', kind, card, reference } = {}) {
      const u = need(), o = db.orders.find(x => x.id === orderId && x.userId === u.id); if (!o) fail('Order not found.', 404);
      if (!['awaiting_payment', 'balance_due'].includes(o.status)) fail('Nothing is due on this order.');
      const pct = (C.payments?.depositPercent || 50) / 100;
      kind = o.status === 'balance_due' ? 'balance' : kind === 'deposit' || (!kind && o.plan === 'deposit') ? 'deposit' : 'full';
      const amount = kind === 'full' ? o.total : kind === 'deposit' ? Math.round(o.total * pct) : o.total - o.paid;
      if (amount <= 0) fail('Nothing is due on this order.');
      const before = o.status, paid = await charge({ method, card, reference });
      if (o.status !== before) fail('This order was already paid.', 409);
      const p = { id: uid('p_'), orderId: o.id, commissionId: null, userId: u.id, vendorId: o.vendorId, designerId: null, amount, kind, status: 'paid', createdAt: iso(), ...paid };
      db.payments.unshift(p); o.paid += amount;
      const v = db.vendors.find(x => x.id === o.vendorId), q = db.quotes.find(x => x.id === o.quoteId), d = db.designs.find(x => x.id === o.designId);
      if (before === 'awaiting_payment') {
        o.plan = kind === 'deposit' ? 'deposit' : 'full'; o.status = 'active'; o.paidAt = iso(); o.phase = 'vendor_assigned'; o.eta = iso(now() + (q?.deliveryDays || 7) * DAY);
        o.events.push({ at: iso(), phase: 'vendor_assigned', title: `${v.name} accepted the order`, body: `${fmt(amount)} ${kind === 'deposit' ? 'deposit ' : ''}received and held by Fashion Teller until delivery.`, by: 'system' });
        if (q) q.status = 'accepted'; db.quotes.filter(x => x.requestId === o.requestId && x.id !== o.quoteId && x.status === 'offered').forEach(x => (x.status = 'declined'));
        const r = db.requests.find(x => x.id === o.requestId); if (r) r.status = 'ordered';
        if (d) d.status = 'ordered';
        notify(v.userId, 'order', `New order ${o.id}`, `${u.name} paid ${fmt(amount)} for "${d?.title}".`, '/workshop');
      } else {
        o.status = 'delivered'; o.events.push({ at: iso(), phase: 'delivered', title: 'Balance paid', body: `${fmt(amount)} received. Confirm you have the garment to release payment to ${v.name}.`, by: 'system' });
      }
      const reward = kind !== 'balance' ? play(u, 'order', null, d) : null;
      audit('pay', p.id); save(); return { payment: clone(p), order: S._orderOut(o), reward };
    },
    async listOrders() { const u = need(); simulate(u); return db.orders.filter(o => o.userId === u.id).map(o => S._orderOut(o)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
    async getOrder(id) {
      const u = need(), o = db.orders.find(x => x.id === id); if (!o) fail('Order not found.', 404);
      const v = db.vendors.find(x => x.id === o.vendorId);
      if (!(o.userId === u.id || u.role === 'admin' || v?.userId === u.id)) fail('That order is not yours.', 403);
      if (simulateOrder(o)) save(); return S._orderOut(o);
    },
    _orderOut(o) {
      const v = db.vendors.find(x => x.id === o.vendorId), d = db.designs.find(x => x.id === o.designId), c = userById(o.userId), m = db.measurements.find(x => x.id === o.measurementId), q = db.quotes.find(x => x.id === o.quoteId), u = me();
      const dOut = d ? { ...designOut(d, d.userId === u?.id || u?.role === 'admin' ? 'owner' : 'party') } : null;
      return { ...clone(o), vendor: vendorPub(v), design: dOut, customer: c ? { id: c.id, name: c.name, city: c.city, country: c.country, phone: c.phone } : null, measurement: m ? clone(m) : null, deliveryDays: q?.deliveryDays ?? null, balance: o.total - o.paid, review: db.reviews.find(r => r.id === o.reviewId) || null };
    },
    async cancelOrder(id) {
      const u = need(), o = db.orders.find(x => x.id === id && x.userId === u.id); if (!o) fail('Order not found.', 404);
      if (!['awaiting_payment', 'active'].includes(o.status) || o.phase === 'tailoring' || o.phase === 'delivered') fail('This order has started production and cannot be cancelled here. Report a problem instead.');
      o.status = 'cancelled'; o.events.push({ at: iso(), phase: o.phase, title: 'Order cancelled', body: o.paid ? `${fmt(o.paid)} will be refunded to the original payment method.` : 'No payment was taken.', by: 'customer' });
      if (o.paid) { db.payments.filter(p => p.orderId === o.id && p.status === 'paid').forEach(p => (p.status = 'refunded')); o.paid = 0; notify(db.vendors.find(v => v.id === o.vendorId)?.userId, 'order', `Order ${o.id} was cancelled`, 'The customer cancelled before production started.', '/workshop'); }
      const d = db.designs.find(x => x.id === o.designId); if (d && d.status === 'ordered') d.status = 'requested';
      const r = db.requests.find(x => x.id === o.requestId); if (r && r.status === 'ordered') r.status = 'closed';
      save(); return S._orderOut(o);
    },
    /** The customer has the garment in hand: the payment is released to the tailor. */
    async confirmDelivery(id) {
      const u = need(), o = db.orders.find(x => x.id === id && x.userId === u.id); if (!o) fail('Order not found.', 404);
      if (o.status === 'balance_due') fail('Pay the balance first, then confirm delivery.');
      if (o.status !== 'delivered') fail('This order has not been delivered yet.');
      if (o.issue?.status === 'open') fail('A problem is open on this order. We will be in touch before anything is released.');
      const v = db.vendors.find(x => x.id === o.vendorId);
      o.status = 'completed'; o.receivedAt = iso(); o.events.push({ at: iso(), phase: 'delivered', title: 'Received by the customer', body: `Payment released to ${v.name}.`, by: 'customer' });
      db.payments.filter(p => p.orderId === o.id && p.status === 'paid').forEach(p => (p.status = 'released')); v.ordersDone += 1;
      const po = payout(v.userId, 'order', o.id, `Order ${o.id}`, o.paid);
      notify(v.userId, 'order', `Order ${o.id} confirmed`, `${u.name.split(' ')[0]} has the garment. ${fmt(po ? po.net : o.paid)} released to you${po && po.fee ? `, after the ${feePct()}% platform fee` : ''}.`, '/workshop'); save(); return S._orderOut(o);
    },
    async reportProblem(id, { reason = '', body = '' } = {}) {
      const u = need(), o = db.orders.find(x => x.id === id && x.userId === u.id); if (!o) fail('Order not found.', 404);
      if (!['active', 'balance_due', 'delivered'].includes(o.status)) fail(o.status === 'completed' ? 'This order is complete. Contact support for help with it.' : 'There is nothing to report on this order yet.');
      if (o.issue?.status === 'open') fail('You have already reported a problem on this order. We are looking into it.', 409);
      if (!txt(reason)) fail('Choose what went wrong.'); if (txt(body, 1000).length < 10) fail('Tell us what happened in a sentence or two.');
      o.issue = { reason: txt(reason, 60), body: txt(body, 1000), status: 'open', at: iso(), resolvedAt: null, resolution: null };
      o.events.push({ at: iso(), phase: o.phase, title: 'Problem reported', body: `${o.issue.reason}. Payment stays on hold while Fashion Teller looks into it.`, by: 'customer' });
      db.reports.unshift({ id: uid('rp_'), kind: 'order', refId: o.id, reason: o.issue.reason, note: o.issue.body, byId: u.id, status: 'open', createdAt: iso(), resolvedAt: null, resolution: null });
      notify(db.vendors.find(v => v.id === o.vendorId)?.userId, 'order', `Problem reported on ${o.id}`, o.issue.reason, '/workshop'); audit('issue', o.id); save(); return S._orderOut(o);
    },
    /* tailor side */
    async vendorOrders() { const u = need('tailor'), v = vendorOf(u); if (!v) return []; return db.orders.filter(o => o.vendorId === v.id && o.status !== 'awaiting_payment').map(o => S._orderOut(o)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)); },
    async updateOrder(id, { phase, title, body, photos = [] }) {
      const u = need('tailor'), v = vendorOf(u), o = db.orders.find(x => x.id === id && x.vendorId === v?.id);
      if (!o) fail('Order not found.', 404);
      if (!['active'].includes(o.status)) fail(o.status === 'cancelled' ? 'This order was cancelled.' : 'This order is already delivered.');
      if (phase && !PHASES.includes(phase)) fail('Unknown stage.');
      if (phase && PHASES.indexOf(phase) < PHASES.indexOf(o.phase)) fail('An order cannot move backwards.');
      if (!txt(title)) fail('Give the update a title the customer will understand.');
      const pics = (Array.isArray(photos) ? photos : []).filter(p => typeof p === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(p) && p.length < 220000).slice(0, 3);
      if (phase) o.phase = phase;
      o.events.push({ at: iso(), phase: o.phase, title: txt(title, 90), body: txt(body, 600), by: 'vendor', ...(pics.length ? { photos: pics } : {}) });
      if (phase === 'delivered') markDelivered(o, v);
      notify(o.userId, 'order', `${txt(title, 90)}: order ${o.id}`, txt(body, 160) || v.name, `/orders?id=${o.id}`, 'order:' + o.id);
      save(); return S._orderOut(o);
    },

    /* ───── contact ───── */
    async contact(form) { if (!email(form?.email)) fail('Enter a valid email address.'); if (!txt(form.message, 4000)) fail('Write your message first.'); db.messages.unshift({ id: uid('msg_'), name: txt(form.name, 80), email: txt(form.email, 120), topic: txt(form.topic, 60), message: txt(form.message, 4000), status: 'new', createdAt: iso() }); db.messages.length = Math.min(db.messages.length, 200); save(); return true; },

    /* ───── admin ───── */
    async adminPayouts() { need('admin'); simulatePayouts(); return db.payouts.slice(0, 200).map(x => { const a = db.payoutAccounts.find(y => y.userId === x.userId); return { ...payoutOut(x), payee: person(x.userId), account: a ? { bankName: a.bankName, accountName: a.accountName, last4: a.last4, number: a.number } : null }; }); },
    /** Mark a payout as sent by hand (with the bank reference), or send a failed one again. */
    async adminPayout(id, { action, reference = '' }) {
      const a = need('admin'), x = db.payouts.find(y => y.id === id); if (!x) fail('Payout not found.', 404);
      if (action === 'paid') { if (x.status === 'paid') fail('This payout is already marked as sent.'); x.status = 'paid'; x.paidAt = iso(); x.note = txt(reference, 80); notify(x.userId, 'payout', `${fmt(x.net)} sent to your bank`, x.title, '/account#payouts'); }
      else if (action === 'retry') { if (!['failed', 'pending'].includes(x.status)) fail('Only a failed or waiting payout can be sent again.'); x.status = 'pending'; settle(x.userId); }
      else fail('Choose paid or retry.');
      audit('payout:' + action, id, a.id); save(); return payoutOut(x);
    },
    async adminStats() {
      need('admin');
      const paid = db.payments.filter(p => ['paid', 'released'].includes(p.status)), gmv = paid.reduce((s, p) => s + p.amount, 0), d7 = now() - 7 * DAY;
      return { users: db.users.filter(u => !u.sample).length, customers: db.users.filter(u => u.role === 'customer' && !u.sample).length, tailors: db.vendors.filter(v => v.verified === 'verified').length, pendingTailors: db.vendors.filter(v => v.verified === 'pending').length, designers: db.designers.length, designs: db.designs.length, published: db.designs.filter(d => d.published).length, versions: db.designs.reduce((s, d) => s + d.versions.length, 0), orders: db.orders.length, activeOrders: db.orders.filter(o => ['active', 'balance_due', 'delivered'].includes(o.status)).length, delivered: db.orders.filter(o => ['delivered', 'completed'].includes(o.status)).length, awaitingPayment: db.orders.filter(o => o.status === 'awaiting_payment').length, commissions: db.commissions.length, activeCommissions: db.commissions.filter(c => ['active', 'delivered', 'changes'].includes(c.status)).length, gmv, fees: db.payouts.reduce((n, x) => n + x.fee, 0), payoutsDue: db.payouts.filter(x => ['pending', 'failed'].includes(x.status)).length, held: db.payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0), newUsers7d: db.users.filter(u => !u.sample && ms(u.createdAt) > d7).length, orders7d: db.orders.filter(o => ms(o.createdAt) > d7).length, messages: db.messages.filter(m => m.status === 'new').length, reports: db.reports.filter(r => r.status === 'open').length, byPhase: PHASES.map(p => [p, db.orders.filter(o => o.phase === p && !['cancelled', 'awaiting_payment'].includes(o.status)).length]) };
    },
    async adminUsers() { need('admin'); return db.users.filter(u => !u.sample).map(u => ({ ...pub(u), designs: db.designs.filter(d => d.userId === u.id).length, orders: db.orders.filter(o => o.userId === u.id).length, spent: db.payments.filter(p => p.userId === u.id && ['paid', 'released'].includes(p.status)).reduce((s, p) => s + p.amount, 0) })); },
    async adminVendors() { need('admin'); return db.vendors.map(v => ({ ...vendorPub(v), user: pub(userById(v.userId)), application: db.applications.find(a => a.vendorId === v.id) || null, quotes: db.quotes.filter(q => q.vendorId === v.id).length, orders: db.orders.filter(o => o.vendorId === v.id).length })); },
    async adminSetVendorStatus(id, status) {
      const a = need('admin'), v = db.vendors.find(x => x.id === id); if (!v) fail('Tailor not found.', 404);
      if (!['verified', 'rejected', 'suspended', 'pending'].includes(status)) fail('Unknown status.');
      v.verified = status; v.verifiedAt = status === 'verified' ? iso() : v.verifiedAt;
      const app = db.applications.find(x => x.vendorId === id); if (app) app.status = status === 'verified' ? 'approved' : status;
      notify(v.userId, 'workshop', status === 'verified' ? 'Your workshop is verified' : `Workshop status: ${status}`, status === 'verified' ? 'You can now quote on requests.' : 'Open your workshop page for details.', '/workshop');
      audit('vendor:' + status, id, a.id); save(); return vendorPub(v);
    },
    async adminSetUserStatus(id, status) { const a = need('admin'), u = userById(id); if (!u) fail('User not found.', 404); if (u.role === 'admin') fail('Admin accounts cannot be suspended here.'); u.status = status === 'suspended' ? 'suspended' : 'active'; audit('user:' + u.status, id, a.id); save(); return pub(u); },
    async adminDesigns() { need('admin'); return db.designs.map(d => ({ ...designOut(d), quotes: db.quotes.filter(q => q.designId === d.id && q.status !== 'withdrawn').length })); },
    async adminOrders() { const a = need('admin'); simulate(a); return db.orders.map(o => S._orderOut(o)).sort((x, y) => y.createdAt.localeCompare(x.createdAt)); },
    async adminSetOrderPhase(id, phase, note) {
      const a = need('admin'), o = db.orders.find(x => x.id === id); if (!o) fail('Order not found.', 404);
      if (['cancelled', 'completed'].includes(o.status)) fail('This order is closed.');
      if (phase === 'cancelled') { o.status = 'cancelled'; o.events.push({ at: iso(), phase: o.phase, title: 'Cancelled by Fashion Teller', body: txt(note, 300), by: 'admin' }); if (o.paid) { db.payments.filter(p => p.orderId === o.id && p.status === 'paid').forEach(p => (p.status = 'refunded')); o.paid = 0; } }
      else {
        if (!PHASES.includes(phase)) fail('Unknown stage.'); if (o.status === 'awaiting_payment') fail('This order has not been paid.');
        if (PHASES.indexOf(phase) < PHASES.indexOf(o.phase)) fail('An order cannot move backwards.');
        o.phase = phase; o.events.push({ at: iso(), phase, title: txt(note, 90) || `Moved to ${phase.replace('_', ' ')}`, body: '', by: 'admin' });
        if (phase === 'delivered') markDelivered(o);
      }
      notify(o.userId, 'order', `Order ${o.id} updated`, phase === 'cancelled' ? 'Cancelled by Fashion Teller.' : `Now: ${phase.replace('_', ' ')}.`, `/orders?id=${o.id}`);
      audit('order:' + phase, id, a.id); save(); return S._orderOut(o);
    },
    /** Close a reported problem on an order: refund the customer, or release the payment to the tailor. */
    async adminResolveIssue(id, { action, note = '' }) {
      const a = need('admin'), o = db.orders.find(x => x.id === id); if (!o?.issue || o.issue.status !== 'open') fail('No open problem on this order.', 404);
      if (!['refund', 'release'].includes(action)) fail('Choose refund or release.');
      const v = db.vendors.find(x => x.id === o.vendorId);
      o.issue.status = 'resolved'; o.issue.resolvedAt = iso(); o.issue.resolution = action;
      if (action === 'refund') { db.payments.filter(p => p.orderId === o.id && p.status === 'paid').forEach(p => (p.status = 'refunded')); o.events.push({ at: iso(), phase: o.phase, title: 'Refunded', body: `${fmt(o.paid)} refunded by Fashion Teller. ${txt(note, 300)}`.trim(), by: 'admin' }); o.paid = 0; o.status = 'cancelled'; }
      else { o.events.push({ at: iso(), phase: o.phase, title: 'Problem closed', body: txt(note, 300) || 'Reviewed by Fashion Teller.', by: 'admin' }); }
      db.reports.filter(r => r.kind === 'order' && r.refId === o.id && r.status === 'open').forEach(r => { r.status = 'resolved'; r.resolvedAt = iso(); r.resolution = action; });
      notify(o.userId, 'order', `Your report on ${o.id} was reviewed`, action === 'refund' ? 'You have been refunded.' : 'The order continues.', `/orders?id=${o.id}`); notify(v?.userId, 'order', `Report on ${o.id} closed`, action === 'refund' ? 'The customer was refunded.' : 'No action against the order.', '/workshop');
      audit('issue:' + action, id, a.id); save(); return S._orderOut(o);
    },
    async adminPayments() { need('admin'); return db.payments.map(p => ({ ...clone(p), customer: pub(userById(p.userId)), vendor: vendorPub(db.vendors.find(v => v.id === p.vendorId)), designer: p.designerId ? person(p.designerId) : null })); },
    async adminRefund(paymentId) {
      const a = need('admin'), p = db.payments.find(x => x.id === paymentId); if (!p) fail('Payment not found.', 404);
      if (p.status !== 'paid') fail('Only a payment still held by Fashion Teller can be refunded.');
      p.status = 'refunded';
      const o = db.orders.find(x => x.id === p.orderId); if (o) { o.paid = Math.max(0, o.paid - p.amount); o.events.push({ at: iso(), phase: o.phase, title: 'Refund issued', body: `${fmt(p.amount)} refunded by Fashion Teller.`, by: 'admin' }); if (o.paid === 0 && ['active', 'delivered', 'balance_due'].includes(o.status)) o.status = 'cancelled'; }
      const c = db.commissions.find(x => x.id === p.commissionId); if (c) { c.paid = 0; c.status = 'cancelled'; c.updatedAt = iso(); say(c.threadId, 'system', `Fashion Teller refunded ${fmt(p.amount)} and closed this commission.`); }
      notify(p.userId, 'payment', 'Refund issued', `${fmt(p.amount)} is on its way back to you.`, o ? `/orders?id=${o.id}` : c ? `/commissions?id=${c.id}` : '/orders');
      audit('refund', paymentId, a.id); save(); return clone(p);
    },
    async adminCommissions() { need('admin'); return db.commissions.map(commissionOut).sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)); },
    async adminReports() { need('admin'); return db.reports.map(r => { const d = r.kind === 'design' && db.designs.find(x => x.id === r.refId); return { ...clone(r), by: person(r.byId), design: d ? mini(d) : null, target: r.kind === 'user' ? person(r.refId) : null }; }); },
    async adminResolveReport(id, action) {
      const a = need('admin'), r = db.reports.find(x => x.id === id); if (!r) fail('Report not found.', 404);
      if (r.status !== 'open') fail('This report is already closed.'); if (!['dismiss', 'remove'].includes(action)) fail('Choose dismiss or remove.');
      if (r.kind === 'order') fail('Order problems are resolved from the order itself.');
      if (action === 'remove' && r.kind === 'design') { const d = db.designs.find(x => x.id === r.refId); if (d) { d.published = false; notify(d.userId, 'moderation', 'A design was taken off Discover', `"${d.title}" was reported and removed from the public feed. It is still in your library.`, `/design?id=${d.id}`); } }
      if (action === 'remove' && r.kind === 'user') { const u = userById(r.refId); if (u && u.role !== 'admin') u.status = 'suspended'; }
      r.status = 'resolved'; r.resolvedAt = iso(); r.resolution = action; audit('report:' + action, r.refId, a.id); save(); return clone(r);
    },
    async adminMessages() { need('admin'); return db.messages.map(clone); },
    async adminApplications() { need('admin'); return db.applications.map(clone); },
    async adminAudit() { need('admin'); const who = id => userById(id)?.name || db.vendors.find(v => v.id === id)?.name || db.designs.find(d => d.id === id)?.title || id; return db.audit.slice(0, 100).map(a => ({ ...a, by: who(a.by), target: a.target.startsWith('p_') ? 'payment ' + (db.payments.find(p => p.id === a.target)?.reference || '') : who(a.target) })); },
  });

  load();
})();
