"""Every page at every device size, signed out and signed in: script errors, failed requests and sideways overflow."""
import sys
from playwright.sync_api import sync_playwright
from e2e_lib import *
OUT = ['/', '/how-it-works', '/studio', '/discover', '/designers', '/designer?id=@amaserwaa', '/tailors', '/about', '/signin', '/nope']
IN = {'customer': ['/studio', '/designs', '/designs#badges', '/orders', '/commissions', '/messages', '/account', '/account#measurements', '/account#designer', '/discover?sort=following', '/designers'],
      'designer': ['/commissions', '/designs', '/messages', '/account#designer'], 'tailor': ['/workshop', '/workshop#orders', '/workshop#profile', '/account'], 'admin': ['/admin', '/admin#orders', '/admin#payments', '/admin#reports', '/admin#users']}
sizes = sys.argv[1:] or list(SIZES)
bad = 0
with sync_playwright() as p:
    for size in sizes:
        s = Session(p, size, gl=False)
        def visit(path, tag):
            global bad
            n = len(s.errors); s.go(path, 700)
            try: s.page.keyboard.press('Escape')
            except Exception: pass
            o = s.overflow(); new = s.errors[n:]
            if new or o['bad']: bad += 1; print(f'  [{size}] {tag} {path}', o['bad'] or '', new or '')
        for path in OUT: visit(path, 'out')
        # deep pages that need ids
        first = s.js("return (await FTApi.discover({ limit: 1 })).items[0].id"); visit(f'/design?id={first}', 'out')
        for who, paths in IN.items():
            s.login(who)
            for path in paths: visit(path, who)
            if who == 'customer':
                oid = s.js("const o = await FTApi.listOrders(); return o[0] && o[0].id"); cid = s.js("const c = await FTApi.listCommissions(); return c[0] && c[0].id"); did = s.js("const d = await FTApi.listDesigns(); return d[0] && d[0].id")
                for path in [f'/orders?id={oid}', f'/commissions?id={cid}', f'/design?id={did}']: visit(path, who)
            s.go('/'); s.js("await FTApi.logout()")
        print(f'[{size}] done')
        s.close()
print('problems:', bad); sys.exit(1 if bad else 0)
