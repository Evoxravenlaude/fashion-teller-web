"""Accessibility pass: axe-core (WCAG 2 A/AA + best practice) on every page, signed out and per role."""
import sys, json, pathlib
from playwright.sync_api import sync_playwright
from e2e_lib import *
import os
AXE = pathlib.Path(os.environ.get('AXE_JS') or 'node_modules/axe-core/axe.min.js').read_text()     # npm install axe-core (in tests/browser)
OUT = ['/', '/how-it-works', '/studio', '/discover', '/designers', '/designer?id=@amaserwaa', '/tailors', '/about', '/signin', '/nope']
IN = {'customer': ['/studio', '/designs', '/designs#published', '/designs#forme', '/designs#badges', '/orders', '/commissions', '/messages', '/account', '/account#measurements', '/account#designer', '/account#security', '/discover?sort=following', '/discover?sort=saved'],
      'designer': ['/commissions', '/designs', '/account#designer', '/designer?id=@kemilawal'], 'tailor': ['/workshop', '/workshop#quotes', '/workshop#orders', '/workshop#reviews', '/workshop#profile'],
      'admin': ['/admin', '/admin#tailors', '/admin#orders', '/admin#payments', '/admin#commissions', '/admin#reports', '/admin#users', '/admin#designs', '/admin#inbox']}
size = sys.argv[1] if len(sys.argv) > 1 else 'phone'
only = sys.argv[2] if len(sys.argv) > 2 else None
tally = {}
RUN = """async () => { const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }, resultTypes: ['violations'] });
  return r.violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, nodes: v.nodes.slice(0, 4).map(n => ({ t: n.target.join(' '), h: n.html.slice(0, 140), s: (n.any[0] || n.all[0] || n.none[0] || {}).message || '' })) })); }"""
with sync_playwright() as p:
    s = Session(p, size, gl=False)
    def check(path, tag):
        s.go(path, 900)
        s.page.evaluate(AXE)
        for v in s.page.evaluate(RUN):
            k = v['id']; t = tally.setdefault(k, {'impact': v['impact'], 'help': v['help'], 'pages': {}, 'nodes': []})
            t['pages'][f'{tag} {path}'] = v['n']
            for n in v['nodes']:
                if len(t['nodes']) < 8 and n['t'] not in [x['t'] for x in t['nodes']]: t['nodes'].append(n)
    if only in (None, 'out'):
        for path in OUT: check(path, 'out')
        first = s.js("return (await FTApi.discover({ limit: 1 })).items[0].id"); check(f'/design?id={first}', 'out')
    for who, paths in IN.items():
        if only not in (None, who): continue
        s.login(who)
        for path in paths: check(path, who)
        if who == 'customer':
            oid = s.js("const o = await FTApi.listOrders(); return o[0] && o[0].id"); cid = s.js("const c = await FTApi.listCommissions(); return c[0] && c[0].id"); did = s.js("const d = await FTApi.listDesigns(); return d[0] && d[0].id")
            tid = s.js("const t = await FTApi.listThreads(); return t[0] && t[0].id")
            for path in [f'/orders?id={oid}', f'/commissions?id={cid}', f'/design?id={did}', f'/messages?t={tid}', f'/studio?design={did}&step=2']: check(path, who)
        s.go('/'); s.js("await FTApi.logout()")
    s.close()
for k, t in sorted(tally.items(), key=lambda kv: ({'critical': 0, 'serious': 1, 'moderate': 2, 'minor': 3}.get(kv[1]['impact'], 4), kv[0])):
    print(f"\n{t['impact'].upper():9} {k}: {t['help']}  ({len(t['pages'])} pages, {sum(t['pages'].values())} nodes)")
    print('   pages:', ', '.join(list(t['pages'])[:6]))
    for n in t['nodes'][:5]: print('   ·', n['t'][:90], '|', n['h'][:120].replace('\n', ' '), '|', n['s'][:150])
print('\nrules violated:', len(tally))
