// Node test of the built-in data layer (assets/js/store.js): every product flow, end to end.  Run:  node tests/store.test.js
const ROOT = require('path').join(__dirname, '..', 'assets', 'js') + '/';
const mem = {}; global.window = global;
global.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: k => { delete mem[k]; } };
global.addEventListener = () => {}; global.dispatchEvent = () => {}; global.CustomEvent = class { constructor(t) { this.type = t; } };
window.FT_CONFIG = { currency: { symbol: '₦' }, payments: { depositPercent: 50, platformFeePercent: 20 }, sample: { quoteDelayMs: [1, 20], orderPhaseMs: 60 } };
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
  S.logout();
  { // ── email: confirm an address, reset a password, choose what is emailed
  const link = async (to, kind) => { const m = (await S.mailbox()).find(x => x.to === to && x.kind === kind); return m ? m.link.split('=')[1] : null; };
  const nu = await S.register({ name: 'Ngozi Eze', email: 'Ngozi@Example.com', password: 'first-pass-123', role: 'tailor' }); ok(nu.emailVerified === false && nu.emailPrefs.orders && nu.emailPrefs.messages, 'a new account starts unconfirmed, with emails on');
  const vt = await link('ngozi@example.com', 'verify'); ok(!!vt, 'a confirmation email is written on sign-up');
  await throws(() => S.savePayoutAccount({ bankCode: '058', number: '0123456789' }), /Confirm your email/, 'no bank details before the address is confirmed');
  await throws(() => S.verifyEmail(vt + 'x'), /expired or was already used/, 'a wrong confirmation link is refused');
  ok((await S.verifyEmail(vt)).email === 'ngozi@example.com' && (await S.me()).emailVerified, 'the link confirms the address'); await throws(() => S.verifyEmail(vt), /already used/, 'and works once');
  ok((await S.updateProfile({ emailPrefs: { messages: false } })).emailPrefs.messages === false && (await S.me()).emailPrefs.orders === true, 'email choices are kept');
  const ch = await S.updateProfile({ email: 'ngozi2@example.com' }); ok(ch.emailVerified === false && !!(await link('ngozi2@example.com', 'verify')), 'a changed address has to be confirmed again');
  S.logout();
  ok(await S.forgotPassword('nobody@example.com') === true && !(await link('nobody@example.com', 'reset')), 'forgot password says the same for an unknown address and writes nothing');
  ok(await S.forgotPassword('zainabcuts@sample.fashionteller') === true && !(await link('zainabcuts@sample.fashionteller', 'reset')), 'sample accounts cannot be taken over');
  await S.forgotPassword('NGOZI2@example.com'); const rt = await link('ngozi2@example.com', 'reset'); ok(!!rt, 'a reset email is written');
  await throws(() => S.resetPassword(rt, 'short'), /8 characters/, 'a short new password is refused'); await throws(() => S.resetPassword('nope', 'second-pass-456'), /expired/, 'a made-up reset link is refused');
  ok((await S.resetPassword(rt, 'second-pass-456')).email === 'ngozi2@example.com', 'the reset link sets a new password'); await throws(() => S.resetPassword(rt, 'third-pass-789'), /expired/, 'and works once');
  await throws(() => S.login('ngozi2@example.com', 'first-pass-123'), /password/, 'the old password stops working');
  ok((await S.login('ngozi2@example.com', 'second-pass-456')).emailVerified === true, 'the new one signs in, and the link proved the mailbox');
  S.logout();
  // ── payouts: released money, less the fee, to the tailor's bank
  ok((await S.features()).feePercent === 20 && (await S.features()).fees.commission === 20 && (await S.listBanks()).some(b => b.name === 'GTBank'), 'fee and banks are published');
  await S.login(S.DEMO.customer.email, S.DEMO.customer.password);
  const pd = await S.createDesign({ spec: E.template('senator').spec, title: 'Payout kaftan' }); const pm = (await S.listMeasurements())[0] || await S.saveMeasurement({ label: 'Me', unit: 'cm', fit: 'regular', values: { chest: 96, waist: 80, hip: 98, height: 172 } });
  await S.requestQuotes(pd.id, { measurementId: pm.id }); S.logout();
  const tl = await S.login(S.DEMO.tailor.email, S.DEMO.tailor.password); const rq = (await S.openRequests()).find(x => x.design && x.design.id === pd.id); ok(!!rq, 'the request reaches the demo tailor');
  await S.submitQuote(rq.id, { price: 60000, deliveryDays: 7, note: 'Fabric included.' }); const paidBefore = (await S.earnings()).paid; S.logout();
  await S.login(S.DEMO.customer.email, S.DEMO.customer.password);
  const pq = (await S.listQuotes(pd.id)).find(x => x.vendor.id === tl.vendorId); const po = await S.createOrder(pq.id, { plan: 'full' }); await S.pay(po.id, { method: 'card', card: CARD }); S.logout();
  await S.login(S.DEMO.tailor.email, S.DEMO.tailor.password);
  await S.updateOrder(po.id, { phase: 'tailoring', title: 'Cutting', body: 'Fabric cut.' }); await S.updateOrder(po.id, { phase: 'delivered', title: 'Delivered', body: 'Handed over.' });
  let earn = await S.earnings(); ok(earn.held >= 60000 && Math.abs(earn.heldNet - earn.held * 0.8) <= 3 && earn.feePercent === 20 && earn.ownFee === null && earn.account === null, 'money is held, and shown less the fee, until the customer confirms');
  S.logout(); await S.login(S.DEMO.customer.email, S.DEMO.customer.password); ok((await S.confirmDelivery(po.id)).status === 'completed', 'the customer confirms delivery'); S.logout();
  await S.login(S.DEMO.tailor.email, S.DEMO.tailor.password);
  earn = await S.earnings(); const mine = earn.payouts.find(x => x.refId === po.id); ok(mine && mine.gross === 60000 && mine.feePercent === 20 && mine.fee === 12000 && mine.net === 48000 && mine.status === 'pending', 'a payout is owed: the total less 10%, waiting for bank details');
  ok((await S.listNotifications()).some(n => /bank details/.test(n.title)), 'the tailor is asked for bank details');
  await throws(() => S.savePayoutAccount({ bankCode: 'nope', number: '0123456789' }), /Choose your bank/, 'an unknown bank is refused'); await throws(() => S.savePayoutAccount({ bankCode: '058', number: '12345' }), /10-digit/, 'a short account number is refused');
  const acc = await S.savePayoutAccount({ bankCode: '058', number: '0123 456 789' }); ok(acc.bankName === 'GTBank' && acc.last4 === '6789' && !('number' in acc), 'bank details are saved and only the last four digits come back');
  ok((await S.earnings()).payouts.find(x => x.id === mine.id).status === 'processing', 'the waiting payout goes out as soon as there is somewhere to send it');
  await sleep(120); earn = await S.earnings(); ok(earn.paid - paidBefore === 48000 && earn.pending === 0 && earn.payouts.find(x => x.id === mine.id).status === 'paid', 'and arrives');
  ok((await S.listNotifications()).some(n => /sent to your bank/.test(n.title)), 'the tailor is told it was sent');
  { const box = (await S.mailbox()).filter(m => m.to === S.DEMO.tailor.email); ok(box.some(m => m.kind === 'payout' && /sent to your bank/.test(m.subject)) && box.some(m => m.kind === 'order'), 'order and payout news is also emailed');
    // messages: one email while a conversation is unread, none once she switches them off
    const msgs = async () => (await S.mailbox()).filter(m => m.to === S.DEMO.tailor.email && m.kind === 'message').length, say = async text => { S.logout(); await S.login(S.DEMO.customer.email, S.DEMO.customer.password); const th = await S.openThread({ orderId: po.id }); await S.sendMessage(th.id, { text }); S.logout(); await S.login(S.DEMO.tailor.email, S.DEMO.tailor.password); };
    const m0 = await msgs(); await say('Thank you!'); await say('One more thing.'); ok(await msgs() === m0 + 1, 'two unread messages in one conversation make one email, not two');
    await S.markNotifications('all'); await S.updateProfile({ emailPrefs: { messages: false } }); await say('And a third.'); ok(await msgs() === m0 + 1 && (await S.listNotifications()).some(n => n.kind === 'message' && !n.read), 'with message emails off she is still told under the bell, but not emailed');
    await S.updateProfile({ emailPrefs: { messages: true } }); } await throws(() => S.adminPayouts(), /admin accounts/, 'a tailor cannot see everyone’s payouts'); S.logout();
  await S.login(S.DEMO.admin.email, S.DEMO.admin.password);
  const ap = (await S.adminPayouts()).find(x => x.id === mine.id); ok(ap && ap.net === 48000 && ap.payee.name && ap.account.last4 === '6789', 'admin sees the payout and where it went');
  await throws(() => S.adminPayout(mine.id, { action: 'paid' }), /already/, 'a sent payout cannot be marked sent twice'); await throws(() => S.adminPayout(mine.id, { action: 'nope' }), /paid or retry/, 'unknown payout action');
  ok((await S.adminStats()).fees >= 12000, 'the fee shows in the admin figures');
  // ── the fee is set by an admin; work already quoted or offered keeps its rate
  { let f = await S.adminFees(); ok(f.order === 20 && f.commission === 20 && f.default === 20 && f.accounts.length === 0, 'admin sees the rates');
    for (const bad of [{ order: 51 }, { order: -1 }, { order: 'twenty' }, { commission: true }, {}]) await throws(() => S.adminSetFees(bad), /between 0% and 50%/, 'a bad rate is refused ' + JSON.stringify(bad));
    S.logout(); await S.login(S.DEMO.customer.email, S.DEMO.customer.password); ok(!('fees' in (await S.me())), 'customers are not shown a platform fee');
    const fd = await S.createDesign({ spec: E.template('classic-shirt').spec, title: 'Fee test shirt' }); await S.requestQuotes(fd.id, { measurementId: pm.id }); S.logout();
    await S.login(S.DEMO.tailor.email, S.DEMO.tailor.password); await throws(() => S.adminSetFees({ order: 5 }), /admin accounts/, 'only an admin sets the fee');
    ok((await S.me()).fees.order === 20, 'the tailor is shown the rate they will quote at');
    const fr = (await S.openRequests()).find(x => x.design && x.design.id === fd.id); const fq = await S.submitQuote(fr.id, { price: 40000, deliveryDays: 5 }); ok(fq.feePercent === 20, 'the quote records the rate'); S.logout();
    await S.login(S.DEMO.admin.email, S.DEMO.admin.password); f = await S.adminSetFees({ order: 15, commission: '25.5' }); ok(f.order === 15 && f.commission === 25.5 && (await S.features()).fees.order === 15, 'new rates saved');
    ok((await S.adminAudit()).some(a => a.action === 'fee:order' && a.target === '20% to 15%'), 'the change is in the audit trail'); S.logout();
    await S.login(S.DEMO.customer.email, S.DEMO.customer.password); const fquote = (await S.listQuotes(fd.id)).find(x => x.vendor.id === tl.vendorId); ok(fquote && !('feePercent' in fquote), 'customers do not see the platform cut on a quote');
    const fo = await S.createOrder(fquote.id, { plan: 'full' }); await S.pay(fo.id, { method: 'card', card: CARD }); S.logout();
    await S.login(S.DEMO.tailor.email, S.DEMO.tailor.password); await S.updateOrder(fo.id, { phase: 'tailoring', title: 'Cutting' }); await S.updateOrder(fo.id, { phase: 'delivered', title: 'Delivered' }); S.logout();
    await S.login(S.DEMO.customer.email, S.DEMO.customer.password); await S.confirmDelivery(fo.id); S.logout();
    await S.login(S.DEMO.tailor.email, S.DEMO.tailor.password); const fp = (await S.earnings()).payouts.find(x => x.refId === fo.id);
    ok(fp && fp.feePercent === 20 && fp.fee === 8000 && fp.net === 32000, 'quoted at 20%, paid at 20%, though the rate changed before the customer accepted'); ok((await S.me()).fees.order === 15, 'new quotes are at the new rate'); S.logout();
    await S.login(S.DEMO.admin.email, S.DEMO.admin.password);
    await throws(() => S.adminSetUserFee(tl.id, 60), /between 0% and 50%/, 'an own rate over 50% is refused'); await throws(() => S.adminSetUserFee('u_cust', 5), /Only tailors and designers/, 'customers have no fee to set');
    const ta = await S.adminSetUserFee(tl.id, 12.5); ok(ta.ownFee === 12.5 && ta.fees.order === 12.5 && (await S.adminFees()).accounts.map(a => a.email).join() === S.DEMO.tailor.email, 'an account gets its own rate'); S.logout();
    await S.login(S.DEMO.tailor.email, S.DEMO.tailor.password); ok((await S.listNotifications()).some(n => n.title === 'Your platform fee is now 12.5%') && (await S.earnings()).ownFee === 12.5, 'and is told'); S.logout();
    await S.login(S.DEMO.designer.email, S.DEMO.designer.password); const oc = (await S.listCommissions()).find(x => x.status === 'requested' || x.status === 'offered');
    if (oc) { const off = await S.offerCommission(oc.id, { fee: 30000, days: 4 }); ok(off.feePercent === 25.5, 'a designer’s offer records the commission rate'); } S.logout();
    await S.login(S.DEMO.admin.email, S.DEMO.admin.password); ok((await S.adminSetUserFee(tl.id, '')).ownFee === null, 'an own rate can be removed'); await S.adminSetFees({ order: 20, commission: 20 }); S.logout(); }
  }
  console.log(`store: ${pass} passed, ${failn} failed; db ${(mem['ft.db.v2'].length / 1024).toFixed(0)} KB`);
  process.exit(failn ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
