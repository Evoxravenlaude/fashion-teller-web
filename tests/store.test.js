// Node test of the built-in data layer (assets/js/store.js): every product flow, end to end.  Run:  node tests/store.test.js
const ROOT = require('path').join(__dirname, '..', 'assets', 'js') + '/';
const mem = {}; global.window = global;
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
global.addEventListener = () => {}; global.dispatchEvent = () => {}; global.CustomEvent = class { constructor(t) { this.type = t; } };
window.FT_CONFIG = { currency: { symbol: '₦' }, payments: { depositPercent: 50 }, sample: { quoteDelayMs: [1, 20], orderPhaseMs: 60 } };
window.FTEngine = {}; require(ROOT + 'engine.js'); require(ROOT + 'catalog.js'); require(ROOT + 'store.js');
const S = window.FTStore, E = window.FTEngine, sleep = t => new Promise(r => setTimeout(r, t));
let pass = 0, failn = 0; const ok = (c, m) => { if (c) pass++; else { failn++; console.log('  FAIL', m); } };
const throws = async (fn, re, m) => { try { await fn(); failn++; console.log('  FAIL (no throw)', m); } catch (e) { if (re.test(e.message)) pass++; else { failn++; console.log('  FAIL', m, '->', e.message); } } };
const CARD = { number: '4242 4242 4242 4242', expiry: '12/30', cvv: '123' };
(async () => {
  // signed out
  ok((await S.discover()).items.length >= 12, 'feed has seeded designs');
  ok((await S.listDesigners()).length === 7, 'designers listed');
  ok((await S.unread()).notifications === 0, 'unread signed out');
  await throws(() => S.like('d_feed1'), /Sign in/, 'like needs sign-in');
  await throws(() => S.login('zainabcuts@sample.fashionteller', 'x'), /No account/, 'sample accounts cannot sign in');
  await throws(() => S.login(S.DEMO.customer.email, 'wrong'), /password/, 'wrong password');
  // customer: design → publish → like/remix
  const me = await S.login(S.DEMO.customer.email, S.DEMO.customer.password); ok(me.name === 'Adaeze Okafor' && !me.designer, 'login');
  const evil = { ...E.template('senator').spec, color: '"><script>alert(1)</script>', notes: ['<img src=x onerror=alert(1)>'], template: '../../x' };
  const d0 = await S.createDesign({ spec: evil }); ok(!JSON.stringify(d0.versions[0].spec).includes('<script') && d0.reward.xp > 0, 'spec is sanitised on save');
  const spec2 = { ...d0.versions[0].spec, collar: 'mandarin', embroidery: 'chest' };
  const d1 = await S.saveVersion(d0.id, spec2); ok(d1.versions.length === 2 && d1.current === 2 && d1.versions[1].changes.length >= 1, 'version saved with change list');
  await throws(() => S.saveVersion(d0.id, spec2), /Nothing changed/, 'no empty versions');
  const r1 = await S.restoreVersion(d0.id, 1); ok(r1.current === 3 && r1.versions[2].restored === 1, 'restore makes a new version');
  const p1 = await S.publishDesign(d0.id, { caption: 'Test <b>caption</b>', tags: 'Senator, #Office  x!y', allowRemix: true }); ok(p1.published && p1.tags.join() === 'senator,office,xy' && p1.reward, 'publish');
  ok((await S.discover({ sort: 'new' })).items[0].id === d0.id, 'published design tops New');
  ok((await S.discover({ q: '#kente' })).items.length >= 1 && (await S.discover({ garment: 'agbada' })).items.every(x => x.garment === 'agbada'), 'feed filters');
  const lk = await S.like('d_feed4'); ok(lk.liked && lk.likes === 532, 'like counts'); ok((await S.like('d_feed4', false)).likes === 531, 'unlike');
  await S.saveForLater('d_feed4'); ok((await S.discover({ sort: 'saved' })).items.some(x => x.id === 'd_feed4'), 'saved list');
  const rm = await S.remixDesign('d_feed4'); ok(rm.remixOf.designId === 'd_feed4' && rm.credit.name === 'Chidi Okonkwo' && rm.view === 'owner', 'remix keeps credit');
  const pubView = await S.getDesign('d_feed4'); ok(pubView.view === 'public' && pubView.versions.length === 1, 'public view of someone else’s design');
  await throws(() => S.getDesign('d_com1x'), /no longer exists/, '404 design');
  // follow + designer profile
  const f = await S.follow('u_d2'); ok(f.following, 'follow'); const prof = await S.getDesigner('@chidi.o'); ok(prof.following && prof.items.length === 3 && prof.isDesigner, 'designer profile');
  ok((await S.discover({ sort: 'following' })).items.some(x => x.by.id === 'u_d2'), 'following feed');
  // commission with a sample designer (answers on her own)
  await throws(() => S.requestCommission('u_d4', { title: 'Boubou', brief: 'A boubou for my mother, in indigo please.' }), /not taking/, 'closed designer');
  await throws(() => S.requestCommission('u_d3', { title: 'Hi', brief: 'short' }), /title|Describe/, 'brief validation');
  let c = await S.requestCommission('u_d3', { title: 'Engagement dress', brief: 'A fitted kente dress, floor length, sweetheart neck, for my engagement in March.', garment: 'dress', budget: 30000 });
  ok(c.status === 'requested' && c.role === 'client', 'commission requested');
  await sleep(40); c = await S.getCommission(c.id); ok(c.status === 'offered' && c.offer.fee >= 20000, 'sample designer offers');
  await throws(() => S.payCommission(c.id, { method: 'card', card: { ...CARD, cvv: '000' } }), /declined/, 'declined card');
  const pc = await S.payCommission(c.id, { method: 'card', card: CARD }); ok(pc.commission.status === 'active' && pc.payment.kind === 'commission' && pc.payment.last4 === '4242', 'commission paid into escrow');
  await sleep(60); c = await S.getCommission(c.id); ok(c.status === 'delivered' && c.delivery.design.spec.garment === 'dress' && c.delivery.design.spec.pattern === 'kente', 'sample designer delivers from the brief');
  ok((await S.getDesign(c.delivery.design.id)).view === 'party', 'client can open the delivered design');
  c = await S.requestChanges(c.id, 'Please make it knee length with short sleeves.'); ok(c.status === 'changes' && c.revisions === 1, 'changes requested');
  await sleep(60); c = await S.getCommission(c.id); ok(c.status === 'delivered' && c.deliveries.length === 2 && c.delivery.design.spec.length === 'knee', 'revised delivery follows the note');
  const ap = await S.approveCommission(c.id); ok(ap.commission.status === 'approved' && ap.design.credit.handle === 'amaserwaa' && ap.design.userId === me.id, 'approve copies the design with credit');
  await throws(() => S.publishDesign(ap.design.id, {}), /made for you/, 'cannot publish a commissioned design as your own');
  const rv = await S.addReview({ kind: 'commission', id: c.id, rating: 5, text: 'Lovely.' }); ok(rv.designerId === 'u_d3', 'review designer'); await throws(() => S.addReview({ kind: 'commission', id: c.id, rating: 4 }), /already/, 'one review each');
  // seeded commission waiting on the customer
  const seeded = await S.getCommission('c_seed1'); ok(seeded.status === 'delivered' && seeded.delivery.design, 'seeded delivery');
  // messages
  let th = await S.openThread({ userId: 'u_d2' }); let conv = await S.sendMessage(th.id, { text: 'Hello Chidi' }); ok(conv.messages.length === 1 && conv.messages[0].mine, 'direct message');
  await sleep(6200); conv = await S.getThread(th.id); ok(conv.messages.length === 2 && !conv.messages[1].mine, 'sample designer replies');
  await throws(() => S.openThread({ userId: 'u_c2' }), /designers and tailors/, 'cannot cold-message customers');
  ok((await S.listThreads()).length >= 3, 'threads list');
  // order flow
  const m = await S.saveMeasurement({ label: 'Me', unit: 'cm', values: { chest: 96, waist: 80, hips: 99, evil: 5, 'x<y': 3 } }); ok(!('x<y' in m.values), 'measurement keys are checked');
  const req = await S.requestQuotes(d0.id, { measurementId: m.id }); ok(req.status === 'open', 'request open');
  await sleep(40); const quotes = await S.listQuotes(d0.id); ok(quotes.length >= 2, 'sample tailors quote (' + quotes.length + ')');
  const q = quotes.sort((a, b) => a.price - b.price)[0];
  let o = await S.createOrder(q.id, { plan: 'deposit' }); ok(o.status === 'awaiting_payment' && /^FT-\d{6}$/.test(o.id), 'order created');
  await throws(() => S.openThread({ orderId: o.id }), /once the order is paid/, 'no chat before payment');
  let pay = await S.pay(o.id, { method: 'transfer' }); ok(pay.order.status === 'active' && pay.order.paid === Math.round(o.total / 2) && pay.reward.xp > 0, 'deposit paid');
  await throws(() => S.pay(o.id, { method: 'transfer' }), /Nothing is due/, 'no double payment');
  await throws(() => S.saveVersion(d0.id, { ...spec2, fit: 'relaxed' }), /in production/, 'ordered designs are locked');
  await sleep(260); o = await S.getOrder(o.id); ok(o.status === 'balance_due' && o.phase === 'delivered', 'sample tailor delivers (' + o.status + ')');
  await throws(() => S.confirmDelivery(o.id), /balance first/, 'balance before confirm');
  pay = await S.pay(o.id, { method: 'card', card: CARD }); ok(pay.order.status === 'delivered' && pay.order.balance === 0 && pay.payment.kind === 'balance', 'balance paid');
  th = await S.openThread({ orderId: o.id }); ok(th.kind === 'order', 'order chat');
  o = await S.confirmDelivery(o.id); ok(o.status === 'completed' && o.receivedAt, 'delivery confirmed');
  await S.addReview({ kind: 'order', id: o.id, rating: 4, text: 'Good.' }); ok((await S.getVendor(o.vendorId)).reviewList.some(r => r.refId === o.id), 'tailor review listed');
  const un = await S.unread(); ok(un.notifications > 3, 'notifications arrived (' + un.notifications + ')'); await S.markNotifications('all'); ok((await S.unread()).notifications === 0, 'mark all read');
  const g = await S.game(); ok(g.badges.find(b => b.id === 'made_real').at && g.badges.find(b => b.id === 'collab').at && g.badges.find(b => b.id === 'published').at && g.badges.length === 12, 'badges earned');
  // second order: report a problem → admin refunds
  const d2 = await S.createDesign({ spec: E.template('ankara-shirt').spec }); await S.requestQuotes(d2.id, { measurementId: m.id }); await sleep(40);
  const q2 = (await S.listQuotes(d2.id))[0]; let o2 = await S.createOrder(q2.id); await S.pay(o2.id, { method: 'card', card: CARD });
  o2 = await S.reportProblem(o2.id, { reason: 'Wrong fabric', body: 'The tailor says they will use cotton, I chose ankara.' }); ok(o2.issue.status === 'open', 'problem reported');
  await sleep(260); o2 = await S.getOrder(o2.id); ok(o2.phase !== 'delivered', 'production pauses while a problem is open');
  await S.reportContent({ kind: 'design', id: 'd_feed19', reason: 'Copied design', note: '' });
  S.logout();
  // designer demo account: offer, deliver
  const des = await S.login(S.DEMO.designer.email, S.DEMO.designer.password); ok(des.designer && des.handle === 'kemilawal', 'designer login');
  let inbox = await S.listCommissions(); ok(inbox.length === 2 && inbox.every(x => x.role === 'designer'), 'designer inbox');
  let c2 = await S.offerCommission('c_seed2', { fee: 24000, days: 4, note: 'Six shirts, one design.' }); ok(c2.status === 'offered', 'offer sent');
  await throws(() => S.deliverCommission('c_seed2', { designId: 'd_feed17' }), /not waiting/, 'cannot deliver before payment');
  let c3 = await S.deliverCommission('c_seed3', { designId: 'd_feed17', note: 'Sky linen.' }); ok(c3.status === 'delivered', 'designer delivers');
  await throws(() => S.approveCommission('c_seed3'), /not found/, 'designer cannot approve own delivery');
  const sp = await S.saveDesignerProfile({ handle: 'Kemi.Lawal', bio: 'Updated bio', specialties: ['Kaftans'], feeFrom: 20000, turnaroundDays: 2, open: true }); ok(sp.handle === 'kemi.lawal' && !sp.fresh, 'profile saved');
  await throws(() => S.saveDesignerProfile({ handle: 'zainabcuts' }), /taken/, 'unique handles');
  S.logout();
  // tailor demo account
  await S.login(S.DEMO.tailor.email, S.DEMO.tailor.password);
  const vo = await S.vendorOrders(); ok(vo.length === 1 && vo[0].design && vo[0].measurement, 'tailor sees own orders');
  await throws(() => S.updateOrder(vo[0].id, { phase: 'vendor_assigned', title: 'Back' }), /backwards/, 'no backwards');
  const up = await S.updateOrder(vo[0].id, { phase: 'tailoring', title: 'Embroidery started', body: 'Gold thread.', photos: ['data:image/jpeg;base64,AAAA', 'javascript:alert(1)'] }); ok(up.events[up.events.length - 1].photos.length === 1, 'photos are validated');
  ok((await S.openRequests()).length === 0, 'no open requests left'); await throws(() => S.adminStats(), /admin accounts/, 'tailor is not admin');
  await throws(() => S.getOrder(o.id), /not yours/, 'tailor cannot open other orders');
  S.logout();
  // admin
  await S.login(S.DEMO.admin.email, S.DEMO.admin.password);
  const st = await S.adminStats(); ok(st.reports === 2 && st.commissions === 4 && st.designers === 7 && st.gmv > 0, 'admin stats ' + JSON.stringify({ r: st.reports, c: st.commissions }));
  const reps = await S.adminReports(); const dr = reps.find(r => r.kind === 'design'); await S.adminResolveReport(dr.id, 'remove'); S.logout();
  ok(!(await S.discover({ q: 'Emerald ankara flare' })).items.some(x => x.id === 'd_feed19'), 'removed design leaves Discover');
  await S.login(S.DEMO.admin.email, S.DEMO.admin.password);
  const res = await S.adminResolveIssue(o2.id, { action: 'refund', note: 'Refunded in full.' }); ok(res.status === 'cancelled' && res.paid === 0 && res.issue.status === 'resolved', 'issue refunded');
  await throws(() => S.adminSetOrderPhase(vo[0].id, 'vendor_assigned'), /backwards/, 'admin cannot move backwards');
  ok((await S.adminUsers()).every(u => !/sample\.fashionteller/.test(u.email)) && (await S.adminPayments()).length >= 8 && (await S.adminCommissions()).length === 4 && (await S.adminAudit()).length > 5, 'admin lists');
  console.log(`store: ${pass} passed, ${failn} failed; db ${(mem['ft.db.v2'].length / 1024).toFixed(0)} KB`);
  process.exit(failn ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
