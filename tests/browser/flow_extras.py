"""Email and payouts, in a browser: confirm an address, reset a password, add bank details, get paid, admin view.
Built-in mode shows the emails in a demo mailbox; against the backend (FT_REMOTE=1) the test reads them from the
backend's mail log instead (needs MAIL_DEBUG=1 on the backend, which is the development default)."""
import sys, os, json, time, random, urllib.request
from playwright.sync_api import sync_playwright
from e2e_lib import *
size = sys.argv[1] if len(sys.argv) > 1 else 'desktop'
REMOTE = os.environ.get('FT_REMOTE') == '1'; API = os.environ.get('FT_API', 'http://127.0.0.1:8000')
passed = failed = 0
def check(ok, label):
    global passed, failed
    if ok: passed += 1
    else: failed += 1; print('  FAIL', label)
def last_link(pg, s, email, kind):
    """the newest emailed link of one kind for an address"""
    if REMOTE:
        for _ in range(20):
            with urllib.request.urlopen(f'{API}/api/v1/dev/mail/?to={email}') as r: mails = json.loads(r.read())
            hit = [m for m in mails if m['kind'] == kind]
            if hit: return hit[0]['link']
            time.sleep(0.3)
        return None
    return pg.evaluate("async a => { const m = (await FTApi.mailbox()).find(x => x.to === a[0] && x.kind === a[1]); return m ? m.link : null; }", [email, kind])

