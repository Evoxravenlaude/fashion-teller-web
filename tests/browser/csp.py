"""Every page under the production security headers: collect content-security-policy violations."""
import sys
from playwright.sync_api import sync_playwright
from e2e_lib import *
OUT = ['/', '/how-it-works', '/studio', '/discover', '/designers', '/designer?id=@amaserwaa', '/tailors', '/about', '/signin', '/signin?forgot=1', '/signin?reset=bad', '/try-on?template=senator', '/speed', '/nope']
IN = {'customer': ['/studio', '/designs', '/orders', '/commissions', '/messages', '/account'], 'designer': ['/commissions', '/account#designer', '/account#payouts'], 'tailor': ['/workshop', '/workshop#orders', '/account#payouts'], 'admin': ['/admin', '/admin#orders', '/admin#payouts', '/admin#reports']}
REC = "window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' <- ' + (e.blockedURI || 'inline') + ' @' + (e.sourceFile || '').split('/').pop() + ':' + e.lineNumber));"
seen = {}
with sync_playwright() as p:
    s = Session(p, sys.argv[1] if len(sys.argv) > 1 else 'desktop', gl=True); s.ctx.add_init_script(REC)
    def visit(path, tag, wait=900):
        s.go(path, wait)
        for v in s.page.evaluate('window.__csp || []'): seen.setdefault(v, f'{tag} {path}')
    for path in OUT: visit(path, 'out')
    s.login('customer')
    for path in IN['customer']: visit(path, 'customer')
    did = s.js("const d = await FTApi.listDesigns(); return d[0] && d[0].id"); oid = s.js("const o = await FTApi.listOrders(); return o[0] && o[0].id")
    visit(f'/design?id={did}', 'customer', 3500); visit(f'/orders?id={oid}', 'customer')
    s.go('/studio', 800); s.page.click('#stTools [data-view="3d"]'); s.page.wait_for_timeout(3500)
    ok3d = s.page.evaluate("!!document.querySelector('#stTurn canvas')")
    for v in s.page.evaluate('window.__csp || []'): seen.setdefault(v, 'studio 3d')
    visit(f'/studio?design={did}&step=4', 'customer', 1500)
    s.go('/'); s.js("await FTApi.logout()")
    for who in ('designer', 'tailor', 'admin'):
        s.login(who)
        for path in IN[who]: visit(path, who)
        s.go('/'); s.js("await FTApi.logout()")
    errs = [e for e in s.errors if 'Content Security' in e or 'Refused' in e]
    s.close()
for v, where in seen.items(): print('CSP', v, '|', where)
for e in errs[:8]: print('console', e[:200])
print('3d canvas under CSP:', ok3d, '| violations:', len(seen))
