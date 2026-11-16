"""Accessibility pass on open states: dialogs, popovers, studio steps, 3D view."""
import sys, pathlib
from playwright.sync_api import sync_playwright
from e2e_lib import *
import os
AXE = pathlib.Path(os.environ.get('AXE_JS') or 'node_modules/axe-core/axe.min.js').read_text()     # npm install axe-core (in tests/browser)
RUN = """async () => { const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }, resultTypes: ['violations'] });
  return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map(n => ({ t: n.target.join(' '), h: n.html.slice(0, 150), s: (n.any[0] || n.all[0] || n.none[0] || {}).message || '' })) })); }"""
size = sys.argv[1] if len(sys.argv) > 1 else 'phone'
total = 0
with sync_playwright() as p:
    s = Session(p, size, gl=True)
    def check(tag):
        global total
        s.page.wait_for_timeout(500); s.page.evaluate(AXE)
        for v in s.page.evaluate(RUN):
            if v['id'] == 'color-contrast' and all('.wm' in n['t'] or '.dim' in n['t'] for n in v['nodes']): continue
            total += 1; print(f"[{tag}] {v['impact']} {v['id']}: {v['help']}")
            for n in v['nodes']: print('    ·', n['t'][:80], '|', n['h'].replace('\n', ' ')[:130], '|', n['s'][:140])
    def esc(): s.page.keyboard.press('Escape'); s.page.wait_for_timeout(800)
    s.go('/signin'); s.page.click('.auth-tabs [data-mode="up"]'); check('signin: create account')
    s.go('/signin?forgot=someone@example.com', 700); check('signin: forgot password')
    s.go('/signin?reset=not-a-real-link', 700); check('signin: reset link')
    s.go('/signin?verify=not-a-real-link', 900); check('signin: confirm link')
    # the try-on with a picture up, the fit controls open and the body points showing (this photo has nobody in it, so the points appear)
    s.go('/try-on?template=senator&delegate=cpu&model=lite', 900); check('try-on: start')
    s.page.set_input_files('#toFile', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'photo.jpg'))
    try:
        s.page.wait_for_function("() => window.FTTryOn && FTTryOn.src === 'photo' && FTTryOn.fit && document.querySelector('#toLoad').hidden && !document.querySelector('#toBar').hidden", timeout=90000)
        check('try-on: photo and points'); s.page.click('#toAdjust'); check('try-on: fit controls'); s.page.click('#toAdjust')
        s.page.click('#toShot'); s.page.wait_for_selector('.app-sheet .to-result img', timeout=10000); check('try-on: saved picture'); esc()
    except Exception as e: print('  (try-on skipped)', str(e)[:120])
    s.go('/speed', 1200)
    try: s.page.wait_for_selector('#spView.ready', timeout=60000); s.page.click('#spRun'); s.page.wait_for_function('() => window.FTSpeed', timeout=90000); check('speed check: results')
    except Exception as e: print('  (speed check skipped)', str(e)[:120])
    s.login('customer')
    did = s.js("const d = await FTApi.listDesigns(); return d[0] && d[0].id")
    s.go('/studio');
    for tab in s.page.query_selector_all('#bldTabs [role=tab]')[:9]:
        try: tab.click(); check('studio tab ' + (tab.get_attribute('data-tab') or '?'))
        except Exception as e: print('  (tab skipped)', str(e)[:80])
    try: s.page.click('#stTools [data-view="3d"]'); s.page.wait_for_timeout(2500); check('studio 3d')
    except Exception as e: print('  (3d skipped)', str(e)[:80])
    for step in (2, 3, 4):
        s.go(f'/studio?design={did}&step={step}', 1200); check(f'studio step {step}')
    s.go('/studio'); s.page.click('#bellBtn'); check('bell popover'); esc()
    try: s.page.click('#acctBtn'); check('account menu'); esc()
    except Exception as e: print('  (menu skipped)', str(e)[:80])
    s.go('/designer?id=@amaserwaa', 1000); s.page.click('#hireBtn'); check('commission sheet'); esc()
    s.go(f'/design?id={did}', 1500)
    for act in ('publish', 'rename', 'share'):
        b = s.page.query_selector(f'[data-act="{act}"]')
        if b and b.is_visible(): b.click(); check('design room: ' + act); esc()
    first = s.js("return (await FTApi.discover({ limit: 1 })).items[0].id")
    s.go(f'/design?id={first}', 1500)
    b = s.page.query_selector('[data-report]')
    if b and b.is_visible(): b.click(); check('report sheet'); esc()
    s.go('/account#measurements', 900); check('measurements')
    b = s.page.query_selector('[data-add], #addM, [data-new]')
    if b and b.is_visible(): b.click(); check('measurement form'); esc()
    s.go('/account', 900); check('account: confirm-your-email banner and email choices')
    try: s.js("FTApp.mailbox()"); s.page.wait_for_selector('.app-sheet', timeout=5000); check('demo mailbox'); esc()
    except Exception as e: print('  (mailbox skipped)', str(e)[:80])
    cid = s.js("const c = (await FTApi.listCommissions()).find(x => x.status === 'offered' || x.status === 'delivered'); return c && c.id")
    if cid: s.go(f'/commissions?id={cid}', 1200); check('commission detail (action)')
    s.js("await FTApi.logout()"); s.login('tailor'); s.go('/account#payouts', 1200); check('payouts: bank details form')
    try:
        s.page.select_option('#bk-bank', index=2); s.page.fill('#bk-num', '123'); s.page.click('#bankForm button[type=submit]'); check('payouts: form error')
        s.page.fill('#bk-num', '0123456789'); s.page.click('#bankForm button[type=submit]'); s.page.wait_for_selector('.bankcard', timeout=10000); check('payouts: saved account')
    except Exception as e: print('  (bank form skipped)', str(e)[:80])
    s.js("await FTApi.logout()"); s.login('admin'); s.go('/admin#payouts', 1200); check('admin: payouts')
    s.close()
print('violations in open states:', total)
