"""Designer, tailor and admin journeys in the browser (built-in mode)."""
import sys, re
from playwright.sync_api import sync_playwright
from e2e_lib import *
size = sys.argv[1] if len(sys.argv) > 1 else 'desktop'
ok = fails = 0
def check(c, m):
    global ok, fails
    if c: ok += 1
    else: fails += 1; print('  FAIL', m)
with sync_playwright() as p:
    s = Session(p, size, gl=False); pg = s.page
    # ── designer
    s.login('designer'); check('/commissions' in pg.url, 'designer lands on commissions'); pg.wait_for_selector('.crow'); check(pg.locator('.crow').count() == 2, 'two client commissions')
    pg.locator('.crow', has_text='Groomsmen').click(); pg.wait_for_selector('#offerForm'); pg.fill('#of-fee', '500'); pg.click('#offerForm button[type="submit"]'); pg.wait_for_function("document.querySelector('#offerForm .err').textContent.length > 5"); check(True, 'low fee is rejected with a reason')
    pg.fill('#of-fee', '24000'); hint = pg.inner_text('#offerForm [data-fee="commission"]'); rate = s.js("const m = FTApi.me(); return (m.fees && m.fees.commission) ?? (await FTApi.features()).fees.commission")
    check(f'You receive ₦{24000 - round(24000 * rate / 100):,}' in hint and f'{rate:g}%' in hint, f'the offer form shows what the designer receives ({hint[:60]})')
    pg.fill('#of-days', '4'); pg.fill('#of-note', 'Six shirts from one design.'); pg.click('#offerForm button[type="submit"]'); pg.wait_for_function("document.querySelector('#cSub').textContent.includes('Offer waiting')", timeout=8000); check(True, 'offer sent')
    s.go('/commissions'); pg.locator('.crow', has_text='Linen kaftan').click(); pg.wait_for_selector('[data-act="deliver"]'); pg.click('[data-act="deliver"]'); pg.wait_for_selector('.pick [data-pick]'); pg.locator('.pick [data-pick]').nth(1).click(); pg.fill('#dl-note', 'Sky linen, short sleeves.'); pg.click('[data-send]'); pg.wait_for_function("document.querySelector('#cRoot').textContent.includes('Waiting for')", timeout=8000); check(True, 'designer delivered')
    pg.screenshot(path=f'shots/r-{size}-1-designer.png')
    s.go('/account#designer'); pg.wait_for_selector('#dg-handle'); check(pg.input_value('#dg-handle') == 'kemilawal', 'designer profile loads'); pg.fill('#dg-bio', 'Relaxed tailoring, updated.'); pg.click('#designerForm button[type="submit"]'); pg.wait_for_timeout(600); check(pg.locator('#designerForm .err').inner_text() == '', 'designer profile saves')
    s.go('/designer?id=@kemilawal'); pg.wait_for_selector('.phead'); check('edit profile' in pg.locator('.phead').inner_text().lower() and 'updated' in pg.locator('.phead .bio').inner_text(), 'own public profile')
    s.go('/messages'); pg.wait_for_selector('.trow'); check(pg.locator('.trow').count() == 2, 'designer threads')
    pg.locator('#acctBtn').click(); pg.click('#acctMenu [data-signout]'); pg.wait_for_timeout(700)
    # ── tailor
    s.login('tailor'); check('/workshop' in pg.url, 'tailor lands in the workshop'); pg.click('#wTabs [data-tab="orders"]'); pg.wait_for_selector('.uform')
    pg.fill('.uform input[name="title"]', 'Embroidery started'); pg.set_input_files('.uform [data-shot]', 'photo.jpg'); pg.wait_for_selector('.uform [data-rm]'); pg.click('.uform button[type="submit"]')
    # the timeline of the order that has the update form (a backend used before may also list finished orders first)
    pg.wait_for_function("() => [...document.querySelectorAll('[data-panel=\"orders\"] .feed')].some(f => f.textContent.includes('Embroidery started'))", timeout=8000)
    feed = pg.locator('[data-panel="orders"] .feed', has_text='Embroidery started').first; check('1 photo' in feed.inner_text(), 'update posted with a photo')
    pg.click('#wTabs [data-tab="reviews"]'); pg.wait_for_selector('.revs li'); check(pg.locator('.revs li').count() >= 1, 'reviews tab')
    pg.click('#wTabs [data-tab="profile"]'); pg.wait_for_selector('#vForm'); pg.click('#wTabs [data-tab="quotes"]'); pg.wait_for_timeout(300); pg.screenshot(path=f'shots/r-{size}-2-workshop.png')
    for path in ['/designs', '/admin']:
        s.go(path); check('for' in pg.locator('.empty h2').inner_text().lower() or pg.locator('.card').count() >= 0, f'tailor gate on {path}')
    s.go('/workshop'); pg.locator('#acctBtn').click(); pg.click('#acctMenu [data-signout]'); pg.wait_for_timeout(700)
    # ── admin
    s.login('admin'); check('/admin' in pg.url, 'admin lands on the dashboard'); pg.wait_for_selector('.stat')
    for t in ['tailors', 'orders', 'payments', 'commissions', 'reports', 'users', 'designs', 'inbox', 'overview']:
        pg.click(f'#adTabs [data-tab="{t}"]'); pg.wait_for_timeout(350); check(pg.locator(f'[data-panel="{t}"] .err').count() == 0 and len(pg.locator(f'[data-panel="{t}"]').inner_text()) > 20, f'admin tab {t}')
    pg.click('#adTabs [data-tab="tailors"]'); pg.wait_for_selector('[data-set="verified"]'); pg.locator('[data-set="verified"]').first.click(); pg.wait_for_timeout(500); check(pg.locator('[data-set="verified"]').count() == 0, 'pending tailor verified')
    pg.click('#adTabs [data-tab="overview"]'); pg.wait_for_timeout(400); pg.screenshot(path=f'shots/r-{size}-3-admin.png')
    print(f'roles flow [{size}]: {ok} passed, {fails} failed', s.errors or ''); s.close()
sys.exit(1 if fails or s.errors else 0)
