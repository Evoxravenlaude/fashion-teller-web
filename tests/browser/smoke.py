import sys
from playwright.sync_api import sync_playwright
from e2e_lib import *
PUBLIC = ['/', '/how-it-works', '/studio', '/discover', '/designers', '/designer?id=u_d1', '/design?id=d_feed4', '/tailors', '/about', '/signin', '/try-on?template=senator', '/try-on?design=d_feed4', '/speed', '/signin?forgot=1', '/signin?reset=bad', '/signin?verify=bad', '/designs', '/orders', '/commissions', '/messages', '/account', '/workshop', '/admin', '/nope']
with sync_playwright() as p:
    s = Session(p, sys.argv[1] if len(sys.argv) > 1 else 'desktop', gl=True)
    for path in PUBLIC:
        n = len(s.errors); s.go(path, 900); o = s.overflow(); new = s.errors[n:]
        if path in ('/designs', '/orders', '/commissions', '/messages', '/account', '/workshop', '/admin'):
            try: s.page.keyboard.press('Escape'); s.page.wait_for_timeout(200)
            except Exception: pass
        print(('OK  ' if not new and not o['bad'] else 'FAIL'), path, '|', s.page.title()[:40], '|', 'overflow' if o['bad'] else '', o['bad'] or '', new or '')
    s.page.screenshot(path='shots/smoke-last.png'); s.close()