with sync_playwright() as p:
    s = Session(p, size, gl=False); pg = s.page
    email = f'ngozi{random.randrange(10**8)}@example.com'
    # ── a new account has to confirm its address
    s.go('/signin?mode=up', 700); pg.fill('#au-name', 'Ngozi Eze'); pg.fill('#au-email', email); pg.fill('#au-pass', 'first-pass-123'); pg.click('.auth-form [data-submit]')
    pg.wait_for_function("() => window.FTApi && FTApi.me() && location.pathname !== '/signin'", timeout=15000)
    check(pg.evaluate("FTApi.me().emailVerified") is False, 'new account starts unconfirmed')
    s.go('/account', 900); check(pg.locator('#aVerify .notice').count() == 1 and email in pg.inner_text('#aVerify'), 'account asks to confirm the address')
    if not REMOTE:
        pg.click('#aVerify [data-mailbox]'); pg.wait_for_selector('.app-sheet .mailrow'); check('Confirm your email address' in pg.inner_text('.app-sheet'), 'verification email is in the demo mailbox'); pg.keyboard.press('Escape'); pg.wait_for_timeout(800)
    link = last_link(pg, s, email, 'verify'); check(bool(link) and link.startswith('/signin?verify='), 'verification link sent')
    s.go(link, 1200); pg.wait_for_selector('#authCard .signed'); check('Email confirmed' in pg.inner_text('#authCard'), 'link confirms the address')
    check(pg.evaluate("FTApi.me().emailVerified") is True, 'account is confirmed')
    s.go(link, 900); pg.wait_for_selector('#authCard .signed'); check('did not work' in pg.inner_text('#authCard'), 'a used link is refused')
    s.go('/account', 800); check(pg.locator('#aVerify .notice').count() == 0, 'banner gone once confirmed')
    # email preferences
    pg.uncheck('#prefs [data-pref="messages"]'); pg.wait_for_timeout(700); check(pg.evaluate("FTApi.me().emailPrefs.messages") is False, 'email preference saved')
    # ── forgot password
    s.js("await FTApi.logout()"); s.go('/signin', 700); pg.fill('#au-email', email); pg.click('[data-forgot]'); pg.wait_for_selector('#forgotForm')
    check(pg.input_value('#fg-email') == email, 'forgot form carries the address over'); pg.click('#forgotForm button[type=submit]'); pg.wait_for_selector('#authCard .signed')
    check('Check your inbox' in pg.inner_text('#authCard'), 'reset request acknowledged')
    link = last_link(pg, s, email, 'reset'); check(bool(link) and link.startswith('/signin?reset='), 'reset link sent')
    s.go('/signin?forgot=', 600); pg.fill('#fg-email', 'nobody-here@example.com'); pg.click('#forgotForm button[type=submit]'); pg.wait_for_selector('#authCard .signed'); check('Check your inbox' in pg.inner_text('#authCard'), 'unknown address gets the same answer')
    s.go(link, 800); pg.fill('#rs-new', 'short'); pg.fill('#rs-new2', 'short'); pg.click('#resetForm button[type=submit]'); check('8 characters' in pg.inner_text('#resetForm .err'), 'short password refused')
    pg.fill('#rs-new', 'second-pass-456'); pg.fill('#rs-new2', 'second-pass-456'); pg.click('#resetForm button[type=submit]'); pg.wait_for_selector('#authCard .signed'); check('Password changed' in pg.inner_text('#authCard'), 'password changed')
    s.go(link, 800); pg.fill('#rs-new', 'third-pass-789'); pg.fill('#rs-new2', 'third-pass-789'); pg.click('#resetForm button[type=submit]'); pg.wait_for_timeout(900); check('expired' in pg.inner_text('#resetForm .err'), 'reset link works once')
    r = s.js(f"try {{ await FTApi.login('{email}', 'first-pass-123'); return 'in'; }} catch (e) {{ return e.message; }}"); check(r != 'in', 'old password no longer works')
    r = s.js(f"try {{ await FTApi.login('{email}', 'second-pass-456'); return 'in'; }} catch (e) {{ return e.message; }}"); check(r == 'in', 'new password signs in')
    s.js("await FTApi.logout()")
    # ── payouts: the tailor adds bank details, delivers, the customer confirms, the money goes out
    s.login('tailor'); s.go('/account#payouts', 1200); pg.wait_for_selector('#bankForm, .bankcard')
    if pg.query_selector('.bankcard'): pg.click('.bankcard [data-change]'); pg.wait_for_selector('#bankForm')          # a backend that has run this before already holds bank details
    check('platform fee' in pg.inner_text('#poFee'), 'fee explained'); fee = s.js("return (await FTApi.features()).feePercent")
    pg.select_option('#bk-bank', index=3); pg.fill('#bk-num', '12345'); pg.click('#bankForm button[type=submit]'); pg.wait_for_timeout(700); check('10-digit' in pg.inner_text('#bankForm .err'), 'bad account number refused')
    pg.fill('#bk-num', '0123456789'); pg.click('#bankForm button[type=submit]'); pg.wait_for_selector('.bankcard', timeout=10000); check('••6789' in pg.inner_text('.bankcard'), 'bank details saved, number masked')
    vid = s.js("return (await FTApi.myVendor()).id")
    s.go('/workshop', 1200)
    # a customer orders from this tailor: request → quote → pay → deliver → confirm
    s.js("await FTApi.logout()"); s.login('customer')
    did = s.js("const t = FTEngine.TEMPLATES[0]; return (await FTApi.createDesign({ spec: FTEngine.normalize(t.spec || t), title: 'Payout test kaftan' })).id")
    s.js(f"const ms = await FTApi.listMeasurements(); const mid = ms[0] ? ms[0].id : (await FTApi.saveMeasurement({{ label: 'Me', unit: 'cm', fit: 'regular', values: {{ chest: 96, waist: 80, hip: 98, height: 172 }} }})).id; await FTApi.requestQuotes('{did}', {{ measurementId: mid }})")
    s.js("await FTApi.logout()"); s.login('tailor'); s.go('/workshop', 1500)
    rid = s.js(f"const r = (await FTApi.openRequests()).find(x => x.design && x.design.id === '{did}'); return r && r.id"); check(bool(rid), 'the request reaches the tailor')
    pg.wait_for_selector(f'.req[data-id="{rid}"] [data-fee]'); hint = pg.inner_text(f'.req[data-id="{rid}"] [data-fee]'); check('You receive' in hint and f'{fee}%' in hint, 'quote form shows what the tailor receives')
    s.js(f"await FTApi.submitQuote('{rid}', {{ price: 60000, deliveryDays: 7, note: 'Fabric included.' }})")
    s.js("await FTApi.logout()"); s.login('customer')
    oid = s.js(f"const q = (await FTApi.listQuotes('{did}')).find(x => x.vendor.id === '{vid}'); const o = await FTApi.createOrder(q.id, {{ plan: 'full' }}); await FTApi.pay(o.id, {{ method: 'card', card: {{ number: '4084084084084081', expiry: '12/30', cvv: '123' }} }}); return o.id")
    s.js("await FTApi.logout()"); s.login('tailor')
    s.js(f"await FTApi.updateOrder('{oid}', {{ phase: 'tailoring', title: 'Cutting', body: 'Fabric cut.' }}); await FTApi.updateOrder('{oid}', {{ phase: 'delivered', title: 'Delivered', body: 'Handed over at the door.' }})")
    e0 = s.js("return await FTApi.earnings()"); check(e0['held'] >= 60000 and e0['heldNet'] == e0['held'] - round(e0['held'] * fee / 100), 'money shows as held until the customer confirms')
    s.js("await FTApi.logout()"); s.login('customer'); s.js(f"await FTApi.confirmDelivery('{oid}')"); total = s.js(f"return (await FTApi.getOrder('{oid}')).paid")
    s.js("await FTApi.logout()"); s.login('tailor'); s.go('/account#payouts', 1500); pg.wait_for_selector('#poRoot .table .tr:not(.th)')
    row = pg.inner_text('#poRoot .table'); net = total - round(total * fee / 100)
    check(f'{net:,}' in row, f'payout is the order total less the {fee}% fee'); check('On its way' in row or 'Paid' in row, 'payout sent once bank details exist')
    pg.wait_for_function("() => /Paid/.test(document.querySelector('#poRoot .table').innerText)", timeout=30000); check(True, 'payout arrives')
    e = s.js("return await FTApi.earnings()"); check(e['paid'] - e0['paid'] == net and e['pending'] == 0, 'earnings add up')          # e0: a backend that has run this before already paid some out
    pg.screenshot(path=f'shots/x-{size}-payouts.png')
    s.js("await FTApi.logout()"); s.login('admin'); s.go('/admin#payouts', 1500); pg.wait_for_selector('[data-panel="payouts"] .table .tr:not(.th)')
    check(f'{net:,}' in pg.inner_text('[data-panel="payouts"]'), 'admin sees the payout'); st = s.js("return await FTApi.adminStats()"); check(st['fees'] >= total - net, 'platform fee counted')
    # the admin changes the fee: the platform rate for tailor orders, then the demo tailor's own rate
    pg.wait_for_selector('#feeForm'); check(pg.input_value('#fee-order') == f'{fee:g}' and pg.input_value('#fee-commission') != '', f'the fee form shows the current rates ({fee:g}%)')
    pg.fill('#fee-order', '60'); pg.click('#feeForm button[type=submit]'); pg.wait_for_timeout(700); check('between 0% and 50%' in pg.inner_text('#feeForm .err'), 'a rate over 50% is refused')
    pg.fill('#fee-order', '17.5'); check('₦10,500' in pg.inner_text('#feeForm [data-eg="tailor"]'), 'the example under the field follows what is typed')
    pg.click('#feeForm button[type=submit]'); pg.wait_for_function("() => FTApi.adminFees().then(f => f.order === 17.5)", timeout=10000)
    check(s.js("return (await FTApi.adminFees()).order") == 17.5, 'the new tailor rate is saved')
    pg.screenshot(path=f'shots/x-{size}-fees.png')
    s.go('/admin#users', 1500); row = pg.locator('[data-panel="users"] .tr', has_text='tailor@demo.fashionteller'); row.locator('[data-userfee]').click()
    pg.wait_for_selector('.app-sheet #ask-fee'); pg.fill('#ask-fee', '12'); pg.click('.app-sheet button[type=submit]'); pg.wait_for_timeout(900)
    check('12%' in pg.inner_text('[data-panel="users"]'), "the tailor's own rate shows in the users list")
    s.go('/admin#payouts', 1500); pg.wait_for_selector('#feeForm'); check('tailor@demo.fashionteller' in pg.inner_text('.feebox'), 'and among accounts with their own rate')
    s.js("await FTApi.logout()"); s.login('tailor'); s.go('/account#payouts', 1500); pg.wait_for_selector('#poFee:not(:empty)')
    check('12%' in pg.inner_text('#poFee') and 'agreed' in pg.inner_text('#poFee'), 'the tailor sees their own rate'); check(s.js("return (await FTApi.listNotifications()).some(n => n.title === 'Your platform fee is now 12%')"), 'and was told')
    s.js("await FTApi.logout()"); s.login('admin'); s.go('/admin#payouts', 1500); pg.wait_for_selector('.feebox [data-clearfee]')
    pg.locator('.feebox .tr', has_text='tailor@demo.fashionteller').locator('[data-clearfee]').click(); pg.wait_for_timeout(900)
    s.js(f"await FTApi.adminSetFees({{ order: {fee}, commission: {fee} }})")          # put things back, for a backend that is used again
    check(s.js("const f = await FTApi.adminFees(); return f.accounts.length === 0"), 'an own rate can be removed')
    s.go('/admin', 1200); check('Platform fees earned' in pg.inner_text('[data-panel="overview"]'), 'fees on the overview'); pg.screenshot(path=f'shots/x-{size}-admin.png')
    check(s.overflow()['bad'] == [], 'no sideways scroll'); errs = [e for e in s.errors if 'status of 5' in e or 'PAGEERROR' in e or 'pageerror' in e]; check(not errs, f'no script errors {errs[:2]}')
    s.close()
print(f'extras flow [{size}{" backend" if REMOTE else ""}]: {passed} passed, {failed} failed'); sys.exit(1 if failed else 0)
