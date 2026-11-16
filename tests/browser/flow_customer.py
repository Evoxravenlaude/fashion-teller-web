"""End-to-end in the browser, built-in mode: a customer designs, saves, sees it in 3D, publishes, requests quotes, pays, tracks,
confirms, reviews; then commissions a designer and messages them. Screenshots along the way."""
import sys, re
from playwright.sync_api import sync_playwright, expect
from e2e_lib import *
size = sys.argv[1] if len(sys.argv) > 1 else 'desktop'
ok = fails = 0
def check(c, m):
    global ok, fails
    if c: ok += 1
    else: fails += 1; print('  FAIL', m)
with sync_playwright() as p:
    s = Session(p, size, gl=True); pg = s.page
    s.go('/studio')
    # 1 design: pick a template, change parts
    pg.click('[data-tpl="senator"]'); pg.wait_for_timeout(300)
    pg.click('[data-bt="collar"]'); pg.click('[data-set="collar"][data-v="v"]'); pg.click('[data-bt="colours"]'); pg.locator('[data-color]').nth(2).click()
    pg.click('[data-bt="embroidery"]'); pg.click('[data-set="embroidery"][data-v="chest"]')
    check(pg.locator('#stEst').inner_text().count('₦') == 2, 'estimate chip shows a range')
    check(not pg.locator('#bldTabs [data-bt="length"]').is_hidden(), 'kaftan offers length')
    pg.click('[data-bt="style"]'); pg.click('[data-garment="suit"]'); pg.wait_for_timeout(200)
    check(pg.locator('#bldTabs [data-bt="length"]').is_hidden() and pg.locator('#bldTabs [data-bt="sleeves"]').is_hidden(), 'suit hides length and sleeves')
    pg.click('#undoBtn'); pg.wait_for_timeout(200)
    # sketch a stroke
    pg.click('[data-bt="sketch"]'); box = pg.locator('#stArt').bounding_box()
    pg.mouse.move(box['x'] + box['width'] * .45, box['y'] + box['height'] * .5); pg.mouse.down(); pg.mouse.move(box['x'] + box['width'] * .5, box['y'] + box['height'] * .56, steps=6); pg.mouse.up(); pg.wait_for_timeout(300)
    check('1 stroke' in pg.locator('#bldBody').inner_text(), 'sketch stroke recorded')
    # 3D on the stage
    pg.click('[data-bt="style"]'); pg.click('#stTools [data-view="3d"]'); pg.wait_for_selector('#stTurn.ready, #stTurn.is-flat', timeout=30000)
    check(pg.locator('#stTurn canvas').count() == 1, '3D canvas mounted'); pg.click('#v3dBar [data-face="back"]'); pg.wait_for_timeout(1200)
    pg.screenshot(path=f'shots/f-{size}-1-studio3d.png')
    # save → sign up
    pg.click('#saveBtn'); pg.wait_for_selector('.auth-sheet.on'); pg.click('.auth-sheet [data-demo="customer"]'); pg.wait_for_selector('#reward.on', timeout=15000)
    check('XP' in pg.locator('#reward').inner_text(), 'reward shown on save'); pg.wait_for_timeout(600)
    check(pg.locator('#nexts .next-card').count() == 3, 'what-next cards after saving')
    check(pg.locator('#stNext a').count() == 1, 'design room link on the stage')
    design_id = pg.evaluate("JSON.parse(sessionStorage.getItem('ft.studio')).designId")
    # 2 see it
    pg.click('#toPreview'); pg.wait_for_timeout(1500); check(pg.locator('#tones [data-tone]').count() == 5, 'mannequin tones offered'); pg.click('#tones [data-tone="3"]')
    # the doors into the try-on: from the studio (the draft as it stands) and from the design room (the saved design)
    pg.click('#pvTabs [data-tab="pvtry"]'); pg.wait_for_timeout(300); links = pg.locator('[data-panel="pvtry"] a[data-try]'); check(links.count() == 2 and links.nth(0).is_visible(), 'studio offers the try-on: camera, or a photo or video')
    href = links.nth(1).get_attribute('href'); pg.evaluate("() => { const a = document.querySelectorAll('[data-panel=\"pvtry\"] a[data-try]')[1]; a.addEventListener('click', e => e.preventDefault(), { once: true }); a.click(); }")
    title = pg.evaluate("() => { const d = JSON.parse(localStorage.getItem('ft.draft') || 'null'); return d && d.spec ? FTEngine.title(FTEngine.normalize(d.spec)) : ''; }")
    p2 = pg.context.new_page(); p2.goto(BASE + href, wait_until='domcontentloaded'); p2.wait_for_function('() => window.FTTryOn && FTTryOn.spec', timeout=20000)
    check(bool(title) and p2.inner_text('#toName') == title and p2.get_attribute('#toBack', 'href') == '/studio', f'the try-on opens on the studio draft ({title})')
    p2.goto(BASE + f'/design?id={design_id}', wait_until='domcontentloaded'); p2.wait_for_selector('a[href^="/try-on?design="]', timeout=15000); saved = p2.evaluate(f"async () => (await FTApi.getDesign('{design_id}')).title")
    p2.click('a[href^="/try-on?design="]'); p2.wait_for_function('() => window.FTTryOn && FTTryOn.design', timeout=20000)
    check(p2.inner_text('#toName') == saved and design_id in p2.get_attribute('#toBack', 'href'), 'and from the design room, on the saved design'); p2.close()
    pg.click('#pvTabs [data-tab="pvvers"]'); check(pg.locator('#vgrid .vcard').count() == 1, 'version list')
    # 3 measure → 4 quotes
    pg.click('#toMeasure'); pg.wait_for_selector('[data-pane="3"].on')
    if pg.locator('#mlist .mcard').count() == 0:
        pg.click('#mNew'); pg.click('[data-preset="M"]'); pg.fill('#mf-label', 'Me'); pg.click('#mformWrap button[type="submit"]'); pg.wait_for_selector('#mlist .mcard')
    pg.fill('#reqNotes', 'Wedding on the 14th.'); pg.click('#reqBtn'); pg.wait_for_selector('[data-pane="4"].on'); pg.wait_for_selector('#vlist .vendor', timeout=20000); pg.wait_for_timeout(2500)
    n = pg.locator('#vlist .vendor').count(); check(n >= 2, f'quotes arrived ({n})'); pg.screenshot(path=f'shots/f-{size}-2-quotes.png')
    pg.click('#sortSeg [data-v="price"]'); pg.wait_for_timeout(700); pg.locator('#vlist .vendor').first.click()
    pg.click('#ctaBtn'); pg.wait_for_selector('[data-pane="5"].on')
    # 5 pay: declined card then a good one
    pg.fill('#cardName', 'Adaeze Okafor'); pg.fill('#cardNum', '4084084084084081'); pg.fill('#cardExp', '1230'); pg.fill('#cardCvv', '000'); pg.click('#payBtn'); pg.wait_for_function("document.querySelector('#err5').textContent.includes('declined')", timeout=8000); check(True, 'declined card is explained')
    pg.fill('#cardCvv', '123'); pg.click('#payBtn'); pg.wait_for_selector('[data-pane="6"].on', timeout=15000)
    order_id = pg.evaluate("JSON.parse(sessionStorage.getItem('ft.studio')).orderId"); check(bool(re.match(r'FT-\d{6}$', order_id or '')), 'order number ' + str(order_id))
    # 6 track until delivered, then confirm
    pg.wait_for_selector('#trkActs [data-act="confirm"]', timeout=60000); pg.screenshot(path=f'shots/f-{size}-3-track.png')
    pg.click('#trkActs [data-act="confirm"]'); pg.click('.app-sheet [data-yes]'); pg.wait_for_function("document.querySelector('#trkTitle').textContent.includes('Yours')", timeout=8000); check(True, 'delivery confirmed in the studio')
    # order page: review + message
    s.go(f'/orders?id={order_id}'); pg.wait_for_selector('[data-act="review"]'); pg.screenshot(path=f'shots/f-{size}-4-order.png')
    pg.click('[data-act="review"]'); pg.click('.starpick [data-v="4"]'); pg.fill('#ask-text', 'Good work, on time.'); pg.click('.app-sheet button[type="submit"]'); pg.wait_for_selector('.revbox', timeout=8000); check(True, 'review posted')
    pg.click('[data-msg^="order:"]'); pg.wait_for_url(re.compile('/messages')); pg.wait_for_selector('#cmp'); pg.fill('#cmp', 'Thank you, it fits.'); pg.click('.composer .send'); pg.wait_for_selector('.chat li.mine'); check(pg.locator('.chat li.mine').count() == 1, 'message sent')
    pg.wait_for_function("document.querySelectorAll('.chat li:not(.mine):not(.sys):not(.day)').length >= 1", timeout=15000); check(True, 'tailor replied'); pg.screenshot(path=f'shots/f-{size}-5-messages.png')
    # design room: publish
    s.go(f'/design?id={design_id}', 2500); pg.wait_for_selector('#rmView.ready, #rmView.is-flat', timeout=30000); check('In production' in pg.locator('.room-side').inner_text(), 'ordered design is locked in the room')
    pg.click('[data-act="publish"]'); pg.fill('#ask-caption', 'For the wedding.'); pg.fill('#ask-tags', 'senator, wedding'); pg.click('.app-sheet button[type="submit"]'); pg.wait_for_function("document.querySelector('#publish').textContent.includes('On Discover')", timeout=8000); check(True, 'published from the design room')
    pg.wait_for_timeout(900); pg.screenshot(path=f'shots/f-{size}-6-room.png')
    s.go('/discover?sort=new'); pg.wait_for_selector('.dcard'); check(str(design_id) == pg.locator('.dcard').first.get_attribute('data-id'), 'published design tops New')
    # like + remix someone else's design
    lk = pg.locator('.dcard [data-like][aria-pressed="false"]').nth(2); did = lk.get_attribute('data-like'); lk.click(); pg.wait_for_timeout(500); check(pg.locator(f'[data-like="{did}"]').get_attribute('aria-pressed') == 'true', 'liked')
    kente = s.js("return (await FTApi.discover({ q: 'Kente midi' })).items[0].id"); s.go(f'/design?id={kente}', 2500); pg.click('[data-act="remix"]'); pg.wait_for_url(re.compile('/studio')); pg.wait_for_timeout(900); check('remix' in pg.locator('#stTitle').inner_text().lower(), 'remix opens in the studio')
    # commission a sample designer
    s.go('/designer?id=@tolustitch')
    pg.click('#hireBtn'); pg.fill('#ask-title', 'Shirts for my brothers'); pg.fill('#ask-brief', 'Three short sleeve ankara shirts with a pocket, for a family photo in December.'); pg.select_option('#ask-garment', 'shirt'); pg.fill('#ask-budget', '15000'); pg.click('.app-sheet button[type="submit"]')
    pg.wait_for_url(re.compile('/commissions\\?id='))
    pg.wait_for_selector('[data-act="pay"]', timeout=30000); pg.screenshot(path=f'shots/f-{size}-7-offer.png')
    pg.click('[data-act="pay"]'); pg.wait_for_selector('#ck-num'); pg.fill('#ck-num', '4084084084084081'); pg.fill('#ck-exp', '1230'); pg.fill('#ck-cvv', '321'); pg.click('.app-sheet [data-pay]')
    pg.wait_for_selector('[data-act="approve"]', timeout=40000); check(pg.locator('.deliv .art svg').count() == 1, 'delivery shows the design'); pg.screenshot(path=f'shots/f-{size}-8-delivered.png')
    pg.click('[data-act="changes"]'); pg.fill('#ask-note', 'Make the sleeves long please.'); pg.click('.app-sheet button[type="submit"]'); pg.wait_for_function("document.querySelector('#cRoot').textContent.includes('Delivery 2')", timeout=40000); pg.wait_for_selector('[data-act="approve"]'); check(True, 'revised delivery')
    pg.click('[data-act="approve"]'); pg.click('.app-sheet [data-yes]'); pg.wait_for_selector('[data-act="review"]', timeout=10000); check('It is yours' in pg.locator('#cRoot').inner_text(), 'commission approved')
    s.go('/designs#forme'); pg.wait_for_selector('.card.design'); check('Designed by Tolu' in pg.locator('#dRoot').inner_text(), 'commissioned design is in the library, credited')
    pg.screenshot(path=f'shots/f-{size}-9-mystudio.png')
    # notifications
    pg.click('#bellBtn'); pg.wait_for_selector('#bellPop .nlist li'); check(pg.locator('#bellPop .nlist li').count() >= 5, 'notifications listed'); pg.screenshot(path=f'shots/f-{size}-10-bell.png')
    print(f'customer flow [{size}]: {ok} passed, {fails} failed', s.errors or ''); s.close()
sys.exit(1 if fails or s.errors else 0)
